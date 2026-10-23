"""Pre-generate packs (real Gemini calls) so the demo works offline and instantly.

    python -m closedloop_demo.seed ../docs/demo/samples/*

Each document's pack is written to ``closedloop_demo/packs/<id>.json``; the id
is the hash of the extracted text, so uploading the same file later is a cache hit.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from .bank import PackStore, save_seed
from .ingest import extract


def main(paths: list[str]) -> None:
    store = PackStore(seed_dir=Path("/nonexistent"), cache_dir=Path(tempfile.mkdtemp()))
    for path in map(Path, paths):
        ex = extract(path.name, path.read_bytes())
        pack, _ = store.create(ex, path.name)
        out = save_seed(pack)
        n = sum(len(t.questions) for t in pack.topics)
        print(f"{path.name}: {pack.title!r}, {len(pack.topics)} topics, {n} questions, {pack.dropped_questions} dropped, {pack.generation_ms / 1000:.1f} s -> {out.name}")


if __name__ == "__main__":
    main(sys.argv[1:])
