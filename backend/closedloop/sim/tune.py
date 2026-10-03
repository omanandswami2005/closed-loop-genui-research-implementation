"""Controller tuning, parameter sensitivity and metric-weight sensitivity.

    python -m closedloop.sim.tune search       --out ../results/tuning   # ~5 min
    python -m closedloop.sim.tune sensitivity  --out ../results/tuning   # ~3 min

No published rule gives PID gains for this loop: the classic rules need a
plant model, and here the interface never changes the simulated learner's
answers. So the controller parameters are *tuned*, not sourced:

1. Cost = ITAE-style time-weighted mismatch (Graham & Lathrop 1953) between
   the rendered level and the learner's true state, plus LAMBDA x interface
   jitter. Mismatch = an abstract interface (level >= 3) for a learner who
   does not know the skill, or a concrete one (level <= 2) for one who does.
2. Random search over Kp, Ki, Kd, gamma, S_max and the hysteresis band on a
   TUNING cohort (seed + 1). The sigmoid slope follows the spec's rule
   k = ln(19) / (Kp + Ki * S_max).
3. Every paper number comes from the TEST cohort (the benchmark seed).
4. ``sensitivity`` moves each tuned parameter by +/-50% on the test cohort and
   re-runs the main arms under alternative M_I weightings.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
from dataclasses import asdict
from pathlib import Path

from ..governor import GovernorConfig
from ..metric import DEFAULT_WEIGHTS, set_weights
from .arms import ARMS, Variant
from .learners import COHORT, cohort
from .run import DEFAULT_SEED, run_cohort, summary_table

TUNING_SEED = DEFAULT_SEED + 1
LAMBDA = 1.0
N_SAMPLES = 200
SPACE = {  # uniform ranges for the random search
    "kp": (0.25, 2.5),
    "ki": (0.0, 0.4),
    "kd": (0.0, 1.0),
    "gamma": (0.05, 1.0),
    "s_max": (1.0, 6.0),
    "hysteresis": (0.02, 0.15),
}
SPEC = {"kp": 1.25, "ki": 0.10, "kd": 0.35, "gamma": 0.10, "s_max": 3.0, "hysteresis": 0.06}
WEIGHT_SETS = {
    "equal_default": DEFAULT_WEIGHTS,
    "spec_original": (0.40, 0.35, 0.25),
    "drop_density": (0.0, 0.5, 0.5),
    "drop_abstraction": (0.5, 0.0, 0.5),
    "drop_depth": (0.5, 0.5, 0.0),
    "density_heavy": (0.60, 0.20, 0.20),
    "abstraction_heavy": (0.20, 0.60, 0.20),
    "depth_heavy": (0.20, 0.20, 0.60),
}
KEEP = (
    "mean_delta_m",
    "fidelity",
    "jitter",
    "level_skips_per_run",
    "fallback_rate",
    "reached_level4",
    "overload_rate",
    "underload_rate",
    "itae_mismatch",
)


def slope_for(kp: float, ki: float, s_max: float) -> float:
    """Spec Section 6.3: steady-state budget extremes at 5% and 95%."""
    return math.log(19) / (kp + ki * s_max)


def config_for(params: dict) -> GovernorConfig:
    return GovernorConfig(**params, slope=slope_for(params["kp"], params["ki"], params["s_max"]))


def cost(row: dict) -> float:
    return row["itae_mismatch"] + LAMBDA * row["jitter"]


def _write(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def _sizes(scale: float) -> dict[str, int]:
    return {k: max(1, round(v * scale)) for k, v in COHORT.items()}


def _evaluate(param_sets: list[dict], seed: int, workers: int, scale: float, names: list[str] | None = None) -> list[dict]:
    names = names or [f"cfg{i}" for i in range(len(param_sets))]
    variants = [Variant(n, "closed_loop", governor=config_for(ps)) for n, ps in zip(names, param_sets)]
    runs, streaks, _, _ = run_cohort(cohort(seed, _sizes(scale)), variants, seed, workers)
    out = []
    for ps, row in zip(param_sets, summary_table(runs, streaks, variants, [])):
        r = {"name": row["variant"], **ps, "slope": slope_for(ps["kp"], ps["ki"], ps["s_max"]), **{k: row[k] for k in KEEP}}
        r["cost"] = cost(r)
        out.append(r)
    return out


def search(out: Path, workers: int, scale: float) -> None:
    rng = random.Random(TUNING_SEED)
    samples = [SPEC] + [{k: round(rng.uniform(lo, hi), 3) for k, (lo, hi) in SPACE.items()} for _ in range(N_SAMPLES)]
    rows = _evaluate(samples, TUNING_SEED, workers, scale, ["spec"] + [f"sample{i}" for i in range(N_SAMPLES)])
    best = min(rows, key=lambda r: r["cost"])
    _write(out / "search.csv", sorted(rows, key=lambda r: r["cost"]))
    chosen = {k: best[k] for k in SPACE}
    summary = {
        "procedure": "random search on the tuning cohort; all reported results use the test cohort",
        "tuning_seed": TUNING_SEED,
        "test_seed": DEFAULT_SEED,
        "cost": "itae_mismatch + LAMBDA * jitter",
        "itae_mismatch": "sum_n (n+1) * mismatch_n / sum_n (n+1), mismatch = level >= 3 while the skill is unknown or level <= 2 while known",
        "lambda": LAMBDA,
        "samples": N_SAMPLES,
        "search_space": SPACE,
        "slope_rule": "k = ln(19) / (Kp + Ki * S_max)",
        "spec_values": {**SPEC, "cost_on_tuning_cohort": rows[0]["cost"]},
        "chosen_values": {**chosen, "slope": best["slope"], "cost_on_tuning_cohort": best["cost"]},
    }
    (out / "tuning.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({k: summary[k] for k in ("spec_values", "chosen_values")}, indent=1))


def sensitivity(out: Path, workers: int, scale: float) -> None:
    base = GovernorConfig()
    tuned = {k: getattr(base, k) for k in SPACE}
    sets, names = [tuned], ["tuned"]
    for k in SPACE:
        for f in (0.5, 1.5):
            sets.append({**tuned, k: tuned[k] * f})
            names.append(f"{k}_x{f}")
    rows = _evaluate(sets, DEFAULT_SEED, workers, scale, names)
    _write(out / "parameter_sensitivity.csv", rows)
    for r in rows:
        print(f"{r['name']:18s} cost={r['cost']:.4f} itae={r['itae_mismatch']:.4f} J={r['jitter']:.4f} L4={r['reached_level4']:.3f} skips={r['level_skips_per_run']:.2f}")

    variants = [ARMS[1], ARMS[2], ARMS[3]]
    learners = cohort(DEFAULT_SEED, _sizes(scale))
    wrows = []
    for name, weights in WEIGHT_SETS.items():
        set_weights(weights)
        runs, streaks, _, _ = run_cohort(learners, variants, DEFAULT_SEED, workers)
        for row in summary_table(runs, streaks, variants, []):
            wrows.append(
                {
                    "weights": name,
                    "w_density": round(weights[0], 4),
                    "w_abstraction": round(weights[1], 4),
                    "w_depth": round(weights[2], 4),
                    "variant": row["variant"],
                    **{k: row[k] for k in KEEP + ("mean_delta_m_ref",)},
                }
            )
    set_weights(DEFAULT_WEIGHTS)
    _write(out / "weight_sensitivity.csv", wrows)
    for r in wrows:
        print(f"{r['weights']:18s} {r['variant']:20s} dMref={r['mean_delta_m_ref']:.4f} fid={r['fidelity']:.3f} J={r['jitter']:.4f} itae={r['itae_mismatch']:.4f}")
    (out / "governor_defaults.json").write_text(json.dumps(asdict(base), indent=2) + "\n")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", choices=("search", "sensitivity"))
    ap.add_argument("--out", type=Path, default=Path("../results/tuning"))
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--scale", type=float, default=1.0)
    args = ap.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    (search if args.mode == "search" else sensitivity)(args.out, args.workers, args.scale)


if __name__ == "__main__":
    main()
