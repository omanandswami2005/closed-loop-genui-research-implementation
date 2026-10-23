"""Demo entry point: the ``/api/demo`` routes in front of the untouched research app.

    uvicorn closedloop_demo.app:app --port 8000

Everything that is not ``/api/demo/*`` (the research API, ``/api/health``, the
built frontend) is served by ``closedloop.service.app`` exactly as before.
"""

from __future__ import annotations

from fastapi import FastAPI

from closedloop.service import CORS_ORIGINS, app as research_app
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

app = FastAPI(title="Closed-loop GenUI demo extension", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])
app.include_router(router)
app.mount("/", research_app)
