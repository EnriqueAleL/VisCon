"""Extract PDF pages into paragraphs: pypdf text extraction, split on blank lines.

PDF text extraction has no reliable concept of a sentence or paragraph boundary, so a
paragraph here is a best-effort grouping of consecutive non-blank lines. That's good
enough as a unit to pre-translate for the on-disk cache; an arbitrary user selection is
always translated directly from its own text and never depends on this grouping lining
up with what was actually selected.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

logging.getLogger("pypdf").setLevel(logging.ERROR)  # font-substitution notices, not errors


@dataclass(frozen=True)
class Paragraph:
    page: int
    idx: int
    text: str

    @property
    def ref(self) -> str:
        return f"P{self.page}-{self.idx}"


def extract_pages(path: Path) -> list[str]:
    """Raw extracted text per page, in page order."""
    reader = PdfReader(str(path))
    return [page.extract_text() or "" for page in reader.pages]


def paragraphs_from_text(text: str, page: int) -> list[Paragraph]:
    paragraphs = []
    for block in re.split(r"\n\s*\n", text.strip()):
        collapsed = " ".join(block.split())
        if collapsed:
            paragraphs.append(Paragraph(page, len(paragraphs), collapsed))
    return paragraphs
