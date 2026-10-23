import time

import pytest

from closedloop_demo.plant import _obj, layout_schema
from closedloop_demo.vertex import GeminiUnavailable, Reply, hedged


def _reply(tag):
    return Reply({"tag": tag}, 1.0, {})


def test_hedged_returns_the_first_copy_that_answers():
    calls = []

    def fn():
        calls.append(1)
        if len(calls) == 1:
            time.sleep(1.0)  # the first copy stalls
            return _reply("slow")
        return _reply("fast")

    t0 = time.monotonic()
    assert hedged(fn, hedge_after_s=0.1, copies=3, deadline_s=5).data == {"tag": "fast"}
    assert time.monotonic() - t0 < 0.8


def test_hedged_replaces_a_failed_copy_and_gives_up_at_the_limit():
    calls = []

    def fn():
        calls.append(1)
        raise GeminiUnavailable("HTTP 502")

    with pytest.raises(GeminiUnavailable):
        hedged(fn, hedge_after_s=5, copies=3, deadline_s=5)
    assert len(calls) == 3


def test_hedged_stops_at_once_on_a_billing_or_auth_error():
    calls = []

    def fn():
        calls.append(1)
        raise GeminiUnavailable("HTTP 403")

    with pytest.raises(GeminiUnavailable):
        hedged(fn, hedge_after_s=0.01, copies=3, deadline_s=5)
    assert len(calls) == 1


def test_layout_schema_pins_types_and_counts(seeded_store):
    from closedloop_demo.components import ConceptCard, HintAccordion, Prompt, Stack

    root = Stack(type="Stack", direction="vertical", children=[
        Prompt(type="Prompt", text="x"),
        ConceptCard(type="ConceptCard", title="t", points=["a", "b", "c"], highlight=1),
        HintAccordion(type="HintAccordion", hints=["h1", "h2"]),
    ])
    sch = layout_schema(root)
    kids = sch["properties"]["children"]
    assert kids["minItems"] == kids["maxItems"] == 3
    card = kids["items"]["anyOf"][1]["properties"]
    assert card["type"]["enum"] == ["ConceptCard"]
    assert card["points"]["minItems"] == card["points"]["maxItems"] == 3
    assert card["highlight"] == {"type": "INTEGER", "minimum": 1, "maximum": 1}
    assert kids["items"]["anyOf"][2]["properties"]["hints"]["maxItems"] == 2
    assert _obj({"a": {}})["required"] == ["a"]
