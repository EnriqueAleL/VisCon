"""Discover translatable PDFs on disk: every `*.pdf` in the translation folder."""
from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

from .pdf_text import Paragraph, extract_pages, paragraphs_from_text


@dataclass
class Document:
    name: str
    path: Path

    @cached_property
    def pages(self) -> list[list[Paragraph]]:
        """Paragraphs per page, 0-indexed list; `Paragraph.page` inside is 1-indexed."""
        return [paragraphs_from_text(text, number + 1) for number, text in enumerate(extract_pages(self.path))]


def discover(pdf_dir: Path) -> dict[str, Document]:
    if not pdf_dir.is_dir():
        raise FileNotFoundError(f"PDF folder not found: {pdf_dir}")
    return {path.name: Document(path.name, path) for path in sorted(pdf_dir.glob("*.pdf"))}
