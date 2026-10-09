"""Export each lecture's chapters as video chapter markers.

Per lecture this writes `lecN.json` (a plain list for any frontend) and
`lecN.chapters.vtt` (WebVTT chapters, loadable with
`<track kind="chapters" src="lecN.chapters.vtt">` on a <video> element).
"""
from __future__ import annotations

import json
from pathlib import Path


def vtt_time(seconds: float) -> str:
    ms = round(seconds * 1000)
    h, rest = divmod(ms, 3_600_000)
    m, rest = divmod(rest, 60_000)
    s, ms = divmod(rest, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def chapter_markers(entry: dict) -> list[dict]:
    """Contiguous markers: each chapter runs until the next one starts (no gaps between pauses)."""
    chapters = entry["chapters"]
    markers = []
    for k, c in enumerate(chapters):
        end = chapters[k + 1]["start"] if k + 1 < len(chapters) else max(c["end"], entry["duration"])
        markers.append({"id": c["id"], "start": round(c["start"], 3), "end": round(end, 3), "title": c["title"]})
    return markers


def render_vtt(markers: list[dict]) -> str:
    cues = [
        f"{m['id']}\n{vtt_time(m['start'])} --> {vtt_time(m['end'])}\n{' '.join(m['title'].split())}"
        for m in markers
    ]
    return "WEBVTT\n\n" + "\n\n".join(cues) + "\n"


def export_chapters(index: dict, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for entry in index["lectures"].values():
        n = entry["lecture"]
        markers = chapter_markers(entry)
        data = {"lecture": n, "title": entry["title"], "index_model": entry.get("model"), "chapters": markers}
        json_path, vtt_path = out_dir / f"lec{n}.json", out_dir / f"lec{n}.chapters.vtt"
        json_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        vtt_path.write_text(render_vtt(markers), encoding="utf-8")
        written += [json_path, vtt_path]
    return written
