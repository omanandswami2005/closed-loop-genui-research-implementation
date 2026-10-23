import copy
import json

from closedloop_demo.labs import (
    GALLERY,
    MIN_STATIONS,
    LabStore,
    lab_prompt,
    template_stations,
)
from closedloop_demo.vertex import GeminiUnavailable

from .conftest import FakeVertex

ST = {s["type"]: s for s in json.loads(GALLERY.read_text())["stations"]}
PROFILE = {"name": "Asha", "grade": "Grade 9-10", "interests": "cricket and cooking"}


def lab_reply(*types, broken=()):
    stations = [copy.deepcopy(ST[t]) for t in types]
    for t in broken:
        s = copy.deepcopy(ST[t])
        s["answer"] = [0]  # BalanceScale that cannot balance
        stations.append(s)
    return {"title": "Heart lab", "intro": "Welcome, Asha.", "toolbox": ["fact one", "fact two"], "stations": stations}


def _topic(seeded_store):
    pack = seeded_store.all()[0]
    return pack, pack.topics[0]


def test_lab_is_composed_validated_and_cached(seeded_store, tmp_path):
    pack, topic = _topic(seeded_store)
    fake = FakeVertex([lab_reply("SequenceSort", "BalanceScale", "ParameterLab", "Flashcards")])
    store = LabStore(client=fake, cache_dir=tmp_path)
    lab = store.get(pack, topic, PROFILE)
    assert lab.source == "gemini" and lab.model == "fake-gemini" and lab.rejected == []
    assert [s.type for s in lab.stations] == ["SequenceSort", "BalanceScale", "ParameterLab", "Flashcards"]
    assert [s.id for s in lab.stations] == ["s1", "s2", "s3", "s4"]
    assert "Asha" in fake.prompts[0] and "cricket and cooking" in fake.prompts[0] and topic.title in fake.prompts[0]
    # second request: memory cache; a new store: disk cache; no further Gemini calls
    assert store.get(pack, topic, PROFILE) is lab
    again = LabStore(client=FakeVertex(error=AssertionError("must not call")), cache_dir=tmp_path).get(pack, topic, PROFILE)
    assert again.model_dump() == lab.model_dump()


def test_rejected_stations_go_back_to_gemini_once(seeded_store, tmp_path):
    _, topic = _topic(seeded_store)
    fake = FakeVertex([lab_reply("MatchPairs", "Pendulum", broken=["BalanceScale"]), {"stations": [ST["BalanceScale"]]}])
    lab = LabStore(client=fake, cache_dir=tmp_path).compose(topic, PROFILE)
    assert len(fake.prompts) == 2 and "rejected by a validator" in fake.prompts[1] and "BalanceScale" in fake.prompts[1]
    assert [s.type for s in lab.stations] == ["MatchPairs", "Pendulum", "BalanceScale"]
    assert lab.source == "gemini" and len(lab.rejected) == 1


def test_duplicates_are_dropped_and_the_lab_is_topped_up(seeded_store, tmp_path):
    _, topic = _topic(seeded_store)
    fake = FakeVertex([lab_reply("MatchPairs", "MatchPairs")])
    lab = LabStore(client=fake, cache_dir=tmp_path).compose(topic, PROFILE)
    assert len(lab.stations) >= MIN_STATIONS and lab.stations[0].type == "MatchPairs"
    assert lab.source == "mixed" and any("duplicate" in r for r in lab.rejected)


def test_gemini_down_gives_the_template_lab(seeded_store, tmp_path):
    pack, topic = _topic(seeded_store)
    store = LabStore(client=FakeVertex(error=GeminiUnavailable("HTTP 429")), cache_dir=tmp_path)
    lab = store.get(pack, topic, PROFILE)
    assert lab.source == "template" and lab.model == "" and len(lab.stations) >= MIN_STATIONS
    assert any("gemini unavailable" in r for r in lab.rejected)
    assert not list(tmp_path.glob("*.json"))  # a fallback lab is not cached: the next visit tries Gemini again


def test_template_stations_come_from_the_validated_bank(seeded_store):
    for pack in seeded_store.all():
        for topic in pack.topics:
            from closedloop_demo.widgets import parse_station

            raws = template_stations(topic)
            assert len(raws) >= 2
            assert all(parse_station(r)[0] is not None for r in raws), topic.title


def test_prompt_names_the_catalog_and_the_learner(seeded_store):
    _, topic = _topic(seeded_store)
    p = lab_prompt(topic, PROFILE)
    assert "ParameterLab" in p and "BalanceScale" in p and "Grade 9-10" in p and "never invent formulas" in p
