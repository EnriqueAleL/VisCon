"""Offline tests: subtitle parsing, compaction, indexing and the ask pipeline with a fake LLM."""
from pathlib import Path

import pytest

from viscon_qa.chat import ChatReply, chat
from viscon_qa.ask import EXPLAIN_INSTRUCTIONS, LANGUAGE_RULES, LOCATE_INSTRUCTIONS, ChapterPick, Explanation, Moment, ask
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
        ChapterPick(chapter_ids=["1.1", "nope"], intent="find"),
        Moment(evidence="we prove that", found=True, start_ref="L1-1", end_ref="L1-1", answer="They prove it.", language="en"),
    )
    result = ask("when did they prove the contraction?", index=index, lectures=lectures, llm=llm, model="m")
    assert result.found and result.lecture == 1
    assert result.start == 9.5 - 3.0 and result.end == 30.0
    assert result.chapter == "Bellman contraction" and result.video.name == "lec1.mp4"
    assert "[L1-1] 00:09" in llm.calls[1]  # the excerpt carries line labels and times


def test_explain_questions_use_their_own_prompt_and_return_background(tmp_path):
    index, lectures = indexed(tmp_path)
    seen = []

    class Recording(FakeLLM):
        def parse(self, *, model, instructions, input, schema):
            seen.append((instructions, schema))
            return super().parse(model=model, instructions=instructions, input=input, schema=schema)

    llm = Recording(
        ChapterPick(chapter_ids=["1.1"], intent="explain"),
        Explanation(evidence="we prove that", found=True, start_ref="L1-1", end_ref="L1-1",
                    answer="The lecturer proves it step by step.", language="en", background="A contraction shrinks distances."),
    )
    result = ask("explain the contraction", index=index, lectures=lectures, llm=llm, model="m")
    assert seen[1][0].startswith(EXPLAIN_INSTRUCTIONS) and seen[1][1] is Explanation
    assert result.found and result.intent == "explain"
    assert result.background == "A contraction shrinks distances."
    assert result.to_dict()["background"] == "A contraction shrinks distances."


def test_find_questions_use_the_locate_prompt_and_carry_no_background(tmp_path):
    index, lectures = indexed(tmp_path)
    seen = []

    class Recording(FakeLLM):
        def parse(self, *, model, instructions, input, schema):
            seen.append((instructions, schema))
            return super().parse(model=model, instructions=instructions, input=input, schema=schema)

    llm = Recording(
        ChapterPick(chapter_ids=["1.1"], intent="find"),
        Moment(evidence="we prove that", found=True, start_ref="L1-1", end_ref="L1-1", answer="They prove it.", language="en"),
    )
    result = ask("when did they prove the contraction?", index=index, lectures=lectures, llm=llm, model="m")
    assert seen[1][0].startswith(LOCATE_INSTRUCTIONS) and seen[1][1] is Moment
    assert result.intent == "find" and result.background == ""


def test_answer_language_setting_reaches_the_prompt_and_the_result(tmp_path):
    index, lectures = indexed(tmp_path)
    seen = []

    class Recording(FakeLLM):
        def parse(self, *, model, instructions, input, schema):
            seen.append(instructions)
            return super().parse(model=model, instructions=instructions, input=input, schema=schema)

    def run(language, written):
        seen.clear()
        llm = Recording(
            ChapterPick(chapter_ids=["1.1"], intent="find"),
            Moment(evidence="we prove that", found=True, start_ref="L1-1", end_ref="L1-1", answer="x", language=written),
        )
        result = ask("q", index=index, lectures=lectures, llm=llm, model="m", language=language)
        return result, seen[1]

    result, prompt = run("de", "de")
    assert prompt.endswith(LANGUAGE_RULES["de"]) and result.language == "de"
    result, prompt = run("en", "en")
    assert prompt.endswith(LANGUAGE_RULES["en"]) and result.language == "en"
    result, prompt = run("auto", "de")
    assert prompt.endswith(LANGUAGE_RULES["auto"]) and result.language == "de"
    result, prompt = run("klingon", "en")  # unknown values fall back to auto
    assert prompt.endswith(LANGUAGE_RULES["auto"])


def test_no_match_message_follows_the_requested_language(tmp_path):
    index, lectures = indexed(tmp_path)
    german = ask("q", index=index, lectures=lectures, model="m", language="de",
                 llm=FakeLLM(ChapterPick(chapter_ids=[], intent="find")))
    english = ask("q", index=index, lectures=lectures, model="m", language="auto",
                  llm=FakeLLM(ChapterPick(chapter_ids=[], intent="find")))
    assert not german.found and german.language == "de" and "Vorlesung" in german.answer
    assert not english.found and english.language == "en" and "lecture" in english.answer


def test_ask_rejects_refs_outside_the_excerpt(tmp_path):
    index, lectures = indexed(tmp_path)
    llm = FakeLLM(
        ChapterPick(chapter_ids=["1.1"], intent="find"),
        Moment(evidence="x", found=True, start_ref="L5-0", end_ref="", answer="Invented.", language="en"),
    )
    result = ask("q", index=index, lectures=lectures, llm=llm, model="m")
    assert not result.found and [c.chapter_id for c in result.candidates] == ["1.1"]


def test_ask_with_no_matching_chapter(tmp_path):
    index, lectures = indexed(tmp_path)
    result = ask("q", index=index, lectures=lectures, llm=FakeLLM(ChapterPick(chapter_ids=[], intent="find")), model="m")
    assert not result.found and result.candidates == []


def test_ask_requires_an_index(tmp_path):
    with pytest.raises(ValueError, match="index is empty"):
        ask("q", index={"version": 1, "lectures": {}}, lectures={}, llm=FakeLLM(), model="m")


def test_ask_requires_evidence(tmp_path):
    index, lectures = indexed(tmp_path)
    llm = FakeLLM(
        ChapterPick(chapter_ids=["1.1"], intent="find"),
        Moment(evidence="", found=True, start_ref="L1-1", end_ref="L1-1", answer="Not mentioned.", language="en"),
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


class RecordingLLM(FakeLLM):
    def parse(self, *, model, instructions, input, schema):
        self.instructions = instructions
        return super().parse(model=model, instructions=instructions, input=input, schema=schema)


def chat_reply(**overrides):
    values = dict(evidence="we prove that", found=True, start_ref="L1-1", end_ref="L1-1",
                  answer="The lecturer proves the contraction property.", background="", language="en")
    return ChatReply(**{**values, **overrides})


def test_chat_answers_from_the_open_lecture_with_full_context(tmp_path):
    index, lectures = indexed(tmp_path)
    llm = RecordingLLM(chat_reply(background="A contraction shrinks distances."))
    history = [{"role": "user", "text": "What is a contraction?"}, {"role": "assistant", "text": "A map that shrinks distances."}]
    result = chat("and why does it matter?", number=1, index=index, lectures=lectures, llm=llm, model="m",
                  history=history, current_time=12.0, language="en")
    assert result.scope == "lecture" and result.found and result.lecture == 1
    assert result.start == 9.5 - 3.0 and result.end == 30.0 and result.chapter == "Bellman contraction"
    assert result.background == "A contraction shrinks distances."
    prompt = llm.calls[0]
    assert "[L1-0]" in prompt and "[L1-2]" in prompt          # the whole lecture, with labels
    assert "Bellman contraction - Proof." in prompt            # the chapter outline
    assert "The student is at: 00:12" in prompt                # where the student is watching
    assert "Student: What is a contraction?" in prompt         # the conversation so far
    assert prompt.rstrip().endswith("Student question: and why does it matter?")
    assert prompt.index("Transcript:") < prompt.index("The student is at")  # stable part first, for caching


def test_chat_returns_none_when_the_lecture_does_not_cover_it(tmp_path):
    index, lectures = indexed(tmp_path)
    llm = FakeLLM(chat_reply(found=False, evidence="", answer="", start_ref="", end_ref=""))
    assert chat("something from another lecture", number=1, index=index, lectures=lectures, llm=llm, model="m") is None
    assert chat("x", number=9, index=index, lectures=lectures, llm=FakeLLM(), model="m") is None  # lecture not available


def test_chat_keeps_a_general_answer_without_a_moment(tmp_path):
    index, lectures = indexed(tmp_path)
    llm = FakeLLM(chat_reply(start_ref="", end_ref="", answer="The lecture proves a contraction property."))
    result = chat("summarise this lecture", number=1, index=index, lectures=lectures, llm=llm, model="m")
    assert result.found and result.start is None and result.end is None and result.chapter is None


def test_chat_ignores_invented_labels_but_keeps_the_answer(tmp_path):
    index, lectures = indexed(tmp_path)
    llm = FakeLLM(chat_reply(start_ref="L9-99", end_ref="L9-100"))
    result = chat("q", number=1, index=index, lectures=lectures, llm=llm, model="m")
    assert result.found and result.start is None


def test_chat_only_sends_the_last_turns_and_the_chosen_language(tmp_path):
    index, lectures = indexed(tmp_path)
    history = [{"role": "user", "text": f"question {i}"} for i in range(10)]
    llm = RecordingLLM(chat_reply(language="de"))
    result = chat("q", number=1, index=index, lectures=lectures, llm=llm, model="m", history=history, language="de")
    assert "question 3" not in llm.calls[0] and "question 4" in llm.calls[0] and "question 9" in llm.calls[0]
    assert llm.instructions.endswith(LANGUAGE_RULES["de"]) and result.language == "de"
