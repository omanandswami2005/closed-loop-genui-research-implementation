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
| `policy.py` | 5 | System-1 decisions (scaffolding mode, balance scale, hints, density). `LayaPolicy` asks the real Laya model; `SurrogatePolicy` is a deterministic stand-in used for the 160,000-step benchmark |
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
  field, depth overflow, injected `onClick`). These rates are assumptions,
  not measurements; swap in logged Gemini outputs to measure them.
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

## Laya, gains and weights

```
pip install -e ".[laya]"
python -m closedloop.sim.laya_eval --out ../results/laya   # real Laya vs the surrogate
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
