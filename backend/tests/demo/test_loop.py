from closedloop_demo.loop import PRIOR, DemoSession, grade, topic_report
from closedloop_demo.plant import Emission


def _session(store, plant=None, prior="little"):
    pack = store.all()[0]
    return DemoSession(pack, pack.topics[0], {"name": "T", "prior": prior, "interests": "cricket"}, plant, seed=7)


def test_grading_is_deterministic(seeded_store):
    t = seeded_store.all()[0].topics[0]
    mc = t.at_level(1)[0]
    assert grade(mc, mc.answer).correct and grade(mc, mc.answer.upper() + " ").correct
    assert not grade(mc, mc.options[1]).correct and not grade(mc, "").correct
    bl = t.at_level(3)[0]
    assert grade(bl, bl.answer).correct
    if len(bl.answer) >= 5:
        assert grade(bl, bl.answer[:-1] + "#").correct  # one slip in a long word is accepted
    assert not grade(bl, "completely wrong").correct


def test_onboarding_prior_sets_starting_mastery(seeded_store):
    for prior, p in PRIOR.items():
        assert _session(seeded_store, prior=prior).tracker.mastery == p


def test_loop_runs_and_adapts(seeded_store):
    s = _session(seeded_store)
    for i in range(16):
        q = s.current.question
        s.respond(q.answer if i % 5 else "wrong")
    levels = [t.level for t in s.history]
    assert max(levels) > min(levels)  # the screen changed as mastery moved
    assert all(t.abs_error <= 0.05 for t in s.history)
    r = topic_report(s)
    assert r["answered"] == 16 and r["correct"] == 12 and len(r["missed"]) == 4


def test_client_view_never_contains_the_answer_key(seeded_store):
    s = _session(seeded_store)
    for _ in range(8):
        view = s.current.view
        assert "answer" not in view and "accepted" not in view
        if view["kind"] == "choice":
            assert s.current.question.answer in view["options"]
        s.respond(s.current.question.answer)


class _DownPlant:
    name = "gemini"

    def generate(self, template, q, topic, profile):
        return Emission("", "gemini unavailable: HTTP 429")


class _EchoPlant:
    """A plant that returns the layout unchanged (what a perfect rewrite looks like structurally)."""

    name = "gemini"

    def generate(self, template, q, topic, profile):
        return Emission(template.model_dump_json(), None)


def test_gemini_failure_falls_back_with_reason(seeded_store):
    s = _session(seeded_store, plant=_DownPlant())
    t = s.current.telemetry
    assert t.fallback_used and t.reason.startswith("gemini unavailable")
    s.respond(s.current.question.answer)  # the loop keeps going


def test_gemini_output_passes_the_gate(seeded_store):
    s = _session(seeded_store, plant=_EchoPlant())
    for _ in range(5):
        assert not s.current.telemetry.fallback_used
        s.respond(s.current.question.answer)
