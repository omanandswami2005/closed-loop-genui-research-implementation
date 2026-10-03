import random

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from closedloop import service  # noqa: E402
from closedloop.plant import Emission  # noqa: E402


class _Counting:
    def __init__(self):
        self.calls = 0

    def generate(self, budget, decision, eq, rng):
        self.calls += 1
        return Emission("{}", None)


def test_daily_cap_stops_real_calls():
    inner = _Counting()
    plant = service._CappedPlant(inner, cap=2)
    outs = [plant.generate(0.5, None, None, random.Random(0)) for _ in range(4)]
    assert inner.calls == 2 and plant.remaining() == 0
    assert outs[-1].text == "" and "cap" in outs[-1].fault


def test_gemini_sessions_rate_limited_per_ip(monkeypatch):
    monkeypatch.setattr(service, "GEMINI_SESSIONS_PER_IP", 1)
    monkeypatch.setattr(service, "_gemini", service._CappedPlant(_Counting(), cap=0))
    service._ip_sessions.clear()
    client = TestClient(service.app)
    headers = {"x-forwarded-for": "203.0.113.9"}
    assert client.post("/api/sessions", json={"plant": "gemini", "seed": 1}, headers=headers).status_code == 200
    assert client.post("/api/sessions", json={"plant": "gemini", "seed": 2}, headers=headers).status_code == 429
    assert client.post("/api/sessions", json={"plant": "surrogate", "seed": 3}, headers=headers).status_code == 200
