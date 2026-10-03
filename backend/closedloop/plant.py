"""Generative plant, validation gate and deterministic fallback (Layers 3-4).

``plan`` + ``build`` form a deterministic compiler from (budget, policy
decision, equation) to the closest admissible CLT-UI tree. ``SurrogatePlant``
wraps that compiler with configurable fault injection so the in-silico
benchmark can stand in for the foundation model: with some probability it
drifts off the budget, with some probability it emits malformed output.
``admit`` is the gate every plant output passes before rendering.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, replace
from functools import lru_cache

from .ast_schema import (
    SCHEMA_VERSION,
    CartesianVerificationPlane,
    ConcreteBalanceScale,
    Equation,
    LinearExpr,
    LineSpec,
    MathText,
    ScaffoldedOperationPad,
    Stack,
    SteppedHintAccordion,
    Structure,
    SymbolicEquationWorkspace,
    UIDocument,
    WorkedSolutionStep,
    WorkedStep,
    measure,
    parse_document,
)
from .metric import DELTA_MAX, RHO_MAX, structural_complexity
from .policy import PolicyDecision

EPSILON = 0.05  # admissible constraint error |M_I - M_I*|

# Range of the primary manipulative's interactive-element parameter per alpha.
PRIMARY_RANGE = {1: (1, 6), 2: (1, 5), 3: (1, 6), 4: (1, 7)}
_OPS = ("+", "-", "*", "/")


@dataclass(frozen=True)
class Blueprint:
    alpha: int
    primary: int  # interactive elements in the primary manipulative
    hint_tiers: int
    worked_steps: int
    depth: int

    @property
    def rho(self) -> int:
        return self.primary + self.hint_tiers

    @property
    def m_i(self) -> float:
        return structural_complexity(self.rho, self.alpha, self.depth)

    def is_valid(self) -> bool:
        lo, hi = PRIMARY_RANGE[self.alpha]
        min_depth = 2 if (self.hint_tiers or self.worked_steps) else 1
        return lo <= self.primary <= hi and self.rho <= RHO_MAX and min_depth <= self.depth <= DELTA_MAX


def plan(budget: float, decision: PolicyDecision) -> Blueprint:
    """Closest admissible blueprint to ``budget`` under the policy decision."""
    hint_options = range(1, min(3, decision.density_limit) + 1) if decision.hint_enabled else (0,)
    worked = min(3, decision.density_limit) if decision.scaffolding_mode == "worked_example" else 0
    lo, hi = PRIMARY_RANGE[decision.alpha]
    best: tuple[float, int, int] | None = None
    best_bp: Blueprint | None = None
    for primary in range(lo, hi + 1):
        for hints in hint_options:
            for d in range(1, DELTA_MAX + 1):
                bp = Blueprint(decision.alpha, primary, hints, worked, d)
                if not bp.is_valid():
                    continue
                key = (round(abs(bp.m_i - budget), 9), bp.rho, d)  # prefer simpler on ties
                if best is None or key < best:
                    best, best_bp = key, bp
    assert best_bp is not None
    return best_bp


def _primary_node(bp: Blueprint, eq: Equation):
    p = bp.primary
    if bp.alpha == 1:
        return ConcreteBalanceScale(
            type="ConcreteBalanceScale",
            left=LinearExpr(coef_x=eq.a, const=eq.b),
            right=LinearExpr(coef_x=0, const=eq.c),
            draggable_weights=p,
        )
    if bp.alpha == 2:
        if p == 1:
            return ScaffoldedOperationPad(type="ScaffoldedOperationPad", operations=["-"], value_input=False)
        return ScaffoldedOperationPad(type="ScaffoldedOperationPad", operations=list(_OPS[: p - 1]), value_input=True)
    if bp.alpha == 3:
        return SymbolicEquationWorkspace(type="SymbolicEquationWorkspace", input_lines=p)
    line = LineSpec(slope=float(eq.a), intercept=float(eq.b))
    target = LineSpec(slope=0.0, intercept=float(eq.c))
    lines = [line] if p <= 2 else [line, target]
    return CartesianVerificationPlane(
        type="CartesianVerificationPlane",
        lines=lines,
        draggable=p >= 2,
        parameter_sliders=max(0, p - 3),
    )


def _worked_steps(eq: Equation, n: int) -> WorkedSolutionStep:
    rhs = eq.c - eq.b
    steps = [
        WorkedStep(
            operation=f"subtract {eq.b} from both sides",
            result_latex=f"{eq.a}x = {rhs}",
            explanation="Undo the constant term so only the x-term remains on the left.",
        ),
        WorkedStep(
            operation=f"divide both sides by {eq.a}",
            result_latex=f"x = \\frac{{{rhs}}}{{{eq.a}}}",
            explanation="Undo the coefficient to isolate x.",
        ),
        WorkedStep(
            operation="substitute back",
            result_latex=f"{eq.a}\\cdot\\frac{{{rhs}}}{{{eq.a}}} + {eq.b} = {eq.c}",
            explanation="Check that both sides of the balance are equal.",
        ),
    ]
    return WorkedSolutionStep(type="WorkedSolutionStep", steps=steps[:n])


_HINTS = (
    "What operation is applied to x last?",
    "Apply the inverse operation to both sides.",
    "Isolate the x-term first, then divide by its coefficient.",
)


def build(bp: Blueprint, eq: Equation) -> UIDocument:
    primary = _primary_node(bp, eq)
    if bp.depth == 1:
        root = primary
    else:
        children = [primary]
        if bp.hint_tiers:
            children.append(SteppedHintAccordion(type="SteppedHintAccordion", hints=list(_HINTS[: bp.hint_tiers])))
        if bp.worked_steps:
            children.append(_worked_steps(eq, bp.worked_steps))
        root = Stack(type="Stack", direction="vertical", children=children)
        for _ in range(bp.depth - 2):
            prompt = MathText(type="MathText", latex=eq.latex())
            root = Stack(type="Stack", direction="vertical", children=[prompt, root])
    return UIDocument(schema_version=SCHEMA_VERSION, equation=eq, root=root)


# --------------------------------------------------------------------------
# Deterministic fallback cache

FALLBACK_GRID = 40  # budgets cached at multiples of 1/40


@lru_cache(maxsize=None)
def _fallback_blueprint(grid_index: int, decision: PolicyDecision) -> Blueprint:
    return plan(grid_index / FALLBACK_GRID, decision)


def fallback_document(budget: float, decision: PolicyDecision, eq: Equation) -> UIDocument:
    """Pre-compiled template nearest to ``budget``; never calls the plant."""
    index = min(FALLBACK_GRID, max(0, round(budget * FALLBACK_GRID)))
    return build(_fallback_blueprint(index, decision), eq)


# --------------------------------------------------------------------------
# Surrogate generative plant

FAULT_KINDS = ("truncated_json", "unknown_component", "out_of_range", "depth_overflow", "injected_field")


@dataclass(frozen=True)
class PlantConfig:
    p_malformed: float = 0.03  # probability of a schema-invalid emission
    p_drift: float = 0.15  # probability of a structurally valid but off-budget emission


@dataclass(frozen=True)
class Emission:
    text: str
    fault: str | None  # injected fault kind, or "drift", or None


def _drift(bp: Blueprint, rng: random.Random) -> Blueprint:
    for _ in range(8):
        if rng.random() < 0.5:
            cand = replace(bp, primary=bp.primary + rng.choice((-2, -1, 1, 2)))
        else:
            cand = replace(bp, depth=bp.depth + rng.choice((-1, 1)))
        if cand.is_valid():
            return cand
    return bp


def _corrupt(doc: UIDocument, kind: str) -> str:
    data = doc.model_dump(mode="json")
    if kind == "truncated_json":
        text = json.dumps(data)
        return text[: len(text) // 2]
    if kind == "unknown_component":
        data["root"] = {"type": "RawHTML", "html": "<div>x</div>"}
    elif kind == "out_of_range":
        data["equation"]["a"] = 0
    elif kind == "depth_overflow":
        for _ in range(DELTA_MAX):
            data["root"] = {"type": "Stack", "direction": "vertical", "children": [data["root"]]}
    elif kind == "injected_field":
        data["root"]["onClick"] = "eval(payload)"
    return json.dumps(data)


class SurrogatePlant:
    def __init__(self, config: PlantConfig | None = None) -> None:
        self.config = config or PlantConfig()

    def generate(self, budget: float, decision: PolicyDecision, eq: Equation, rng: random.Random) -> Emission:
        bp = plan(budget, decision)
        fault = None
        if rng.random() < self.config.p_drift:
            drifted = _drift(bp, rng)
            if drifted != bp:
                bp, fault = drifted, "drift"
        doc = build(bp, eq)
        if rng.random() < self.config.p_malformed:
            kind = rng.choice(FAULT_KINDS)
            return Emission(_corrupt(doc, kind), kind)
        return Emission(doc.model_dump_json(), fault)


# --------------------------------------------------------------------------
# Validation gate


@dataclass(frozen=True)
class Admission:
    document: UIDocument
    structure: Structure
    schema_valid: bool
    within_budget: bool  # of the plant output, before any fallback
    fallback_used: bool
    reason: str | None


def admit(
    text: str,
    budget: float,
    decision: PolicyDecision,
    eq: Equation,
    *,
    check_budget: bool = True,
    epsilon: float = EPSILON,
) -> Admission:
    """Schema check, then (optionally) the |M_I - M_I*| <= epsilon check.

    Any failure renders the deterministic fallback template instead.
    """
    doc, error = parse_document(text)
    if doc is None:
        fb = fallback_document(budget, decision, eq)
        return Admission(fb, measure(fb), False, False, True, f"schema: {error}")
    structure = measure(doc)
    within = abs(structure.m_i - budget) <= epsilon
    if check_budget and not within:
        fb = fallback_document(budget, decision, eq)
        return Admission(fb, measure(fb), True, False, True, "budget")
    return Admission(doc, structure, True, within, False, None)
