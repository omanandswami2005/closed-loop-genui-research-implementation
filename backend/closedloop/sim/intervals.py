"""Learner-level confidence intervals for the benchmark (paper, Results).

Each row of ``runs.csv`` is one learner's summary on one arm, so the
resampling unit is the learner. Per-arm intervals use a normal approximation
over learners (``metrics.mean_ci``), with a bootstrap check. Differences from
the closed loop are paired by learner, since every arm replays the same
responses, and use a bootstrap over learners.

    python -m closedloop.sim.intervals --runs ../results/benchmark/runs.csv \
        --out ../results/benchmark/bootstrap_ci.csv
"""

from __future__ import annotations

import argparse
import csv
import random
import statistics
from pathlib import Path

from .metrics import mean_ci

METRICS = ("mean_delta_m_ref", "jitter")
REFERENCE = "closed_loop"
COMPARED = ("unconstrained_genui", "rule_based")


def bootstrap_ci(values: list[float], resamples: int, rng: random.Random) -> tuple[float, float]:
    """Percentile bootstrap 95% interval for the mean over the given units."""
    n = len(values)
    means = sorted(statistics.fmean(values[rng.randrange(n)] for _ in range(n)) for _ in range(resamples))
    return means[int(0.025 * resamples)], means[int(0.975 * resamples) - 1]


def load_runs(path: Path) -> dict[str, dict[str, dict[str, str]]]:
    """variant -> learner_id -> row (one row per learner per arm)."""
    out: dict[str, dict[str, dict[str, str]]] = {}
    with path.open(newline="") as fh:
        for row in csv.DictReader(fh):
            out.setdefault(row["variant"], {})[row["learner_id"]] = row
    return out


def build_rows(runs: dict[str, dict[str, dict[str, str]]], resamples: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for variant in (REFERENCE, *COMPARED, "static", "closed_loop_forgetting", "closed_loop_lapse_cusum"):
        if variant not in runs:
            continue
        for metric in METRICS:
            values = [float(r[metric]) for r in runs[variant].values()]
            lo_b, hi_b = bootstrap_ci(values, resamples, rng)
            lo_n, hi_n = mean_ci(values)[1:]
            rows.append({
                "kind": "per_arm", "variant": variant, "metric": metric,
                "mean": statistics.fmean(values), "normal_lo": lo_n, "normal_hi": hi_n,
                "bootstrap_lo": lo_b, "bootstrap_hi": hi_b,
            })
    ref = runs[REFERENCE]
    for other in COMPARED:
        for metric in METRICS:
            ids = sorted(set(ref) & set(runs[other]))
            diffs = [float(runs[other][i][metric]) - float(ref[i][metric]) for i in ids]
            lo_b, hi_b = bootstrap_ci(diffs, resamples, rng)
            lo_n, hi_n = mean_ci(diffs)[1:]
            rows.append({
                "kind": "paired_difference", "variant": f"{other} minus {REFERENCE}", "metric": metric,
                "mean": statistics.fmean(diffs), "normal_lo": lo_n, "normal_hi": hi_n,
                "bootstrap_lo": lo_b, "bootstrap_hi": hi_b,
            })
    return rows


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--runs", type=Path, default=Path("../results/benchmark/runs.csv"))
    ap.add_argument("--out", type=Path, default=Path("../results/benchmark/bootstrap_ci.csv"))
    ap.add_argument("--resamples", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=20261003)
    args = ap.parse_args(argv)
    rows = build_rows(load_runs(args.runs), args.resamples, args.seed)
    with args.out.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        for row in rows:
            writer.writerow({k: round(v, 6) if isinstance(v, float) else v for k, v in row.items()})
    for row in rows:
        print(f"{row['kind']:18s} {row['variant']:40s} {row['metric']:18s} {row['mean']:.4f} "
              f"[{row['bootstrap_lo']:.4f}, {row['bootstrap_hi']:.4f}]")


if __name__ == "__main__":
    main()
