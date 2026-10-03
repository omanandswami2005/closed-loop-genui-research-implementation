"""Numerical check of the PID -> complexity-budget mapping in start-here.md (Section 6).

Compares the original spec (raw error, sigmoid slope 1.8) with the corrected spec
(asymmetric error normalisation, sigmoid slope 2.0) and asserts that a mastered
learner reaches the top complexity level under the corrected spec.

Run: python3 scripts/verify_budget_range.py   (stdlib only; exits 1 on failure)
"""
import math
import random
import sys

P_STAR = 0.85
KP, KI, KD = 1.25, 0.10, 0.35
GAMMA, S_MAX, HYST = 0.10, 3.0, 0.06
BKT = dict(L0=0.15, T=0.12, G=0.20, S=0.08)
N_LEVELS = 4
TOP_LEVEL_MIN = 0.75  # lower edge of level 4 (equal-width bands on [0, 1])


def level(m):
    return min(N_LEVELS, 1 + int(m * N_LEVELS))


def error_raw(p):
    return P_STAR - p


def error_norm(p):
    # Piecewise normalisation: deficit scaled by P*, surplus scaled by 1 - P*, so e in [-1, 1].
    d = P_STAR - p
    return d / P_STAR if d >= 0 else d / (1.0 - P_STAR)


SPECS = {
    "original": dict(err=error_raw, k=1.8),
    "corrected": dict(err=error_norm, k=2.0),
}


def budget(u, k):
    return 1.0 / (1.0 + math.exp(k * u))


def analytic_range(spec):
    """Extreme reachable M_I* at steady state (D = 0, integral saturated)."""
    e_lo, e_hi = spec["err"](1.0), spec["err"](0.0)
    u_lo = KP * e_lo - KI * S_MAX
    u_hi = KP * e_hi + KI * S_MAX
    return budget(u_hi, spec["k"]), budget(u_lo, spec["k"]), (e_lo, e_hi), (u_lo, u_hi)


class Governor:
    def __init__(self, spec):
        self.spec = spec
        self.S = 0.0
        self.D = 0.0
        self.e_prev = None
        self.committed = None

    def step(self, p):
        e = self.spec["err"](p)
        if self.e_prev is None:
            self.e_prev = e  # no derivative kick on the first step
        self.S = max(-S_MAX, min(S_MAX, self.S + e))
        self.D = GAMMA * (e - self.e_prev) + (1 - GAMMA) * self.D
        self.e_prev = e
        u = KP * e + KI * self.S + KD * self.D
        raw = budget(u, self.spec["k"])
        # Hysteresis against the last *committed* budget so slow drift still accumulates.
        if self.committed is None or abs(raw - self.committed) >= HYST:
            self.committed = raw
        return e, u, raw, self.committed


def bkt_update(p, correct):
    if correct:
        post = p * (1 - BKT["S"]) / (p * (1 - BKT["S"]) + (1 - p) * BKT["G"])
    else:
        post = p * BKT["S"] / (p * BKT["S"] + (1 - p) * (1 - BKT["G"]))
    return post + (1 - post) * BKT["T"]


def mastered_trajectory(spec, steps=30):
    g, p, rows = Governor(spec), BKT["L0"], []
    for n in range(steps):
        rows.append((n, p) + g.step(p))
        p = bkt_update(p, correct=True)
    return rows


def fast_master_cohort(spec, n_traces=300, steps=40, seed=7):
    """Fast Mastery archetype (P(T)=0.35, slip=0.02) generating responses; tracer uses standard priors."""
    rng = random.Random(seed)
    reached, final_levels = 0, []
    for _ in range(n_traces):
        known = rng.random() < BKT["L0"]
        g, p, top = Governor(spec), BKT["L0"], False
        for _ in range(steps):
            _, _, _, m = g.step(p)
            top |= level(m) == N_LEVELS
            correct = (rng.random() > 0.02) if known else (rng.random() < BKT["G"])
            p = bkt_update(p, correct)
            known = known or rng.random() < 0.35
        reached += top
        final_levels.append(level(m))
    return reached / n_traces, sum(l == N_LEVELS for l in final_levels) / n_traces


def main():
    ok = True
    for name, spec in SPECS.items():
        lo, hi, (e_lo, e_hi), (u_lo, u_hi) = analytic_range(spec)
        print(f"== {name} spec ==")
        print(f"  error range e in [{e_lo:+.3f}, {e_hi:+.3f}], steady-state u in [{u_lo:+.4f}, {u_hi:+.4f}]")
        print(f"  reachable M_I* in [{lo:.3f}, {hi:.3f}]  -> levels {level(lo)}..{level(hi)}")
        rows = mastered_trajectory(spec)
        print("   n   P(L_n)    e_n      u_n    M*raw  M*held  level")
        for n, p, e, u, raw, held in rows:
            if n < 8 or n % 5 == 0 or n == len(rows) - 1:
                print(f"  {n:2d}  {p:.4f}  {e:+.4f}  {u:+.4f}  {raw:.3f}  {held:.3f}   {level(held)}")
        final = rows[-1][-1]
        frac_any, frac_final = fast_master_cohort(spec)
        print(f"  mastered learner final M_I* = {final:.3f} (level {level(final)})")
        print(f"  Fast Master cohort (N=300, 40 steps): reached level 4 = {frac_any:.1%}, "
              f"at level 4 on last step = {frac_final:.1%}")
        if name == "corrected":
            ok &= level(final) == N_LEVELS and level(lo) == 1 and level(hi) == N_LEVELS
        print()
    print("PASS: corrected spec spans levels 1..4 and a mastered learner reaches level 4"
          if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
