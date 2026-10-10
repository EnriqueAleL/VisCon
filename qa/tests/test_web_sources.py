"""The web bridge can read one course from two folders (original recordings + later submissions)."""
import json
from pathlib import Path

from viscon_qa.config import Settings
from viscon_qa.index import save_index
from viscon_qa.web import load_sources

VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello there.\n\n00:00:30.000 --> 00:00:40.000\nSecond part.\n"


def course(tmp_path: Path, name: str, numbers: list[int]) -> tuple[Path, Path]:
    lectures, index = tmp_path / name / "lectures", tmp_path / name / "qa" / "index.json"
    lectures.mkdir(parents=True)
    for n in numbers:
        (lectures / f"lec{n}.vtt").write_text(VTT, encoding="utf-8")
    save_index(index, {"version": 1, "lectures": {str(n): {"lecture": n, "title": f"Lecture {n}", "chapters": []} for n in numbers}})
    return lectures, index


def settings(lectures: Path, index: Path) -> Settings:
    return Settings(lectures_dir=lectures, index_path=index, index_model="m", answer_model="m", api_key="k")


def test_a_single_source_is_read_as_before(tmp_path: Path):
    lectures, index = course(tmp_path, "a", [1, 2])
    idx, lecs = load_sources(settings(lectures, index))
    assert list(idx["lectures"]) == ["1", "2"] and list(lecs) == [1, 2]


def test_two_sources_are_merged_in_lecture_order(tmp_path: Path):
    base_l, base_i = course(tmp_path, "original", [1, 2])
    extra_l, extra_i = course(tmp_path, "submitted", [25, 26])
    idx, lecs = load_sources(settings(base_l, base_i), extra_i, extra_l)
    assert list(idx["lectures"]) == ["1", "2", "25", "26"]
    assert list(lecs) == [1, 2, 25, 26]
    assert lecs[25].transcript.parent == extra_l


def test_on_a_clash_the_first_source_wins(tmp_path: Path):
    base_l, base_i = course(tmp_path, "original", [7])
    extra_l, extra_i = course(tmp_path, "submitted", [7])
    idx, lecs = load_sources(settings(base_l, base_i), extra_i, extra_l)
    assert list(idx["lectures"]) == ["7"] and lecs[7].transcript.parent == base_l


def test_a_missing_second_source_is_simply_ignored(tmp_path: Path):
    base_l, base_i = course(tmp_path, "original", [1])
    idx, lecs = load_sources(settings(base_l, base_i), tmp_path / "nope" / "index.json", tmp_path / "nope" / "lectures")
    assert list(idx["lectures"]) == ["1"] and list(lecs) == [1]
