"""JSON-only calls to Gemini on Vertex AI, reusing the research plant's endpoint and auth."""

from __future__ import annotations

import json
import os
import time
from collections.abc import Callable
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass, replace

import httpx

from closedloop.gemini import GeminiConfig, GeminiPlant


class GeminiUnavailable(RuntimeError):
    """Network, credentials, quota or an unparseable reply; the caller falls back."""


@dataclass
class Reply:
    data: dict
    latency_ms: float
    usage: dict


class VertexJSON:
    def __init__(self, model: str | None = None, timeout_s: float | None = None) -> None:
        cfg = GeminiConfig()
        cfg = replace(
            cfg,
            model=model or os.environ.get("GENUI_DEMO_MODEL", "gemini-3-flash-preview"),
            timeout_s=timeout_s or float(os.environ.get("GENUI_DEMO_TIMEOUT", "120")),
        )
        self._plant = GeminiPlant(cfg)  # owns the HTTP client and the token logic
        self.model = cfg.model

    def call(self, prompt: str, schema: dict | None, *, thinking: str = "LOW", temperature: float = 0.4, seed: int | None = None) -> Reply:
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": temperature,
                "thinkingConfig": {"thinkingLevel": thinking},
            },
        }
        if schema is not None:
            body["generationConfig"]["responseSchema"] = schema
        if seed is not None:
            body["generationConfig"]["seed"] = seed
        t0 = time.perf_counter()
        # Streamed (server-sent events) so long generations keep the connection
        # busy; the chunks are joined before parsing.
        url = self._plant.config.url.replace(":generateContent", ":streamGenerateContent") + "?alt=sse"
        texts: list[str] = []
        data: dict = {}
        try:
            with self._plant.client.stream("POST", url, headers=self._plant._headers(), json=body) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    chunk = json.loads(line[5:])
                    data = chunk if "usageMetadata" in chunk else data
                    for cand in chunk.get("candidates", [])[:1]:
                        for part in cand.get("content", {}).get("parts", []):
                            if not part.get("thought"):
                                texts.append(part.get("text", ""))
            parsed = json.loads("".join(texts))
        except httpx.HTTPStatusError as exc:
            raise GeminiUnavailable(f"HTTP {exc.response.status_code}") from exc
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise GeminiUnavailable(type(exc).__name__) from exc
        if not isinstance(parsed, dict):
            raise GeminiUnavailable("reply is not a JSON object")
        usage = data.get("usageMetadata", {})
        return Reply(
            parsed,
            (time.perf_counter() - t0) * 1000,
            {
                "prompt_tokens": usage.get("promptTokenCount", 0),
                "output_tokens": usage.get("candidatesTokenCount", 0),
                "thought_tokens": usage.get("thoughtsTokenCount", 0),
            },
        )



_HEDGE_POOL = ThreadPoolExecutor(max_workers=16, thread_name_prefix="vertex-hedge")


def hedged(fn: Callable[[], Reply], *, hedge_after_s: float, copies: int, deadline_s: float) -> Reply:
    """Run ``fn``; while no copy has answered, start another every ``hedge_after_s``, up to ``copies``.

    Vertex replies usually arrive in 2-5 s, but a few take 25 s or more. An
    identical request sent after a short wait usually comes back first, so the
    learner is not left waiting. The first successful reply wins; the others
    finish in the background and are ignored. A failed copy is replaced at once.
    """
    start = time.monotonic()
    running = {_HEDGE_POOL.submit(fn)}
    launched, last_error = 1, None
    while running:
        remaining = deadline_s - (time.monotonic() - start)
        if remaining <= 0:
            break
        done, running = wait(running, timeout=min(hedge_after_s, remaining) if launched < copies else remaining, return_when=FIRST_COMPLETED)
        for f in done:
            try:
                return f.result()
            except GeminiUnavailable as exc:
                last_error = exc
                if str(exc).rsplit(" ", 1)[-1] in ("401", "402", "403", "429"):
                    raise
        if launched < copies:
            running.add(_HEDGE_POOL.submit(fn))
            launched += 1
    raise last_error if last_error is not None and not running else GeminiUnavailable("ReadTimeout")
