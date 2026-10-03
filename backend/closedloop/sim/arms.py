"""Experimental arms and ablation variants (spec Sections 7 and 8).

Every variant consumes the same trajectory. ``ref_target`` is the committed
budget of the full closed-loop governor on that trajectory; it is identical
across variants and is the reference for cross-arm constraint error.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field

from ..bkt import BKTParams, BKTTracker
from ..governor import GovernorConfig, PIDGovernor, complexity_level, level_center
from ..plant import EPSILON, PlantConfig, SurrogatePlant, admit, fallback_document
from ..policy import Policy, SurrogatePolicy
from .learners import Trajectory

RECENT_WINDOW = 5


@dataclass(frozen=True)
class Variant:
    name: str
    kind: str  # static | rule_based | open_loop | closed_loop
    governor: GovernorConfig = field(default_factory=GovernorConfig)
    plant: PlantConfig = field(default_factory=PlantConfig)
    open_loop_sigma: float = 0.15  # per-call noise of the unconstrained model's own complexity choice
    static_level: int = 2
    rule_up: int = 3  # consecutive correct to step up
    rule_down: int = 2  # consecutive incorrect to step down
    bkt: BKTParams = field(default_factory=BKTParams)  # the tracker's parameters


ARMS = (
    Variant("static", "static"),
    Variant("unconstrained_genui", "open_loop"),
    Variant("rule_based", "rule_based"),
    Variant("closed_loop", "closed_loop"),
)
ABLATIONS = (
    Variant("ablation_no_derivative_filter", "closed_loop", governor=GovernorConfig(gamma=1.0)),
    Variant("ablation_no_anti_windup", "closed_loop", governor=GovernorConfig(s_max=None)),
    Variant("ablation_level_slew_limit", "closed_loop", governor=GovernorConfig(max_level_step=1)),
)
# Lapse handling. Standard BKT saturates after a success run, so a later run
# of errors does not lower complexity. Two tracker extensions are compared:
# BKT+Forgets from the literature, and the CUSUM lapse detector proposed here
# (see closedloop.bkt). The slew limit stops the resulting drops skipping levels.
FORGET_P = 0.02
LAPSE_H = 6.5  # about three consecutive errors from a saturated estimate
EXTENSIONS = (
    Variant("closed_loop_forgetting", "closed_loop", bkt=BKTParams(p_f=FORGET_P)),
    Variant("closed_loop_lapse_cusum", "closed_loop", bkt=BKTParams(lapse_threshold=LAPSE_H)),
    Variant(
        "closed_loop_lapse_cusum_slew",
        "closed_loop",
        governor=GovernorConfig(max_level_step=1),
        bkt=BKTParams(lapse_threshold=LAPSE_H),
    ),
)


@dataclass(frozen=True)
class StepRecord:
    step: int
    correct: bool
    known: bool  # true latent state of the simulated learner on this item
    mastery: float
    target: float  # budget this variant aimed at
    ref_target: float
    m_i: float
    level: int  # level of the rendered interface
    target_level: int
    delta_m: float  # |M_I - target|
    delta_m_ref: float  # |M_I - ref_target|
    attempted: bool  # a generative call was made
    schema_valid: bool
    within_budget: bool
    fallback: bool
    fault: str | None
    system1_ns: int


def mastery_series(responses: tuple[bool, ...], params: BKTParams) -> list[float]:
    """Mastery estimate *before* each item: the value its interface is built from."""
    tracker, out = BKTTracker(params), []
    for r in responses:
        out.append(tracker.mastery)
        tracker.observe(r)
    return out


def reference_targets(mastery: list[float]) -> list[float]:
    gov = PIDGovernor()
    return [gov.step(m).budget for m in mastery]


def run_variant(variant: Variant, traj: Trajectory, seed: int, policy: Policy | None = None) -> list[StepRecord]:
    bkt = variant.bkt
    policy = policy or SurrogatePolicy()
    plant = SurrogatePlant(variant.plant)
    plant_rng = random.Random(f"{seed}:plant:{traj.learner_id}")
    noise_rng = random.Random(f"{seed}:open_loop:{traj.learner_id}")
    gov = PIDGovernor(variant.governor)
    ref = reference_targets(mastery_series(traj.responses, BKTParams()))

    # Item n's interface is built from responses 0..n-1, then response n is observed.
    records: list[StepRecord] = []
    tracker = BKTTracker(bkt)
    p = tracker.mastery
    rule_level, streak_ok, streak_bad = 1, 0, 0
    for n, (correct, eq) in enumerate(zip(traj.responses, traj.problems)):
        window = traj.responses[max(0, n - RECENT_WINDOW) : n]
        recent_errors = sum(1 for r in window if not r)
        attempted = False
        schema_valid = within = True
        fallback, fault, s1_ns = False, None, 0

        if variant.kind == "closed_loop":
            t0 = time.perf_counter_ns()
            if n:
                p = tracker.observe(traj.responses[n - 1])
            out = gov.step(p)
            decision = policy.decide(p, out.budget, out.level, recent_errors)
            s1_ns = time.perf_counter_ns() - t0
            target = out.budget
            emission = plant.generate(target, decision, eq, plant_rng)
            adm = admit(emission.text, target, decision, eq, check_budget=True)
            attempted, fault = True, emission.fault
        else:
            if n:
                p = tracker.observe(traj.responses[n - 1])
            target = ref[n]
            if variant.kind == "open_loop":
                own = min(1.0, max(0.0, p + noise_rng.gauss(0.0, variant.open_loop_sigma)))
                decision = policy.decide(p, own, complexity_level(own), recent_errors)
                emission = plant.generate(own, decision, eq, plant_rng)
                adm = admit(emission.text, own, decision, eq, check_budget=False)
                attempted, fault = True, emission.fault
            else:
                if variant.kind == "rule_based":
                    if n and traj.responses[n - 1]:
                        streak_ok, streak_bad = streak_ok + 1, 0
                        if streak_ok >= variant.rule_up and rule_level < 4:
                            rule_level, streak_ok = rule_level + 1, 0
                    elif n:
                        streak_ok, streak_bad = 0, streak_bad + 1
                        if streak_bad >= variant.rule_down and rule_level > 1:
                            rule_level, streak_bad = rule_level - 1, 0
                    level = rule_level
                else:
                    level = variant.static_level
                budget = level_center(level)
                decision = policy.decide(p, budget, level, recent_errors if variant.kind == "rule_based" else 0)
                doc = fallback_document(budget, decision, eq)
                adm = admit(doc.model_dump_json(), budget, decision, eq, check_budget=False)

        schema_valid, within, fallback = adm.schema_valid, adm.within_budget, adm.fallback_used
        m_i = adm.structure.m_i
        records.append(
            StepRecord(
                step=n,
                correct=correct,
                known=traj.latent[n],
                mastery=p,
                target=target,
                ref_target=ref[n],
                m_i=m_i,
                level=complexity_level(m_i),
                target_level=complexity_level(target),
                delta_m=abs(m_i - target),
                delta_m_ref=abs(m_i - ref[n]),
                attempted=attempted,
                schema_valid=schema_valid,
                within_budget=within,
                fallback=fallback,
                fault=fault,
                system1_ns=s1_ns,
            )
        )
    return records


__all__ = ["ABLATIONS", "ARMS", "EXTENSIONS", "EPSILON", "StepRecord", "Variant", "reference_targets", "run_variant"]
