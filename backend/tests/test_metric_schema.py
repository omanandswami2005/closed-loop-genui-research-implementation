import json
import random

import pytest

from closedloop.ast_schema import Equation, UIDocument, measure, parse_document
from closedloop.governor import complexity_level
from closedloop.metric import structural_complexity
from closedloop.plant import (
    EPSILON,
    FAULT_KINDS,
    PlantConfig,
    SurrogatePlant,
    _corrupt,
    admit,
    build,
    fallback_document,
    plan,
)
from closedloop.policy import SurrogatePolicy

EQ = Equation(a=3, b=4, c=19)
POLICY = SurrogatePolicy()


def test_metric_bounds_and_weights():
    assert structural_complexity(1, 1, 1) == pytest.approx(0.0)
    assert structural_complexity(8, 4, 4) == pytest.approx(1.0)
    assert structural_complexity(8, 1, 1) == pytest.approx(0.40)
    assert structural_complexity(1, 4, 1) == pytest.approx(0.35)
    assert structural_complexity(1, 1, 4) == pytest.approx(0.25)
    assert structural_complexity(50, 9, 0) == structural_complexity(8, 4, 1)  # clamped


def _decisions():
    for i in range(0, 101):
        b = i / 100
        for mastery, errors in ((0.1, 0), (0.1, 3), (0.6, 2)):
            yield b, POLICY.decide(mastery, b, complexity_level(b), errors)


def test_every_plan_builds_a_valid_document_with_matching_metric():
    for b, d in _decisions():
        bp = plan(b, d)
        doc = build(bp, EQ)
        reparsed, err = parse_document(doc.model_dump_json())
        assert err is None
        s = measure(reparsed)
        assert (s.rho, s.alpha, s.delta) == (bp.rho, bp.alpha, bp.depth)
        assert s.m_i == pytest.approx(bp.m_i)


def test_plans_are_within_epsilon_over_the_operating_range():
    # The steady-state budget range is [0.043, 0.957].
    for b, d in _decisions():
        if 0.04 <= b <= 0.96:
            assert abs(plan(b, d).m_i - b) <= EPSILON, (b, d)


def test_fallback_is_valid_and_within_epsilon():
    for b, d in _decisions():
        doc = fallback_document(b, d, EQ)
        assert isinstance(doc, UIDocument)
        if 0.04 <= b <= 0.96:
            assert abs(measure(doc).m_i - b) <= EPSILON


@pytest.mark.parametrize("kind", FAULT_KINDS)
def test_every_injected_fault_is_rejected_and_falls_back(kind):
    d = POLICY.decide(0.5, 0.4, 2, 0)
    text = _corrupt(build(plan(0.4, d), EQ), kind)
    assert parse_document(text)[0] is None
    adm = admit(text, 0.4, d, EQ)
    assert adm.fallback_used and not adm.schema_valid
    assert abs(adm.structure.m_i - 0.4) <= EPSILON


def test_schema_rejects_executable_or_unknown_content():
    d = POLICY.decide(0.5, 0.4, 2, 0)
    data = build(plan(0.4, d), EQ).model_dump(mode="json")
    data["root"] = {"type": "Script", "src": "alert(1)"}
    assert parse_document(json.dumps(data))[0] is None
    assert parse_document("not json")[0] is None


def test_off_budget_output_is_replaced():
    d = POLICY.decide(0.9, 0.9, 4, 0)
    low = build(plan(0.6, POLICY.decide(0.6, 0.6, 3, 0)), EQ).model_dump_json()
    adm = admit(low, 0.9, d, EQ)
    assert adm.schema_valid and not adm.within_budget and adm.fallback_used
    assert abs(adm.structure.m_i - 0.9) <= EPSILON
    unchecked = admit(low, 0.9, d, EQ, check_budget=False)
    assert not unchecked.fallback_used


def test_clean_surrogate_plant_always_admitted():
    plant, rng = SurrogatePlant(PlantConfig(p_malformed=0.0, p_drift=0.0)), random.Random(0)
    for b, d in _decisions():
        if 0.04 <= b <= 0.96:
            adm = admit(plant.generate(b, d, EQ, rng).text, b, d, EQ)
            assert not adm.fallback_used


def test_response_schema_exports():
    schema = UIDocument.model_json_schema()
    assert "root" in schema["properties"]
