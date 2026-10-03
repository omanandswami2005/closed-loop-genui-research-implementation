"""CLT-UI declarative component AST (spec Section 4).

The generative plant may only emit a ``UIDocument`` as JSON. Nothing in the
tree is executable: every node is a typed record the React client maps onto a
pre-audited component. ``UIDocument.model_json_schema()`` is the response
schema handed to the model.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from .metric import ALPHA_MIN, DELTA_MAX, RHO_MAX, structural_complexity

SCHEMA_VERSION = "clt-ui/1"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class LinearExpr(_Strict):
    """coef_x * x + const."""

    coef_x: int = Field(ge=-20, le=20)
    const: int = Field(ge=-100, le=100)


class Equation(_Strict):
    """a * x + b = c, the problem every component refers to."""

    a: int = Field(ge=-20, le=20)
    b: int = Field(ge=-100, le=100)
    c: int = Field(ge=-100, le=100)

    @model_validator(mode="after")
    def _nonzero_coefficient(self) -> "Equation":
        if self.a == 0:
            raise ValueError("coefficient a must be nonzero")
        return self

    def latex(self) -> str:
        sign = "+" if self.b >= 0 else "-"
        return f"{self.a}x {sign} {abs(self.b)} = {self.c}"


class MathText(_Strict):
    type: Literal["MathText"]
    latex: str = Field(min_length=1, max_length=200)


class ConcreteBalanceScale(_Strict):
    type: Literal["ConcreteBalanceScale"]
    left: LinearExpr
    right: LinearExpr
    draggable_weights: int = Field(ge=1, le=6)


class WorkedStep(_Strict):
    operation: str = Field(min_length=1, max_length=40)
    result_latex: str = Field(min_length=1, max_length=120)
    explanation: str = Field(min_length=1, max_length=160)


class WorkedSolutionStep(_Strict):
    type: Literal["WorkedSolutionStep"]
    steps: list[WorkedStep] = Field(min_length=1, max_length=6)


class ScaffoldedOperationPad(_Strict):
    type: Literal["ScaffoldedOperationPad"]
    operations: list[Literal["+", "-", "*", "/"]] = Field(min_length=1, max_length=4)
    value_input: bool

    @model_validator(mode="after")
    def _unique_operations(self) -> "ScaffoldedOperationPad":
        if len(set(self.operations)) != len(self.operations):
            raise ValueError("operations must be unique")
        return self


class SymbolicEquationWorkspace(_Strict):
    type: Literal["SymbolicEquationWorkspace"]
    input_lines: int = Field(ge=1, le=6)


class SteppedHintAccordion(_Strict):
    type: Literal["SteppedHintAccordion"]
    hints: list[str] = Field(min_length=1, max_length=3)


class LineSpec(_Strict):
    slope: float = Field(ge=-50, le=50)
    intercept: float = Field(ge=-100, le=100)


class CartesianVerificationPlane(_Strict):
    type: Literal["CartesianVerificationPlane"]
    lines: list[LineSpec] = Field(min_length=1, max_length=2)
    draggable: bool
    parameter_sliders: int = Field(ge=0, le=4)


class Stack(_Strict):
    type: Literal["Stack"]
    direction: Literal["vertical", "horizontal"]
    children: list["Node"] = Field(min_length=1, max_length=4)


Node = Annotated[
    Union[
        Stack,
        MathText,
        ConcreteBalanceScale,
        WorkedSolutionStep,
        ScaffoldedOperationPad,
        SymbolicEquationWorkspace,
        SteppedHintAccordion,
        CartesianVerificationPlane,
    ],
    Field(discriminator="type"),
]
Stack.model_rebuild()

# Semantic abstraction score alpha per primary manipulative.
ABSTRACTION = {
    "ConcreteBalanceScale": 1,
    "ScaffoldedOperationPad": 2,
    "SymbolicEquationWorkspace": 3,
    "CartesianVerificationPlane": 4,
}


def interactive_count(node: Node) -> int:
    """rho contribution: buttons, draggable objects and input fields."""
    if isinstance(node, Stack):
        return sum(interactive_count(child) for child in node.children)
    if isinstance(node, ConcreteBalanceScale):
        return node.draggable_weights
    if isinstance(node, ScaffoldedOperationPad):
        return len(node.operations) + int(node.value_input)
    if isinstance(node, SymbolicEquationWorkspace):
        return node.input_lines
    if isinstance(node, SteppedHintAccordion):
        return len(node.hints)  # one reveal control per tier
    if isinstance(node, CartesianVerificationPlane):
        return 1 + (len(node.lines) if node.draggable else 0) + node.parameter_sliders
    return 0  # MathText, WorkedSolutionStep are static


def abstraction(node: Node) -> int:
    """alpha: the most abstract manipulative present (1 if none)."""
    if isinstance(node, Stack):
        return max((abstraction(child) for child in node.children), default=ALPHA_MIN)
    return ABSTRACTION.get(node.type, ALPHA_MIN)


def depth(node: Node) -> int:
    if isinstance(node, Stack):
        return 1 + max(depth(child) for child in node.children)
    return 1


class UIDocument(_Strict):
    schema_version: Literal["clt-ui/1"]
    equation: Equation
    root: Node

    @model_validator(mode="after")
    def _structural_bounds(self) -> "UIDocument":
        d = depth(self.root)
        if d > DELTA_MAX:
            raise ValueError(f"tree depth {d} exceeds {DELTA_MAX}")
        rho = interactive_count(self.root)
        if rho > RHO_MAX:
            raise ValueError(f"{rho} interactive elements exceeds {RHO_MAX}")
        if rho < 1:
            raise ValueError("document has no interactive element")
        return self


@dataclass(frozen=True)
class Structure:
    rho: int
    alpha: int
    delta: int

    @property
    def m_i(self) -> float:
        return structural_complexity(self.rho, self.alpha, self.delta)


def measure(doc: UIDocument) -> Structure:
    return Structure(interactive_count(doc.root), abstraction(doc.root), depth(doc.root))


def parse_document(text: str) -> tuple[UIDocument | None, str | None]:
    """Parse plant output; returns (document, None) or (None, error summary)."""
    try:
        return UIDocument.model_validate_json(text), None
    except ValidationError as exc:
        first = exc.errors()[0]
        return None, f"{first['type']}: {first['msg']}"
