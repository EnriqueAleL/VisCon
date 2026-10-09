"""JSON stdin/stdout bridge for the shared VisCon server. No HTTP port or shell."""
from __future__ import annotations

import json
import re
import sys

from . import corpus
from .ask import ask
from .config import load_settings
from .index import load_index
from .llm import OpenAILLM


def main() -> None:
    request = json.load(sys.stdin)
    settings = load_settings()
    index = load_index(settings.index_path)
    lectures = corpus.discover(settings.lectures_dir)
    lecture_id = request.get("lectureId")
    if lecture_id:
        if not re.fullmatch(r"lec\d+", lecture_id):
            raise ValueError("Unknown lecture")
        number = int(lecture_id[3:])
        lectures = {n: lecture for n, lecture in lectures.items() if n == number}
        index = {**index, "lectures": {key: value for key, value in index["lectures"].items()
                                      if value["lecture"] == number}}
    result = ask(request["question"], index=index, lectures=lectures,
                 llm=OpenAILLM(settings.require_key()), model=settings.require_model("answer"))
    # Absolute filesystem paths stay on the server; the web layer supplies media URLs.
    payload = result.to_dict()
    payload.pop("video", None)
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
