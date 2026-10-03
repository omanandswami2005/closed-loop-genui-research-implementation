"""HTTP service for the live closed loop.

    uvicorn closedloop.service:app --port 8000

Sessions live in memory (one process, bounded LRU), which is enough for the
prototype. ``GENUI_PLANTS`` lists the plants a client may ask for
(default ``surrogate,gemini``); ``surrogate`` needs no network.
"""

from __future__ import annotations

import os
import threading
import uuid
from collections import OrderedDict
from dataclasses import asdict
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .ast_schema import UIDocument
from .governor import GovernorConfig
from .loop import LoopSession

MAX_SESSIONS = int(os.environ.get("GENUI_MAX_SESSIONS", "500"))
ALLOWED_PLANTS = tuple(p.strip() for p in os.environ.get("GENUI_PLANTS", "surrogate,gemini").split(",") if p.strip())
CORS_ORIGINS = [o for o in os.environ.get("GENUI_CORS_ORIGINS", "*").split(",") if o]

app = FastAPI(title="Closed-loop GenUI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])

_sessions: OrderedDict[str, tuple[LoopSession, threading.Lock]] = OrderedDict()
_registry_lock = threading.Lock()
_gemini = None


def _plant(name: str):
    global _gemini
    if name == "surrogate":
        return None
    if _gemini is None:
        from .gemini import GeminiPlant

        _gemini = GeminiPlant()
    return _gemini


class CreateSession(BaseModel):
    plant: Literal["surrogate", "gemini"] = "surrogate"
    seed: int | None = Field(default=None, ge=0, lt=2**31)


class Response(BaseModel):
    answer: str = Field(max_length=200)
    steps: list[str] = Field(default_factory=list, max_length=12)


class StepLine(BaseModel):
    line: str = Field(max_length=200)


def _view(sid: str, s: LoopSession) -> dict:
    item = s.current
    return {
        "session_id": sid,
        "item": item.telemetry.item,
        "equation": item.equation.model_dump(),
        "equation_latex": item.equation.latex(),
        "document": item.document,
        "telemetry": asdict(item.telemetry),
        "history": [asdict(t) for t in s.history[-40:]],
        "responses": s.responses[-40:],
        "setpoint": s.governor.config.setpoint,
    }


def _get(sid: str) -> tuple[LoopSession, threading.Lock]:
    with _registry_lock:
        entry = _sessions.get(sid)
        if entry is None:
            raise HTTPException(404, "unknown session")
        _sessions.move_to_end(sid)
        return entry


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "plants": list(ALLOWED_PLANTS), "sessions": len(_sessions)}


@app.get("/api/config")
def config() -> dict:
    return {"governor": asdict(GovernorConfig()), "schema": UIDocument.model_json_schema()}


@app.post("/api/sessions")
def create_session(req: CreateSession) -> dict:
    if req.plant not in ALLOWED_PLANTS:
        raise HTTPException(400, f"plant {req.plant!r} is disabled")
    session = LoopSession(plant=_plant(req.plant), plant_name=req.plant, seed=req.seed)
    sid = uuid.uuid4().hex
    with _registry_lock:
        _sessions[sid] = (session, threading.Lock())
        while len(_sessions) > MAX_SESSIONS:
            _sessions.popitem(last=False)
    return _view(sid, session)


@app.get("/api/sessions/{sid}")
def get_session(sid: str) -> dict:
    session, lock = _get(sid)
    with lock:
        return _view(sid, session)


@app.post("/api/sessions/{sid}/check")
def check_line(sid: str, req: StepLine) -> dict:
    session, lock = _get(sid)
    with lock:
        return asdict(session.check(req.line))


@app.post("/api/sessions/{sid}/responses")
def respond(sid: str, req: Response) -> dict:
    session, lock = _get(sid)
    with lock:
        outcome = session.respond(req.answer, req.steps)
        return {"outcome": asdict(outcome), **_view(sid, session)}
