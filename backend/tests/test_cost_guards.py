import random

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from closedloop import service  # noqa: E402
from closedloop.plant import Emission, admit  # noqa: E402
from closedloop.policy import SurrogatePolicy  # noqa: E402
from closedloop.ast_schema import Equation  # noqa: E402

EQ = Equation(a=3, b=4, c=19)
DECISION = SurrogatePolicy().decide(0.3, 0.35, 2, 2)


class _Fake:
    """Stands in for GeminiPlant: fails with ``fault`` when set."""

    def __init__(self, fault=None):
        self.calls, self.fault = 0, fault

    def generate(self, budget, decision, eq, rng):
        self.calls += 1
        return Emission("", self.fault) if self.fault else Emission("{}", None)


@pytest.fixture
def client(monkeypatch):
    service._ip_sessions.clear()
    yield TestClient(service.app)
    monkeypatch.setattr(service, "_gemini", None)


def test_daily_cap_stops_real_calls_and_surrogate_stands_in():
    inner = _Fake()
    plant = service._GuardedPlant(inner, cap=2)
    outs = [plant.generate(0.35, DECISION, EQ, random.Random(0)) for _ in range(4)]
    assert inner.calls == 2 and plant.remaining() == 0 and not plant.available()
    assert outs[-1].fault.startswith(service.DEGRADED) and "cap" in outs[-1].fault
    assert admit(outs[-1].text, 0.35, DECISION, EQ).schema_valid


@pytest.mark.parametrize("status", ["402", "403", "429"])
def test_billing_or_quota_error_opens_breaker(status):
    inner = _Fake(f"plant_error: HTTPStatusError {status}")
    plant = service._GuardedPlant(inner, cap=0)
    first = plant.generate(0.35, DECISION, EQ, random.Random(0))
    second = plant.generate(0.35, DECISION, EQ, random.Random(1))
    assert inner.calls == 1, "no further Vertex calls while the breaker is open"
    assert first.fault.startswith(service.DEGRADED) and second.fault.startswith(service.DEGRADED)
    assert not plant.available()


def test_transient_error_does_not_open_breaker():
    inner = _Fake("plant_error: ReadTimeout")
    plant = service._GuardedPlant(inner, cap=0)
    plant.generate(0.35, DECISION, EQ, random.Random(0))
    plant.generate(0.35, DECISION, EQ, random.Random(1))
    assert inner.calls == 2 and plant.available()


def test_credit_exhaustion_end_to_end_shows_notice_not_error(client, monkeypatch):
    monkeypatch.setattr(service, "_gemini", service._GuardedPlant(_Fake("plant_error: HTTPStatusError 403"), cap=0))
    res = client.post("/api/sessions", json={"plant": "gemini", "seed": 1})
    assert res.status_code == 200
    view = res.json()
    assert view["notice"] and "surrogate" in view["notice"]
    assert not view["telemetry"]["fallback_used"] and view["document"]["schema_version"] == "clt-ui/1"
    assert client.get("/api/health").json()["gemini_available"] is False


def test_per_ip_limit_degrades_to_surrogate_session(client, monkeypatch):
    monkeypatch.setattr(service, "GEMINI_SESSIONS_PER_IP", 1)
    monkeypatch.setattr(service, "_gemini", service._GuardedPlant(_Fake(), cap=0))
    headers = {"x-forwarded-for": "203.0.113.9"}
    first = client.post("/api/sessions", json={"plant": "gemini", "seed": 1}, headers=headers).json()
    second = client.post("/api/sessions", json={"plant": "gemini", "seed": 2}, headers=headers)
    assert first["notice"] is None
    assert second.status_code == 200 and second.json()["telemetry"]["plant"] == "surrogate"
    assert "used up" in second.json()["notice"]


@pytest.mark.parametrize(
    "status,body",
    [
        (429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Quota exceeded"}}),
        (403, {"error": {"code": 403, "status": "PERMISSION_DENIED", "message": "Billing account disabled"}}),
    ],
)
def test_real_gemini_client_billing_failure_falls_back(client, monkeypatch, status, body):
    httpx = pytest.importorskip("httpx")
    from closedloop.gemini import GeminiPlant

    calls = []

    def vertex(request):
        calls.append(request.url)
        return httpx.Response(status, json=body)

    monkeypatch.setenv("GENUI_GEMINI_TOKEN", "test")
    gemini = GeminiPlant(client=httpx.Client(transport=httpx.MockTransport(vertex)))
    monkeypatch.setattr(service, "_gemini", service._GuardedPlant(gemini, cap=0))
    view = client.post("/api/sessions", json={"plant": "gemini", "seed": 4}).json()
    assert "surrogate" in view["notice"] and str(status) in view["notice"]
    sid = view["session_id"]
    view = client.post(f"/api/sessions/{sid}/responses", json={"answer": "x = 0"}).json()
    assert "surrogate" in view["notice"] and len(calls) == 1
