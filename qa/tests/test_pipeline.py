"""Offline tests: subtitle parsing, compaction, indexing and the ask pipeline with a fake LLM."""
from pathlib import Path

import pytest

from viscon_qa.ask import ChapterPick, Moment, ask
from viscon_qa.corpus import Lecture, discover
from viscon_qa.index import ChapterDraft, ChapterDrafts, build_index, load_index
from viscon_qa.transcripts import compact, format_time, parse_subtitles, parse_time

VTT = """WEBVTT

1
00:00:01.000 --> 00:00:04.000 align:start
Welcome <b>back</b> &amp; hello.

00:00:04.500 --> 00:00:09.000
Today we prove that the Bellman operator

00:00:09.500 --> 00:00:30.000
is a contraction.

NOTE this block is ignored

00:00:45.000 --> 00:00:50.000
After a long pause, an example.
"""


def make_lecture(tmp_path: Path, number: int = 1, video: bool = True) -> Lecture:
    (tmp_path / f"lec{number}.vtt").write_text(VTT, encoding="utf-8")
    if video:
        (tmp_path / f"lec{number}.mp4").write_bytes(b"")
    return discover(tmp_path)[number]


class FakeLLM:
    """Returns queued responses in order and records the prompts it received."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def parse(self, *, model, instructions, input, schema):
        self.calls.append(input)
        response = self.responses.pop(0)
        assert isinstance(response, schema)
        return response


def test_parse_time_and_format():
    assert parse_time("01:02:03.500") == 3723.5
    assert parse_time("02:03,25") == 123.25
    assert format_time(3723.5) == "1:02:03"
    assert format_time(65) == "01:05"


def test_parse_subtitles_strips_tags_settings_and_notes():
    cues = parse_subtitles(VTT)
    assert [c.text for c in cues] == [
        "Welcome back & hello.",
        "Today we prove that the Bellman operator",
        "is a contraction.",
        "After a long pause, an example.",
    ]
    assert cues[0].end == 4.0


def test_compact_merges_until_limit_and_breaks_on_pauses():
    lines = compact(parse_subtitles(VTT), lecture=3, max_seconds=25, max_gap=5)
    assert [(l.idx, l.start, l.end) for l in lines] == [(0, 1.0, 9.0), (1, 9.5, 30.0), (2, 45.0, 50.0)]
    assert lines[1].ref == "L3-1"


def test_discover_pairs_videos(tmp_path):
    lec = make_lecture(tmp_path, 2)
    (tmp_path / "lec10.vtt").write_text(VTT, encoding="utf-8")
    found = discover(tmp_path)
    assert list(found) == [2, 10]
    assert lec.video.name == "lec2.mp4" and found[10].video is None


def test_build_index_maps_lines_to_times_and_resumes(tmp_path):
    lec = make_lecture(tmp_path)
    llm = FakeLLM(ChapterDrafts(chapters=[
        ChapterDraft(start_line=1, title="Contraction proof", summary="Proof.", key_terms=["Bellman"]),
        ChapterDraft(start_line=99, title="Out of range", summary="", key_terms=[]),
        ChapterDraft(start_line=2, title="Example", summary="Gridworld.", key_terms=[" "]),
    ]))
    path = tmp_path / "index.json"
    build_index(llm, "m", [lec], path, log=lambda _: None)
    chapters = load_index(path)["lectures"]["1"]["chapters"]
    # The first chapter is moved to line 0 and the out-of-range draft is dropped.
    assert [(c["id"], c["start_line"], c["end_line"]) for c in chapters] == [("1.1", 0, 1), ("1.2", 2, 2)]
    assert (chapters[0]["start"], chapters[0]["end"]) == (1.0, 30.0)
    assert chapters[1]["key_terms"] == []

    build_index(FakeLLM(), "m", [lec], path, log=lambda _: None)  # already indexed: no LLM call


def indexed(tmp_path):
    lec = make_lecture(tmp_path)
    path = tmp_path / "index.json"
    build_index(FakeLLM(ChapterDrafts(chapters=[
        ChapterDraft(start_line=0, title="Bellman contraction", summary="Proof.", key_terms=["Bellman"]),
        ChapterDraft(start_line=2, title="Example", summary="Gridworld.", key_terms=[]),
    ])), "m", [lec], path, log=lambda _: None)
    return load_index(path), {1: lec}


def test_ask_returns_lecture_and_timestamp(tmp_path):
    index, lectures = indexed(tmp_path)
    llm = FakeLLM(
        ChapterPick(chapter_ids=["1.1", "nope"]),
        Moment(evidence="we prove that", found=True, start_ref="L1-1", end_ref="L1-1", answer="They prove it."),
    )
    result = ask("when did they prove the contraction?", index=index, lectures=lectures, llm=llm, model="m")
    assert result.found and result.lecture == 1
    assert result.start == 9.5 - 3.0 and result.end == 30.0
    assert result.chapter == "Bellman contraction" and result.video.name == "lec1.mp4"
    assert "[L1-1] 00:09" in llm.calls[1]  # the excerpt carries line labels and times


def test_ask_rejects_refs_outside_the_excerpt(tmp_path):
    index, lectures = indexed(tmp_path)
    llm = FakeLLM(
        ChapterPick(chapter_ids=["1.1"]),
        Moment(evidence="x", found=True, start_ref="L5-0", end_ref="", answer="Invented."),
    )
    result = ask("q", index=index, lectures=lectures, llm=llm, model="m")
    assert not result.found and [c.chapter_id for c in result.candidates] == ["1.1"]


def test_ask_with_no_matching_chapter(tmp_path):
    index, lectures = indexed(tmp_path)
    result = ask("q", index=index, lectures=lectures, llm=FakeLLM(ChapterPick(chapter_ids=[])), model="m")
    assert not result.found and result.candidates == []


def test_ask_requires_an_index(tmp_path):
    with pytest.raises(ValueError, match="index is empty"):
        ask("q", index={"version": 1, "lectures": {}}, lectures={}, llm=FakeLLM(), model="m")


def test_ask_requires_evidence(tmp_path):
    index, lectures = indexed(tmp_path)
    llm = FakeLLM(
        ChapterPick(chapter_ids=["1.1"]),
        Moment(evidence="", found=True, start_ref="L1-1", end_ref="L1-1", answer="Not mentioned."),
    )
    assert not ask("q", index=index, lectures=lectures, llm=llm, model="m").found


def test_summary_maps_chapters_to_times_and_caches(tmp_path):
    from viscon_qa.summary import SectionDraft, SummaryDraft, get_summary, render_summary

    index, lectures = indexed(tmp_path)
    entry = index["lectures"]["1"]
    draft = SummaryDraft(
        overview="About Bellman.",
        sections=[
            SectionDraft(chapter_ids=["1.2", "9.9"], heading="Example", points=["Gridworld.", " "]),
            SectionDraft(chapter_ids=[], heading="Empty", points=[]),
        ],
        takeaways=["Contraction => convergence."],
    )
    llm = FakeLLM(draft)
    summary = get_summary(llm, "m", lectures[1], entry, tmp_path / "s")
    assert summary["sections"] == [{"heading": "Example", "chapter_ids": ["1.2"], "start": 45.0, "points": ["Gridworld."]}]
    assert "## [00:45] Example" in render_summary(summary)
    assert "Transcript:\n[0] 00:01" in llm.calls[0]

    assert get_summary(FakeLLM(), "m", lectures[1], entry, tmp_path / "s") == summary  # cached
    get_summary(FakeLLM(draft), "other-model", lectures[1], entry, tmp_path / "s")     # model changed: redone


def test_export_chapters_writes_contiguous_markers(tmp_path):
    from viscon_qa.chapters import export_chapters

    index, _ = indexed(tmp_path)
    export_chapters(index, tmp_path / "ch")
    data = __import__("json").loads((tmp_path / "ch" / "lec1.json").read_text(encoding="utf-8"))
    assert [(c["start"], c["end"]) for c in data["chapters"]] == [(1.0, 45.0), (45.0, 50.0)]
    assert (tmp_path / "ch" / "lec1.chapters.vtt").read_text(encoding="utf-8") == (
        "WEBVTT\n\n1.1\n00:00:01.000 --> 00:00:45.000\nBellman contraction\n\n"
        "1.2\n00:00:45.000 --> 00:00:50.000\nExample\n"
    )
