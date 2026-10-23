from __future__ import annotations

import copy
from pathlib import Path

import pytest

from closedloop_demo.bank import SEED_DIR, PackStore

SAMPLES = Path(__file__).resolve().parents[3] / "docs" / "demo" / "samples"


class FakeVertex:
    """Stands in for Gemini: replays canned replies in order, or raises."""

    model = "fake-gemini"

    def __init__(self, replies=None, error: Exception | None = None):
        self.replies = list(replies or [])
        self.error = error
        self.prompts: list[str] = []

    def call(self, prompt, schema, **kw):
        from closedloop_demo.vertex import Reply

        self.prompts.append(prompt)
        if self.error:
            raise self.error
        data = self.replies.pop(0) if len(self.replies) > 1 else copy.deepcopy(self.replies[0])
        return Reply(data(prompt) if callable(data) else data, 12.0, {})


def mcq(level: int, n: int, topic: str = "plants") -> dict:
    return {
        "level": level,
        "prompt": f"Question {n} about {topic} at level {level}?",
        "options": [f"right {n}", f"wrong a{n}", f"wrong b{n}", f"wrong c{n}"],
        "answer": f"right {n}",
        "accepted": [],
        "distractors": [],
        "hints": ["think", "look again", "nearly there"],
        "explanation": "Because the material says so.",
        "key_point": f"Key point {n}",
    }


def blank(n: int) -> dict:
    return {
        "level": 3,
        "prompt": f"Plants make food by ____ number {n}.",
        "options": [],
        "answer": "photosynthesis",
        "accepted": ["photo-synthesis"],
        "distractors": ["respiration", "digestion", "osmosis"],
        "hints": ["it needs light", "starts with photo", "light + synthesis"],
        "explanation": "Plants make glucose by photosynthesis.",
        "key_point": "Plants photosynthesise",
    }


def topic_questions() -> dict:
    qs = []
    for lv in (1, 2, 4):
        qs += [mcq(lv, lv * 10 + i) for i in range(3)]
    qs += [blank(i) for i in range(3)]
    return {"questions": qs}


OUTLINE = {
    "title": "Plants",
    "topics": [
        {"title": "Photosynthesis", "summary": "How plants make food. It needs light.", "key_points": ["Light is needed", "Glucose is made", "Oxygen is released"]},
        {"title": "Respiration", "summary": "How energy is released. It happens always.", "key_points": ["Uses glucose", "Releases energy"]},
    ],
}


@pytest.fixture
def seeded_store(tmp_path) -> PackStore:
    return PackStore(seed_dir=SEED_DIR, cache_dir=tmp_path / "cache")


@pytest.fixture
def fake_store(tmp_path):
    fake = FakeVertex([OUTLINE, topic_questions()])
    return PackStore(seed_dir=tmp_path / "none", cache_dir=tmp_path / "cache", client=fake), fake
