"""HTTP service for the live closed loop.

    uvicorn closedloop.service:app --port 8000

Sessions live in memory (one process, bounded LRU), which is enough for the
prototype. ``GENUI_PLANTS`` lists the plants a client may ask for
(default ``surrogate,gemini``); ``surrogate`` needs no network.

Cost guards for a public deployment (0 disables each):
``GENUI_GEMINI_DAILY_CAP`` caps real Gemini calls per UTC day across all
sessions (past the cap the gate renders the deterministic fallback), and
``GENUI_GEMINI_SESSIONS_PER_IP`` caps Gemini sessions per client IP per hour.
``GENUI_STATIC_DIR`` serves the built frontend from the same origin.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import asdict
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .ast_schema import UIDocument
from .governor import GovernorConfig
from .loop import LoopSession
from .plant import Emission

MAX_SESSIONS = int(os.environ.get("GENUI_MAX_SESSIONS", "500"))
ALLOWED_PLANTS = tuple(p.strip() for p in os.environ.get("GENUI_PLANTS", "surrogate,gemini").split(",") if p.strip())
GEMINI_DAILY_CAP = int(os.environ.get("GENUI_GEMINI_DAILY_CAP", "0"))
GEMINI_SESSIONS_PER_IP = int(os.environ.get("GENUI_GEMINI_SESSIONS_PER_IP", "0"))
STATIC_DIR = os.environ.get("GENUI_STATIC_DIR")
CORS_ORIGINS = [o for o in os.environ.get("GENUI_CORS_ORIGINS", "*").split(",") if o]

app = FastAPI(title="Closed-loop GenUI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])

_sessions: OrderedDict[str, tuple[LoopSession, threading.Lock]] = OrderedDict()
_registry_lock = threading.Lock()
_gemini = None


class _CappedPlant:
    """Counts real Gemini calls per UTC day; past the cap, emits nothing so the gate falls back."""

    def __init__(self, plant, cap: int) -> None:
        self.plant, self.cap = plant, cap
        self._day, self.calls = "", 0
        self._lock = threading.Lock()

    def remaining(self) -> int | None:
        if not self.cap:
            return None
        with self._lock:
            used = self.calls if self._day == time.strftime("%Y-%m-%d", time.gmtime()) else 0
            return max(0, self.cap - used)

    def generate(self, budget, decision, eq, rng) -> Emission:
        if self.cap:
            with self._lock:
                today = time.strftime("%Y-%m-%d", time.gmtime())
                if today != self._day:
                    self._day, self.calls = today, 0
                if self.calls >= self.cap:
                    return Emission("", "plant_error: daily cap reached")
                self.calls += 1
        return self.plant.generate(budget, decision, eq, rng)


_ip_sessions: dict[str, list[float]] = {}


def _plant(name: str):
    global _gemini
    if name == "surrogate":
        return None
    if _gemini is None:
        from .gemini import GeminiPlant

        _gemini = _CappedPlant(GeminiPlant(), GEMINI_DAILY_CAP)
    return _gemini


def _admit_gemini_session(request: Request) -> None:
    if not GEMINI_SESSIONS_PER_IP:
        return
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "?")
    now = time.time()
    with _registry_lock:
        recent = [t for t in _ip_sessions.get(ip, []) if now - t < 3600]
        if len(recent) >= GEMINI_SESSIONS_PER_IP:
            raise HTTPException(429, "live Gemini session limit reached for this hour; use the surrogate plant")
        recent.append(now)
        _ip_sessions[ip] = recent
        if len(_ip_sessions) > 10 * MAX_SESSIONS:
            _ip_sessions.clear()


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
    remaining = _gemini.remaining() if _gemini is not None else (GEMINI_DAILY_CAP or None)
    return {"ok": True, "plants": list(ALLOWED_PLANTS), "sessions": len(_sessions), "gemini_calls_left_today": remaining}


@app.get("/api/config")
def config() -> dict:
    return {"governor": asdict(GovernorConfig()), "schema": UIDocument.model_json_schema()}


@app.post("/api/sessions")
def create_session(req: CreateSession, request: Request) -> dict:
    if req.plant not in ALLOWED_PLANTS:
        raise HTTPException(400, f"plant {req.plant!r} is disabled")
    if req.plant == "gemini":
        _admit_gemini_session(request)
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


if STATIC_DIR:  # after the API routes, so /api/* is never shadowed
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
