"""HTTP routes of the demo extension, under ``/api/demo``.

Learners, packs and sessions live in memory (one process, bounded), like the
research service. Profiles are also kept by the browser and re-sent, so a
restarted server only loses in-progress sessions.
"""

from __future__ import annotations

import os
import threading
import uuid
from collections import OrderedDict
from dataclasses import asdict
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .bank import LEVEL_NAME, Pack, PackStore
from .ingest import MAX_BYTES, IngestError, extract, from_paste
from .labs import LabStore, catalog_summary, gallery_json, lab_json
from .loop import MAX_ITEMS, DemoSession, topic_report
from .plant import GeminiLearnPlant
from .vertex import GeminiUnavailable

MAX_SESSIONS = int(os.environ.get("GENUI_DEMO_MAX_SESSIONS", "300"))
DEFAULT_PLANT = os.environ.get("GENUI_DEMO_PLANT", "gemini")

router = APIRouter(prefix="/api/demo")
store = PackStore()
gemini = GeminiLearnPlant()
labs = LabStore()
_learners: dict[str, dict] = {}
_sessions: OrderedDict[str, tuple[DemoSession, threading.Lock, str]] = OrderedDict()  # sid -> (session, lock, learner)
_lock = threading.Lock()


class Profile(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    grade: str = Field(default="", max_length=60)
    interests: str = Field(default="", max_length=160)
    prior: Literal["new", "little", "well"] = "little"
    goal: str = Field(default="", max_length=160)


class LearnerIn(Profile):
    learner_id: str | None = Field(default=None, max_length=40)


class SessionIn(BaseModel):
    learner_id: str = Field(max_length=40)
    pack_id: str = Field(max_length=40)
    topic_id: str = Field(max_length=10)
    plant: Literal["gemini", "deterministic"] | None = None
    seed: int | None = Field(default=None, ge=0, lt=2**31)


class LabResultIn(BaseModel):
    station_id: str = Field(max_length=10)
    type: str = Field(max_length=40)
    solved: bool
    attempts: int = Field(default=0, ge=0, le=999)
    revealed: bool = False
    seconds: float = Field(default=0, ge=0, le=86400)


class ResponseIn(BaseModel):
    answer: str = Field(max_length=300)
    hints_opened: int = Field(default=0, ge=0, le=3)
    justification: str = Field(default="", max_length=600)


def _pack_summary(p: Pack) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "source_name": p.source_name,
        "source_kind": p.source_kind,
        "source_units": p.source_units,
        "chars": p.chars,
        "truncated": p.truncated,
        "seeded": p.seeded,
        "model": p.model,
        "created": p.created,
        "generation_ms": p.generation_ms,
        "dropped_questions": p.dropped_questions,
        "topics": [
            {"id": t.id, "title": t.title, "summary": t.summary, "key_points": t.key_points, "questions": len(t.questions)} for t in p.topics
        ],
    }


def _view(sid: str, s: DemoSession, outcome: dict | None = None) -> dict:
    item = s.current
    return {
        "session_id": sid,
        "pack_id": s.pack.id,
        "topic": {"id": s.topic.id, "title": s.topic.title, "summary": s.topic.summary},
        "item": item.telemetry.item,
        "question": item.view,
        "level_name": LEVEL_NAME[item.question.level],
        "document": item.document,
        "telemetry": asdict(item.telemetry),
        "history": [asdict(t) for t in s.history[-40:]],
        "responses": s.responses[-40:],
        "setpoint": s.governor.config.setpoint,
        "plant": s.plant_name,
        "notice": (
            f"Live Gemini is unavailable ({item.telemetry.reason.removeprefix('gemini unavailable: ')}); "
            "this screen uses the deterministic template."
            if (item.telemetry.reason or "").startswith("gemini unavailable")
            else None
        ),
        "outcome": outcome,
        "stage": s.stage,
        "done": s.stage == "done",
        "end_reason": s.end_reason,
        "answered": len(s.log),
        "max_items": MAX_ITEMS,
        "lab_results": s.lab_results,
    }


def _get(sid: str) -> tuple[DemoSession, threading.Lock, str]:
    with _lock:
        entry = _sessions.get(sid)
        if entry is None:
            raise HTTPException(404, "unknown session (the server may have restarted); start the topic again")
        _sessions.move_to_end(sid)
        return entry


@router.get("/health")
def health() -> dict:
    return {"ok": True, "packs": len(store.all()), "sessions": len(_sessions), "gemini_available": gemini.available(), "default_plant": DEFAULT_PLANT}


@router.post("/learners")
def upsert_learner(req: LearnerIn) -> dict:
    lid = req.learner_id or uuid.uuid4().hex[:16]
    with _lock:
        _learners[lid] = req.model_dump(exclude={"learner_id"})
    return {"learner_id": lid, "profile": _learners[lid]}


@router.get("/packs")
def list_packs() -> list[dict]:
    return [_pack_summary(p) for p in store.all()]


@router.get("/packs/{pid}")
def get_pack(pid: str) -> dict:
    p = store.get(pid)
    if p is None:
        raise HTTPException(404, "unknown pack")
    return _pack_summary(p)


@router.post("/packs")
async def create_pack(file: UploadFile | None = File(default=None), text: str | None = Form(default=None), name: str | None = Form(default=None)) -> dict:
    try:
        if file is not None and file.filename:
            data = await file.read(MAX_BYTES + 1)
            ex = extract(file.filename, data)
            source = file.filename
        elif text and text.strip():
            ex = from_paste(text)
            source = (name or "").strip() or "Pasted text"
        else:
            raise IngestError("Upload a file or paste some text.")
    except IngestError as exc:
        raise HTTPException(422, str(exc)) from exc
    try:
        pack, cached = await run_in_threadpool(store.create, ex, source)
    except GeminiUnavailable as exc:
        raise HTTPException(
            503, f"Topic generation is unavailable right now ({exc}). Try again, or pick one of the ready-made sample packs."
        ) from exc
    return {**_pack_summary(pack), "cached": cached}


@router.post("/sessions")
async def create_session(req: SessionIn) -> dict:
    pack = store.get(req.pack_id)
    topic = pack.topic(req.topic_id) if pack else None
    if topic is None:
        raise HTTPException(404, "unknown pack or topic")
    with _lock:
        profile = _learners.get(req.learner_id)
    if profile is None:
        raise HTTPException(404, "unknown learner; complete onboarding first")
    plant = gemini if (req.plant or DEFAULT_PLANT) == "gemini" else None
    session = await run_in_threadpool(DemoSession, pack, topic, profile, plant, req.seed)
    sid = uuid.uuid4().hex
    with _lock:
        _sessions[sid] = (session, threading.Lock(), req.learner_id)
        while len(_sessions) > MAX_SESSIONS:
            _sessions.popitem(last=False)
    return _view(sid, session)


@router.get("/sessions/{sid}")
def get_session(sid: str) -> dict:
    session, lock, _ = _get(sid)
    with lock:
        return _view(sid, session)


@router.post("/sessions/{sid}/responses")
async def respond(sid: str, req: ResponseIn) -> dict:
    session, lock, _ = _get(sid)

    def run() -> dict:
        with lock:
            if session.stage == "done":
                raise HTTPException(409, "this topic's check is finished")
            outcome = session.respond(req.answer, req.hints_opened)
            return _view(sid, session, outcome)

    return await run_in_threadpool(run)


@router.get("/catalog")
def catalog() -> dict:
    return catalog_summary()


@router.get("/gallery")
def gallery() -> dict:
    """One validated example of every lab-ui/1 component (written by Gemini once, checked on every load)."""
    return gallery_json()


@router.post("/sessions/{sid}/lab")
async def session_lab(sid: str) -> dict:
    """The topic's interactive lab, composed by Gemini for this learner (cached), validated, with fallback."""
    session, _, _ = _get(sid)
    lab = await run_in_threadpool(labs.get, session.pack, session.topic, session.profile, use_gemini=session.plant is not None)
    return lab_json(lab)


@router.post("/sessions/{sid}/lab/results")
def lab_result(sid: str, req: LabResultIn) -> dict:
    session, lock, _ = _get(sid)
    with lock:
        session.record_lab(req.station_id, req.type, req.solved, req.attempts, req.revealed, req.seconds)
        return {"ok": True, "lab_results": session.lab_results}


@router.post("/sessions/{sid}/lab/finish")
def lab_finish(sid: str) -> dict:
    session, lock, _ = _get(sid)
    with lock:
        if session.stage == "explore":
            session.stage = "check"
        return _view(sid, session)


@router.get("/learners/{lid}/report")
def report(lid: str) -> dict:
    with _lock:
        profile = _learners.get(lid)
        mine = [(sid, s, lk) for sid, (s, lk, owner) in _sessions.items() if owner == lid]
    if profile is None:
        raise HTTPException(404, "unknown learner")
    topics: dict[tuple[str, str], dict] = {}
    for sid, s, lk in mine:
        with lk:
            r = topic_report(s)
        key = (r["pack_id"], r["topic_id"])
        # one row per topic: the session with the most answers
        if key not in topics or r["answered"] >= topics[key]["answered"]:
            topics[key] = {**r, "session_id": sid}
    rows = sorted(topics.values(), key=lambda r: (r["pack_title"], r["topic_id"]))
    answered = sum(r["answered"] for r in rows)
    return {
        "learner_id": lid,
        "profile": profile,
        "topics": rows,
        "totals": {
            "topics_started": len(rows),
            "topics_mastered": sum(r["status"] == "mastered" for r in rows),
            "answered": answered,
            "correct": sum(r["correct"] for r in rows),
        },
    }
