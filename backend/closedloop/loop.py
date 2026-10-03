"""One learner's live closed loop: Layers 0-4 for a single session.

Same order as the benchmark (``sim/arms.py``): the interface for item n is
built from responses 0..n-1, then response n is checked and observed.
"""

from __future__ import annotations

import random
import time
from dataclasses import asdict, dataclass, field
from typing import Protocol

from .ast_schema import Equation
from .bkt import BKTParams, BKTTracker
from .checker import StepCheck, check_step, check_value, format_fraction, solution
from .governor import GovernorConfig, PIDGovernor
from .plant import Emission, SurrogatePlant, admit
from .policy import Policy, PolicyDecision, SurrogatePolicy

RECENT_WINDOW = 5
LAPSE_H = 6.5  # CUSUM lapse detector threshold (see closedloop.bkt)


class Plant(Protocol):
    def generate(self, budget: float, decision: PolicyDecision, eq: Equation, rng: random.Random) -> Emission: ...


def new_problem(rng: random.Random) -> Equation:
    """a x + b = c with an integer solution."""
    a = rng.choice([-1, 1]) * rng.randint(2, 9)
    x = rng.randint(-8, 8)
    b = rng.randint(-20, 20)
    return Equation(a=a, b=b, c=a * x + b)


@dataclass(frozen=True)
class Telemetry:
    item: int
    mastery: float  # P(L_n) the interface was built from
    error: float  # e_n
    integral: float
    derivative: float
    effort: float  # u_n
    budget_raw: float
    budget: float  # committed M_I*
    level: int
    m_i: float  # achieved M_I of the rendered tree
    rho: int
    alpha: int
    delta: int
    abs_error: float  # |M_I - M_I*|
    decision: dict
    plant: str
    plant_ms: float
    system1_ms: float
    schema_valid: bool
    within_budget: bool
    fallback_used: bool
    reason: str | None
    lapse_alarms: int


@dataclass
class Item:
    equation: Equation
    document: dict
    telemetry: Telemetry


@dataclass
class Outcome:
    correct: bool
    message: str
    solution: str
    steps: list[dict] = field(default_factory=list)


class LoopSession:
    def __init__(
        self,
        plant: Plant | None = None,
        plant_name: str = "surrogate",
        policy: Policy | None = None,
        seed: int | None = None,
        governor: GovernorConfig | None = None,
        bkt: BKTParams | None = None,
    ) -> None:
        self.seed = seed if seed is not None else random.randrange(2**31)
        self.rng = random.Random(self.seed)
        self.plant = plant or SurrogatePlant()
        self.plant_name = plant_name
        self.policy = policy or SurrogatePolicy()
        self.tracker = BKTTracker(bkt or BKTParams(lapse_threshold=LAPSE_H))
        self.governor = PIDGovernor(governor or GovernorConfig())
        self.responses: list[bool] = []
        self.history: list[Telemetry] = []
        self.current: Item = self._next_item()

    def _next_item(self) -> Item:
        eq = new_problem(self.rng)
        recent_errors = sum(1 for r in self.responses[-RECENT_WINDOW:] if not r)
        t0 = time.perf_counter()
        p = self.tracker.mastery
        out = self.governor.step(p)
        decision = self.policy.decide(p, out.budget, out.level, recent_errors)
        t1 = time.perf_counter()
        emission = self.plant.generate(out.budget, decision, eq, self.rng)
        t2 = time.perf_counter()
        adm = admit(emission.text, out.budget, decision, eq)
        s = adm.structure
        reason = adm.reason or (emission.fault if emission.fault and emission.fault != "drift" else None)
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
            reason=reason,
            lapse_alarms=self.tracker.alarms,
        )
        self.history.append(tel)
        return Item(eq, adm.document.model_dump(mode="json"), tel)

    def check(self, line: str) -> StepCheck:
        return check_step(self.current.equation, line)

    def respond(self, answer: str, steps: list[str] | None = None) -> Outcome:
        eq = self.current.equation
        step_checks = [{"line": s, **asdict(check_step(eq, s))} for s in (steps or []) if s.strip()]
        result = check_value(eq, answer)
        correct = result.solved
        self.responses.append(correct)
        self.tracker.observe(correct)
        outcome = Outcome(correct, result.message, format_fraction(solution(eq)), step_checks)
        self.current = self._next_item()
        return outcome
