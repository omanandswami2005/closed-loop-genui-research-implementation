import math

import pytest

from closedloop.bkt import BKTParams, update
from closedloop.governor import (
    GovernorConfig,
    PIDGovernor,
    budget_from_effort,
    complexity_level,
    normalized_error,
)


def test_normalized_error_endpoints_and_continuity():
    assert normalized_error(0.0, 0.85) == pytest.approx(1.0)
    assert normalized_error(0.85, 0.85) == pytest.approx(0.0)
    assert normalized_error(1.0, 0.85) == pytest.approx(-1.0)
    assert normalized_error(0.85 - 1e-9, 0.85) == pytest.approx(normalized_error(0.85 + 1e-9, 0.85), abs=1e-6)


def test_budget_mapping_reachable_range():
    u_max = 1.25 + 0.10 * 3.0
    assert budget_from_effort(u_max, 2.0) == pytest.approx(1 / (1 + math.exp(3.1)))
    assert budget_from_effort(-u_max, 2.0) == pytest.approx(0.957, abs=1e-3)
    assert budget_from_effort(u_max, 2.0) == pytest.approx(0.043, abs=1e-3)
    assert budget_from_effort(800.0, 2.0) == pytest.approx(0.0)  # no overflow
    assert budget_from_effort(-800.0, 2.0) == pytest.approx(1.0)


@pytest.mark.parametrize("budget,level", [(0.0, 1), (0.249, 1), (0.25, 2), (0.5, 3), (0.749, 3), (0.75, 4), (1.0, 4)])
def test_complexity_levels(budget, level):
    assert complexity_level(budget) == level


def test_first_step_has_no_derivative_kick():
    out = PIDGovernor().step(0.15)
    assert out.derivative == 0.0
    e = (0.85 - 0.15) / 0.85
    assert out.integral == pytest.approx(e)
    assert out.effort == pytest.approx(1.25 * e + 0.10 * e)


def test_integral_clamped_with_anti_windup_and_unbounded_without():
    clamped, free = PIDGovernor(), PIDGovernor(GovernorConfig(s_max=None))
    for _ in range(20):
        a, b = clamped.step(0.0), free.step(0.0)
    assert a.integral == pytest.approx(3.0)
    assert b.integral == pytest.approx(20.0)


def test_unfiltered_derivative_is_raw_difference():
    gov = PIDGovernor(GovernorConfig(gamma=1.0))
    gov.step(0.2)
    out = gov.step(0.6)
    assert out.derivative == pytest.approx(normalized_error(0.6, 0.85) - normalized_error(0.2, 0.85))


def test_hysteresis_holds_against_last_committed_value():
    gov = PIDGovernor(GovernorConfig(kp=0.0, ki=0.0, kd=0.0))  # effort 0 -> raw budget 0.5
    first = gov.step(0.5)
    assert first.committed and first.budget == pytest.approx(0.5)
    gov.config = GovernorConfig(kp=1.0, ki=0.0, kd=0.0)
    # Raw budgets drift by < 0.06 per step but accumulate past the deadband.
    budgets = [gov.step(m).budget for m in (0.83, 0.86, 0.87, 0.88, 0.9, 0.92, 0.95)]
    assert budgets[0] == pytest.approx(0.5)
    assert budgets[-1] > 0.6


def test_all_correct_learner_matches_spec_verification():
    # Spec Section 6.3: commits 0.878 (level 4) at step 3 and settles at 0.947.
    params, gov, p = BKTParams(), PIDGovernor(), BKTParams().p_l0
    outs = []
    for _ in range(40):
        outs.append(gov.step(p))
        p = update(p, True, params)
    assert outs[3].budget == pytest.approx(0.878, abs=1e-3)
    assert outs[3].level == 4
    assert outs[-1].budget == pytest.approx(0.947, abs=1e-3)
    # The same trajectory jumps from level 2 straight to level 4.
    assert [o.level for o in outs[:4]] == [1, 1, 2, 4]


def test_level_slew_limit_moves_one_level_per_step():
    params, gov, p = BKTParams(), PIDGovernor(GovernorConfig(max_level_step=1)), BKTParams().p_l0
    levels = []
    for _ in range(10):
        levels.append(gov.step(p).level)
        p = update(p, True, params)
    assert max(abs(b - a) for a, b in zip(levels, levels[1:])) == 1
    assert levels[-1] == 4


def test_lapse_detector_restores_reaction_after_saturation():
    from closedloop.sim.arms import mastery_series
    from closedloop.sim.metrics import failure_streaks

    responses = [True] * 15 + [False] * 5 + [True] * 20
    for params, reacts in ((BKTParams(), False), (BKTParams(lapse_threshold=6.5), True)):
        gov = PIDGovernor()
        levels = [gov.step(m).level for m in mastery_series(tuple(responses), params)]
        (ev,) = failure_streaks(responses, levels)
        assert (ev.tau_react is not None) is reacts
