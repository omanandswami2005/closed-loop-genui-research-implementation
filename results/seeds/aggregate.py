"""Spread of the main benchmark across independent test seeds.

Re-create each seed folder with
    cd backend && python -m closedloop.sim.run --seed SEED --out ../results/seeds/SEED
then run this file from the repository root. It writes across_seeds.csv
(one row per arm and metric: mean, sd, min, max over seeds, cohort "all").
"""
import csv
import statistics as st
from pathlib import Path

HERE = Path(__file__).parent
METRICS = ["mean_delta_m_ref", "fidelity_ref", "jitter", "level_skips_per_run",
           "overload_rate", "underload_rate", "itae_mismatch", "fallback_rate"]

values: dict[tuple[str, str], list[float]] = {}
seeds = sorted(p.name for p in HERE.iterdir() if (p / "summary.csv").exists())
for seed in seeds:
    for row in csv.DictReader(open(HERE / seed / "summary.csv")):
        if row["archetype"] != "all":
            continue
        for m in METRICS:
            if row[m] != "":
                values.setdefault((row["variant"], m), []).append(float(row[m]))

with open(HERE / "across_seeds.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["variant", "metric", "n_seeds", "mean", "sd", "min", "max"])
    for (variant, m), xs in values.items():
        w.writerow([variant, m, len(xs), f"{st.mean(xs):.6f}", f"{st.stdev(xs):.6f}", f"{min(xs):.6f}", f"{max(xs):.6f}"])
print(f"{len(seeds)} seeds: {', '.join(seeds)}")
