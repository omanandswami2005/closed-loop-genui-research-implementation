"""Synthetic learner cohort: Monte Carlo knowledge tracing (spec Section 7).

Each learner is a two-state hidden Markov model whose parameters are drawn
per learner from archetype ranges centred on the spec values. Responses are
sampled once per learner and replayed unchanged through every arm (paired
design), so the interface never feeds back into the simulated learner: the
benchmark measures controller behaviour, not learning gains.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from ..ast_schema import Equation

# (low, high) uniform ranges for P(L0), P(T), P(G), P(S).
ARCHETYPES: dict[str, dict[str, tuple[float, float]]] = {
    "struggling_novice": {"p_l0": (0.02, 0.08), "p_t": (0.03, 0.07), "p_g": (0.10, 0.20), "p_s": (0.20, 0.30)},
    "inconsistent_guesser": {"p_l0": (0.05, 0.20), "p_t": (0.10, 0.20), "p_g": (0.15, 0.40), "p_s": (0.08, 0.30)},
    "fast_master": {"p_l0": (0.15, 0.30), "p_t": (0.30, 0.40), "p_g": (0.15, 0.25), "p_s": (0.01, 0.03)},
}
COHORT = {"struggling_novice": 300, "inconsistent_guesser": 400, "fast_master": 300}
HORIZON = 40


@dataclass(frozen=True)
class Trajectory:
    learner_id: int
    archetype: str
    params: dict[str, float]
    responses: tuple[bool, ...]
    latent: tuple[bool, ...]  # true mastery state when each response was given
    problems: tuple[Equation, ...]


def _problem(rng: random.Random) -> Equation:
    a = rng.choice([-1, 1]) * rng.randint(2, 9)
    x = rng.randint(-8, 8)
    b = rng.randint(-20, 20)
    return Equation(a=a, b=b, c=a * x + b)


def sample_trajectory(learner_id: int, archetype: str, seed: int, horizon: int = HORIZON) -> Trajectory:
    rng = random.Random(f"{seed}:learner:{learner_id}")
    params = {name: rng.uniform(lo, hi) for name, (lo, hi) in ARCHETYPES[archetype].items()}
    known = rng.random() < params["p_l0"]
    responses, latent, problems = [], [], []
    for _ in range(horizon):
        p_correct = 1.0 - params["p_s"] if known else params["p_g"]
        responses.append(rng.random() < p_correct)
        latent.append(known)
        problems.append(_problem(rng))
        if not known and rng.random() < params["p_t"]:
            known = True
    return Trajectory(learner_id, archetype, params, tuple(responses), tuple(latent), tuple(problems))


def cohort(seed: int, sizes: dict[str, int] | None = None, horizon: int = HORIZON) -> list[Trajectory]:
    sizes = sizes or COHORT
    out, next_id = [], 0
    for archetype, n in sizes.items():
        for _ in range(n):
            out.append(sample_trajectory(next_id, archetype, seed, horizon))
            next_id += 1
    return out
