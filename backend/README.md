# closedloop: core engine and in-silico benchmark

Pure-Python implementation of the control path in `start-here.md` and the
Monte Carlo benchmark from Section 7. Python 3.11, one runtime dependency
(Pydantic v2).

```
pip install -e ".[test]"
python -m pytest
python -m closedloop.sim.run --out ../results/benchmark      # ~10 s on 4 cores
```

## Modules

| Module | Spec | Contents |
|---|---|---|
| `bkt.py` | 6.1 | Closed-form BKT posterior and transition, standard priors |
| `governor.py` | 6.2, 6.3 | Normalized error, PID with anti-windup clamp and filtered derivative, inverted logistic budget, 4 levels, hysteresis against the last committed budget, optional level slew limit |
| `metric.py` | 6.4 | Structural complexity M_I |
| `ast_schema.py` | 4 | CLT-UI JSON AST (Pydantic, `extra="forbid"`, depth <= 4, rho <= 8); `UIDocument.model_json_schema()` is the model's response schema |
| `policy.py` | 5 | System-1 decisions (scaffolding mode, balance scale, hints, density). `SurrogatePolicy` is a deterministic stand-in with Laya's decision signature |
| `plant.py` | 5, Layers 3-4 | Deterministic compiler budget -> AST, surrogate plant with fault injection, the validation gate (`admit`) and the fallback template cache |
| `sim/` | 7, 8 | Learner archetypes, the 4 arms and 3 ablations, metrics, CLI |

## Conventions that matter for the paper

- **Timing.** The interface for item *n* is built from responses 0..n-1;
  the governor's first step uses the prior P(L_0). With this convention the
  all-correct learner reproduces Section 6.3 exactly (0.878 at step 3,
  settling at 0.947), see `tests/test_governor.py`.
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
| `runs.csv` | one row per variant x learner (7,000) |
| `streaks.csv` | one row per failure-streak event |
| `probe_steps.csv`, `probe_summary.csv` | scripted controller probes (early lapse, saturated lapse, prolonged struggle) |
| `manifest.json` | seed, cohort, all parameters, System-1 latency percentiles, injected fault counts |

`--steps-csv` also writes every step (`steps.csv.gz`, not committed).
