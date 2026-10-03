import pytest

from closedloop.bkt import BKTParams, BKTTracker, posterior, update

P = BKTParams()


def test_posterior_matches_closed_form():
    # 0.15*0.92 / (0.15*0.92 + 0.85*0.20)
    assert posterior(0.15, True, P) == pytest.approx(0.138 / 0.308)
    # 0.15*0.08 / (0.15*0.08 + 0.85*0.80)
    assert posterior(0.15, False, P) == pytest.approx(0.012 / 0.692)


def test_update_applies_transition():
    post = posterior(0.15, True, P)
    assert update(0.15, True, P) == pytest.approx(post + (1 - post) * 0.12)


def test_correct_raises_and_incorrect_lowers_posterior():
    for p in (0.05, 0.3, 0.6, 0.95):
        assert posterior(p, True, P) > p > posterior(p, False, P)


def test_tracker_saturates_after_success_run():
    t = BKTTracker()
    for _ in range(15):
        t.observe(True)
    assert t.mastery > 0.9999
    # Documented BKT property: a saturated estimate barely moves on a lapse.
    for _ in range(5):
        t.observe(False)
    assert t.mastery > 0.99


def test_plain_bkt_reaches_exactly_one_and_never_drops():
    # van de Sande (2013): without forgetting, P(L) can only rise. In float64
    # it rounds to exactly 1.0 after 24 straight correct answers, and from
    # there no number of wrong answers can lower it.
    t = BKTTracker()
    for _ in range(23):
        t.observe(True)
    assert t.mastery < 1.0
    t.observe(True)
    assert t.mastery == 1.0
    for _ in range(40):
        t.observe(False)
        assert t.mastery == 1.0


@pytest.mark.parametrize("kwargs", [{"p_t": 1.5}, {"p_g": -0.1}, {"p_g": 0.6, "p_s": 0.5}])
def test_invalid_params_rejected(kwargs):
    with pytest.raises(ValueError):
        BKTParams(**kwargs)


def test_forgetting_keeps_estimate_below_one():
    t = BKTTracker(BKTParams(p_f=0.02))
    for _ in range(40):
        t.observe(True)
    assert 0.95 < t.mastery < 0.99


def test_lapse_detector_absorbs_a_slip_and_trips_on_a_run():
    params = BKTParams(lapse_threshold=6.5)
    t = BKTTracker(params)
    for _ in range(15):
        t.observe(True)
    t.observe(False)  # one slip: no alarm, estimate stays high
    assert t.alarms == 0 and t.mastery > 0.9
    for _ in range(3):
        t.observe(True)
    for _ in range(3):
        t.observe(False)
    assert t.alarms == 1 and t.mastery < 0.25


def test_lapse_detector_is_silent_for_a_struggling_learner():
    t = BKTTracker(BKTParams(lapse_threshold=6.5))
    for _ in range(30):
        t.observe(False)
    assert t.alarms == 0  # errors are expected when the estimate is already low
