# Reproducing the paper's numbers

This file lists the commands, settings and prompts behind the numbers in the
paper. All commands run from `backend/` unless noted. The committed outputs in
`results/` were produced with these defaults.

## Environment

- Python 3.11 or newer (see `backend/pyproject.toml`).
- Install the package in editable mode: `pip install -e .`. Add `".[test]"` to
  run the tests and `".[service]"` for the web service.
- Dependencies are version ranges in `backend/pyproject.toml`. The exact
  versions used to check these commands (Python 3.13.16) are pinned in
  `backend/requirements-lock.txt`: `pip install -r requirements-lock.txt`, then
  `pip install -e . --no-deps`. With these versions the full test suite passes.

## Benchmark (Tables III–IV and the paired intervals)

| Step | Command | Output |
|---|---|---|
| Main benchmark, 1,000 learners, seed 20261003 | `python -m closedloop.sim.run --out ../results/benchmark` | `results/benchmark/summary.csv`, `runs.csv`, `lapse_summary.csv`, `lapse_sensitivity.csv` (CUSUM threshold h and forgetting P(F) sweeps), `probe_steps.csv`, `manifest.json` |
| Paired bootstrap intervals (2,000 resamples) | `python -m closedloop.sim.intervals --runs ../results/benchmark/runs.csv --out ../results/benchmark/bootstrap_ci.csv` | `bootstrap_ci.csv` |
| Fallback retention sweep | `python -m closedloop.sim.fallback_sweep` | `fallback_retention.json` |
| Lapse overload with CI | `python -m closedloop.sim.lapse_ci` | `lapse_overload_ci.json` |
| Ten test seeds | `python -m closedloop.sim.run --seed SEED --out ../results/seeds/SEED` for each seed, then `python ../results/seeds/aggregate.py` | `results/seeds/across_seeds.csv` |
| Controller tuning (tuning seed 20261004) | `python -m closedloop.sim.tune search --out ../results/tuning` | `tuning.json`, `search.csv` |
| Parameter and weight sensitivity | `python -m closedloop.sim.tune sensitivity --out ../results/tuning` | `results/tuning/` |
| Paired tests and effect sizes (Table V) | `python results/benchmark/paired_tests.py` (from the repo root) | `results/benchmark/paired_tests.csv` |

The BKT saturation claims are checked by `backend/tests/test_bkt_saturation.py`
(`python -m pytest tests/test_bkt_saturation.py` from `backend/`, after
`pip install -e ".[test]"`).

The synthetic cohort is generated in `backend/closedloop/sim/learners.py`
(archetypes and parameter ranges are in Table II of the paper). The four arms,
ablations and lapse handling are in `arms.py`; the metrics are in `metrics.py`.

## Real Gemini measurement (Table III)

The model is called from `backend/closedloop/gemini.py`. Settings come from
environment variables with these defaults:

| Variable | Default | Meaning |
|---|---|---|
| `GENUI_GEMINI_MODEL` | `gemini-3.7-flash` | model id |
| `GENUI_GEMINI_THINKING` | `LOW` | thinking level |
| `GENUI_GEMINI_TIMEOUT` | `30` | seconds per call |
| `GOOGLE_CLOUD_PROJECT` | (set to your project) | Vertex AI project |
| `GOOGLE_CLOUD_LOCATION` | `global` | Vertex location |

The temperature is fixed at 0.4 in the same file.

The prompt is built in `_prompt` and `_layout` in `gemini.py`. The free mode
asks the model to choose the layout as well; the guided mode fixes the layout
with the planner first. Responses are checked by the same validation gate as
the benchmark.

Commands (from `backend/`):

```
GENUI_GEMINI_TOKEN=$(gcloud auth print-access-token) python -m closedloop.sim.gemini_eval --out ../results/gemini --n 300 --mode free
GENUI_GEMINI_TOKEN=$(gcloud auth print-access-token) python -m closedloop.sim.gemini_eval --out ../results/gemini_guided --n 300 --mode guided
```

Model outputs vary between runs, so a rerun will not match the committed
numbers exactly; the committed rows in `results/gemini*/calls.csv` are the
reference.

## Zero-shot Laya comparison (not used in the system)

`pip install -e ".[laya]"` then `python -m closedloop.sim.laya_eval --out ../results/laya`.
