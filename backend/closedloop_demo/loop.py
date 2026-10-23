"""One learner's closed loop on one topic of their own material.

Same order as ``closedloop.loop.LoopSession``: the screen for item n is built
from responses 0..n-1, then response n is graded and observed. The BKT
tracker, PID governor and policy are the research components, unchanged; only
the content (bank questions), the component pack and the grader differ.
"""

from __future__ import annotations

import random
import re
import time
from dataclasses import asdict, dataclass, field

from closedloop.bkt import BKTParams, BKTTracker
from closedloop.governor import GovernorConfig, PIDGovernor
from closedloop.loop import LAPSE_H, RECENT_WINDOW, Telemetry
from closedloop.policy import SurrogatePolicy

from .bank import Pack, Question, Topic, _fold
from .components import measure
from .plant import Admission, GeminiLearnPlant, admit, build, plan

# Onboarding answer "how well do you know this already?" -> starting mastery P(L0).
PRIOR = {"new": 0.10, "little": 0.25, "well": 0.45}
# Multiple choice with 4 options can be guessed 1 time in 4 (research math items use 0.20).
DEMO_BKT = dict(p_t=0.12, p_g=0.25, p_s=0.08, lapse_threshold=LAPSE_H)


def _edit_distance_le1(a: str, b: str) -> bool:
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) > len(b):
        a, b = b, a
    i = j = diff = 0
    while i < len(a) and j < len(b):
        if a[i] != b[j]:
            diff += 1
            if diff > 1:
                return False
            if len(a) == len(b):
                i += 1
            j += 1
        else:
            i += 1
            j += 1
    return diff + (len(b) - j) <= 1


@dataclass(frozen=True)
class Grade:
    correct: bool
    message: str


def grade(q: Question, answer: str) -> Grade:
    """Deterministic: exact option for multiple choice; normalised text (+1 typo for long words) for blanks."""
    given = _fold(answer)
    if not given:
        return Grade(False, "No answer given.")
    if q.kind == "choice":
        ok = given == _fold(q.answer)
        return Grade(ok, "Correct." if ok else "Not quite.")
    keys = [_fold(k) for k in (q.answer, *q.accepted)]
    if given in keys:
        return Grade(True, "Correct.")
    if any(len(k) >= 5 and _edit_distance_le1(given, k) for k in keys):
        return Grade(True, f"Correct (accepted with a small spelling slip: {q.answer}).")
    return Grade(False, "Not quite.")


@dataclass
class Item:
    question: Question
    document: dict
    telemetry: Telemetry
    view: dict  # what the client may see of the question (no answer key)
    started: float


@dataclass
class LogEntry:
    item: int
    question_id: str
    level: int
    prompt: str
    answer: str
    correct_answer: str
    correct: bool
    explanation: str
    mastery_before: float
    mastery_after: float
    budget: float
    hints_opened: int
    seconds: float
    plant: str
    fallback_used: bool


class DemoSession:
    def __init__(self, pack: Pack, topic: Topic, profile: dict, plant: GeminiLearnPlant | None, seed: int | None = None) -> None:
        self.pack, self.topic, self.profile = pack, topic, profile
        self.seed = seed if seed is not None else random.randrange(2**31)
        self.rng = random.Random(self.seed)
        self.plant = plant
        self.plant_name = "gemini" if plant else "deterministic"
        self.policy = SurrogatePolicy()
        prior = PRIOR.get(profile.get("prior", "little"), 0.25)
        self.tracker = BKTTracker(BKTParams(p_l0=prior, **DEMO_BKT))
        self.governor = PIDGovernor(GovernorConfig())
        self.responses: list[bool] = []
        self.history: list[Telemetry] = []
        self.log: list[LogEntry] = []
        self.asked: dict[str, int] = {}
        self.started = time.time()
        self.current = self._next_item()

    # -- question selection -------------------------------------------------
    def _pick(self, level: int) -> Question:
        pool = self.topic.at_level(level)
        last = self.log[-1].question_id if self.log else None
        fresh = [q for q in pool if q.id not in self.asked]
        if fresh:
            return fresh[0]
        # every question at this level seen: the least recently asked, never the one just answered
        ordered = sorted(pool, key=lambda q: self.asked.get(q.id, -1))
        return next((q for q in ordered if q.id != last), ordered[0])

    def _example(self, q: Question) -> Question | None:
        """A worked example from the same topic that does not contain this question's answer."""
        ans = _fold(q.answer)
        for cand in sorted(self.topic.questions, key=lambda c: (c.level != q.level, c.level)):
            if cand.id == q.id or cand.id in self.asked:
                continue
            text = _fold(" ".join((cand.prompt, cand.answer, cand.explanation)))
            if ans and re.search(rf"\b{re.escape(ans)}\b", text):
                continue
            return cand
        return None

    def _client_view(self, q: Question, doc: dict) -> dict:
        node = _find_question(doc["root"])
        view = {"id": q.id, "kind": q.kind, "level": q.level, "prompt": q.prompt}
        if q.kind == "choice":
            n = node["options_shown"]
            shown = [q.answer, *q.options[1:n]]
            random.Random(f"{self.seed}:{q.id}").shuffle(shown)
            view["options"] = shown
            view["evidence"] = self.topic.key_points[: node.get("evidence", 0)]
        else:
            n = node["word_bank"]
            chips = [q.answer, *q.distractors[: max(0, n - 1)]] if n else []
            random.Random(f"{self.seed}:{q.id}").shuffle(chips)
            view["word_bank"] = chips
        return view

    # -- loop -----------------------------------------------------------------
    def _next_item(self) -> Item:
        recent_errors = sum(1 for r in self.responses[-RECENT_WINDOW:] if not r)
        t0 = time.perf_counter()
        p = self.tracker.mastery
        out = self.governor.step(p)
        decision = self.policy.decide(p, out.budget, out.level, recent_errors)
        q = self._pick(decision.alpha)
        example = self._example(q) if decision.scaffolding_mode == "worked_example" else None
        bp = plan(out.budget, decision, q, example_available=example is not None, key_points=len(self.topic.key_points))
        template = build(bp, q, self.topic, example)
        t1 = time.perf_counter()
        if self.plant is not None:
            emission = self.plant.generate(template, q, self.topic, self.profile)
            text, fault = emission.text, emission.fault
        else:
            text, fault = template.model_dump_json(), None
        t2 = time.perf_counter()
        adm = admit(text, out.budget, q, template) if not fault else None
        if adm is None:  # the plant did not answer: render the template, say why
            adm = Admission(template, measure(template), False, False, True, fault)
        s = adm.structure
        tel = Telemetry(
            item=len(self.history),
            mastery=p,
            error=out.error,
            integral=out.integral,
            derivative=out.derivative,
            effort=out.effort,
            budget_raw=out.budget_raw,
            budget=out.budget,
            level=out.level,
            m_i=s.m_i,
            rho=s.rho,
            alpha=s.alpha,
            delta=s.delta,
            abs_error=abs(s.m_i - out.budget),
            decision={**asdict(decision), "alpha": decision.alpha},
            plant=self.plant_name,
            plant_ms=(t2 - t1) * 1000,
            system1_ms=(t1 - t0) * 1000,
            schema_valid=adm.schema_valid,
            within_budget=adm.within_budget,
            fallback_used=adm.fallback_used,
            reason=adm.reason,
            lapse_alarms=self.tracker.alarms,
        )
        self.history.append(tel)
        self.asked[q.id] = len(self.history)
        doc = adm.document.model_dump(mode="json")
        return Item(q, doc, tel, self._client_view(q, doc), time.time())

    def respond(self, answer: str, hints_opened: int = 0) -> dict:
        item = self.current
        q = item.question
        g = grade(q, answer)
        before = self.tracker.mastery
        self.responses.append(g.correct)
        after = self.tracker.observe(g.correct)
        self.log.append(
            LogEntry(
                item=item.telemetry.item,
                question_id=q.id,
                level=q.level,
                prompt=q.prompt,
                answer=answer,
                correct_answer=q.answer,
                correct=g.correct,
                explanation=q.explanation,
                mastery_before=before,
                mastery_after=after,
                budget=item.telemetry.budget,
                hints_opened=hints_opened,
                seconds=round(time.time() - item.started, 1),
                plant=item.telemetry.plant,
                fallback_used=item.telemetry.fallback_used,
            )
        )
        self.current = self._next_item()
        return {"correct": g.correct, "message": g.message, "correct_answer": q.answer, "explanation": q.explanation, "prompt": q.prompt}


def _find_question(node: dict) -> dict:
    if node["type"] == "Stack":
        for child in node["children"]:
            found = _find_question(child)
            if found:
                return found
        return {}
    return node if node["type"] in ("ChoiceQuestion", "BlankQuestion") else {}


MASTERED = 0.95  # same mastery threshold as the governor setpoint P*


def topic_report(s: DemoSession) -> dict:
    n = len(s.log)
    correct = sum(e.correct for e in s.log)
    levels = sorted({e.level for e in s.log})
    mastery = s.tracker.mastery
    start = s.history[0].mastery if s.history else mastery
    if mastery >= MASTERED:
        status, advice = "mastered", "The model's estimate passed the mastery threshold. Move on to the next topic, or revisit later to check retention."
    elif n >= 4 and correct / n < 0.5:
        status, advice = "needs support", "Most answers were wrong. Re-read this topic's key points and work through the guided questions again with hints."
    elif n == 0:
        status, advice = "not started", "No answers yet."
    else:
        status, advice = "in progress", "Keep going: the screens will become more open as the estimate rises."
    return {
        "pack_id": s.pack.id,
        "pack_title": s.pack.title,
        "topic_id": s.topic.id,
        "topic_title": s.topic.title,
        "answered": n,
        "correct": correct,
        "accuracy": round(correct / n, 3) if n else None,
        "mastery_start": round(start, 3),
        "mastery_now": round(mastery, 3),
        "highest_level": max(levels) if levels else None,
        "levels_seen": levels,
        "hints_opened": sum(e.hints_opened for e in s.log),
        "minutes": round((time.time() - s.started) / 60, 1),
        "gemini_screens": sum(1 for t in s.history if t.plant == "gemini" and not t.fallback_used),
        "fallback_screens": sum(1 for t in s.history if t.fallback_used),
        "status": status,
        "advice": advice,
        "trace": [round(e.mastery_after, 3) for e in s.log],
        "missed": [
            {"prompt": e.prompt, "your_answer": e.answer, "correct_answer": e.correct_answer, "explanation": e.explanation, "level": e.level}
            for e in s.log
            if not e.correct
        ],
    }
