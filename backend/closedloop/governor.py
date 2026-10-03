"""Discrete-time PID complexity governor (spec Sections 6.2 and 6.3).

Maps the BKT mastery estimate to a committed interface complexity budget
M_I* in [0, 1] with anti-windup clamping, a first-order low-pass filtered
derivative, an inverted logistic projection and a hysteresis deadband.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

N_LEVELS = 4


@dataclass(frozen=True)
class GovernorConfig:
    setpoint: float = 0.95  # mastery threshold of Corbett & Anderson (1995)
    # Gains, filter, clamp and deadband: tuned by random search on a separate
    # tuning cohort (sim/tune.py, results/tuning/tuning.json); spec values were
    # Kp 1.25, Ki 0.10, Kd 0.35, gamma 0.10, S_max 3, hysteresis 0.06.
    kp: float = 0.865
    ki: float = 0.377
    kd: float = 0.672
    gamma: float = 0.398  # derivative low-pass coefficient; 1.0 = raw difference
    s_max: float | None = 1.253  # integral clamp; None disables anti-windup
    slope: float = 2.202  # sigmoid slope k = ln(19) / (Kp + Ki * S_max)
    hysteresis: float = 0.141  # deadband against the last committed budget
    # Optional slew limit on committed levels per step. None (the spec default)
    # lets the budget jump several levels at once, e.g. level 2 -> 4.
    max_level_step: int | None = None

    def with_(self, **changes: object) -> "GovernorConfig":
        return replace(self, **changes)


def normalized_error(mastery: float, setpoint: float) -> float:
    """Asymmetrically normalized tracking error e_n in [-1, 1]."""
    if mastery <= setpoint:
        return (setpoint - mastery) / setpoint
    return (setpoint - mastery) / (1.0 - setpoint)


def budget_from_effort(effort: float, slope: float) -> float:
    """Inverted logistic: high control effort (deficit) -> low complexity."""
    z = slope * effort
    if z >= 0:
        ez = math.exp(-z)
        return ez / (1.0 + ez)
    return 1.0 / (1.0 + math.exp(z))


def complexity_level(budget: float) -> int:
    """Quantize a budget into levels 1..4 (four equal bands)."""
    return min(N_LEVELS, 1 + math.floor(N_LEVELS * budget))


def level_center(level: int) -> float:
    return (level - 0.5) / N_LEVELS


@dataclass(frozen=True)
class GovernorOutput:
    error: float
    integral: float
    derivative: float
    effort: float
    budget_raw: float  # M_I*(n) before hysteresis
    budget: float  # committed budget sent to the plant
    level: int  # level of the committed budget
    committed: bool  # True when a new budget was committed this step


class PIDGovernor:
    def __init__(self, config: GovernorConfig | None = None) -> None:
        self.config = config or GovernorConfig()
        self.reset()

    def reset(self) -> None:
        self._integral = 0.0
        self._derivative = 0.0
        self._prev_error: float | None = None
        self._committed: float | None = None

    def step(self, mastery: float) -> GovernorOutput:
        c = self.config
        e = normalized_error(mastery, c.setpoint)
        prev = e if self._prev_error is None else self._prev_error  # no derivative kick

        s = self._integral + e
        if c.s_max is not None:
            s = min(c.s_max, max(-c.s_max, s))
        d = c.gamma * (e - prev) + (1.0 - c.gamma) * self._derivative
        u = c.kp * e + c.ki * s + c.kd * d
        raw = budget_from_effort(u, c.slope)

        committed = False
        if self._committed is None or abs(raw - self._committed) >= c.hysteresis:
            new = raw
            if self._committed is not None and c.max_level_step is not None:
                old_level = complexity_level(self._committed)
                jump = complexity_level(raw) - old_level
                if abs(jump) > c.max_level_step:
                    step = c.max_level_step if jump > 0 else -c.max_level_step
                    new = level_center(old_level + step)
            committed = new != self._committed
            self._committed = new

        self._integral, self._derivative, self._prev_error = s, d, e
        return GovernorOutput(
            error=e,
            integral=s,
            derivative=d,
            effort=u,
            budget_raw=raw,
            budget=self._committed,
            level=complexity_level(self._committed),
            committed=committed,
        )
