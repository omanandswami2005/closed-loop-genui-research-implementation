"""``learn-ui/1``: the general-content component pack and its M_I measurement.

Same contract as the research schema (``closedloop.ast_schema``): a strict,
closed set of declarative nodes, measured with the same three terms
(interactive elements rho, abstraction alpha, nesting depth delta) and the same
metric. The question node only *references* a bank question by id; the
question text, options and answer key are filled in by the server from the
validated bank, so a generated screen can never change what counts as correct.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from closedloop.metric import ALPHA_MIN, DELTA_MAX, RHO_MAX, structural_complexity

SCHEMA_VERSION = "learn-ui/1"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Prompt(_Strict):
    type: Literal["Prompt"]
    text: str = Field(min_length=1, max_length=400)


class ConceptCard(_Strict):
    type: Literal["ConceptCard"]
    title: str = Field(min_length=1, max_length=120)
    points: list[str] = Field(min_length=1, max_length=4)
    highlight: int | None = Field(default=None, ge=0, le=3)  # index of the point the question tests


class ExampleStep(_Strict):
    label: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1, max_length=500)


class WorkedExplanation(_Strict):
    type: Literal["WorkedExplanation"]
    steps: list[ExampleStep] = Field(min_length=1, max_length=3)


class HintAccordion(_Strict):
    type: Literal["HintAccordion"]
    hints: list[str] = Field(min_length=1, max_length=3)


class ChoiceQuestion(_Strict):
    type: Literal["ChoiceQuestion"]
    question_id: str
    style: Literal["guided", "plain", "apply"]
    options_shown: int = Field(ge=2, le=4)
    justify: bool = False  # optional free-text "why" box (not graded)
    evidence: int = Field(default=0, ge=0, le=4)  # apply only: tick the key ideas that support the choice (not graded)
    key_idea: str | None = Field(default=None, min_length=1, max_length=300)  # guided only: the tested idea, shown above the options (static)

    @model_validator(mode="after")
    def _style_rules(self) -> "ChoiceQuestion":
        if self.style == "guided" and self.justify:
            raise ValueError("a guided question has no justification box")
        if self.style != "apply" and self.evidence:
            raise ValueError("only an apply question asks for supporting key ideas")
        if self.style != "guided" and self.key_idea:
            raise ValueError("only a guided question shows the key idea")
        return self


class BlankQuestion(_Strict):
    type: Literal["BlankQuestion"]
    question_id: str
    word_bank: int = Field(ge=0, le=4)  # chips shown (answer + decoys); 0 = type it yourself

    @model_validator(mode="after")
    def _bank_size(self) -> "BlankQuestion":
        if self.word_bank == 1:
            raise ValueError("a word bank needs at least 2 chips")
        return self


class Stack(_Strict):
    type: Literal["Stack"]
    direction: Literal["vertical", "horizontal"]
    children: list["Node"] = Field(min_length=1, max_length=4)


Node = Annotated[
    Union[Stack, Prompt, ConceptCard, WorkedExplanation, HintAccordion, ChoiceQuestion, BlankQuestion],
    Field(discriminator="type"),
]
Stack.model_rebuild()

STYLE_ALPHA = {"guided": 1, "plain": 2, "apply": 4}


def interactive_count(node) -> int:
    if isinstance(node, Stack):
        return sum(interactive_count(c) for c in node.children)
    if isinstance(node, HintAccordion):
        return len(node.hints)
    if isinstance(node, ChoiceQuestion):
        return node.options_shown + int(node.justify) + node.evidence
    if isinstance(node, BlankQuestion):
        return 1 + node.word_bank
    return 0


def abstraction(node) -> int:
    if isinstance(node, Stack):
        return max((abstraction(c) for c in node.children), default=ALPHA_MIN)
    if isinstance(node, ChoiceQuestion):
        return STYLE_ALPHA[node.style]
    if isinstance(node, BlankQuestion):
        return 3
    return ALPHA_MIN


def depth(node) -> int:
    if isinstance(node, Stack):
        return 1 + max(depth(c) for c in node.children)
    return 1


def questions_in(node) -> list:
    if isinstance(node, Stack):
        return [q for c in node.children for q in questions_in(c)]
    return [node] if isinstance(node, (ChoiceQuestion, BlankQuestion)) else []


def texts_in(node) -> list[str]:
    """All generated free text (checked for answer leaks by the gate)."""
    if isinstance(node, Stack):
        return [t for c in node.children for t in texts_in(c)]
    if isinstance(node, Prompt):
        return [node.text]
    if isinstance(node, ConceptCard):
        return [node.title, *node.points]
    if isinstance(node, ChoiceQuestion) and node.key_idea:
        return [node.key_idea]
    if isinstance(node, HintAccordion):
        return list(node.hints)
    return []


class LearnDocument(_Strict):
    schema_version: Literal["learn-ui/1"]
    question_id: str
    root: Node

    @model_validator(mode="after")
    def _bounds(self) -> "LearnDocument":
        d = depth(self.root)
        if d > DELTA_MAX:
            raise ValueError(f"tree depth {d} exceeds {DELTA_MAX}")
        rho = interactive_count(self.root)
        if rho > RHO_MAX:
            raise ValueError(f"{rho} interactive elements exceeds {RHO_MAX}")
        qs = questions_in(self.root)
        if len(qs) != 1:
            raise ValueError(f"screen must hold exactly one question, found {len(qs)}")
        if qs[0].question_id != self.question_id:
            raise ValueError("question node does not reference the screen's question")
        return self


@dataclass(frozen=True)
class Structure:
    rho: int
    alpha: int
    delta: int

    @property
    def m_i(self) -> float:
        return structural_complexity(self.rho, self.alpha, self.delta)


def measure(doc: LearnDocument) -> Structure:
    return Structure(interactive_count(doc.root), abstraction(doc.root), depth(doc.root))


def parse(text: str) -> tuple[LearnDocument | None, str | None]:
    try:
        return LearnDocument.model_validate_json(text), None
    except ValidationError as exc:
        first = exc.errors()[0]
        return None, f"{first['type']}: {first['msg']}"
