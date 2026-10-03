"""Benchmark metrics (spec Section 7, metric table)."""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Sequence

from ..plant import EPSILON
from .arms import StepRecord

STREAK_LEN = 5


def jitter(values: Sequence[float]) -> float:
    """J = 1/(N-1) * sum |x_n - x_{n-1}|."""
    if len(values) < 2:
        return 0.0
    return sum(abs(b - a) for a, b in zip(values, values[1:])) / (len(values) - 1)


def level_jumps(levels: Sequence[int]) -> list[int]:
    return [abs(b - a) for a, b in zip(levels, levels[1:])]


@dataclass(frozen=True)
class StreakEvent:
    start: int  # first incorrect response of the streak
    end: int  # last incorrect response of the streak
    pre_level: int  # level of the interface on which the streak began
    tau_react: int | None  # items after onset until the level drops below pre_level
    tau_recover: int | None  # items after the last failure until the level is back at pre_level
    dropped: bool  # level fell below pre_level in response to the streak


def failure_streaks(correct: Sequence[bool], levels: Sequence[int], min_len: int = STREAK_LEN) -> list[StreakEvent]:
    """Recovery events for every run of >= ``min_len`` incorrect responses.

    ``levels[k]`` is the level of the interface shown for item k, decided from
    responses 0..k-1, so a response can first move the level of item k+1.
    tau_react is the spec's "steps required to reduce complexity after a
    failure streak" (defined only when pre_level > 1). tau_recover measures
    integral-windup recovery: items after the streak's last failure until
    complexity is back at its pre-streak level (defined only when it dropped).
    ``None`` means the event is right-censored at the horizon.
    """
    events, n, i = [], len(correct), 0
    while i < n:
        if correct[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and not correct[j + 1]:
            j += 1
        if j - i + 1 >= min_len:
            pre = levels[i]
            react = next((k - i for k in range(i + 1, n) if levels[k] < pre), None) if pre > 1 else None
            dropped = any(levels[k] < pre for k in range(i + 1, min(j + 2, n)))
            recover = next((k - j for k in range(j + 2, n) if levels[k] >= pre), None) if dropped else None
            events.append(StreakEvent(i, j, pre, react, recover, dropped))
        i = j + 1
    return events


def _mismatch(r: StepRecord) -> int:
    return int((not r.known and r.level >= 3) or (r.known and r.level <= 2))


def run_summary(records: Sequence[StepRecord], epsilon: float = EPSILON) -> dict[str, float | int]:
    m_i = [r.m_i for r in records]
    levels = [r.level for r in records]
    target_levels = [r.target_level for r in records]
    jumps = level_jumps(levels)
    attempts = sum(r.attempted for r in records)
    return {
        "mean_delta_m": statistics.fmean(r.delta_m for r in records),
        "max_delta_m": max(r.delta_m for r in records),
        "fidelity": sum(r.delta_m <= epsilon for r in records) / len(records),
        "mean_delta_m_ref": statistics.fmean(r.delta_m_ref for r in records),
        "fidelity_ref": sum(r.delta_m_ref <= epsilon for r in records) / len(records),
        "jitter": jitter(m_i),
        "target_jitter": jitter([r.target for r in records]),
        "level_changes": sum(j > 0 for j in jumps),
        "level_skips": sum(j >= 2 for j in jumps),
        "max_level_jump": max(jumps, default=0),
        "target_level_skips": sum(j >= 2 for j in level_jumps(target_levels)),
        "attempts": attempts,
        "schema_valid": sum(r.attempted and r.schema_valid for r in records),
        "plant_within_budget": sum(r.attempted and r.schema_valid and r.within_budget for r in records),
        "fallbacks": sum(r.fallback for r in records),
        "reached_level4": int(4 in levels),
        "first_level4_step": next((r.step for r in records if r.level == 4), -1),
        # Ground-truth mismatch, only measurable in simulation: an abstract
        # interface (level >= 3) shown to a learner who does not know the
        # skill, or a concrete one (level <= 2) shown to one who does.
        "overload_rate": sum(not r.known and r.level >= 3 for r in records) / len(records),
        "underload_rate": sum(r.known and r.level <= 2 for r in records) / len(records),
        # ITAE-style (Graham & Lathrop 1953) time-weighted mismatch in [0, 1]:
        # late mismatches, after the controller has had time to settle, cost more.
        "itae_mismatch": sum((r.step + 1) * _mismatch(r) for r in records) / sum(r.step + 1 for r in records),
        "final_mastery": records[-1].mastery,
        "correct_rate": sum(r.correct for r in records) / len(records),
    }


def mean_ci(values: Sequence[float]) -> tuple[float, float, float]:
    """Mean and normal-approximation 95% confidence interval."""
    m = statistics.fmean(values)
    if len(values) < 2:
        return m, m, m
    half = 1.96 * statistics.stdev(values) / math.sqrt(len(values))
    return m, m - half, m + half


def percentile(values: Sequence[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return float("nan")
    k = (len(ordered) - 1) * q
    lo, hi = math.floor(k), math.ceil(k)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)
