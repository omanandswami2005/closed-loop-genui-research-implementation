import pytest

from closedloop_demo.bank import LEVELS, build_topic, clean_question
from closedloop_demo.ingest import from_paste
from closedloop_demo.vertex import GeminiUnavailable

from .conftest import OUTLINE, FakeVertex, blank, mcq, topic_questions


def test_choice_answer_is_canonicalised_and_first():
    raw = mcq(1, 1) | {"answer": "RIGHT 1 "}
    q = clean_question(raw, "q")
    assert q.answer == "right 1" and q.options[0] == "right 1" and len(q.options) == 4


@pytest.mark.parametrize(
    "change",
    [
        {"answer": "not an option"},
        {"options": ["a", "a", "right 1"]},  # duplicates collapse, leaving too few options
        {"hints": []},
        {"level": 7},
        {"hints": ["right 1"]},  # a hint that is the answer
    ],
)
def test_bad_choice_questions_are_dropped(change):
    assert clean_question(mcq(1, 1) | change, "q") is None


def test_blank_rules():
    q = clean_question(blank(1), "q")
    assert q.kind == "blank" and q.prompt.count("____") == 1
    assert "respiration" in q.distractors and "photo-synthesis" in q.accepted
    assert clean_question(blank(1) | {"prompt": "no gap here at all"}, "q") is None
    assert clean_question(blank(1) | {"prompt": "two ____ gaps ____ here"}, "q") is None
    assert clean_question(blank(1) | {"answer": "a very long multi word answer"}, "q") is None


def test_topic_needs_every_level():
    qs = [q for q in topic_questions()["questions"] if q["level"] != 3]
    topic, dropped = build_topic(OUTLINE["topics"][0], qs, "t1")
    assert topic is None and dropped == len(qs)
    topic, dropped = build_topic(OUTLINE["topics"][0], topic_questions()["questions"], "t1")
    assert topic and dropped == 0 and all(topic.at_level(lv) for lv in LEVELS)


def test_duplicate_prompts_are_dropped():
    qs = topic_questions()["questions"]
    topic, dropped = build_topic(OUTLINE["topics"][0], qs + qs[:2], "t1")
    assert dropped == 2 and len(topic.questions) == 12


def test_generation_outline_then_one_call_per_topic_and_cache(fake_store):
    store, fake = fake_store
    ex = from_paste("Plants make food. " * 30)
    pack, cached = store.create(ex, "notes")
    assert not cached and len(pack.topics) == 2 and pack.model == "fake-gemini"
    assert len(fake.prompts) == 3  # outline + 2 topics
    assert "Topic: Respiration" in fake.prompts[2] or "Topic: Respiration" in fake.prompts[1]
    again, cached = store.create(ex, "notes")
    assert cached and again.id == pack.id and len(fake.prompts) == 3
    assert (store.cache_dir / f"{pack.id}.json").exists()


def test_generation_failure_is_reported(tmp_path):
    from closedloop_demo.bank import PackStore

    store = PackStore(seed_dir=tmp_path / "x", cache_dir=tmp_path / "c", client=FakeVertex(error=GeminiUnavailable("HTTP 429")))
    with pytest.raises(GeminiUnavailable):
        store.create(from_paste("Plants make food. " * 30), "notes")


def test_seeded_packs_load_and_are_valid(seeded_store):
    packs = seeded_store.all()
    assert len(packs) >= 3 and all(p.seeded for p in packs)
    for p in packs:
        for t in p.topics:
            assert all(t.at_level(lv) for lv in LEVELS)
