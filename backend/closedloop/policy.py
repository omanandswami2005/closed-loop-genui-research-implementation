"""System-1 micro-affordance policy (spec Section 5, Layer 2).

``SurrogatePolicy`` is a deterministic stand-in with the same inputs and the
same three typed decisions the Laya decider makes (choice / noul / score), so
the 1,000-learner harness does not depend on the Laya runtime. ``LayaPolicy``
answers the same decisions with the real Laya model (``closedloop.sim.laya_eval``
compares the two).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

ScaffoldingMode = Literal["worked_example", "guided_scaffold", "open_symbolic"]


@dataclass(frozen=True)
class PolicyDecision:
    scaffolding_mode: ScaffoldingMode  # choice("scaffolding_mode", ...)
    show_balance_scale: bool  # noul("display_balance_scale_manipulative")
    hint_enabled: bool
    density_limit: int  # score("instructional_density_limit", 1..5)
    graph_verification: bool  # level-4 transfer task (Cartesian plane)

    @property
    def alpha(self) -> int:
        """Abstraction score the plant must realize for this decision."""
        if self.show_balance_scale:
            return 1
        if self.scaffolding_mode == "guided_scaffold":
            return 2
        if self.scaffolding_mode == "open_symbolic":
            return 4 if self.graph_verification else 3
        return 1


class Policy(Protocol):
    def decide(self, mastery: float, budget: float, level: int, recent_errors: int) -> PolicyDecision: ...


class SurrogatePolicy:
    def decide(self, mastery: float, budget: float, level: int, recent_errors: int) -> PolicyDecision:
        if level <= 1:
            mode: ScaffoldingMode = "worked_example"
        elif level == 2:
            mode = "guided_scaffold"
        else:
            mode = "open_symbolic"
        # Regress to the concrete manipulative on a failure burst at level 2.
        show_scale = level == 1 or (level == 2 and recent_errors >= 3)
        density = min(5, max(1, 1 + round(4 * budget)))
        # A hint accordion needs a container (depth 2) plus at least one
        # control; below density 2 that cannot fit inside the budget.
        hint = level <= 2 and density >= 2 and (recent_errors >= 2 or mastery < 0.30)
        return PolicyDecision(mode, show_scale, hint, density, graph_verification=level >= 4)


_MODES: dict[str, str] = {
    "worked_example": "low mastery: the learner needs every step worked out and shown",
    "guided_scaffold": "partial mastery: the learner applies inverse operations with guidance",
    "open_symbolic": "high mastery: the learner solves the equation freely",
}
LAYA_QUESTIONS = {
    "scaffolding_mode": {
        "type": "choice",
        "instructions": "Which scaffolding mode fits this learner right now?",
        "criteria": _MODES,
    },
    "display_balance_scale_manipulative": {
        "type": "noul",
        "instructions": "Should the concrete balance-scale picture be shown to this learner?",
    },
    "enable_hint_button": {
        "type": "noul",
        "instructions": "Should a hint button be offered to this learner?",
    },
    "instructional_density_limit": {
        "type": "score",
        "instructions": "How much interface content can this learner handle at once?",
        "criteria": ["1 very little", "2 little", "3 moderate", "4 much", "5 a lot"],
    },
}


def describe_state(mastery: float, budget: float, level: int, recent_errors: int) -> str:
    """Plain-text learner state handed to Laya."""
    return (
        "A student is solving linear equations of the form ax + b = c. "
        f"Estimated probability the student has mastered the skill: {mastery:.2f}. "
        f"Interface complexity budget from the controller: {budget:.2f} on a 0 to 1 scale (level {level} of 4). "
        f"Wrong answers in the last five attempts: {recent_errors}."
    )


class LayaPolicy:
    """The same three decisions answered by the Laya System-1 decision model.

    Requires the optional ``laya`` package (``pip install -e ".[laya]"``); the
    model checkpoint downloads on first use. ``graph_verification`` stays a
    deterministic function of the level, as in the surrogate.
    """

    def __init__(self, router=None) -> None:
        if router is None:
            from laya import Router

            router = Router()
        self.router = router
        self.last_raw: dict | None = None

    def decide(self, mastery: float, budget: float, level: int, recent_errors: int) -> PolicyDecision:
        result = self.router.predict(describe_state(mastery, budget, level, recent_errors), LAYA_QUESTIONS)
        answers = result["answers"]
        self.last_raw = answers
        probs = answers["instructional_density_limit"]["probabilities"]
        density = 1 + int(max(probs, key=probs.get))
        # A hint needs density >= 2 to fit inside the budget (see SurrogatePolicy).
        hint = density >= 2 and answers["enable_hint_button"]["noul"] >= 0.5
        return PolicyDecision(
            scaffolding_mode=answers["scaffolding_mode"]["choice"],
            show_balance_scale=answers["display_balance_scale_manipulative"]["noul"] >= 0.5,
            hint_enabled=hint,
            density_limit=density,
            graph_verification=level >= 4,
        )
