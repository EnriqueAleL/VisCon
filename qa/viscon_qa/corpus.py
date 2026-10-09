"""Discover lectures on disk: `lecN.vtt` (or `.srt`) with an optional `lecN.mp4` next to it."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path

from .transcripts import Line, compact, parse_subtitles

NAME_RE = re.compile(r"lec(\d+)\.(vtt|srt)$", re.IGNORECASE)
VIDEO_EXTS = (".mp4", ".webm", ".mkv", ".mov")


@dataclass
class Lecture:
    number: int
    transcript: Path
    video: Path | None = field(default=None)

    @property
    def title(self) -> str:
        return f"Lecture {self.number}"

    @cached_property
    def lines(self) -> list[Line]:
        content = self.transcript.read_text(encoding="utf-8", errors="replace")
        return compact(parse_subtitles(content), self.number)


def discover(lectures_dir: Path) -> dict[int, Lecture]:
    if not lectures_dir.is_dir():
        raise FileNotFoundError(f"Lectures folder not found: {lectures_dir}")
    lectures: dict[int, Lecture] = {}
    for path in lectures_dir.iterdir():
        m = NAME_RE.fullmatch(path.name)
        if not m:
            continue
        number = int(m.group(1))
        video = next((v for ext in VIDEO_EXTS if (v := path.with_suffix(ext)).exists()), None)
        lectures[number] = Lecture(number, path, video)
    return dict(sorted(lectures.items()))
