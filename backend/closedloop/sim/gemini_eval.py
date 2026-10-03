"""Measure the real Gemini plant against the validation gate.

    python -m closedloop.sim.gemini_eval --out ../results/gemini --n 200

Each call asks Gemini for one CLT-UI screen at a budget drawn uniformly from
[0.02, 0.98], with the surrogate policy's decision for that budget and a
random equation. Every output goes through the same gate as the benchmark.
The measured malformed rate (schema rejections) and drift rate (valid but
|M_I - M_I*| > epsilon) replace the surrogate plant's assumed 3% and 15%.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import statistics
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ..ast_schema import measure, parse_document
from ..gemini import GeminiConfig, GeminiPlant
from ..governor import complexity_level
from ..plant import EPSILON, admit
from ..policy import SurrogatePolicy
from .learners import _problem
from .metrics import percentile
from .run import DEFAULT_SEED


def _call(i: int, seed: int, plant: GeminiPlant) -> dict:
    rng = random.Random(f"{seed}:gemini:{i}")
    budget = rng.uniform(0.02, 0.98)
    level = complexity_level(budget)
    recent_errors = rng.randint(0, 3)
    mastery = rng.random()
    decision = SurrogatePolicy().decide(mastery, budget, level, recent_errors)
    eq = _problem(rng)
    emission = plant.generate(budget, decision, eq, rng)
    latency = plant.last_latency_ms
    adm = admit(emission.text, budget, decision, eq)
    m_i = None
    if adm.schema_valid:
        doc, _ = parse_document(emission.text)
        m_i = measure(doc).m_i
    return {
        "call": i,
        "budget": round(budget, 4),
        "level": level,
        "scaffolding_mode": decision.scaffolding_mode,
        "alpha": decision.alpha,
        "hint_enabled": decision.hint_enabled,
        "density_limit": decision.density_limit,
        "equation": eq.latex(),
        "latency_ms": round(latency or 0.0, 1),
        "plant_error": emission.fault or "",
        "schema_valid": adm.schema_valid,
        "m_i": "" if m_i is None else round(m_i, 4),
        "abs_error": "" if m_i is None else round(abs(m_i - budget), 4),
        "within_budget": adm.within_budget,
        "fallback_used": adm.fallback_used,
        "reason": adm.reason or "",
    }


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=Path("../results/gemini"))
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = ap.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)

    plant = GeminiPlant()
    with ThreadPoolExecutor(args.workers) as pool:
        rows = list(pool.map(lambda i: _call(i, args.seed, plant), range(args.n)))
    with (args.out / "calls.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    n = len(rows)
    valid = [r for r in rows if r["schema_valid"]]
    errors = [r["abs_error"] for r in valid]
    latencies = [r["latency_ms"] for r in rows if not r["plant_error"]]
    reasons: dict[str, int] = {}
    for r in rows:
        if not r["schema_valid"]:
            reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
    by_level = {}
    for lv in (1, 2, 3, 4):
        sub = [r for r in rows if r["level"] == lv]
        if sub:
            by_level[lv] = {
                "calls": len(sub),
                "schema_compliance": sum(r["schema_valid"] for r in sub) / len(sub),
                "budget_compliance": sum(r["within_budget"] for r in sub) / len(sub),
            }
    cfg = GeminiConfig()
    summary = {
        "model": cfg.model,
        "location": cfg.location,
        "thinking_level": cfg.thinking_level,
        "temperature": cfg.temperature,
        "seed": args.seed,
        "calls": n,
        "epsilon": EPSILON,
        "plant_errors": sum(bool(r["plant_error"]) for r in rows),
        "schema_compliance": len(valid) / n,
        "malformed_rate": 1 - len(valid) / n,
        "budget_compliance": sum(r["within_budget"] for r in rows) / n,
        "drift_rate_given_valid": sum(not r["within_budget"] for r in valid) / len(valid) if valid else None,
        "fallback_rate": sum(r["fallback_used"] for r in rows) / n,
        "abs_error_median": statistics.median(errors) if errors else None,
        "abs_error_mean": statistics.fmean(errors) if errors else None,
        "latency_ms_p50": percentile(latencies, 0.50) if latencies else None,
        "latency_ms_p95": percentile(latencies, 0.95) if latencies else None,
        "schema_rejections": reasons,
        "by_level": by_level,
    }
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
