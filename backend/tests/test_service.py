import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from closedloop.checker import format_fraction, solution  # noqa: E402
from closedloop.ast_schema import Equation  # noqa: E402
from closedloop.loop import LoopSession  # noqa: E402
from closedloop.service import app  # noqa: E402

client = TestClient(app)


def _answer(view: dict) -> str:
    return "x = " + format_fraction(solution(Equation(**view["equation"])))


def test_session_round_trip_raises_mastery_and_complexity():
    view = client.post("/api/sessions", json={"seed": 7}).json()
    assert view["item"] == 0 and view["telemetry"]["level"] == 1
    assert view["document"]["schema_version"] == "clt-ui/1"
    for _ in range(6):
        view = client.post(f"/api/sessions/{view['session_id']}/responses", json={"answer": _answer(view)}).json()
        assert view["outcome"]["correct"]
    t = view["telemetry"]
    assert t["mastery"] > 0.95 and t["level"] == 4
    assert t["abs_error"] <= 0.05 or t["fallback_used"]


def test_wrong_answer_is_marked_and_shows_solution():
    view = client.post("/api/sessions", json={"seed": 3}).json()
    sol = format_fraction(solution(Equation(**view["equation"])))
    res = client.post(f"/api/sessions/{view['session_id']}/responses", json={"answer": "x = 999"}).json()
    assert not res["outcome"]["correct"] and res["outcome"]["solution"] == sol
    assert res["telemetry"]["mastery"] < view["telemetry"]["mastery"]


def test_step_check_endpoint():
    view = client.post("/api/sessions", json={"seed": 11}).json()
    eq = Equation(**view["equation"])
    line = f"{eq.a}x = {eq.c - eq.b}"
    r = client.post(f"/api/sessions/{view['session_id']}/check", json={"line": line}).json()
    assert r["equivalent"] and not r["solved"]


def test_unknown_session_and_bad_plant():
    assert client.get("/api/sessions/nope").status_code == 404
    assert client.post("/api/sessions", json={"plant": "laya"}).status_code == 422


def test_seeded_sessions_are_reproducible():
    a, b = LoopSession(seed=5), LoopSession(seed=5)
    assert a.current.document == b.current.document
