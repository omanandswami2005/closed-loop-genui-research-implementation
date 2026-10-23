"""Planner, deterministic builder, Gemini plant and validation gate for ``learn-ui/1``.

Mirrors ``closedloop.plant``: ``plan`` finds the closest admissible layout to
the committed budget M_I* under the policy decision, ``build`` compiles it from
the validated bank (this is also the fallback template), ``GeminiLearnPlant``
asks Gemini to write the screen's teaching text for this learner inside that
layout, and ``admit`` is the gate every plant output passes before rendering.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from dataclasses import dataclass

from closedloop.metric import DELTA_MAX, RHO_MAX, structural_complexity
from closedloop.plant import EPSILON
from closedloop.policy import PolicyDecision

from .bank import Question, Topic, _fold
from .components import (
    SCHEMA_VERSION,
    BlankQuestion,
    ChoiceQuestion,
    ConceptCard,
    ExampleStep,
    HintAccordion,
    LearnDocument,
    Prompt,
    Stack,
    Structure,
    WorkedExplanation,
    measure,
    parse,
    texts_in,
)
from .vertex import GeminiUnavailable, VertexJSON, hedged

STYLE_FOR_ALPHA = {1: "guided", 2: "plain", 4: "apply"}


@dataclass(frozen=True)
class Variant:
    """One concrete setting of the question node."""

    primary: int  # interactive elements of the question node
    options_shown: int = 0
    justify: bool = False
    word_bank: int = 0
    evidence: int = 0


@dataclass(frozen=True)
class Blueprint:
    alpha: int
    variant: Variant
    hint_tiers: int
    worked_steps: int
    concept: bool
    depth: int

    @property
    def rho(self) -> int:
        return self.variant.primary + self.hint_tiers

    @property
    def m_i(self) -> float:
        return structural_complexity(self.rho, self.alpha, self.depth)

    @property
    def extras(self) -> int:
        return int(self.hint_tiers > 0) + int(self.worked_steps > 0) + int(self.concept)

    def is_valid(self) -> bool:
        min_depth = 2 if self.extras else 1
        return self.rho <= RHO_MAX and min_depth <= self.depth <= DELTA_MAX and 1 + self.extras <= 4


def variants(alpha: int, q: Question, key_points: int) -> list[Variant]:
    if alpha == 3:
        out = [Variant(1)]
        out += [Variant(1 + n, word_bank=n) for n in range(2, min(4, 1 + len(q.distractors)) + 1)]
        return out
    out = []
    for n in range(2, len(q.options) + 1):
        out.append(Variant(n, options_shown=n))
        if alpha == 1:
            continue
        out.append(Variant(n + 1, options_shown=n, justify=True))
        if alpha == 4:
            for k in range(1, min(4, key_points) + 1):
                out.append(Variant(n + k, options_shown=n, evidence=k))
                out.append(Variant(n + k + 1, options_shown=n, justify=True, evidence=k))
    return out


def plan(budget: float, decision: PolicyDecision, q: Question, *, example_available: bool, key_points: int = 4) -> Blueprint:
    """Closest admissible blueprint to ``budget``; requested scaffolds are kept when within tolerance."""
    alpha = decision.alpha
    wants_hints = decision.hint_enabled
    hint_options = (*range(1, min(3, decision.density_limit, len(q.hints)) + 1), 0) if wants_hints else (0,)
    wants_worked = decision.scaffolding_mode == "worked_example" and example_available
    worked_options = (min(3, decision.density_limit), 0) if wants_worked else (0,)
    wants_concept = decision.scaffolding_mode != "open_symbolic"
    concept_options = (True, False) if wants_concept else (False,)
    best, best_bp = None, None
    for worked in worked_options:
        for concept in concept_options:
            for v in variants(alpha, q, key_points):
                for hints in hint_options:
                    for d in range(1, DELTA_MAX + 1):
                        bp = Blueprint(alpha, v, hints, worked, concept, d)
                        if not bp.is_valid():
                            continue
                        err = round(abs(bp.m_i - budget), 9)
                        ok = err <= EPSILON
                        dropped = (wants_worked and worked == 0) + (wants_concept and not concept) + (wants_hints and hints == 0)
                        key = (not ok, dropped if ok else 0, err, bp.rho, d)
                        if best is None or key < best:
                            best, best_bp = key, bp
    assert best_bp is not None, "every question has at least one admissible layout"
    return best_bp


# ---------------------------------------------------------------------------
# Deterministic builder (also the fallback template)

def _pad_prompts(bp: Blueprint) -> list[str]:
    """Framing sentences used as the extra nesting levels the budget asks for."""
    first = {
        1: "Read the key ideas first, then pick the answer.",
        2: "Think about what the idea means, then choose.",
        3: "Fill the gap from memory.",
        4: "Use what you know in a new situation.",
    }[bp.alpha]
    second = (
        "You can open the hints one at a time if you get stuck."
        if bp.hint_tiers
        else "Tick the key ideas you used; only the choice is marked."
        if bp.variant.evidence
        else "Say why in the box if you like; only the choice is marked."
        if bp.variant.justify
        else "Take your time and check each option."
        if bp.alpha != 3
        else "Spelling slips in longer words are accepted."
    )
    return [first, second]


def _question_node(bp: Blueprint, q: Question):
    v = bp.variant
    # A guided question without a concept card still gets a nudge (static text, no added depth).
    key_idea = q.hints[0] if bp.alpha == 1 and not bp.concept else None
    if bp.alpha == 3:
        return BlankQuestion(type="BlankQuestion", question_id=q.id, word_bank=v.word_bank)
    return ChoiceQuestion(
        type="ChoiceQuestion",
        question_id=q.id,
        style=STYLE_FOR_ALPHA[bp.alpha],
        options_shown=v.options_shown,
        justify=v.justify,
        evidence=v.evidence,
        key_idea=key_idea,
    )


def example_steps(example: Question, n: int) -> list[ExampleStep]:
    if n >= 3:
        return [
            ExampleStep(label="Example", text=example.prompt.replace("____", "___")),
            ExampleStep(label="Answer", text=example.answer),
            ExampleStep(label="Why", text=example.explanation),
        ]
    if n == 2:
        return [
            ExampleStep(label="Example", text=f"{example.prompt.replace('____', '___')} Answer: {example.answer}."),
            ExampleStep(label="Why", text=example.explanation),
        ]
    return [ExampleStep(label="Example", text=f"{example.prompt.replace('____', '___')} Answer: {example.answer}. {example.explanation}")]


def build(bp: Blueprint, q: Question, topic: Topic, example: Question | None) -> LearnDocument:
    node = _question_node(bp, q)
    if bp.depth == 1:
        root = node
    else:
        children = []
        if bp.concept:
            points = topic.key_points[:4]
            hi = next((i for i, p in enumerate(points) if _fold(p) == _fold(q.key_point)), None)
            if hi is None and bp.alpha == 1:  # guided: make sure the tested point is on the card
                points = [q.key_point, *points][:4]
                hi = 0
            children.append(ConceptCard(type="ConceptCard", title=topic.title, points=points, highlight=hi if bp.alpha == 1 else None))
        if bp.worked_steps and example is not None:
            children.append(WorkedExplanation(type="WorkedExplanation", steps=example_steps(example, bp.worked_steps)))
        children.append(node)
        if bp.hint_tiers:
            children.append(HintAccordion(type="HintAccordion", hints=q.hints[: bp.hint_tiers]))
        root = Stack(type="Stack", direction="vertical", children=children)
        pads = _pad_prompts(bp)
        for i in range(bp.depth - 2):
            root = Stack(type="Stack", direction="vertical", children=[Prompt(type="Prompt", text=pads[i % 2]), root])
    return LearnDocument(schema_version=SCHEMA_VERSION, question_id=q.id, root=root)


# ---------------------------------------------------------------------------
# Gemini plant: writes the teaching text for this learner inside the layout


@dataclass(frozen=True)
class Emission:
    text: str
    fault: str | None
    latency_ms: float = 0.0


_LEARN_SCHEMA_NOTE = """Node types (JSON, "type" field selects the node):
- Stack {direction: "vertical", children: [nodes]}
- Prompt {text}: one short sentence framing the task
- ConceptCard {title, points: [1-4 strings], highlight: index or null}
- WorkedExplanation {steps: [{label, text}]}
- HintAccordion {hints: [strings]}
- ChoiceQuestion / BlankQuestion: the question itself (fixed; copy it exactly), except a guided
  ChoiceQuestion's "key_idea": one short sentence (max 25 words) that nudges the learner towards the idea being tested.
  It must never name, quote or point to the correct option."""


def _outline(node) -> str:
    """A one-line description of the layout, so the model keeps every count."""
    if isinstance(node, Stack):
        return f"Stack of {len(node.children)} children [" + ", ".join(_outline(c) for c in node.children) + "]"
    if isinstance(node, ConceptCard):
        return f"ConceptCard with {len(node.points)} points"
    if isinstance(node, WorkedExplanation):
        return f"WorkedExplanation with {len(node.steps)} steps"
    if isinstance(node, HintAccordion):
        return f"HintAccordion with {len(node.hints)} hints"
    if isinstance(node, ChoiceQuestion) and node.key_idea:
        return "ChoiceQuestion (rewrite its key_idea only)"
    return type(node).__name__


def _fixed(value) -> dict:
    if isinstance(value, bool):
        return {"type": "BOOLEAN"}
    if isinstance(value, int):
        return {"type": "INTEGER", "minimum": value, "maximum": value}
    return {"type": "STRING", "enum": [value]}


def _obj(props: dict) -> dict:
    return {"type": "OBJECT", "properties": props, "required": list(props), "propertyOrdering": list(props)}


def _list(item: dict, n: int) -> dict:
    return {"type": "ARRAY", "items": item, "minItems": n, "maxItems": n}


def layout_schema(node) -> dict:
    """A response schema that pins the layout: node types, order and every count are fixed, only text is free."""
    text = {"type": "STRING"}
    if isinstance(node, Stack):
        return _obj({"type": _fixed("Stack"), "direction": _fixed(node.direction),
                     "children": {**_list({}, len(node.children)), "items": {"anyOf": [layout_schema(c) for c in node.children]}}})
    if isinstance(node, Prompt):
        return _obj({"type": _fixed("Prompt"), "text": text})
    if isinstance(node, ConceptCard):
        props = {"type": _fixed("ConceptCard"), "title": text, "points": _list(text, len(node.points))}
        if node.highlight is not None:
            props["highlight"] = _fixed(node.highlight)
        return _obj(props)
    if isinstance(node, WorkedExplanation):
        return _obj({"type": _fixed("WorkedExplanation"), "steps": _list(_obj({"label": text, "text": text}), len(node.steps))})
    if isinstance(node, HintAccordion):
        return _obj({"type": _fixed("HintAccordion"), "hints": _list(text, len(node.hints))})
    fields = {k: _fixed(v) for k, v in node.model_dump().items() if v is not None}
    if getattr(node, "key_idea", None):
        fields["key_idea"] = text
    return _obj(fields)


def gemini_prompt(template: LearnDocument, q: Question, topic: Topic, profile: dict) -> str:
    interests = profile.get("interests") or "general everyday life"
    grade = profile.get("grade") or "secondary school"
    return f"""You personalise one screen of an adaptive tutor. Output only JSON.

Learner: {profile.get("name") or "the learner"}, level: {grade}, interests: {interests}.
Topic: {topic.title}. The learner will answer this question (do NOT reveal or paraphrase its answer):
"{q.prompt}"

Below is the screen layout the complexity controller fixed. Return the SAME JSON structure: same node types, same order,
same number of children, points, steps and hints, same question node copied exactly, same "highlight" value.
Do not add or remove any node. The layout is exactly: {_outline(template.root)}.
Rewrite only the free text, for this learner:
- Prompt.text: one short sentence (max 25 words) framing the task, linking to their interests where natural.
- ConceptCard.points: the same facts in plain words for their level (max 25 words each); keep every fact accurate.
- WorkedExplanation.steps: keep labels; rewrite text so the worked example is clear, and where natural use an analogy
  from their interests. It is a different question from the one they will answer; keep its answer correct.
- HintAccordion.hints: graded hints from a gentle nudge to a strong clue, never stating the answer.
Facts must stay faithful to the topic's key points:
{chr(10).join("- " + p for p in topic.key_points)}

{_LEARN_SCHEMA_NOTE}

LAYOUT:
{template.model_dump_json()}"""


_PERSISTENT = ("401", "402", "403", "429")


class GeminiLearnPlant:
    """Gemini with a daily call cap and a circuit breaker; any failure goes to the deterministic template."""

    name = "gemini"

    def __init__(self, client: VertexJSON | None = None, cap: int | None = None) -> None:
        self._client = client
        self.cap = int(os.environ.get("GENUI_DEMO_GEMINI_DAILY_CAP", "0")) if cap is None else cap
        self._day, self.calls, self.open_until = "", 0, 0.0
        self._lock = threading.Lock()
        self.timeout_s = float(os.environ.get("GENUI_DEMO_ITEM_TIMEOUT", "25"))

    @property
    def client(self) -> VertexJSON:
        if self._client is None:
            self._client = VertexJSON(model=os.environ.get("GENUI_DEMO_SCREEN_MODEL", "gemini-3.5-flash-lite"), timeout_s=self.timeout_s)
        return self._client

    def available(self) -> bool:
        return time.time() >= self.open_until

    def generate(self, template: LearnDocument, q: Question, topic: Topic, profile: dict) -> Emission:
        with self._lock:
            if time.time() < self.open_until:
                return Emission("", "gemini unavailable: paused after a billing or quota error")
            if self.cap:
                today = time.strftime("%Y-%m-%d", time.gmtime())
                if today != self._day:
                    self._day, self.calls = today, 0
                if self.calls >= self.cap:
                    return Emission("", "gemini unavailable: daily call cap reached")
                self.calls += 1
        t0 = time.perf_counter()
        try:
            # The response schema pins the layout the controller chose; the gate still checks everything.
            prompt = gemini_prompt(template, q, topic, profile)
            schema = _obj({"schema_version": _fixed(SCHEMA_VERSION), "question_id": _fixed(q.id), "root": layout_schema(template.root)})
            reply = hedged(
                lambda: self.client.call(prompt, schema, thinking="LOW", temperature=0.5),
                hedge_after_s=float(os.environ.get("GENUI_DEMO_HEDGE_AFTER", "7")),
                copies=int(os.environ.get("GENUI_DEMO_HEDGE_COPIES", "3")),
                deadline_s=self.timeout_s,
            )
        except GeminiUnavailable as exc:
            if str(exc).rsplit(" ", 1)[-1] in _PERSISTENT:
                with self._lock:
                    self.open_until = time.time() + 600
            return Emission("", f"gemini unavailable: {exc}", (time.perf_counter() - t0) * 1000)
        return Emission(json.dumps(reply.data), None, reply.latency_ms)


# ---------------------------------------------------------------------------
# Validation gate


@dataclass(frozen=True)
class Admission:
    document: LearnDocument
    structure: Structure
    schema_valid: bool
    within_budget: bool
    fallback_used: bool
    reason: str | None


def leaks(doc: LearnDocument, q: Question) -> bool:
    """True when generated free text gives the answer away."""
    answers = [q.answer, *q.accepted]
    # For multiple choice the concept card may restate the tested key point (that is the guided scaffold).
    texts = texts_in_hints_and_prompts(doc.root) if q.kind == "choice" else texts_in(doc.root)
    pat = [re.compile(rf"\b{re.escape(_fold(a))}\b") for a in answers if len(_fold(a)) >= 3]
    return any(p.search(_fold(t)) for p in pat for t in texts)


def texts_in_hints_and_prompts(node) -> list[str]:
    """Text that must never give the answer away, even for multiple choice."""
    if isinstance(node, Stack):
        return [t for c in node.children for t in texts_in_hints_and_prompts(c)]
    if isinstance(node, Prompt):
        return [node.text]
    if isinstance(node, HintAccordion):
        return list(node.hints)
    if isinstance(node, ChoiceQuestion) and node.key_idea:
        return [node.key_idea]
    return []


def admit(text: str, budget: float, q: Question, fallback: LearnDocument, *, epsilon: float = EPSILON) -> Admission:
    """Schema, question integrity, answer-leak and budget checks; any failure renders ``fallback``."""

    def fb(schema_valid: bool, within: bool, reason: str) -> Admission:
        return Admission(fallback, measure(fallback), schema_valid, within, True, reason)

    doc, error = parse(text)
    if doc is None:
        return fb(False, False, f"schema: {error}")
    if doc.question_id != q.id:
        return fb(True, False, "integrity: screen references a different question")
    structure = measure(doc)
    within = abs(structure.m_i - budget) <= epsilon
    if leaks(doc, q):
        return fb(True, within, "leak: generated text contains the answer")
    if not within:
        return fb(True, False, "budget")
    return Admission(doc, structure, True, True, False, None)
