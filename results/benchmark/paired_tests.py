"""Paired significance tests and effect sizes between the closed loop and each baseline.

All arms replay the same 1,000 test learners (runs.csv), so each comparison is
paired by learner. For every baseline and metric this writes, to paired_tests.csv:
mean paired difference (baseline minus closed loop), Cohen's d_z (mean / SD of
the differences), Wilcoxon signed-rank z and two-sided p (normal approximation
with tie correction), and Holm-adjusted p over all tests in the file.
Standard library only. Run from the repository root:
    python results/benchmark/paired_tests.py
"""
import csv
import math
import statistics as st
from pathlib import Path

HERE = Path(__file__).parent
REFERENCE = "closed_loop"
BASELINES = ["unconstrained_genui", "rule_based", "static"]
METRICS = ["mean_delta_m_ref", "jitter", "level_skips", "overload_rate", "itae_mismatch"]


def wilcoxon(diffs):
    """Signed-rank test, zero differences dropped, average ranks for ties."""
    d = [x for x in diffs if x != 0.0]
    n = len(d)
    if n == 0:
        return 0.0, 1.0, 0
    order = sorted(range(n), key=lambda i: abs(d[i]))
    ranks = [0.0] * n
    tie_term = 0.0
    i = 0
    while i < n:
        j = i
        while j + 1 < n and abs(d[order[j + 1]]) == abs(d[order[i]]):
            j += 1
        r = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = r
        t = j - i + 1
        tie_term += t ** 3 - t
        i = j + 1
    w_plus = sum(r for r, x in zip(ranks, d) if x > 0)
    mean = n * (n + 1) / 4
    var = n * (n + 1) * (2 * n + 1) / 24 - tie_term / 48
    z = (w_plus - mean) / math.sqrt(var)
    p = math.erfc(abs(z) / math.sqrt(2))
    return z, p, n


rows = {}
for r in csv.DictReader(open(HERE / "runs.csv")):
    rows[(r["variant"], r["learner_id"])] = r
learners = sorted({lid for (v, lid) in rows if v == REFERENCE}, key=int)

results = []
for base in BASELINES:
    for m in METRICS:
        diffs = [float(rows[(base, lid)][m]) - float(rows[(REFERENCE, lid)][m]) for lid in learners]
        mean = st.mean(diffs)
        sd = st.stdev(diffs)
        d_z = mean / sd if sd > 0 else float("nan")
        z, p, n_nonzero = wilcoxon(diffs)
        results.append(dict(baseline=base, metric=m, n=len(diffs), n_nonzero=n_nonzero,
                            mean_diff=mean, sd_diff=sd, cohen_dz=d_z, wilcoxon_z=z, p=p))

# Holm step-down adjustment over every test in the table.
order = sorted(range(len(results)), key=lambda i: results[i]["p"])
running = 0.0
for rank, i in enumerate(order):
    adj = min(1.0, (len(results) - rank) * results[i]["p"])
    running = max(running, adj)
    results[i]["p_holm"] = running

with open(HERE / "paired_tests.csv", "w", newline="") as f:
    w = csv.writer(f)
    keys = ["baseline", "metric", "n", "n_nonzero", "mean_diff", "sd_diff", "cohen_dz", "wilcoxon_z", "p", "p_holm"]
    w.writerow(keys)
    for r in results:
        w.writerow([r[k] if isinstance(r[k], (str, int)) else f"{r[k]:.6g}" for k in keys])
