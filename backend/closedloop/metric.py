"""Structural complexity metric M_I (spec Section 6.4).

Each term follows an established complexity factor: interactive-element
count (element interactivity, Sweller 2010; choice count, Hick 1952), the
concrete-to-abstract representation scale (concreteness fading, Fyfe et al.
2014) and nesting depth (depth/breadth of interface hierarchies, Kiger 1984).
No data fix the weights, so the terms are weighted equally, the standard
default for an unfitted linear composite (Dawes 1979). The spec's original
0.40 / 0.35 / 0.25 and other weightings are run as sensitivity variants in
``closedloop.sim.tune``.
"""

from __future__ import annotations

DEFAULT_WEIGHTS = (1 / 3, 1 / 3, 1 / 3)  # density, abstraction, depth
RHO_MIN, RHO_MAX = 1, 8  # interactive elements
ALPHA_MIN, ALPHA_MAX = 1, 4  # semantic abstraction score
DELTA_MIN, DELTA_MAX = 1, 4  # tree nesting depth

_weights = DEFAULT_WEIGHTS


def set_weights(weights: tuple[float, float, float]) -> None:
    """Replace the weights process-wide (sensitivity analysis only)."""
    global _weights
    if abs(sum(weights) - 1.0) > 1e-9 or min(weights) < 0:
        raise ValueError("weights must be non-negative and sum to 1")
    _weights = tuple(weights)
    from .plant import _fallback_blueprint  # cached plans depend on the weights

    _fallback_blueprint.cache_clear()


def _clamp(value: int, lo: int, hi: int) -> int:
    return min(hi, max(lo, value))


def structural_complexity(rho: int, alpha: int, delta: int) -> float:
    """M_I in [0, 1]; each input is clamped to its declared bounds."""
    w_density, w_abstraction, w_depth = _weights
    rho = _clamp(rho, RHO_MIN, RHO_MAX)
    alpha = _clamp(alpha, ALPHA_MIN, ALPHA_MAX)
    delta = _clamp(delta, DELTA_MIN, DELTA_MAX)
    return (
        w_density * (rho - RHO_MIN) / (RHO_MAX - RHO_MIN)
        + w_abstraction * (alpha - ALPHA_MIN) / (ALPHA_MAX - ALPHA_MIN)
        + w_depth * (delta - DELTA_MIN) / (DELTA_MAX - DELTA_MIN)
    )
