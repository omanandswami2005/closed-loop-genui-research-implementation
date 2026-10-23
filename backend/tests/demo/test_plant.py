import json

from closedloop.governor import complexity_level
from closedloop.plant import EPSILON
from closedloop.policy import SurrogatePolicy

from closedloop_demo.components import measure, parse
from closedloop_demo.plant import admit, build, plan


def _cases(store):
    policy = SurrogatePolicy()
    for p in store.all():
        for t in p.topics:
            for i in range(0, 101, 2):
                b = i / 100
                for errors in (0, 3):
                    d = policy.decide(0.3, b, complexity_level(b), errors)
                    for q in t.at_level(d.alpha):
                        yield b, d, q, t


def test_every_reachable_budget_has_a_template_within_tolerance(seeded_store):
    worst = 0.0
    for b, d, q, t in _cases(seeded_store):
        for example in (q, None):
            bp = plan(b, d, q, example_available=example is not None, key_points=len(t.key_points))
            doc = build(bp, q, t, example)
            assert measure(doc).m_i == bp.m_i
            worst = max(worst, abs(bp.m_i - b))
    assert worst <= EPSILON


def _one(seeded_store):
    b, d, q, t = next((c for c in _cases(seeded_store) if c[0] > 0.3 and c[1].alpha == 2))
    bp = plan(b, d, q, example_available=True, key_points=len(t.key_points))
    return b, q, t, build(bp, q, t, None)


def test_gate_admits_a_valid_screen(seeded_store):
    b, q, _, doc = _one(seeded_store)
    adm = admit(doc.model_dump_json(), b, q, doc)
    assert not adm.fallback_used and adm.schema_valid and adm.within_budget


def test_gate_rejects_schema_integrity_leak_and_budget(seeded_store):
    b, q, t, doc = _one(seeded_store)
    data = doc.model_dump(mode="json")

    raw = json.loads(json.dumps(data))
    raw["root"] = {"type": "RawHTML", "html": "<script>"}
    assert admit(json.dumps(raw), b, q, doc).reason.startswith("schema")

    assert admit("{not json", b, q, doc).reason.startswith("schema")

    other = next(x for x in t.questions if x.id != q.id)
    swapped = doc.model_dump_json().replace(f'"{q.id}"', f'"{other.id}"')
    assert admit(swapped, b, q, doc).reason.startswith("integrity")

    leaky = {"schema_version": "learn-ui/1", "question_id": q.id, "root": {"type": "Stack", "direction": "vertical", "children": [
        {"type": "Prompt", "text": f"The answer is {q.answer}"}, data["root"] if data["root"]["type"] != "Stack" else data["root"]["children"][-1]]}}
    adm = admit(json.dumps(leaky), b, q, doc)
    assert adm.fallback_used and adm.reason.startswith(("leak", "schema"))

    assert admit(doc.model_dump_json(), b + 0.3, q, doc).reason == "budget"


def test_question_node_only_references_the_bank(seeded_store):
    _, q, _, doc = _one(seeded_store)
    text = doc.model_dump_json()
    assert q.answer not in text  # the answer key is never part of the screen document
    parsed, err = parse(text)
    assert parsed and err is None
