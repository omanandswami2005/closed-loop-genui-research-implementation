"""Run the in-silico benchmark and write CSV results.

    python -m closedloop.sim.run --out ../results/benchmark
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import statistics
from collections import defaultdict
from dataclasses import asdict
from multiprocessing import Pool
from pathlib import Path

from ..bkt import BKTParams
from ..governor import PIDGovernor
from ..plant import EPSILON, FAULT_KINDS
from .arms import ABLATIONS, ARMS, EXTENSIONS, FORGET_P, LAPSE_H, Variant, mastery_series, run_variant
from .learners import COHORT, HORIZON, Trajectory, cohort
from .metrics import failure_streaks, jitter, level_jumps, mean_ci, percentile, run_summary

DEFAULT_SEED = 20261003

PROBES = {
    # Lapse after a short success run, while BKT mastery is still responsive.
    "early_lapse": [True] * 4 + [False] * 5 + [True] * 31,
    # Lapse after a long success run: BKT mastery has saturated near 1.
    "saturated_lapse": [True] * 15 + [False] * 5 + [True] * 20,
    "prolonged_struggle": [False] * 25 + [True] * 15,
}
PROBE_VARIANTS = [v for v in ARMS + ABLATIONS + EXTENSIONS if v.kind == "closed_loop"]
# True per-item forgetting range of the lapse stress cohort.
LAPSE_COHORT_FORGET = (0.02, 0.06)
LAPSE_VARIANTS = [ARMS[1], ARMS[2], ARMS[3], *EXTENSIONS]
FORGET_SWEEP = (0.01, 0.02, 0.05, 0.10)
LAPSE_SWEEP = (3.0, 4.5, 6.5, 9.0, 12.0)


def _simulate(job: tuple[list[Variant], Trajectory, int, bool]):
    variants, traj, seed, keep_steps = job
    out = []
    for variant in variants:
        records = run_variant(variant, traj, seed)
        summary = run_summary(records)
        streaks = failure_streaks([r.correct for r in records], [r.level for r in records])
        latencies = [r.system1_ns for r in records if r.system1_ns]
        faults = [r.fault for r in records if r.fault and r.fault != "drift"]
        out.append((variant.name, traj, summary, streaks, latencies, faults, records if keep_steps else None))
    return out


def _write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    with path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def _fmt(value):
    return round(value, 6) if isinstance(value, float) else value


def summarize(group: list[dict], streak_rows: list[dict], horizon: int) -> dict:
    def col(name):
        return [row[name] for row in group]

    attempts = sum(col("attempts"))
    valid = sum(col("schema_valid"))
    steps = len(group) * horizon
    dm, dm_lo, dm_hi = mean_ci(col("mean_delta_m"))
    dmr, dmr_lo, dmr_hi = mean_ci(col("mean_delta_m_ref"))
    j, j_lo, j_hi = mean_ci(col("jitter"))
    react = [s["tau_react"] for s in streak_rows if s["pre_level"] > 1]
    recover = [s["tau_recover"] for s in streak_rows if s["dropped"]]
    react_obs = [t for t in react if t != ""]
    recover_obs = [t for t in recover if t != ""]
    return {
        "n_runs": len(group),
        "mean_delta_m": dm,
        "mean_delta_m_ci_lo": dm_lo,
        "mean_delta_m_ci_hi": dm_hi,
        "fidelity": statistics.fmean(col("fidelity")),
        "mean_delta_m_ref": dmr,
        "mean_delta_m_ref_ci_lo": dmr_lo,
        "mean_delta_m_ref_ci_hi": dmr_hi,
        "fidelity_ref": statistics.fmean(col("fidelity_ref")),
        "jitter": j,
        "jitter_ci_lo": j_lo,
        "jitter_ci_hi": j_hi,
        "target_jitter": statistics.fmean(col("target_jitter")),
        "level_changes_per_run": statistics.fmean(col("level_changes")),
        "level_skips_per_run": statistics.fmean(col("level_skips")),
        "runs_with_level_skip": sum(1 for v in col("level_skips") if v) / len(group),
        "target_level_skips_per_run": statistics.fmean(col("target_level_skips")),
        "generation_attempts": attempts,
        "schema_compliance": valid / attempts if attempts else "",
        "plant_budget_compliance": sum(col("plant_within_budget")) / attempts if attempts else "",
        "fallback_rate": sum(col("fallbacks")) / steps,
        "reached_level4": statistics.fmean(col("reached_level4")),
        "overload_rate": statistics.fmean(col("overload_rate")),
        "underload_rate": statistics.fmean(col("underload_rate")),
        "itae_mismatch": statistics.fmean(col("itae_mismatch")),
        "n_react_events": len(react),
        "tau_react_median": statistics.median(react_obs) if react_obs else "",
        "tau_react_censored": (len(react) - len(react_obs)) / len(react) if react else "",
        "n_recover_events": len(recover),
        "tau_recover_median": statistics.median(recover_obs) if recover_obs else "",
        "tau_recover_mean": statistics.fmean(recover_obs) if recover_obs else "",
        "tau_recover_censored": (len(recover) - len(recover_obs)) / len(recover) if recover else "",
    }


def run_probes(out_dir: Path) -> list[dict]:
    step_rows, summary_rows = [], []
    for probe, responses in PROBES.items():
        for v in PROBE_VARIANTS:
            mastery = mastery_series(tuple(responses), v.bkt)
            gov = PIDGovernor(v.governor)
            outs = [gov.step(m) for m in mastery]
            for n, (r, m, o) in enumerate(zip(responses, mastery, outs)):
                step_rows.append({"probe": probe, "variant": v.name, "step": n, "correct": int(r), "mastery": m, **asdict(o)})
            levels = [o.level for o in outs]
            events = failure_streaks(responses, levels)
            ev = events[0] if events else None
            summary_rows.append(
                {
                    "probe": probe,
                    "variant": v.name,
                    "tau_react": ev.tau_react if ev and ev.tau_react is not None else "",
                    "tau_recover": ev.tau_recover if ev and ev.tau_recover is not None else "",
                    "budget_jitter": jitter([o.budget for o in outs]),
                    "level_skips": sum(j >= 2 for j in level_jumps(levels)),
                    "max_integral": max(abs(o.integral) for o in outs),
                    "final_budget": outs[-1].budget,
                    "first_level4_step": next((i for i, o in enumerate(outs) if o.level == 4), ""),
                }
            )
    # The prolonged-struggle streak starts at step 0, so measure its recovery
    # directly: steps after the last failure until the committed level rises.
    for row in summary_rows:
        if row["probe"] == "prolonged_struggle":
            series = [s for s in step_rows if s["probe"] == row["probe"] and s["variant"] == row["variant"]]
            last_fail = max(s["step"] for s in series if not s["correct"])
            floor = series[last_fail]["level"]
            row["tau_recover"] = next((s["step"] - last_fail for s in series if s["step"] > last_fail and s["level"] > floor), "")
    _write_csv(out_dir / "probe_steps.csv", [{k: _fmt(v) for k, v in r.items()} for r in step_rows])
    _write_csv(out_dir / "probe_summary.csv", [{k: _fmt(v) for k, v in r.items()} for r in summary_rows])
    return summary_rows


def run_cohort(learners: list[Trajectory], variants: list[Variant], seed: int, workers: int, step_path: Path | None = None):
    jobs = [(variants, t, seed, step_path is not None) for t in learners]
    with Pool(workers) as pool:
        results = [item for chunk in pool.imap(_simulate, jobs, chunksize=16) for item in chunk]

    run_rows, streak_rows, latencies = [], [], []
    fault_counts: dict[str, dict[str, int]] = defaultdict(lambda: dict.fromkeys(FAULT_KINDS, 0))
    step_file = gzip.open(step_path, "wt", newline="") if step_path else None
    step_writer = None
    for name, traj, summary, streaks, lat, faults, records in results:
        base = {"variant": name, "learner_id": traj.learner_id, "archetype": traj.archetype}
        run_rows.append({**base, **{k: _fmt(v) for k, v in summary.items()}})
        for s in streaks:
            streak_rows.append(
                {
                    **base,
                    "start": s.start,
                    "end": s.end,
                    "pre_level": s.pre_level,
                    "dropped": int(s.dropped),
                    "tau_react": "" if s.tau_react is None else s.tau_react,
                    "tau_recover": "" if s.tau_recover is None else s.tau_recover,
                }
            )
        if name == "closed_loop":
            latencies.extend(lat)
        for f in faults:
            fault_counts[name][f] += 1
        if step_file and records:
            for r in records:
                row = {**base, **{k: _fmt(v) for k, v in asdict(r).items()}}
                if step_writer is None:
                    step_writer = csv.DictWriter(step_file, fieldnames=list(row))
                    step_writer.writeheader()
                step_writer.writerow(row)
    if step_file:
        step_file.close()
    return run_rows, streak_rows, latencies, dict(fault_counts)


def summary_table(run_rows: list[dict], streak_rows: list[dict], variants: list[Variant], archetypes: list[str]) -> list[dict]:
    rows = []
    for v in variants:
        for arch in ["all", *archetypes]:
            group = [r for r in run_rows if r["variant"] == v.name and arch in ("all", r["archetype"])]
            s_rows = [s for s in streak_rows if s["variant"] == v.name and arch in ("all", s["archetype"])]
            row = {"variant": v.name, "archetype": arch, **summarize(group, s_rows, HORIZON)}
            rows.append({k: _fmt(val) for k, val in row.items()})
    return rows


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=Path("../results/benchmark"))
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--scale", type=float, default=1.0, help="cohort size multiplier (1.0 = 1,000 learners)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--steps-csv", action="store_true", help="also write per-step records (steps.csv.gz)")
    args = ap.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    sizes = {k: max(1, round(v * args.scale)) for k, v in COHORT.items()}
    archetypes = list(sizes)

    # 1. Main benchmark: 4 arms, ablations and the forgetting extension.
    variants = list(ARMS) + list(ABLATIONS) + list(EXTENSIONS)
    run_rows, streak_rows, latencies, faults = run_cohort(
        cohort(args.seed, sizes), variants, args.seed, args.workers, args.out / "steps.csv.gz" if args.steps_csv else None
    )
    _write_csv(args.out / "runs.csv", run_rows)
    _write_csv(args.out / "streaks.csv", streak_rows)
    summary_rows = summary_table(run_rows, streak_rows, variants, archetypes)
    _write_csv(args.out / "summary.csv", summary_rows)

    # 2. Lapse stress cohort: the same archetypes, but learners truly forget.
    lapse_learners = cohort(args.seed, sizes, forget=LAPSE_COHORT_FORGET)
    l_runs, l_streaks, _, _ = run_cohort(lapse_learners, LAPSE_VARIANTS, args.seed, args.workers)
    lapse_rows = summary_table(l_runs, l_streaks, LAPSE_VARIANTS, archetypes)
    _write_csv(args.out / "lapse_summary.csv", lapse_rows)

    # 3. Sensitivity of the closed loop to the two lapse mechanisms' settings.
    sweep = [Variant("closed_loop", "closed_loop")]
    sweep += [Variant(f"forgetting_pf_{f}", "closed_loop", bkt=BKTParams(p_f=f)) for f in FORGET_SWEEP]
    sweep += [Variant(f"lapse_cusum_h_{h}", "closed_loop", bkt=BKTParams(lapse_threshold=h)) for h in LAPSE_SWEEP]
    sens_rows = []
    for label, learners in (("main", cohort(args.seed, sizes)), ("lapse", lapse_learners)):
        r, st, _, _ = run_cohort(learners, sweep, args.seed, args.workers)
        for row in summary_table(r, st, sweep, []):
            sens_rows.append({"cohort": label, **row})
    _write_csv(args.out / "lapse_sensitivity.csv", sens_rows)

    probe_rows = run_probes(args.out)

    lat_us = [x / 1000 for x in latencies]
    manifest = {
        "seed": args.seed,
        "cohort": sizes,
        "horizon": HORIZON,
        "epsilon": EPSILON,
        "tracker_forgetting_p": FORGET_P,
        "tracker_lapse_threshold": LAPSE_H,
        "lapse_cohort_true_forgetting": LAPSE_COHORT_FORGET,
        "variants": [
            {
                "name": v.name,
                "kind": v.kind,
                "governor": asdict(v.governor),
                "plant": asdict(v.plant),
                "bkt": asdict(v.bkt),
                "open_loop_sigma": v.open_loop_sigma,
            }
            for v in variants
        ],
        "system1_latency_us": {
            "n": len(lat_us),
            "p50": percentile(lat_us, 0.50),
            "p95": percentile(lat_us, 0.95),
            "p99": percentile(lat_us, 0.99),
            "note": "BKT update + PID governor + surrogate policy; excludes the Laya runtime and the plant",
        },
        "injected_faults": faults,
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    _print_table("main cohort", summary_rows)
    _print_table("lapse cohort", lapse_rows)
    print("\nprobes:")
    for row in probe_rows:
        print(f"  {row['probe']:20s} {row['variant']:32s} react={row['tau_react']!s:>3} recover={row['tau_recover']!s:>3} skips={row['level_skips']} jitter={row['budget_jitter']:.4f}")
    print("\nsystem-1 latency (us):", {k: round(v, 2) if isinstance(v, float) else v for k, v in manifest["system1_latency_us"].items() if k != "note"})


def _print_table(title: str, rows: list[dict]) -> None:
    cols = ["mean_delta_m_ref", "fidelity", "jitter", "level_skips_per_run", "fallback_rate", "reached_level4", "overload_rate", "underload_rate", "tau_react_median"]
    print(f"\n{title}\n{'variant':32s}" + "".join(f"{c[:14]:>15s}" for c in cols))
    for row in rows:
        if row["archetype"] != "all":
            continue
        cells = "".join(f"{row[c]:>15.4f}" if isinstance(row[c], float) else f"{str(row[c]):>15s}" for c in cols)
        print(f"{row['variant']:32s}{cells}")


if __name__ == "__main__":
    main()
