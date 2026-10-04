# closedloop: core engine and in-silico benchmark

Pure-Python implementation of the control path in `start-here.md` and the
Monte Carlo benchmark from Section 7. Python 3.11, one runtime dependency
(Pydantic v2).

```
pip install -e ".[test]"
python -m pytest
python -m closedloop.sim.run --out ../results/benchmark      # ~1 min on 4 cores
```

## Modules

| Module | Spec | Contents |
|---|---|---|
| `bkt.py` | 6.1 | Closed-form BKT posterior and transition, standard priors |
| `governor.py` | 6.2, 6.3 | Normalized error, PID with anti-windup clamp and filtered derivative, inverted logistic budget, 4 levels, hysteresis against the last committed budget, optional level slew limit |
| `metric.py` | 6.4 | Structural complexity M_I |
| `ast_schema.py` | 4 | CLT-UI JSON AST (Pydantic, `extra="forbid"`, depth <= 4, rho <= 8); `UIDocument.model_json_schema()` is the model's response schema |
| `policy.py` | 5 | System-1 decisions (scaffolding mode, balance scale, hints, density). `SurrogatePolicy` is the system's deterministic rule-based policy, used in the benchmark and the live app; `LayaPolicy` is kept only for the Laya evaluation (not used) |
| `plant.py` | 5, Layers 3-4 | Deterministic compiler budget -> AST, surrogate plant with fault injection, the validation gate (`admit`) and the fallback template cache |
| `sim/` | 7, 8 | Learner archetypes, the 4 arms and 3 ablations, metrics, CLI |

## Conventions that matter for the paper

- **Timing.** The interface for item *n* is built from responses 0..n-1;
  the governor's first step uses the prior P(L_0). With this convention the
  all-correct learner reproduces Section 6.3 exactly (with P* = 0.95:
  level 4 committed at step 4 at 0.905), see `tests/test_governor.py`.
- **Mastery target P* = 0.95**, the criterion of Corbett & Anderson (1995).
- **Equal M_I weights** (1/3 each, Dawes 1979); the spec's 0.40 / 0.35 / 0.25
  is a sensitivity variant.
- **Paired design.** Responses are sampled once per learner and replayed
  through every variant; the interface does not feed back into the
  simulated learner, so no result is a learning-gain claim.
- **Reference target.** `ref_target` is the full governor's committed
  budget on the same trajectory. Cross-arm constraint error is
  `delta_m_ref = |M_I - ref_target|`; `delta_m` is error against the
  variant's own target.
- **Surrogate plant.** Gemini is replaced by the deterministic compiler plus
  injected faults: `p_drift = 0.15` (valid but off-budget output) and
  `p_malformed = 0.03` (truncated JSON, unknown component, out-of-range
  field, depth overflow, injected `onClick`). These were assumptions; the
  real plant measures 3.4% content-malformed and 2.8% drift (see "Real
  Gemini plant" below), so 15% drift is a stress setting.
- **Unconstrained arm.** The same plant asked for a complexity of
  `P(L_n) + N(0, 0.15)` with no governor, hysteresis or budget check.
- **Rule-based arm.** Level up after 3 consecutive correct, down after 2
  consecutive incorrect, pre-authored template per level.
- **epsilon = 0.05** for the budget check (the spec leaves it open).
- **Hints below density 2.** A hint accordion needs a container plus a
  control (M_I >= 0.14 at level 1), which does not fit budgets near the
  0.043 floor, so the policy only enables hints when the budget is >= 0.125.

## Lapse handling (extension)

Standard BKT saturates near 1 after a success run, so a later run of errors
barely moves the estimate and the interface stays at level 4. In float64 the
plain estimate reaches exactly 1.0 after 24 straight correct answers and can
then never decrease (van de Sande 2013; `tests/test_bkt.py`). Two tracker
extensions are compared (`bkt.py`, `sim/arms.py: EXTENSIONS`):

- `closed_loop_forgetting`: BKT+Forgets with P(F) = 0.02 (Qiu et al. 2011;
  Khajah et al. 2016).
- `closed_loop_lapse_cusum`: a CUSUM detector (Page 1954) on the
  log-likelihood ratio between "skill not known" and the tracker's own
  prediction. It accumulates only when a confident estimate is contradicted;
  on an alarm (h = 6.5, about three straight errors from saturation) the
  estimate is reset to 0.5. `_slew` adds the one-level-per-step limit.

Forgetting makes every isolated slip move the estimate; the detector only
reacts to runs. `lapse_summary.csv` evaluates them on a second cohort whose
learners truly forget (0.02 to 0.06 per item); `lapse_sensitivity.csv` sweeps
P(F) and h on both cohorts. `overload_rate` and `underload_rate` compare the
rendered level with the learner's true (simulated) knowledge state.

Every parameter's source, or its status as an assumption, is listed in
`../docs/sources.md`.

## Laya evaluation, gains and weights

```
pip install -e ".[laya]"
python -m closedloop.sim.laya_eval --out ../results/laya   # Laya zero-shot vs the rule-based policy (evaluation only)
python -m closedloop.sim.tune search --out ../results/tuning       # tune controller
python -m closedloop.sim.tune sensitivity --out ../results/tuning  # +/-50% and weight sweeps
```

`laya_eval` asks both policies the same decisions on 200 learner states and
runs the closed loop end to end with each on 12 paired learners.
`tune search` picks Kp, Ki, Kd, gamma, S_max and the hysteresis band by random
search on a tuning cohort (seed 20261004); the cost is a time-weighted
(ITAE-style) mismatch between the shown level and the learner's true state
plus jitter. The chosen values are the `GovernorConfig` defaults, and every
reported number uses the test cohort (seed 20261003). `tune sensitivity`
moves each value by +/-50% and re-runs the main arms under alternative M_I
weightings (spec 0.40/0.35/0.25, each term dropped, each term heavy).

## Live service

```
pip install -e ".[service]"
uvicorn closedloop.service:app --port 8000
```

`loop.py` runs one learner's loop in the benchmark's order, with the CUSUM
lapse detector on. `service.py` exposes it: `POST /api/sessions`
(`{"plant": "surrogate" | "gemini", "seed"?}`), `POST
/api/sessions/{id}/responses` (`{"answer", "steps"?}`), `POST
/api/sessions/{id}/check` (one workspace line) and `GET /api/health`. Each
response carries the next CLT-UI document and the full telemetry.
`checker.py` checks answers and steps with exact rational arithmetic and
accepts only expressions linear in x. The System-1 policy is the rule-based
`SurrogatePolicy`; Laya was measured (above) and is not used.

## Real Gemini plant

`gemini.py` calls `gemini-3.7-flash` on the Vertex AI global endpoint
(project and model from `GOOGLE_CLOUD_PROJECT`, `GENUI_GEMINI_MODEL`; on
Cloud Run the token comes from the metadata server). Its output goes through
the same `admit` gate as the surrogate's.

```
python -m closedloop.sim.gemini_eval --out ../results/gemini --n 300 --workers 4
python -m closedloop.sim.gemini_eval --out ../results/gemini_guided --n 300 --workers 4 --mode guided
```

Two modes (`GENUI_GEMINI_MODE`). In **free** mode the model chooses a layout
that meets the budget from the M_I formula. In **guided** mode (the live
app's default) the deterministic planner (`plant.plan`) fixes the layout (primary
manipulative, interactive count, hints, worked steps, depth) and the model
writes the instructional content. 300 calls each, budgets drawn uniformly
from [0.02, 0.98], thinking level LOW, 4 concurrent calls, same seed:

| Measure | Free | Guided |
|---|---|---|
| Schema compliance | 0.947 (6 transport errors, 10 trees with no interactive element) | 0.987 (4 transport errors, 0 content errors) |
| Drift, valid but off budget by > 0.05 | 2.8% of valid outputs | 0% |
| Within budget overall (fallback) | 0.92 (0.08) | 0.987 (0.013) |
| abs(M_I - M_I*), valid outputs | median 0.012, mean 0.014 | median 0.007, mean 0.009 |
| Latency | p50 7.7 s, p95 18.6 s | p50 2.7 s, p95 5.1 s |
| Thinking / output tokens, median | 696 / 210 | 0 / 215 |

Most of the free-mode latency is the model's hidden reasoning about the
budget arithmetic (about 700 thinking tokens); a minimal call to the same
endpoint takes about 1.2 s. Given the layout, the model stops thinking.
In free mode level 1 is the weakest (schema 0.87, budget 0.85): near the
budget floor the model sometimes emits a screen with nothing to interact
with. An earlier free-mode run (p50 5.6 s) read latencies from a shared
attribute across threads; latency is now recorded per thread.

## Recovery metrics

- `tau_react`: items after the onset of a >= 5-failure streak until the
  rendered level drops (the spec's tau_rec as worded).
- `tau_recover`: items after the streak's last failure until the level is
  back at its pre-streak value (integral-windup recovery).
- Both are right-censored at the 40-item horizon; `summary.csv` reports the
  censored fraction next to each median.

## Outputs (`results/benchmark/`)

| File | Rows |
|---|---|
| `summary.csv` | per variant x archetype (and `all`): means with 95% CI, fidelity, jitter, level skips, schema compliance, fallback rate, recovery |
| `runs.csv` | one row per variant x learner (10,000) |
| `streaks.csv` | one row per failure-streak event |
| `probe_steps.csv`, `probe_summary.csv` | scripted controller probes (early lapse, saturated lapse, prolonged struggle) |
| `lapse_summary.csv` | the same table for the lapse cohort (learners who forget) |
| `lapse_sensitivity.csv` | closed loop under P(F) and h sweeps, both cohorts |
| `manifest.json` | seed, cohort, all parameters, System-1 latency percentiles, injected fault counts |

`--steps-csv` also writes every step (`steps.csv.gz`, not committed).
