"""Paired bootstrap CI for the CUSUM overload reduction in the forgetting cohort.

Uses the lapse cohort (learners forget with probability 0.02-0.06 per item)
and the plain closed loop versus the CUSUM lapse variant, both on the test
seed. Overload is the share of items shown level 3 or 4 while the skill is
not known. The bootstrap resamples learners, and the reduction is reported as
a relative change of the cohort mean.

    python -m closedloop.sim.lapse_ci --out ../results/benchmark/lapse_overload_ci.json
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
from pathlib import Path

from ..bkt import BKTParams
from .arms import Variant, run_variant
from .learners import COHORT, cohort
from .arms import LAPSE_H
from .run import DEFAULT_SEED, LAPSE_COHORT_FORGET

PLAIN = Variant("closed_loop", "closed_loop")
CUSUM = Variant("closed_loop_lapse_cusum", "closed_loop", bkt=BKTParams(lapse_threshold=LAPSE_H))


def overload(records) -> float:
    return sum(not r.known and r.level >= 3 for r in records) / len(records)


def run(seed: int, resamples: int) -> dict:
    learners = cohort(seed, COHORT, forget=LAPSE_COHORT_FORGET)
    plain = [overload(run_variant(PLAIN, t, seed)) for t in learners]
    cusum = [overload(run_variant(CUSUM, t, seed)) for t in learners]
    n = len(plain)
    rng = random.Random(seed)
    relative = []
    for _ in range(resamples):
        idx = [rng.randrange(n) for _ in range(n)]
        p = statistics.fmean(plain[i] for i in idx)
        c = statistics.fmean(cusum[i] for i in idx)
        relative.append((c - p) / p)
    relative.sort()
    mean_p, mean_c = statistics.fmean(plain), statistics.fmean(cusum)
    return {
        "cohort": "lapse (forget 0.02-0.06 per item)",
        "learners": n,
        "resamples": resamples,
        "seed": seed,
        "overload_plain": mean_p,
        "overload_cusum": mean_c,
        "relative_change": (mean_c - mean_p) / mean_p,
        "bootstrap_ci_lo": relative[int(0.025 * resamples)],
        "bootstrap_ci_hi": relative[int(0.975 * resamples) - 1],
    }


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=Path("../results/benchmark/lapse_overload_ci.json"))
    ap.add_argument("--resamples", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = ap.parse_args(argv)
    result = run(args.seed, args.resamples)
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
