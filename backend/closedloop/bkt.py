"""Bayesian Knowledge Tracing (spec Section 6.1).

Closed-form single-skill BKT update. pyBKT is only needed to *fit* the four
parameters from logged data; the runtime update is these two equations.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BKTParams:
    p_l0: float = 0.15  # prior mastery P(L_0)
    p_t: float = 0.12  # transition (learn) probability P(T)
    p_g: float = 0.20  # guess probability P(G)
    p_s: float = 0.08  # slip probability P(S)

    def __post_init__(self) -> None:
        for name in ("p_l0", "p_t", "p_g", "p_s"):
            value = getattr(self, name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name}={value} outside [0, 1]")
        if self.p_g + self.p_s >= 1.0:
            raise ValueError("P(G) + P(S) must be < 1 for the model to be identifiable")


def posterior(p_l: float, correct: bool, params: BKTParams) -> float:
    """P(L_n | r_n): Bayes update of mastery on one observed response."""
    if correct:
        known = p_l * (1.0 - params.p_s)
        unknown = (1.0 - p_l) * params.p_g
    else:
        known = p_l * params.p_s
        unknown = (1.0 - p_l) * (1.0 - params.p_g)
    return known / (known + unknown)


def update(p_l: float, correct: bool, params: BKTParams) -> float:
    """Posterior followed by the learning transition: P(L_{n+1})."""
    post = posterior(p_l, correct, params)
    return post + (1.0 - post) * params.p_t


class BKTTracker:
    """Stateful mastery estimate for one learner on one knowledge component."""

    def __init__(self, params: BKTParams | None = None) -> None:
        self.params = params or BKTParams()
        self.mastery = self.params.p_l0

    def observe(self, correct: bool) -> float:
        self.mastery = update(self.mastery, correct, self.params)
        return self.mastery
