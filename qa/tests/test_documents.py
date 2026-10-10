"""Offline tests for PDF text extraction and removing a lecture from an index."""
import json
from pathlib import Path

import pytest

from viscon_qa.__main__ import main
from viscon_qa.documents import DocumentError, MAX_PAGES, extract_pdf, save_document
from viscon_qa.index import load_index, remove_lectures, save_index


def make_pdf(pages: list[str]) -> bytes:
    """A minimal, valid PDF with one line of text per page (hand-built so no PDF library is needed to test)."""
    objects: list[bytes] = []
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(len(pages)))
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
    font = 3 + 2 * len(pages)
    for i, text in enumerate(pages):
        stream = f"BT /F1 18 Tf 40 700 Td ({text}) Tj ET".encode()
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {4 + 2 * i} 0 R /Resources << /Font << /F1 {font} 0 R >> >> >>".encode())
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def test_text_is_extracted_per_page(tmp_path: Path):
    pdf = tmp_path / "script.pdf"
    pdf.write_bytes(make_pdf(["Pipelining overlaps instruction phases", "A load-use hazard needs one bubble"]))
    data = extract_pdf(pdf)
    assert data["page_count"] == 2 and data["pages_with_text"] == 2
    assert [p["page"] for p in data["pages"]] == [1, 2]
    assert "Pipelining overlaps instruction phases" in data["pages"][0]["text"]
    assert "load-use hazard" in data["pages"][1]["text"]


def test_a_page_without_text_is_kept_but_a_document_without_any_text_is_rejected(tmp_path: Path):
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    scan = tmp_path / "scan.pdf"
    with scan.open("wb") as handle:
        writer.write(handle)
    with pytest.raises(DocumentError, match="no extractable text"):
        extract_pdf(scan)

    mixed = tmp_path / "mixed.pdf"
    mixed.write_bytes(make_pdf(["Real text here", ""]))
    data = extract_pdf(mixed)
    assert data["page_count"] == 2 and data["pages_with_text"] == 1 and data["pages"][1]["text"] == ""


def test_broken_and_hostile_files_fail_cleanly(tmp_path: Path):
    for name, content in {"junk.pdf": b"this is not a pdf at all", "empty.pdf": b"", "trunc.pdf": make_pdf(["x"])[:40]}.items():
        path = tmp_path / name
        path.write_bytes(content)
        with pytest.raises(DocumentError):
            extract_pdf(path)
    with pytest.raises(DocumentError):
        extract_pdf(tmp_path / "missing.pdf")


def test_encrypted_pdf_is_refused(tmp_path: Path):
    from pypdf import PdfReader, PdfWriter

    source = tmp_path / "plain.pdf"
    source.write_bytes(make_pdf(["secret"]))
    writer = PdfWriter(clone_from=PdfReader(str(source)))
    writer.encrypt("hunter2")
    locked = tmp_path / "locked.pdf"
    with locked.open("wb") as handle:
        writer.write(handle)
    with pytest.raises(DocumentError, match="password"):
        extract_pdf(locked)


def test_cli_extract_writes_json_and_reports_errors(tmp_path: Path, capsys, monkeypatch):
    monkeypatch.setenv("QA_INDEX_PATH", str(tmp_path / "qa" / "index.json"))
    pdf = tmp_path / "slides.pdf"
    pdf.write_bytes(make_pdf(["Cache associativity"]))
    out = tmp_path / "qa" / "documents" / "abc.json"
    assert main(["extract", str(pdf), str(out)]) == 0
    assert json.loads(out.read_text(encoding="utf-8"))["pages"][0]["text"] == "Cache associativity"
    junk = tmp_path / "junk.pdf"
    junk.write_bytes(b"nope")
    assert main(["extract", str(junk), str(tmp_path / "x.json")]) == 1
    assert "could not be read" in capsys.readouterr().err
    assert not (tmp_path / "x.json").exists()


def test_save_document_is_atomic(tmp_path: Path):
    out = tmp_path / "deep" / "doc.json"
    save_document({"version": 1, "pages": []}, out)
    assert json.loads(out.read_text()) == {"version": 1, "pages": []}
    assert not list(out.parent.glob("*.tmp"))


def test_removing_a_lecture_deletes_its_index_entry_markers_and_summary(tmp_path: Path):
    index = tmp_path / "qa" / "index.json"
    save_index(index, {"version": load_index(tmp_path / "none.json")["version"], "lectures": {"3": {"lecture": 3}, "4": {"lecture": 4}}})
    for name in ("chapters/lec3.json", "chapters/lec3.chapters.vtt", "summaries/lec3.json", "chapters/lec4.json"):
        target = index.parent / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("{}")
    assert remove_lectures(index, [3, 99]) == [3]
    assert list(load_index(index)["lectures"]) == ["4"]
    assert not (index.parent / "chapters/lec3.json").exists() and not (index.parent / "summaries/lec3.json").exists()
    assert (index.parent / "chapters/lec4.json").exists()
    assert remove_lectures(index, [3]) == []
