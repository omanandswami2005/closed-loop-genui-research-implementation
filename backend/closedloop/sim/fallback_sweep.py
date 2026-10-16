"""Fallback retention: does the fallback catalog keep the requested scaffolding?

Sweeps the 41 catalog budgets (multiples of 1/40) against six error counts
and three mastery values, takes the policy's decision for each combination,
and checks the fallback tree the gate would render. Counts a requested worked
example as kept when the chosen layout has worked steps, and a requested hint
as kept when it has hint tiers. Also reports the largest budget error of the
fallback tree, which must stay within EPSILON.

    python -m closedloop.sim.fallback_sweep --out ../results/benchmark/fallback_retention.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ..ast_schema import Equation, measure
from ..governor import complexity_level
from ..plant import EPSILON, FALLBACK_GRID, fallback_document, plan
from ..policy import SurrogatePolicy

ERROR_COUNTS = range(6)
MASTERY_VALUES = (0.1, 0.5, 0.99)
EQUATION = Equation(a=2, b=3, c=11)


def sweep() -> dict:
    policy = SurrogatePolicy()
    combos = worked_requested = worked_kept = hints_requested = hints_kept = 0
    worst_error = 0.0
    for grid in range(FALLBACK_GRID + 1):
        budget = grid / FALLBACK_GRID
        level = complexity_level(budget)
        for errors in ERROR_COUNTS:
            for mastery in MASTERY_VALUES:
                decision = policy.decide(mastery, budget, level, errors)
                combos += 1
                chosen = plan(budget, decision)
                if decision.scaffolding_mode == "worked_example":
                    worked_requested += 1
                    worked_kept += chosen.worked_steps > 0
                if decision.hint_enabled:
                    hints_requested += 1
                    hints_kept += chosen.hint_tiers > 0
                fallback = measure(fallback_document(budget, decision, EQUATION)).m_i
                worst_error = max(worst_error, abs(fallback - budget))
    return {
        "combinations": combos,
        "grid_budgets": FALLBACK_GRID + 1,
        "error_counts": list(ERROR_COUNTS),
        "mastery_values": list(MASTERY_VALUES),
        "worked_example_requested": worked_requested,
        "worked_example_kept": worked_kept,
        "worked_example_kept_share": worked_kept / worked_requested,
        "hints_requested": hints_requested,
        "hints_kept": hints_kept,
        "fallback_worst_budget_error": worst_error,
        "epsilon": EPSILON,
    }


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=Path("../results/benchmark/fallback_retention.json"))
    args = ap.parse_args(argv)
    result = sweep()
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
