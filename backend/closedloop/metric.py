"""Structural complexity metric M_I (spec Section 6.4)."""

from __future__ import annotations

W_DENSITY, W_ABSTRACTION, W_DEPTH = 0.40, 0.35, 0.25
RHO_MIN, RHO_MAX = 1, 8  # interactive elements
ALPHA_MIN, ALPHA_MAX = 1, 4  # semantic abstraction score
DELTA_MIN, DELTA_MAX = 1, 4  # tree nesting depth


def _clamp(value: int, lo: int, hi: int) -> int:
    return min(hi, max(lo, value))


def structural_complexity(rho: int, alpha: int, delta: int) -> float:
    """M_I in [0, 1]; each input is clamped to its declared bounds."""
    rho = _clamp(rho, RHO_MIN, RHO_MAX)
    alpha = _clamp(alpha, ALPHA_MIN, ALPHA_MAX)
    delta = _clamp(delta, DELTA_MIN, DELTA_MAX)
    return (
        W_DENSITY * (rho - RHO_MIN) / (RHO_MAX - RHO_MIN)
        + W_ABSTRACTION * (alpha - ALPHA_MIN) / (ALPHA_MAX - ALPHA_MIN)
        + W_DEPTH * (delta - DELTA_MIN) / (DELTA_MAX - DELTA_MIN)
    )
