"""BKT saturation with the default parameters (paper, BKT saturation section).

Floating-point BKT rounds mastery to exactly 1.0 after 24 correct responses;
exact rational arithmetic keeps it just below 1, and five errors then change it
by a negligible amount.
"""
from fractions import Fraction

from closedloop.bkt import BKTParams, BKTTracker


def float_run(responses):
    tracker = BKTTracker(BKTParams())
    for r in responses:
        tracker.observe(r)
    return tracker.mastery


def exact_run(responses, params=BKTParams()):
    """Same recurrence in exact rational arithmetic."""
    p = Fraction(params.p_l0)
    ps, pg, pt, pf = (Fraction(x) for x in (params.p_s, params.p_g, params.p_t, params.p_f))
    for r in responses:
        if r:
            known, unknown = p * (1 - ps), (1 - p) * pg
        else:
            known, unknown = p * ps, (1 - p) * (1 - pg)
        post = known / (known + unknown)
        p = post * (1 - pf) + (1 - post) * pt
    return p


def test_ten_correct_then_five_errors():
    assert 1 - float_run([True] * 10) < 1e-6
    assert 0.98 < float_run([True] * 10 + [False] * 5) < 0.99


def test_24_correct_rounds_to_exactly_one_in_double_precision():
    assert float_run([True] * 24) == 1.0
    assert float_run([True] * 24 + [False] * 5) == 1.0


def test_exact_arithmetic_errors_lower_the_estimate_only_negligibly():
    before = exact_run([True] * 24)
    after = exact_run([True] * 24 + [False] * 5)
    assert 1 - before < Fraction(1, 10**16)
    assert after < before
    assert float(before - after) < 2e-12
