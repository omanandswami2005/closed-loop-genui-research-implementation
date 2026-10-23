"""Topic and question bank: written once per document by Gemini, validated, cached.

The bank is the only place answer keys come from. Gemini writes it at upload
time under a JSON response schema; every question is then checked here and
dropped if it is malformed (answer not among the options, blank without a gap,
duplicate options...). A topic needs at least one valid question at every
difficulty level, a pack at least one topic.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .ingest import Extracted
from .vertex import GeminiUnavailable, VertexJSON

BLANK = "____"
LEVELS = (1, 2, 3, 4)
LEVEL_NAME = {1: "recognise", 2: "understand", 3: "recall", 4: "apply"}
SEED_DIR = Path(__file__).parent / "packs"
CACHE_DIR = Path(os.environ.get("GENUI_DEMO_CACHE", "/tmp/genui-demo-packs"))


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Question(_Strict):
    id: str
    level: int = Field(ge=1, le=4)
    kind: Literal["choice", "blank"]
    prompt: str = Field(min_length=8, max_length=600)
    options: list[str] = Field(default_factory=list, max_length=4)  # choice: 4 incl. the answer
    answer: str = Field(min_length=1, max_length=200)
    accepted: list[str] = Field(default_factory=list, max_length=6)  # blank: other accepted spellings
    distractors: list[str] = Field(default_factory=list, max_length=4)  # blank: word-bank decoys
    hints: list[str] = Field(min_length=1, max_length=3)
    explanation: str = Field(min_length=8, max_length=800)
    key_point: str = Field(min_length=4, max_length=400)


class Topic(_Strict):
    id: str
    title: str = Field(min_length=2, max_length=120)
    summary: str = Field(min_length=8, max_length=600)
    key_points: list[str] = Field(min_length=1, max_length=5)
    questions: list[Question] = Field(min_length=4)

    def at_level(self, level: int) -> list[Question]:
        return [q for q in self.questions if q.level == level]

    def question(self, qid: str) -> Question | None:
        return next((q for q in self.questions if q.id == qid), None)


class Pack(_Strict):
    id: str
    title: str
    source_name: str
    source_kind: str
    source_units: int
    chars: int
    truncated: bool
    topics: list[Topic] = Field(min_length=1)
    model: str
    created: str
    generation_ms: float
    dropped_questions: int = 0
    seeded: bool = False

    def topic(self, tid: str) -> Topic | None:
        return next((t for t in self.topics if t.id == tid), None)


# ---------------------------------------------------------------------------
# Generation

_S = {"type": "STRING"}
_LIST = {"type": "ARRAY", "items": _S}
OUTLINE_SCHEMA = {
    "type": "OBJECT",
    "required": ["title", "topics"],
    "properties": {
        "title": _S,
        "topics": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["title", "summary", "key_points"],
                "properties": {"title": _S, "summary": _S, "key_points": _LIST},
            },
        },
    },
}
QUESTIONS_SCHEMA = {
    "type": "OBJECT",
    "required": ["questions"],
    "properties": {
        "questions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["level", "prompt", "options", "answer", "accepted", "distractors", "hints", "explanation", "key_point"],
                "properties": {
                    "level": {"type": "INTEGER"},
                    "prompt": _S,
                    "options": _LIST,
                    "answer": _S,
                    "accepted": _LIST,
                    "distractors": _LIST,
                    "hints": _LIST,
                    "explanation": _S,
                    "key_point": _S,
                },
            },
        }
    },
}

_MATERIAL = """MATERIAL ({kind}, {chars} characters{trunc}):
<<<
{text}
>>>"""

OUTLINE_PROMPT = """You are planning lessons for an adaptive tutor from the learner's own study material.
Use ONLY facts stated in or directly implied by the material. Do not invent facts.

Return JSON with:
- "title": a short title for the whole material (max 8 words).
- "topics": {min_topics} to {max_topics} topics that together cover the material's main ideas, in teaching order,
  without overlapping. Each topic has "title" (max 8 words), "summary" (2 plain sentences) and "key_points"
  (3 to 5 short facts taken from the material, one idea each).
Write for a {audience} reader.

""" + _MATERIAL

QUESTIONS_PROMPT = """You are writing the question bank for ONE topic of an adaptive tutor, from the learner's own study material.
Use ONLY facts stated in or directly implied by the material. Do not invent facts.

Topic: {title}
Summary: {summary}
Key points:
{points}

Return JSON {{"questions": [...]}} with exactly 12 questions about THIS topic only, 3 at each level:
- level 1 "recognise": a direct multiple-choice question about one key point; the right option is close to the material's wording.
- level 2 "understand": multiple choice that needs the idea, not the wording (why / what follows / which example fits).
- level 3 "recall": fill-in-the-blank. "prompt" is one sentence stating the idea with exactly one gap written as ____ .
  "answer" is the missing word or short phrase (1 to 3 words). "accepted" lists other correct spellings or synonyms
  (may be empty). "distractors" lists 3 plausible wrong words for a word bank. "options" is an empty list.
- level 4 "apply": multiple choice that puts the idea into a short new situation the material does not state word for
  word, and asks what happens or which choice is right.
For multiple choice (levels 1, 2, 4): "options" has exactly 4 distinct options, one of which is EXACTLY the "answer"
string; wrong options are plausible but clearly wrong given the material; "accepted" and "distractors" are empty lists.
Every question has "hints": 3 hints from a gentle nudge to almost giving it away (never the answer itself),
"explanation": 1 to 2 sentences on why the answer is right, and "key_point": the key point it tests, copied from the list.
Do not repeat a question. Keep each prompt under 40 words. Write for a {audience} reader.

""" + _MATERIAL
AUDIENCE = "secondary-school or first-year university"


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _fold(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def clean_question(raw: dict, qid: str) -> Question | None:
    """A validated question, or None when it cannot be trusted."""
    try:
        level = int(raw.get("level", 0))
        if level not in LEVELS:
            return None
        prompt = _norm(str(raw.get("prompt", "")))
        answer = _norm(str(raw.get("answer", "")))
        hints = [_norm(h) for h in raw.get("hints", []) if _norm(str(h))][:3]
        explanation = _norm(str(raw.get("explanation", "")))
        key_point = _norm(str(raw.get("key_point", ""))) or explanation
        if not prompt or not answer or not hints:
            return None
        if any(_fold(answer) and _fold(answer) == _fold(h) for h in hints):
            return None  # a hint that is the answer gives it away
        if level == 3:
            prompt = re.sub(r"_{2,}", BLANK, prompt)
            if prompt.count(BLANK) != 1 or len(answer.split()) > 4:
                return None
            accepted = list(dict.fromkeys(_norm(a) for a in raw.get("accepted", []) if _norm(str(a)) and _fold(a) != _fold(answer)))[:6]
            decoys = [
                _norm(d) for d in raw.get("distractors", []) if _norm(str(d)) and _fold(d) not in {_fold(answer), *map(_fold, accepted)}
            ]
            decoys = list(dict.fromkeys(decoys))[:4]
            return Question(
                id=qid, level=3, kind="blank", prompt=prompt, answer=answer, accepted=accepted,
                distractors=decoys, hints=hints, explanation=explanation, key_point=key_point,
            )
        options = list(dict.fromkeys(_norm(o) for o in raw.get("options", []) if _norm(str(o))))
        folded = [_fold(o) for o in options]
        if len(set(folded)) != len(folded) or _fold(answer) not in folded:
            return None
        answer = options[folded.index(_fold(answer))]  # canonical spelling = the option text
        wrong = [o for o in options if o != answer][:3]
        if len(wrong) < 2:
            return None
        return Question(
            id=qid, level=level, kind="choice", prompt=prompt, options=[answer, *wrong], answer=answer,
            hints=hints, explanation=explanation, key_point=key_point,
        )
    except (TypeError, ValueError):
        return None


def build_topic(outline: dict, raw_questions: list, tid: str) -> tuple[Topic | None, int]:
    """A validated topic (None if any level ends up empty) and the count of dropped questions."""
    qs, dropped, seen = [], 0, set()
    for qi, rq in enumerate(raw_questions):
        q = clean_question(rq, f"{tid}q{qi + 1}") if isinstance(rq, dict) else None
        if q is None or _fold(q.prompt) in seen:
            dropped += 1
            continue
        seen.add(_fold(q.prompt))
        qs.append(q)
    if not all(any(q.level == lv for q in qs) for lv in LEVELS):
        return None, dropped + len(qs)
    points = [_norm(str(p)) for p in outline.get("key_points", []) if _norm(str(p))][:5]
    try:
        topic = Topic(
            id=tid,
            title=_norm(str(outline.get("title", "")))[:120],
            summary=_norm(str(outline.get("summary", "")))[:600],
            key_points=points,
            questions=qs,
        )
    except ValueError:
        return None, dropped + len(qs)
    return topic, dropped


def pack_id_for(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


class PackStore:
    """Seeded packs (shipped JSON) + packs generated at runtime (memory and disk)."""

    def __init__(self, seed_dir: Path = SEED_DIR, cache_dir: Path = CACHE_DIR, client: VertexJSON | None = None) -> None:
        self._packs: dict[str, Pack] = {}
        self._lock = threading.Lock()
        self._inflight: dict[str, threading.Lock] = {}
        self.cache_dir = cache_dir
        self._client = client
        for d, seeded in ((seed_dir, True), (cache_dir, False)):
            if d.is_dir():
                for f in sorted(d.glob("*.json")):
                    try:
                        p = Pack.model_validate_json(f.read_text())
                    except ValueError:
                        continue
                    self._packs.setdefault(p.id, p.model_copy(update={"seeded": seeded}))

    @property
    def client(self) -> VertexJSON:
        if self._client is None:
            self._client = VertexJSON()
        return self._client

    def all(self) -> list[Pack]:
        with self._lock:
            return sorted(self._packs.values(), key=lambda p: (not p.seeded, p.title))

    def get(self, pid: str) -> Pack | None:
        with self._lock:
            return self._packs.get(pid)

    def create(self, ex: Extracted, source_name: str) -> tuple[Pack, bool]:
        """(pack, cached). Raises GeminiUnavailable when generation fails."""
        pid = pack_id_for(ex.text)
        with self._lock:
            if pid in self._packs:
                return self._packs[pid], True
            gate = self._inflight.setdefault(pid, threading.Lock())
        with gate:  # two uploads of the same file share one Gemini call
            existing = self.get(pid)
            if existing:
                return existing, True
            pack = self._generate(ex, pid, source_name)
            with self._lock:
                self._packs[pid] = pack
                self._inflight.pop(pid, None)
            try:
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                (self.cache_dir / f"{pid}.json").write_text(pack.model_dump_json(indent=1))
            except OSError:
                pass  # the in-memory copy is enough for this process
            return pack, False


    def _generate(self, ex: Extracted, pid: str, source_name: str) -> Pack:
        """Outline call, then one question call per topic in parallel."""
        n = len(ex.text)
        material = {"kind": ex.kind, "chars": n, "trunc": ", truncated" if ex.truncated else "", "text": ex.text}
        thinking = os.environ.get("GENUI_DEMO_BANK_THINKING", "LOW")
        t0 = time.perf_counter()
        outline = self.client.call(
            OUTLINE_PROMPT.format(min_topics=2 if n < 2500 else 3, max_topics=3 if n < 2500 else 5, audience=AUDIENCE, **material),
            OUTLINE_SCHEMA,
            thinking=thinking,
            temperature=0.3,
        ).data
        outlines = [o for o in outline.get("topics", []) if isinstance(o, dict) and o.get("title")][:6]
        if not outlines:
            raise GeminiUnavailable("no topics in the outline")

        def questions(o: dict) -> list:
            prompt = QUESTIONS_PROMPT.format(
                title=o.get("title", ""),
                summary=o.get("summary", ""),
                points="\n".join(f"- {p}" for p in o.get("key_points", [])),
                audience=AUDIENCE,
                **material,
            )
            for attempt in range(2):  # one retry per topic on a transient failure
                try:
                    return self.client.call(prompt, QUESTIONS_SCHEMA, thinking=thinking, temperature=0.4).data.get("questions", [])
                except GeminiUnavailable:
                    if attempt:
                        return []
            return []

        with ThreadPoolExecutor(max_workers=len(outlines)) as pool:
            replies = list(pool.map(questions, outlines))
        topics, dropped = [], 0
        for i, (o, qs) in enumerate(zip(outlines, replies)):
            topic, d = build_topic(o, qs if isinstance(qs, list) else [], f"t{i + 1}")
            dropped += d
            if topic:
                topics.append(topic)
        if not topics:
            raise GeminiUnavailable("no usable topics in the reply")
        return Pack(
            id=pid,
            title=_norm(str(outline.get("title", ""))) or source_name,
            source_name=source_name,
            source_kind=ex.kind,
            source_units=ex.units,
            chars=n,
            truncated=ex.truncated,
            topics=topics,
            model=self.client.model,
            created=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            generation_ms=round((time.perf_counter() - t0) * 1000, 1),
            dropped_questions=dropped,
        )


def save_seed(pack: Pack, directory: Path = SEED_DIR) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{pack.id}.json"
    path.write_text(json.dumps(pack.model_dump(mode="json") | {"seeded": True}, indent=1, ensure_ascii=False))
    return path
