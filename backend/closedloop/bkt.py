"""Bayesian Knowledge Tracing (spec Section 6.1).

Closed-form single-skill BKT update (Corbett & Anderson, 1995). pyBKT is only
needed to *fit* the parameters from logged data; the runtime update is these
two equations.

``p_f`` adds the forgetting transition of BKT+Forgets (Qiu et al., 2011;
Khajah et al., 2016): a known skill becomes unknown with probability P(F).
With P(F) = 0 this is standard BKT, whose estimate saturates at 1 after a
success run so that later errors barely move it. Seen as a state observer
inside the control loop, P(F) plays the role of a forgetting factor in
recursive estimation: it keeps the estimate responsive to new evidence,
but it also makes every isolated slip move the estimate.

``lapse_threshold`` enables the alternative proposed here: a CUSUM change
detector (Page, 1954) on the log-likelihood ratio between "the learner does
not know the skill" and the tracker's own prediction. It accumulates only
when a confident estimate is contradicted, so isolated slips are absorbed and
a run of errors trips it; on an alarm the estimate is re-initialised to
``lapse_reset`` before the current response is applied.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class BKTParams:
    p_l0: float = 0.15  # prior mastery P(L_0)
    p_t: float = 0.12  # transition (learn) probability P(T)
    p_g: float = 0.20  # guess probability P(G)
    p_s: float = 0.08  # slip probability P(S)
    p_f: float = 0.0  # forgetting probability P(F); 0 = standard BKT
    lapse_threshold: float | None = None  # CUSUM alarm threshold h; None = off
    lapse_reset: float = 0.5  # estimate after an alarm (maximal uncertainty)

    def __post_init__(self) -> None:
        for name in ("p_l0", "p_t", "p_g", "p_s", "p_f", "lapse_reset"):
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
    """Posterior followed by the learn/forget transition: P(L_{n+1})."""
    post = posterior(p_l, correct, params)
    return post * (1.0 - params.p_f) + (1.0 - post) * params.p_t


def p_correct(p_l: float, params: BKTParams) -> float:
    return p_l * (1.0 - params.p_s) + (1.0 - p_l) * params.p_g


def lapse_llr(p_l: float, correct: bool, params: BKTParams) -> float:
    """log P(r | skill not known) - log P(r | current estimate)."""
    predicted = p_correct(p_l, params)
    if correct:
        return math.log(params.p_g / predicted)
    return math.log((1.0 - params.p_g) / (1.0 - predicted))


class BKTTracker:
    """Stateful mastery estimate for one learner on one knowledge component."""

    def __init__(self, params: BKTParams | None = None) -> None:
        self.params = params or BKTParams()
        self.mastery = self.params.p_l0
        self.cusum = 0.0
        self.alarms = 0

    def observe(self, correct: bool) -> float:
        prior = self.mastery
        h = self.params.lapse_threshold
        if h is not None:
            self.cusum = max(0.0, self.cusum + lapse_llr(prior, correct, self.params))
            if self.cusum > h:
                prior, self.cusum = self.params.lapse_reset, 0.0
                self.alarms += 1
        self.mastery = update(prior, correct, self.params)
        return self.mastery
