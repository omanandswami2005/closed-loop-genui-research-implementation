"""Gemini generative plant on Vertex AI (spec Section 5, Layer 3).

Same interface as ``SurrogatePlant``: ``generate(budget, decision, eq, rng)``
returns an ``Emission`` whose text goes through ``admit`` like any other plant
output, so a timeout, an error or invalid JSON simply renders the fallback.

Configuration (environment):
    GOOGLE_CLOUD_PROJECT   GCP project id (default omni-505707)
    GOOGLE_CLOUD_LOCATION  Vertex location (default global; gemini-3.7-flash
                           is served only on the global endpoint)
    GENUI_GEMINI_MODEL     model id (default gemini-3.7-flash)
    GENUI_GEMINI_TIMEOUT   seconds (default 30)
    GENUI_GEMINI_THINKING  thinking level LOW or HIGH (default LOW; HIGH is
                           about 3x slower)
    GENUI_GEMINI_MODE      "guided" (default): the deterministic planner
                           (``plant.plan``) fixes the layout and the model
                           writes the content; "free": the model chooses the
                           layout that meets the budget. Guided removes the
                           model's budget arithmetic, which is most of the
                           latency.

Auth: on Cloud Run the access token comes from the metadata server. Elsewhere
no header is added, which suits an environment whose egress proxy injects
credentials; set GENUI_GEMINI_TOKEN to pass a token explicitly.
"""

from __future__ import annotations

import json
import os
import random
import threading
import time
from dataclasses import dataclass

import httpx

from .ast_schema import SCHEMA_VERSION, Equation, UIDocument
from . import metric
from .metric import DELTA_MAX, DELTA_MIN, RHO_MAX, RHO_MIN
from .plant import EPSILON, Emission, plan
from .policy import PolicyDecision

_METADATA_TOKEN = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"

_COMPONENTS = """\
Components (the "type" field selects one; no other fields are allowed):
- Stack {direction: "vertical"|"horizontal", children: 1-4 nodes}: layout only.
- MathText {latex}: static text, 0 interactive elements.
- ConcreteBalanceScale {left: {coef_x, const}, right: {coef_x, const}, draggable_weights: 1-6}: abstraction 1, interactive = draggable_weights.
- ScaffoldedOperationPad {operations: unique subset of ["+","-","*","/"], value_input: bool}: abstraction 2, interactive = len(operations) + (1 if value_input).
- SymbolicEquationWorkspace {input_lines: 1-6}: abstraction 3, interactive = input_lines.
- CartesianVerificationPlane {lines: 1-2 of {slope, intercept}, draggable: bool, parameter_sliders: 0-4}: abstraction 4, interactive = 1 + (len(lines) if draggable) + parameter_sliders.
- WorkedSolutionStep {steps: 1-6 of {operation (<=40 chars), result_latex (<=120), explanation (<=160)}}: static, 0 interactive.
- SteppedHintAccordion {hints: 1-3 strings}: interactive = len(hints)."""


def _prompt(budget: float, decision: PolicyDecision, eq: Equation) -> str:
    w1, w2, w3 = metric._weights
    return f"""You generate one screen of a math tutor as JSON. Output only the JSON object.

Problem: {eq.latex()} (a={eq.a}, b={eq.b}, c={eq.c}).

The screen must hit a target structural complexity M_I* = {budget:.3f} within +/-{EPSILON}, where
M_I = {w1:.4f}*(rho-{RHO_MIN})/{RHO_MAX - RHO_MIN} + {w2:.4f}*(alpha-1)/3 + {w3:.4f}*(delta-{DELTA_MIN})/{DELTA_MAX - DELTA_MIN}
rho = total interactive elements in the tree ({RHO_MIN}-{RHO_MAX}), alpha = abstraction of the most abstract
manipulative present (1 if none), delta = tree depth (a non-Stack root has depth 1; each Stack adds 1; max {DELTA_MAX}).

Pedagogical decisions you must respect:
- scaffolding_mode: {decision.scaffolding_mode}
- primary manipulative abstraction: alpha = {decision.alpha}
- hints allowed: {"yes" if decision.hint_enabled else "no"}
- instructional density limit: {decision.density_limit} (1 = minimal, 5 = rich)
- worked example: {"include a WorkedSolutionStep" if decision.scaffolding_mode == "worked_example" else "none"}

{_COMPONENTS}

Return exactly: {{"schema_version": "{SCHEMA_VERSION}", "equation": {{"a": {eq.a}, "b": {eq.b}, "c": {eq.c}}}, "root": <node>}}"""


def _layout(budget: float, decision: PolicyDecision) -> str:
    bp = plan(budget, decision)
    return (
        "\n\nLayout to realize exactly (it already meets the budget): a primary manipulative with "
        f"alpha = {bp.alpha} and exactly {bp.primary} interactive elements; "
        + (f"a SteppedHintAccordion with exactly {bp.hint_tiers} hints; " if bp.hint_tiers else "no hints; ")
        + (f"a WorkedSolutionStep with {bp.worked_steps} steps; " if bp.worked_steps else "no worked example; ")
        + f"total tree depth exactly {bp.depth} (wrap in Stacks with a MathText prompt for extra depth). "
        "Write the instructional content (hints, worked steps, prompts) yourself."
    )


@dataclass(frozen=True)
class GeminiConfig:
    project: str = os.environ.get("GOOGLE_CLOUD_PROJECT", "omni-505707")
    location: str = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
    model: str = os.environ.get("GENUI_GEMINI_MODEL", "gemini-3.7-flash")
    timeout_s: float = float(os.environ.get("GENUI_GEMINI_TIMEOUT", "30"))
    thinking_level: str = os.environ.get("GENUI_GEMINI_THINKING", "LOW")
    mode: str = os.environ.get("GENUI_GEMINI_MODE", "guided")
    temperature: float = 0.4

    @property
    def url(self) -> str:
        host = "aiplatform.googleapis.com" if self.location == "global" else f"{self.location}-aiplatform.googleapis.com"
        return (
            f"https://{host}/v1/projects/{self.project}/locations/{self.location}"
            f"/publishers/google/models/{self.model}:generateContent"
        )


class GeminiPlant:
    def __init__(self, config: GeminiConfig | None = None, client: httpx.Client | None = None) -> None:
        self.config = config or GeminiConfig()
        self.client = client or httpx.Client(timeout=self.config.timeout_s)
        self._token: tuple[str, float] | None = None
        self._local = threading.local()  # per-thread, so concurrent callers read their own call

    @property
    def last_latency_ms(self) -> float | None:
        return getattr(self._local, "latency_ms", None)

    @property
    def last_usage(self) -> dict:
        """Token counts of this thread's last call (prompt, output, thinking)."""
        return getattr(self._local, "usage", {})

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        token = os.environ.get("GENUI_GEMINI_TOKEN")
        if not token and os.environ.get("K_SERVICE"):  # running on Cloud Run
            if self._token is None or self._token[1] < time.time() + 60:
                r = self.client.get(_METADATA_TOKEN, headers={"Metadata-Flavor": "Google"})
                r.raise_for_status()
                body = r.json()
                self._token = (body["access_token"], time.time() + body["expires_in"])
            token = self._token[0]
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def generate(self, budget: float, decision: PolicyDecision, eq: Equation, rng: random.Random) -> Emission:
        prompt = _prompt(budget, decision, eq)
        if self.config.mode == "guided":
            prompt += _layout(budget, decision)
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": self.config.temperature,
                "seed": rng.randrange(2**31),
                "thinkingConfig": {"thinkingLevel": self.config.thinking_level},
            },
        }
        t0 = time.perf_counter()
        self._local.usage = {}
        try:
            r = self.client.post(self.config.url, headers=self._headers(), json=body)
            r.raise_for_status()
            data = r.json()
            usage = data.get("usageMetadata", {})
            self._local.usage = {
                "prompt_tokens": usage.get("promptTokenCount", 0),
                "output_tokens": usage.get("candidatesTokenCount", 0),
                "thought_tokens": usage.get("thoughtsTokenCount", 0),
            }
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            fault = None
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
            text, fault = "", f"plant_error: {type(exc).__name__}" + (f" {status}" if status else "")
        self._local.latency_ms = (time.perf_counter() - t0) * 1000
        return Emission(text, fault)


def schema_json() -> str:
    """The JSON schema the gate enforces (for documentation and debugging)."""
    return json.dumps(UIDocument.model_json_schema(), indent=2)
