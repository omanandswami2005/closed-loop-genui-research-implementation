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


@pytest.mark.parametrize("kwargs", [{"p_t": 1.5}, {"p_g": -0.1}, {"p_g": 0.6, "p_s": 0.5}])
def test_invalid_params_rejected(kwargs):
    with pytest.raises(ValueError):
        BKTParams(**kwargs)
