import copy
import json

import pytest
from closedloop_demo.labs import GALLERY, gallery_json
from closedloop_demo.widgets import CATALOG, HANDS_ON, SIMULATIONS, parse_station

STATIONS = {s["type"]: s for s in json.loads(GALLERY.read_text())["stations"]}


def test_catalog_has_15_hands_on_and_15_simulations():
    assert len(HANDS_ON) == 15 and len(SIMULATIONS) == 15 and len(CATALOG) == 30
    assert set(STATIONS) == set(CATALOG)


def test_every_gallery_example_passes_the_gate():
    g = gallery_json()
    assert g["rejected"] == [] and len(g["stations"]) == 30


def bad(kind: str, **change):
    s = copy.deepcopy(STATIONS[kind])
    for k, v in change.items():
        s[k] = v(s) if callable(v) else v
    st, why = parse_station(s)
    assert st is None, f"{kind} should be rejected"
    return why


def test_shared_fields_and_unknown_types_are_checked():
    assert "unknown component" in parse_station({"type": "Iframe"})[1]
    assert "unknown component" in parse_station(["x"])[1]
    s = dict(STATIONS["MatchPairs"])
    del s["goal"]
    assert parse_station(s)[0] is None
    assert parse_station({**STATIONS["MatchPairs"], "html": "<script>"})[0] is None  # no extra fields


@pytest.mark.parametrize(
    "kind, change",
    [
        ("BalanceScale", {"answer": [2, 3]}),  # these weights do not balance the pans
        ("ForceArrows", {"answer": lambda s: [s["forces"][0]["value"], 14.5] + s["answer"][2:]}),  # not on the slider grid
        ("ParameterLab", {"target": 1e6}),  # the answer does not reach the target
        ("ParameterLab", {"expression": "voltage / resistance + __import__"}),
        ("Projectile", {"target_distance": 3.0}),  # the answer lands elsewhere
        ("ProportionBar", {"segments": [{"label": "A", "value": 60}, {"label": "B", "value": 30}]}),  # not 100
        ("ClozeBank", {"text": "Only one [[gap]] here."}),
        ("ScenarioBranch", {"steps": lambda s: [{**s["steps"][0], "choices": [{**c, "correct": True} for c in s["steps"][0]["choices"]]}] + s["steps"][1:]}),
        ("SpotTheError", {"statements": lambda s: [{**x, "wrong": True, "correction": x["correction"] or "fix"} for x in s["statements"]]}),
        ("ConceptMap", {"edges": [{"source": "Sun", "target": "Moon", "label": "lights"}]}),
        ("Pendulum", {"target_period": 99.0}),
        ("SequenceSort", {"items": ["only one"]}),
    ],
)
def test_unsolvable_or_broken_stations_are_rejected(kind, change):
    assert bad(kind, **change)


def test_param_values_snap_to_the_slider_grid():
    s = copy.deepcopy(STATIONS["ParameterLab"])
    s["params"][0]["answer"] = 50.4  # step 5: the browser slider can only stop at 50
    st, why = parse_station(s)
    assert why is None and st.params[0].answer == 50
