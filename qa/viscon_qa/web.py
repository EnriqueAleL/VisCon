"""JSON stdin/stdout bridge for the shared VisCon server. No HTTP port or shell."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from . import corpus
from .ask import ask
from .chat import chat
from .config import load_settings
from .index import load_index
from .llm import OpenAILLM


def load_sources(settings, extra_index: Path | None = None, extra_lectures: Path | None = None):
    """The course's index and lectures: the configured ones, plus optionally a second folder with more lectures.

    A course can have material in two places (the original recordings, and lectures students submitted later).
    Lecture numbers are unique within a course, so merging is just a union; the first source wins on a clash.
    """
    index = load_index(settings.index_path)
    lectures = corpus.discover(settings.lectures_dir)
    if extra_index is not None and extra_lectures is not None and extra_index.exists() and extra_lectures.is_dir():
        extra = load_index(extra_index)
        merged = {**extra["lectures"], **index["lectures"]}
        index = {**index, "lectures": dict(sorted(merged.items(), key=lambda item: int(item[0])))}
        for number, lecture in corpus.discover(extra_lectures).items():
            lectures.setdefault(number, lecture)
        lectures = dict(sorted(lectures.items()))
    return index, lectures


def main() -> None:
    request = json.load(sys.stdin)
    settings = load_settings()
    extra_index, extra_lectures = os.getenv("QA_EXTRA_INDEX_PATH"), os.getenv("QA_EXTRA_LECTURES_DIR")
    index, lectures = load_sources(settings, Path(extra_index) if extra_index else None, Path(extra_lectures) if extra_lectures else None)
    language = request.get("language") or "auto"
    if request.get("mode") == "chat":
        # The open lecture first, with the whole course as the fallback when it does not cover the question.
        match = re.fullmatch(r"lec(\d+)", request.get("lectureId") or "")
        if not match:
            raise ValueError("Unknown lecture")
        llm, model = OpenAILLM(settings.require_key()), settings.require_model("answer")
        history = request.get("history") if isinstance(request.get("history"), list) else []
        current = request.get("currentTime")
        current = float(current) if isinstance(current, (int, float)) and not isinstance(current, bool) else None
        result = chat(request["question"], number=int(match.group(1)), index=index, lectures=lectures, llm=llm,
                      model=model, history=history, current_time=current, language=language)
        if result is None:
            result = ask(request["question"], index=index, lectures=lectures, llm=llm, model=model, language=language)
        payload = result.to_dict()
        payload.pop("video", None)
        print(json.dumps(payload, ensure_ascii=False))
        return
    lecture_id = request.get("lectureId")
    if lecture_id:
        if not re.fullmatch(r"lec\d+", lecture_id):
            raise ValueError("Unknown lecture")
        number = int(lecture_id[3:])
        lectures = {n: lecture for n, lecture in lectures.items() if n == number}
        index = {**index, "lectures": {key: value for key, value in index["lectures"].items()
                                      if value["lecture"] == number}}
    result = ask(request["question"], index=index, lectures=lectures,
                 llm=OpenAILLM(settings.require_key()), model=settings.require_model("answer"),
                 language=language)
    # Absolute filesystem paths stay on the server; the web layer supplies media URLs.
    payload = result.to_dict()
    payload.pop("video", None)
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
