"""`summary` for one lecture and for all of them, with a fake model."""
import json
from pathlib import Path

import pytest

import viscon_qa.__main__ as cli
from viscon_qa.index import save_index
from viscon_qa.summary import SectionDraft, SummaryDraft

VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello there.\n\n00:00:30.000 --> 00:00:40.000\nSecond part.\n"


class FakeLLM:
    calls = 0
    inputs: list = []

    def __init__(self, *_args, **_kwargs):
        pass

    def parse(self, *, model, instructions, input, schema):
        FakeLLM.calls += 1
        FakeLLM.inputs.append(input)
        assert schema is SummaryDraft
        return SummaryDraft(overview="About things.", sections=[SectionDraft(chapter_ids=["1.1"], heading="Start", points=["A point"])], takeaways=["Remember this"])


@pytest.fixture
def workspace(tmp_path: Path, monkeypatch):
    lectures = tmp_path / "lectures"
    lectures.mkdir()
    entries = {}
    for n in (1, 2):
        (lectures / f"lec{n}.vtt").write_text(VTT, encoding="utf-8")
        entries[str(n)] = {"lecture": n, "title": f"Lecture {n}", "model": "idx", "chapters": [
            {"id": f"{n}.1", "title": "Intro", "summary": "s", "key_terms": [], "start_line": 0, "end_line": 1, "start": 1.0, "end": 40.0}]}
    save_index(tmp_path / "qa" / "index.json", {"version": 1, "lectures": entries})
    for name, value in {"QA_LECTURES_DIR": lectures, "QA_INDEX_PATH": tmp_path / "qa" / "index.json"}.items():
        monkeypatch.setenv(name, str(value))
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("QA_INDEX_MODEL", "m")
    monkeypatch.setattr(cli, "OpenAILLM", FakeLLM)
    FakeLLM.calls = 0
    FakeLLM.inputs = []
    return tmp_path


def test_one_lecture_is_summarized_and_cached_where_the_app_reads_it(workspace: Path, capsys):
    assert cli.main(["summary", "1", "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["overview"] == "About things." and data["sections"][0]["start"] == 1.0
    assert (workspace / "qa" / "summaries" / "lec1.json").exists()
    assert FakeLLM.calls == 1
    assert cli.main(["summary", "1", "--json"]) == 0
    assert FakeLLM.calls == 1, "a cached summary costs no model call"
    assert cli.main(["summary", "1", "--force", "--json"]) == 0
    assert FakeLLM.calls == 2, "--force regenerates it"


def test_all_summarizes_every_indexed_lecture_and_skips_cached_ones(workspace: Path, capsys):
    assert cli.main(["summary", "1", "--json"]) == 0
    capsys.readouterr()
    assert cli.main(["summary", "--all"]) == 0
    out = capsys.readouterr().out
    assert "Lecture 1" in out and "Lecture 2" in out
    assert FakeLLM.calls == 2, "lecture 1 was already cached: only lecture 2 called the model"
    assert (workspace / "qa" / "summaries" / "lec2.json").exists()


def test_it_needs_a_lecture_or_all_but_not_both(workspace: Path, capsys):
    assert cli.main(["summary"]) == 1
    assert cli.main(["summary", "1", "--all"]) == 1
    assert "lecture number, or --all" in capsys.readouterr().err
    assert cli.main(["summary", "9"]) == 1
    assert FakeLLM.calls == 0


def test_from_index_reads_only_the_chapter_list_never_the_transcript(workspace: Path, capsys):
    assert cli.main(["summary", "1", "--from-index", "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["basis"] == "index" and data["sections"][0]["start"] == 1.0
    sent = FakeLLM.inputs[-1]
    assert "Chapters:" in sent and "Intro" in sent
    assert "Transcript:" not in sent and "Hello there" not in sent and "Second part" not in sent, "no transcript text goes to the model"
    assert len(sent) < 500, "a few hundred characters, not a whole lecture"


def test_from_index_does_not_need_the_transcript_files_at_all(workspace: Path):
    for vtt in (workspace / "lectures").glob("*.vtt"):
        vtt.unlink()
    assert cli.main(["summary", "--all", "--from-index"]) == 0
    assert (workspace / "qa" / "summaries" / "lec2.json").exists()
    assert cli.main(["summary", "1"]) == 1, "the thorough summary still needs the transcript"


def test_a_cached_summary_is_not_served_in_place_of_the_other_kind(workspace: Path, capsys):
    assert cli.main(["summary", "1", "--json"]) == 0
    assert FakeLLM.calls == 1
    assert cli.main(["summary", "1", "--from-index", "--json"]) == 0
    assert FakeLLM.calls == 2, "the cheap one is not satisfied by the thorough one"
    assert cli.main(["summary", "1", "--from-index", "--json"]) == 0
    assert FakeLLM.calls == 2, "but it is cached once made"
    assert json.loads((workspace / "qa" / "summaries" / "lec1.json").read_text())["basis"] == "index"
