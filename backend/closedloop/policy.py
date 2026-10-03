"""System-1 micro-affordance policy (spec Section 5, Layer 2).

``SurrogatePolicy`` is a deterministic stand-in with the same inputs and the
same three typed decisions the Laya decider makes (choice / noul / score), so
the simulation harness does not depend on the Laya runtime. A Laya-backed
implementation only has to provide ``decide`` with this signature.
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
