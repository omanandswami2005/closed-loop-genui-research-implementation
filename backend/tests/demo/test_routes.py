import pytest

pytest.importorskip("fastapi")
pytest.importorskip("multipart")

from closedloop_demo import routes
from closedloop_demo.app import app
from closedloop_demo.bank import PackStore
from closedloop_demo.vertex import GeminiUnavailable
from fastapi.testclient import TestClient

from .conftest import OUTLINE, SAMPLES, FakeVertex, topic_questions


@pytest.fixture
def client(monkeypatch, tmp_path, seeded_store):
    monkeypatch.setattr(routes, "store", seeded_store)
    monkeypatch.setattr(routes, "DEFAULT_PLANT", "deterministic")
    return TestClient(app)


def _learner(c, prior="new"):
    return c.post("/api/demo/learners", json={"name": "Asha", "grade": "Grade 9-10", "interests": "cricket", "prior": prior}).json()["learner_id"]


def test_full_api_flow(client):
    lid = _learner(client)
    packs = client.get("/api/demo/packs").json()
    assert len(packs) >= 3
    pack = packs[0]
    v = client.post("/api/demo/sessions", json={"learner_id": lid, "pack_id": pack["id"], "topic_id": "t1"}).json()
    assert v["telemetry"]["mastery"] == pytest.approx(0.10)
    for _ in range(4):
        v = client.post(f"/api/demo/sessions/{v['session_id']}/responses", json={"answer": "x", "hints_opened": 1}).json()
        assert v["outcome"]["correct"] is False and v["outcome"]["correct_answer"]
    r = client.get(f"/api/demo/learners/{lid}/report").json()
    assert r["totals"] == {"topics_started": 1, "topics_mastered": 0, "answered": 4, "correct": 0}
    assert r["topics"][0]["status"] == "needs support" and r["topics"][0]["hints_opened"] == 4


def test_upload_of_a_seeded_sample_is_a_cache_hit(client):
    with open(SAMPLES / "photosynthesis.pdf", "rb") as f:
        r = client.post("/api/demo/packs", files={"file": ("photosynthesis.pdf", f, "application/pdf")})
    assert r.status_code == 200 and r.json()["cached"] is True


def test_upload_errors(client, monkeypatch, tmp_path):
    assert client.post("/api/demo/packs", files={"file": ("a.docx", b"x" * 300)}).status_code == 422
    assert client.post("/api/demo/packs", data={"text": "short"}).status_code == 422
    assert client.post("/api/demo/packs").status_code == 422
    down = PackStore(seed_dir=tmp_path / "x", cache_dir=tmp_path / "c", client=FakeVertex(error=GeminiUnavailable("HTTP 503")))
    monkeypatch.setattr(routes, "store", down)
    r = client.post("/api/demo/packs", data={"text": "Plants make food. " * 30})
    assert r.status_code == 503 and "sample packs" in r.json()["detail"]


def test_paste_generates_a_pack(client, monkeypatch, tmp_path):
    store = PackStore(seed_dir=tmp_path / "x", cache_dir=tmp_path / "c", client=FakeVertex([OUTLINE, topic_questions()]))
    monkeypatch.setattr(routes, "store", store)
    r = client.post("/api/demo/packs", data={"text": "Plants make food. " * 30, "name": "My notes"})
    assert r.status_code == 200
    body = r.json()
    assert body["source_name"] == "My notes" and len(body["topics"]) == 2 and body["cached"] is False


def test_unknown_ids(client):
    assert client.post("/api/demo/sessions", json={"learner_id": "nope", "pack_id": "x", "topic_id": "t1"}).status_code == 404
    assert client.get("/api/demo/sessions/nope").status_code == 404
    assert client.get("/api/demo/learners/nope/report").status_code == 404


def test_research_app_is_still_served(client):
    assert client.get("/api/health").json()["ok"] is True
    v = client.post("/api/sessions", json={"plant": "surrogate", "seed": 1}).json()
    assert "equation" in v and v["document"]["schema_version"] == "clt-ui/1"


def test_lab_then_limited_check_then_done(client, monkeypatch, tmp_path):
    from closedloop_demo import loop
    from closedloop_demo.labs import LabStore

    monkeypatch.setattr(routes, "labs", LabStore(client=FakeVertex(error=AssertionError("deterministic plant: no Gemini")), cache_dir=tmp_path))
    monkeypatch.setattr(loop, "MIN_ITEMS", 100)  # no early finish: run to the limit
    lid = _learner(client)
    pack = client.get("/api/demo/packs").json()[0]
    v = client.post("/api/demo/sessions", json={"learner_id": lid, "pack_id": pack["id"], "topic_id": "t1"}).json()
    sid = v["session_id"]
    assert v["stage"] == "explore" and v["max_items"] == 10 and v["answered"] == 0

    lab = client.post(f"/api/demo/sessions/{sid}/lab").json()
    assert lab["schema_version"] == "lab-ui/1" and lab["source"] == "template" and len(lab["stations"]) >= 3
    s1 = lab["stations"][0]
    r = client.post(f"/api/demo/sessions/{sid}/lab/results", json={"station_id": s1["id"], "type": s1["type"], "solved": True, "attempts": 1, "seconds": 9.5})
    assert r.json()["lab_results"][s1["id"]]["solved"] is True
    assert client.post(f"/api/demo/sessions/{sid}/lab/results", json={"station_id": "s1", "type": "X", "solved": True, "attempts": -1}).status_code == 422

    v = client.post(f"/api/demo/sessions/{sid}/lab/finish").json()
    assert v["stage"] == "check" and v["lab_results"]
    for i in range(10):
        assert not v["done"]
        v = client.post(f"/api/demo/sessions/{sid}/responses", json={"answer": "x"}).json()
    assert v["done"] and v["stage"] == "done" and v["answered"] == 10 and v["end_reason"] == "all 10 questions answered"
    assert client.post(f"/api/demo/sessions/{sid}/responses", json={"answer": "x"}).status_code == 409
    t = client.get(f"/api/demo/learners/{lid}/report").json()["topics"][0]
    assert t["lab"]["stations"] == 1 and t["lab"]["solved"] == 1 and t["stage"] == "done"


def test_gallery_and_catalog(client):
    g = client.get("/api/demo/gallery").json()
    assert g["count"] == 30 and len(g["stations"]) == 30 and g["rejected"] == []
    c = client.get("/api/demo/catalog").json()
    assert len(c["hands_on"]) == 15 and len(c["simulations"]) == 15
