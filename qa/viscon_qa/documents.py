"""Plain-text extraction from course PDFs (slides, scripts): one entry per page, no LLM involved.

The output is the raw material for citing "script p. 23" and, later, for matching pages to lecture chapters.
PDFs come from students, so the input is treated as untrusted: size caps here, and `limit_resources` in the CLI.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

MAX_PAGES = 3000
MAX_CHARS = 5_000_000
DOCUMENT_VERSION = 1


class DocumentError(Exception):
    """The PDF cannot be used (encrypted, empty, scanned images only, absurdly large, ...)."""


def _clean(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r"[ ]*\n[ ]*", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract_pdf(path: Path) -> dict:
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(str(path), strict=False)
        if reader.is_encrypted and not reader.decrypt(""):
            raise DocumentError("The PDF is password protected.")
        page_count = len(reader.pages)
    except DocumentError:
        raise
    except (PyPdfError, OSError, ValueError, KeyError, RecursionError) as error:
        raise DocumentError(f"The PDF could not be read: {type(error).__name__}.") from error
    if page_count == 0:
        raise DocumentError("The PDF has no pages.")
    if page_count > MAX_PAGES:
        raise DocumentError(f"The PDF has {page_count} pages; the limit is {MAX_PAGES}.")

    pages, total = [], 0
    for number, page in enumerate(reader.pages, start=1):
        try:
            text = _clean(page.extract_text() or "")
        except Exception:  # one damaged page must not lose the rest of the document
            text = ""
        total += len(text)
        if total > MAX_CHARS:
            raise DocumentError("The PDF contains too much text to index.")
        pages.append({"page": number, "text": text})

    with_text = sum(1 for p in pages if p["text"])
    if with_text == 0:
        raise DocumentError("The PDF has no extractable text (is it a scan of images?).")
    return {"version": DOCUMENT_VERSION, "page_count": page_count, "pages_with_text": with_text, "chars": total, "pages": pages}


def save_document(data: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(out)


def limit_resources(memory_mb: int = 2048, cpu_seconds: int = 180) -> None:
    """Best effort on Linux/macOS: a hostile PDF cannot use more than this much memory or CPU time."""
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (memory_mb * 1024 * 1024, memory_mb * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
    except (ImportError, ValueError, OSError):
        pass
