"""Parse WebVTT/SRT subtitles and compact them into numbered transcript lines.

Raw subtitle cues are 1-5 s fragments. Merging them into ~25 s lines roughly
halves the tokens an LLM has to read while still giving it fine enough
anchors to point at a precise moment.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass

TIME_RE = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})")
TAG_RE = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class Cue:
    start: float
    end: float
    text: str


@dataclass(frozen=True)
class Line:
    lecture: int
    idx: int
    start: float
    end: float
    text: str

    @property
    def ref(self) -> str:
        return f"L{self.lecture}-{self.idx}"  # not "7:12", which reads like a time


def parse_time(value: str) -> float:
    m = TIME_RE.fullmatch(value.strip())
    if not m:
        raise ValueError(f"Bad timestamp: {value!r}")
    h, mnt, s, frac = m.groups()
    return int(h or 0) * 3600 + int(mnt) * 60 + int(s) + int(frac.ljust(3, "0")) / 1000


def format_time(seconds: float) -> str:
    total = int(seconds)
    h, rest = divmod(total, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def parse_subtitles(content: str) -> list[Cue]:
    """Parse WebVTT or SRT content into cues, ignoring headers, NOTE/STYLE blocks and tags."""
    cues: list[Cue] = []
    for block in re.split(r"\r?\n\s*\r?\n", content.lstrip("﻿")):
        rows = [r for r in block.splitlines() if r.strip()]
        timing = next((i for i, r in enumerate(rows) if "-->" in r), None)
        if timing is None:
            continue
        left, right = rows[timing].split("-->", 1)
        start = parse_time(left)
        end = parse_time(right.split()[0])  # drop cue settings like "align:start"
        text = " ".join(html.unescape(TAG_RE.sub("", r)).strip() for r in rows[timing + 1:])
        text = " ".join(text.split())
        if text and end >= start:
            cues.append(Cue(start, end, text))
    cues.sort(key=lambda c: c.start)
    return cues


def compact(cues: list[Cue], lecture: int, *, max_seconds: float = 25.0, max_gap: float = 5.0) -> list[Line]:
    """Merge consecutive cues into lines of at most ~max_seconds, breaking on long pauses."""
    lines: list[Line] = []
    group: list[Cue] = []

    def flush() -> None:
        if group:
            text = " ".join(c.text for c in group)
            lines.append(Line(lecture, len(lines), group[0].start, group[-1].end, text))
            group.clear()

    for cue in cues:
        if group and (cue.end - group[0].start > max_seconds or cue.start - group[-1].end > max_gap):
            flush()
        group.append(cue)
    flush()
    return lines


def render_lines(lines: list[Line], *, with_lecture: bool = False) -> str:
    """Render lines as `[idx] mm:ss text` (or `[L<lecture>-<idx>]`) for an LLM prompt."""
    label = (lambda l: l.ref) if with_lecture else (lambda l: str(l.idx))
    return "\n".join(f"[{label(l)}] {format_time(l.start)} {l.text}" for l in lines)
