"""Gemini composes a personalised interactive lab per topic from the ``lab-ui/1`` catalog.

Like Google's generative-UI learning interactives: a short run of levels that
get harder, each with an intro, a goal, graded hints, feedback and a worked
solution, plus a toolbox of key facts. Gemini chooses the components and
writes their data; ``widgets.parse_station`` validates each station and
re-computes its solution. If fewer than ``MIN_STATIONS`` survive (or Gemini is
unavailable), the lab is topped up from a deterministic template built from
the validated question bank.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path

from .bank import BLANK, Pack, Topic
from .vertex import GeminiUnavailable, VertexJSON, hedged
from .widgets import CATALOG, HANDS_ON, SIMULATIONS, Lab, parse_station

MIN_STATIONS = 3
MAX_STATIONS = 4
LAB_DIR = Path(os.environ.get("GENUI_DEMO_CACHE", "/tmp/genui-demo-packs")) / "labs"

CATALOG_DOC = """HANDS-ON MANIPULATIVES
- SequenceSort {items:[3-7 strings in the correct order]}  learner drags steps into order.
- CategorySort {categories:[2-3 {name, items:[2-5 strings]}]}  learner drags items into groups (max 12 items).
- MatchPairs {pairs:[3-6 {left, right}]}  learner connects terms with definitions/examples.
- CycleBuilder {center, stages:[3-6 strings in cyclic order]}  learner places stages around a cycle.
- Timeline {unit, events:[3-6 {label, value:number (time), display:"1905"}]}  learner orders events on a time axis.
- LabelDiagram {layout:"flow"|"layers"|"hub"|"cycle", center, parts:[3-6 {label, clue}]}  learner drags labels onto the boxes of a diagram described by clues.
- BalanceScale {unit, left:[1-4 {label, value>0}], tray:[2-6 {label, value>0}], answer:[tray indices whose values sum to the left pan]}  learner balances the scale.
- NumberLine {min, max, step, unit, markers:[2-4 {label, value}]}  learner drags markers to where they belong.
- CauseEffect {links:[3-5 {cause, effect}]}  learner draws arrows from causes to effects.
- ClozeBank {text with 2-5 gaps written [[word]], distractors:[1-4 words]}  learner drags words into gaps.
- ProportionBar {whole, segments:[2-5 {label, value}] summing to 100, tolerance}  learner drags dividers to estimate a composition.
- ForceArrows {object, unit, step, forces:[2-4 {label, direction:"left"|"right"|"up"|"down", value, adjustable, max}], target_x, target_y, answer:[magnitude per force]}  learner sets forces to reach a net force (right/up positive).
- Mixer {product, ingredients:[2-4 {label, unit, max, step, answer>0}]}  learner mixes amounts in the right ratio (any multiple of the answer works).
- ToggleSystem {switches:[2-4], outcomes:[{on:[switches that are on], result}], default_result, target_result}  learner flips switches to find the setting that gives target_result.
- ExploreDiagram {layout, center, parts:[3-6 {label, detail}]}  learner opens every part of a diagram to read about it.

SIMULATIONS AND EXPLORABLES
- ParameterLab {expression (formula of the parameter names), output_label, output_unit, params:[1-3 PARAM], target, tolerance}  learner moves sliders until the computed output hits the target.
- FunctionPlot {expression (formula of x and parameter names), x_min, x_max, x_label, y_label, params:[1-3 PARAM]}  learner moves sliders until their curve matches the dashed target curve (drawn at the answers).
- Projectile {speed:SLIDER (m/s), angle:SLIDER (degrees, 1-89), gravity, target_distance, tolerance}  learner launches until it lands on the target.
- Pendulum {length:SLIDER (m), gravity, target_period, tolerance}  learner sets the length for a period (T = 2*pi*sqrt(L/g)).
- WaveExplorer {amplitude:SLIDER, frequency:SLIDER, phase:SLIDER (degrees), x_label, y_label}  learner matches a target wave.
- GrowthCurve {model:"exponential"|"decay"|"logistic", start_value, capacity (logistic), rate:SLIDER, t_max, t_label, y_label, target_time, target_value}  learner sets the rate so the curve passes the target point.
- TrendLine {points:[4-12 {x,y}], x_label, y_label}  learner fits a line by dragging slope and intercept.
- DataCursor {series:[1-3 {label, points:[3-20 {x,y} increasing x]}], x_label, y_label, question, answer_x, tolerance}  learner drags a cursor across real data to answer a question.
- ProcessScrubber {unit, stages:[3-6 {label, duration, detail}], target_stage}  learner scrubs through an animated process and stops at target_stage.
- PredictObserve {setup, change, options:[2-4], answer (one option), observation, measure:{label, before, after}}  learner predicts, runs the experiment, then sees the result.
- ScenarioBranch {steps:[2-4 {situation, choices:[2-3 {text, correct, feedback}] with exactly one correct}]}  learner makes decisions in a realistic situation.
- SpotTheError {statements:[3-6 {text, wrong, correction (if wrong)}]}  learner finds the false statements.
- ConceptMap {nodes:[3-6 concepts], edges:[2-6 {source, target, label}]}  learner labels the links between concepts.
- Flashcards {cards:[3-8 {front, back}]}  learner recalls, flips and self-checks.
- DraggableBars {unit, y_max, bars:[2-6 {label, value}], tolerance}  learner drags bars to estimate real values.

PARAM = {name (identifier, not x/t/e/pi), label, unit, min, max, step, value (start), answer (meets the goal)}
SLIDER = {min, max, value (start), answer (meets the goal)}
Formulas: numbers, parameter names, x, + - * / ^ ( ), sin cos tan exp log sqrt abs min max, pi, e. Use * explicitly."""

LAB_PROMPT = """You design an interactive learning lab, like Google's generative-UI learning interactives:
a short run of {n} levels that get progressively harder, each one a hands-on interactive component.

Learner: {name}, level: {grade}, interests: {interests}.
Topic: {title}
Summary: {summary}
Key points (the facts the lab must teach; stay faithful to them and to the source):
{points}
Source excerpt:
<<<
{excerpt}
>>>

Choose {n} DIFFERENT components from the catalog below that best fit THIS content. Prefer components where the learner
manipulates something meaningful: order a process, sort, match, balance, label a diagram, run a simulation, set a slider.
Use a simulation (ParameterLab, FunctionPlot, Projectile, Pendulum, GrowthCurve, WaveExplorer) only when the topic really has
a quantitative relationship; never invent formulas that are not true. Mix at least one hands-on manipulative and at least
one simulation or explorable. Order levels from easiest to hardest.

Each station has the shared fields:
  type, title (max 8 words), intro (1-2 sentences that activate prior knowledge, linked to the learner's interests where
  natural), goal (one sentence: exactly what to do), hints (2-3, gentle nudge to strong clue), solution (worked solution),
  explain (why the answer is right, 1-2 sentences)
plus the fields of its component. All content must be factually correct and at the learner's level.

CATALOG
{catalog}

Return JSON: {{"title": "...", "intro": "one sentence welcoming the learner to the lab", "toolbox": ["3-5 short key facts or
formulas the learner can consult"], "stations": [ ... ]}}"""


REPAIR_PROMPT = """These lab stations were rejected by a validator. Fix each one so it is valid for its component in
the catalog and its challenge is solvable (check the arithmetic: answers must actually meet the goal). Keep the same
component type unless it cannot fit, keep the content faithful. Every station must ALSO have the shared fields:
type, title, intro, goal, hints (2-3), solution, explain. Return JSON: {{"stations": [fixed stations]}}.

CATALOG
{catalog}

REJECTED
{items}"""


def lab_prompt(topic: Topic, profile: dict, excerpt: str = "") -> str:
    return LAB_PROMPT.format(
        n=MAX_STATIONS,
        name=profile.get("name") or "the learner",
        grade=profile.get("grade") or "secondary school",
        interests=profile.get("interests") or "everyday life",
        title=topic.title,
        summary=topic.summary,
        points="\n".join(f"- {p}" for p in topic.key_points),
        excerpt=excerpt or "\n".join(f"- {q.explanation}" for q in topic.questions[:10]),
        catalog=CATALOG_DOC,
    )


def template_stations(topic: Topic) -> list:
    """Deterministic stations from the validated bank (the fallback)."""
    out = []
    pts = topic.key_points
    if len(pts) >= 3:
        out.append({
            "type": "ExploreDiagram", "layout": "hub", "center": topic.title[:40],
            "parts": [{"label": f"Key idea {i + 1}", "detail": p[:260]} for i, p in enumerate(pts[:6])],
            "title": "Explore the key ideas", "intro": topic.summary[:320],
            "goal": "Open every part of the diagram and read the idea behind it.",
            "hints": ["Click a box to open it."], "solution": "Open each box in turn; each holds one key idea of the topic.",
            "explain": "These are the ideas the questions will check.",
        })
    blanks = [q for q in topic.questions if q.kind == "blank" and BLANK in q.prompt]
    seen, gaps, distract = set(), [], []
    for q in blanks:
        w = q.answer.strip()
        if " " in w or w.lower() in seen or len(w) > 30:
            continue
        seen.add(w.lower())
        gaps.append(q.prompt.replace(BLANK, f"[[{w}]]", 1))
        distract += [d for d in q.distractors if d.lower() not in seen and " " not in d]
        if len(gaps) == 3:
            break
    distract = [d for i, d in enumerate(dict.fromkeys(distract)) if d.lower() not in seen][:3]
    if len(gaps) >= 2 and distract:
        out.append({
            "type": "ClozeBank", "text": " ".join(gaps)[:800], "distractors": distract,
            "title": "Fill the gaps", "intro": "Complete the sentences with the right words from the bank.",
            "goal": "Drag a word into every gap; some words are decoys.", "hints": [blanks[0].hints[0]],
            "solution": "The missing words are: " + ", ".join(re.findall(r"\[\[(.*?)\]\]", " ".join(gaps))) + ".",
            "explain": blanks[0].explanation[:400],
        })
    mcq = [q for q in topic.questions if q.kind == "choice" and len(q.answer) <= 110 and len(q.prompt) <= 60]
    if len(mcq) < 3:
        mcq = [q for q in topic.questions if q.kind == "choice" and len(q.answer) <= 120]
    cards = [{"front": q.prompt[:130], "back": q.answer[:220]} for q in mcq[:5]]
    if len(cards) >= 3:
        out.append({
            "type": "Flashcards", "cards": cards, "title": "Quick recall",
            "intro": "Try to answer each card in your head before you flip it.",
            "goal": "Flip every card and mark whether you knew it.", "hints": ["Say your answer out loud before flipping."],
            "solution": "The back of each card holds the answer.", "explain": "Recalling before checking makes memories stronger.",
        })
    return out


class LabStore:
    """One lab per (pack, topic, learner level and interests): memory plus disk cache."""

    def __init__(self, client: VertexJSON | None = None, cache_dir: Path = LAB_DIR) -> None:
        self._client = client
        self.cache_dir = cache_dir
        self._mem: dict[str, Lab] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()

    @property
    def client(self) -> VertexJSON:
        if self._client is None:
            self._client = VertexJSON(model=os.environ.get("GENUI_DEMO_LAB_MODEL", "gemini-3-flash-preview"))
        return self._client

    @staticmethod
    def key(pack: Pack, topic: Topic, profile: dict, plant: str) -> str:
        who = f"{profile.get('grade', '')}|{profile.get('interests', '')}|{plant}".lower()
        return f"{pack.id}-{topic.id}-" + hashlib.sha256(who.encode()).hexdigest()[:10]

    def get(self, pack: Pack, topic: Topic, profile: dict, *, use_gemini: bool = True, excerpt: str = "") -> Lab:
        k = self.key(pack, topic, profile, "gemini" if use_gemini else "template")
        with self._lock:
            if k in self._mem:
                return self._mem[k]
            lock = self._locks.setdefault(k, threading.Lock())
        with lock:  # concurrent requests for the same lab wait for one generation
            if k in self._mem:
                return self._mem[k]
            path = self.cache_dir / f"{k}.json"
            if path.exists():
                lab = Lab.model_validate_json(path.read_text())
            else:
                lab = self.compose(topic, profile, use_gemini=use_gemini, excerpt=excerpt)
                if lab.source != "template" or not use_gemini:
                    self.cache_dir.mkdir(parents=True, exist_ok=True)
                    path.write_text(lab.model_dump_json(indent=1))
            with self._lock:
                self._mem[k] = lab
            return lab

    @staticmethod
    def _admit(raws: list, stations: list, used: set, rejected: list, repaired: bool = False) -> list:
        failed = []
        for raw in raws:
            st, why = parse_station(raw)
            if st is None:
                rejected.append(("after repair: " if repaired else "") + why)
                failed.append((raw, why))
            elif st.type in used:
                rejected.append(f"{st.type}: duplicate component")
            else:
                used.add(st.type)
                stations.append(st)
        return failed

    def compose(self, topic: Topic, profile: dict, *, use_gemini: bool = True, excerpt: str = "") -> Lab:
        rejected: list[str] = []
        stations, title, intro, toolbox, latency = [], "", "", [], 0.0
        if use_gemini:
            t0 = time.perf_counter()
            try:
                prompt = lab_prompt(topic, profile, excerpt)
                data = hedged(lambda: self.client.call(prompt, None, thinking="LOW", temperature=0.6),
                              hedge_after_s=float(os.environ.get("GENUI_DEMO_LAB_HEDGE_AFTER", "35")), copies=3, deadline_s=100).data
                title, intro = str(data.get("title", ""))[:100], str(data.get("intro", ""))[:400]
                toolbox = [str(t)[:200] for t in data.get("toolbox", []) if str(t).strip()][:6]
                used: set[str] = set()
                failed = self._admit(data.get("stations", [])[:6], stations, used, rejected)
                if failed and len(stations) < MAX_STATIONS:
                    # Self-correction: the gate's reasons go back to Gemini once, like Google's check-and-fix loop.
                    fix = REPAIR_PROMPT.format(catalog=CATALOG_DOC, items=json.dumps([{"station": r, "error": e} for r, e in failed])[:12000])
                    try:
                        again = hedged(lambda: self.client.call(fix, None, thinking="LOW", temperature=0.3),
                                       hedge_after_s=25, copies=2, deadline_s=60).data
                        self._admit(again.get("stations", [])[: MAX_STATIONS - len(stations)], stations, used, rejected, repaired=True)
                    except GeminiUnavailable as exc:
                        rejected.append(f"repair unavailable: {exc}")
            except GeminiUnavailable as exc:
                rejected.append(f"gemini unavailable: {exc}")
            latency = (time.perf_counter() - t0) * 1000
        n_gemini = len(stations)
        stations = stations[:MAX_STATIONS]
        if len(stations) < MIN_STATIONS:
            have = {s.type for s in stations}
            for raw in template_stations(topic):
                if len(stations) >= MIN_STATIONS:
                    break
                st, _ = parse_station(raw)
                if st is not None and st.type not in have:
                    stations.append(st)
                    have.add(st.type)
        for i, st in enumerate(stations):
            st.id = f"s{i + 1}"
        source = "gemini" if n_gemini >= len(stations) else "template" if n_gemini == 0 else "mixed"
        return Lab(
            title=title if len(title) >= 2 else f"{topic.title}: interactive lab",
            intro=intro if len(intro) >= 4 else topic.summary[:400],
            toolbox=toolbox or [p[:200] for p in topic.key_points[:5]],
            stations=stations,
            source=source,
            model=self.client.model if use_gemini and n_gemini else "",
            latency_ms=round(latency, 1),
            rejected=rejected,
        )


def catalog_summary() -> dict:
    return {"hands_on": [c.__name__ for c in HANDS_ON], "simulations": [c.__name__ for c in SIMULATIONS], "count": len(CATALOG)}


def lab_json(lab: Lab) -> dict:
    return json.loads(lab.model_dump_json())


GALLERY = Path(__file__).with_name("gallery.json")


def gallery_json() -> dict:
    """The component gallery: one example station per component, each re-validated by the gate."""
    stations, rejected = [], []
    for raw in json.loads(GALLERY.read_text())["stations"]:
        st, why = parse_station(raw)
        if st is None:
            rejected.append(why)
        else:
            stations.append(json.loads(st.model_dump_json()))
    return {"schema_version": "lab-ui/1", "stations": stations, "rejected": rejected, **catalog_summary()}
