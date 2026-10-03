from closedloop.sim.arms import ARMS, ABLATIONS, run_variant
from closedloop.sim.learners import cohort, sample_trajectory
from closedloop.sim.metrics import failure_streaks, jitter, run_summary

SEED = 7


def test_trajectories_are_reproducible():
    a, b = sample_trajectory(3, "fast_master", SEED), sample_trajectory(3, "fast_master", SEED)
    assert a == b
    assert sample_trajectory(3, "fast_master", SEED + 1) != a


def test_cohort_sizes():
    learners = cohort(SEED, {"struggling_novice": 3, "inconsistent_guesser": 4, "fast_master": 3})
    assert [t.archetype for t in learners].count("inconsistent_guesser") == 4
    assert len({t.learner_id for t in learners}) == 10


def test_variants_share_mastery_and_reference_target():
    traj = sample_trajectory(0, "inconsistent_guesser", SEED)
    runs = {v.name: run_variant(v, traj, SEED) for v in ARMS + ABLATIONS}
    base = runs["closed_loop"]
    for records in runs.values():
        assert len(records) == 40
        assert [r.mastery for r in records] == [r.mastery for r in base]
        assert [r.ref_target for r in records] == [r.ref_target for r in base]
    assert [r.target for r in base] == [r.ref_target for r in base]


def test_closed_loop_renders_within_epsilon_every_step():
    for i, arch in enumerate(["struggling_novice", "inconsistent_guesser", "fast_master"] * 5):
        records = run_variant(ARMS[3], sample_trajectory(i, arch, SEED), SEED)
        assert run_summary(records)["fidelity"] == 1.0


def test_run_is_deterministic():
    traj = sample_trajectory(1, "struggling_novice", SEED)
    a = [(r.m_i, r.fault) for r in run_variant(ARMS[1], traj, SEED)]
    b = [(r.m_i, r.fault) for r in run_variant(ARMS[1], traj, SEED)]
    assert a == b


def test_jitter():
    assert abs(jitter([0.1, 0.3, 0.2]) - 0.15) < 1e-12
    assert jitter([0.5]) == 0.0


def test_failure_streak_events():
    correct = [True, True, False, False, False, False, False, True, True, True]
    levels = [3, 3, 3, 3, 2, 1, 1, 1, 2, 3]
    (ev,) = failure_streaks(correct, levels)
    assert (ev.start, ev.end, ev.pre_level) == (2, 6, 3)
    assert ev.tau_react == 2  # item 4 is the first below level 3
    assert ev.dropped and ev.tau_recover == 3  # item 9 is back at level 3
    assert failure_streaks([False] * 4 + [True], [2] * 5) == []
