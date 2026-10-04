"""Evaluate the Laya decision model (zero-shot) against the rule-based policy.

    pip install -e ".[laya]"
    python -m closedloop.sim.laya_eval --out ../results/laya

Part A asks both policies the same decisions on learner states sampled from
the benchmark (stratified by complexity level) and records agreement and
Laya's per-call latency. Part B runs the closed loop end to end with each
policy on a small paired cohort. Laya is not part of the system: untrained it
gave the same answer for every state and is slow on CPU, so the rule-based
``SurrogatePolicy`` is the system's policy.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import statistics
import time
from pathlib import Path

from ..policy import LayaPolicy, SurrogatePolicy
from .arms import ARMS, run_variant
from .learners import cohort
from .metrics import percentile, run_summary
from .run import DEFAULT_SEED

FIELDS = ("scaffolding_mode", "show_balance_scale", "hint_enabled", "density_limit")


def sample_states(seed: int, per_level: int) -> list[tuple[float, float, int, int]]:
    """Learner states the closed loop actually visits, ``per_level`` per level."""
    by_level: dict[int, list] = {1: [], 2: [], 3: [], 4: []}
    for traj in cohort(seed, {"struggling_novice": 30, "inconsistent_guesser": 40, "fast_master": 30}):
        for r in run_variant(ARMS[3], traj, seed):
            window = traj.responses[max(0, r.step - 5) : r.step]
            by_level[r.target_level].append((r.mastery, r.target, r.target_level, sum(not x for x in window)))
    rng = random.Random(seed)
    return [s for level in sorted(by_level) for s in rng.sample(by_level[level], min(per_level, len(by_level[level])))]


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=Path("../results/laya"))
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--per-level", type=int, default=50)
    ap.add_argument("--learners-per-archetype", type=int, default=4)
    args = ap.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)

    laya, surrogate = LayaPolicy(), SurrogatePolicy()
    laya.decide(0.5, 0.5, 3, 0)  # warm-up: checkpoint download and first forward pass

    # Part A: decision agreement and latency.
    rows, latencies = [], []
    for mastery, budget, level, errors in sample_states(args.seed, args.per_level):
        t0 = time.perf_counter()
        d_laya = laya.decide(mastery, budget, level, errors)
        latencies.append((time.perf_counter() - t0) * 1000)
        d_sur = surrogate.decide(mastery, budget, level, errors)
        row = {"mastery": round(mastery, 4), "budget": round(budget, 4), "level": level, "recent_errors": errors}
        for f in FIELDS:
            row[f"surrogate_{f}"] = getattr(d_sur, f)
            row[f"laya_{f}"] = getattr(d_laya, f)
        row["laya_mode_probabilities"] = json.dumps(laya.last_raw["scaffolding_mode"]["probabilities"])
        row["laya_balance_scale_p"] = laya.last_raw["display_balance_scale_manipulative"]["noul"]
        row["laya_hint_p"] = laya.last_raw["enable_hint_button"]["noul"]
        row["latency_ms"] = round(latencies[-1], 2)
        rows.append(row)
    with (args.out / "decisions.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    agreement = {}
    for level in ("all", 1, 2, 3, 4):
        sub = [r for r in rows if level == "all" or r["level"] == level]
        agreement[str(level)] = {f: sum(r[f"surrogate_{f}"] == r[f"laya_{f}"] for r in sub) / len(sub) for f in FIELDS}
        agreement[str(level)]["n"] = len(sub)
    modes = {m: sum(r["laya_scaffolding_mode"] == m for r in rows) for m in ("worked_example", "guided_scaffold", "open_symbolic")}

    # Part B: end-to-end closed loop with each policy on the same learners.
    n = args.learners_per_archetype
    learners = cohort(args.seed, {"struggling_novice": n, "inconsistent_guesser": n, "fast_master": n})
    e2e = {}
    for name, policy in (("surrogate", surrogate), ("laya", laya)):
        summaries, s1 = [], []
        for traj in learners:
            records = run_variant(ARMS[3], traj, args.seed, policy=policy)
            summaries.append(run_summary(records))
            s1.extend(r.system1_ns / 1e6 for r in records)
        e2e[name] = {
            "learners": len(learners),
            "steps": len(s1),
            "fidelity": statistics.fmean(s["fidelity"] for s in summaries),
            "mean_delta_m": statistics.fmean(s["mean_delta_m"] for s in summaries),
            "jitter": statistics.fmean(s["jitter"] for s in summaries),
            "fallback_rate": sum(s["fallbacks"] for s in summaries) / len(s1),
            "plant_budget_compliance": sum(s["plant_within_budget"] for s in summaries) / sum(s["attempts"] for s in summaries),
            "overload_rate": statistics.fmean(s["overload_rate"] for s in summaries),
            "underload_rate": statistics.fmean(s["underload_rate"] for s in summaries),
            "system1_ms_p50": percentile(s1, 0.50),
            "system1_ms_p95": percentile(s1, 0.95),
        }

    import laya as laya_pkg
    import torch

    summary = {
        "laya_version": getattr(laya_pkg, "__version__", "unknown"),
        "checkpoint": "convaiinnovations/laya (english, zero-shot, no fine-tuning)",
        "device": "cpu",
        "torch_threads": torch.get_num_threads(),
        "states": len(rows),
        "latency_ms": {"p50": percentile(latencies, 0.5), "p95": percentile(latencies, 0.95), "max": max(latencies)},
        "agreement_with_surrogate": agreement,
        "laya_mode_counts": modes,
        "end_to_end": e2e,
        "questions": "closedloop.policy.LAYA_QUESTIONS",
    }
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({k: summary[k] for k in ("latency_ms", "agreement_with_surrogate", "laya_mode_counts", "end_to_end")}, indent=1))


if __name__ == "__main__":
    main()
