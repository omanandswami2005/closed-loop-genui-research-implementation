import pytest

pytest.importorskip("pypdf")
pytest.importorskip("pptx")

from closedloop_demo.ingest import MAX_BYTES, MAX_CHARS, IngestError, extract, from_paste  # noqa: E402

from .conftest import SAMPLES  # noqa: E402


def test_pdf_text_with_page_markers():
    ex = extract("photosynthesis.pdf", (SAMPLES / "photosynthesis.pdf").read_bytes())
    assert ex.kind == "pdf" and ex.units == 2
    assert "[Page 1]" in ex.text and "chlorophyll" in ex.text


def test_pptx_text_includes_speaker_notes():
    ex = extract("newtons-laws.pptx", (SAMPLES / "newtons-laws.pptx").read_bytes())
    assert ex.kind == "pptx" and ex.units == 6
    assert "[Slide 4]" in ex.text and "F = m a" in ex.text
    assert "Notes: A passenger lurches forward" in ex.text


def test_markdown_and_paste():
    ex = extract("water-cycle.md", (SAMPLES / "water-cycle.md").read_bytes())
    assert ex.kind == "markdown" and "evaporation" in ex.text
    pasted = from_paste("word " * 100)
    assert pasted.kind == "paste" and not pasted.truncated


def test_long_text_is_truncated_and_flagged():
    ex = from_paste("x" * (MAX_CHARS + 500))
    assert ex.truncated and len(ex.text) == MAX_CHARS


@pytest.mark.parametrize(
    "name,data,message",
    [
        ("notes.docx", b"x" * 500, "Unsupported file type"),
        ("empty.txt", b"", "empty"),
        ("short.txt", b"too short", "Too little text"),
        ("big.txt", b"x" * (MAX_BYTES + 1), "larger than 15 MB"),
        ("broken.pdf", b"%PDF-1.4 not really a pdf", "could not be read"),
        ("broken.pptx", b"PK not a deck", "could not be read"),
    ],
)
def test_clear_errors(name, data, message):
    with pytest.raises(IngestError, match=message):
        extract(name, data)
