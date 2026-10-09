"""Open a lecture video at a given second: VLC if installed, otherwise the default browser."""
from __future__ import annotations

import html
import os
import shutil
import subprocess
import tempfile
import webbrowser
from pathlib import Path

VLC_PATHS = [
    r"C:\Program Files\VideoLAN\VLC\vlc.exe",
    r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
    "/Applications/VLC.app/Contents/MacOS/VLC",
]


def find_vlc() -> str | None:
    return shutil.which("vlc") or next((p for p in VLC_PATHS if os.path.exists(p)), None)


def open_at(video: Path, seconds: float, title: str = "") -> str:
    """Start playback and return a short description of how it was opened."""
    video = video.resolve()
    if vlc := find_vlc():
        subprocess.Popen([vlc, f"--start-time={int(seconds)}", str(video)])
        return "VLC"
    page = Path(tempfile.gettempdir()) / "viscon_player.html"
    page.write_text(
        "<!doctype html><meta charset='utf-8'>"
        f"<title>{html.escape(title or video.name)}</title>"
        "<body style='margin:0;background:#000;display:grid;place-items:center;height:100vh'>"
        f"<video src='{video.as_uri()}#t={int(seconds)}' controls autoplay "
        "style='max-width:100%;max-height:100vh'></video>",
        encoding="utf-8",
    )
    webbrowser.open(page.as_uri())
    return "browser"
