"""Serve the PDF viewer and the live translation API from one process.

GET  /, /app.js, /vendor/..., /*.pdf    -> static files, same as the plain
                                            `python3 -m http.server` this replaces.
POST /api/translate {text, page?, pdf?} -> {translation, source}
POST /api/translate-page {page, pdf?}   -> pre-translate a page's paragraphs in the
                                            background so a later matching selection
                                            resolves from the index instead of waiting.
POST /api/ask {question, pdf?}          -> {found, answer, page, candidates}, needs
                                            `index-book` to have been run at least once.
"""
from __future__ import annotations

import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from .ask import ask as ask_question
from .book_index import load_book_index
from .config import ConfigError, load_settings
from .corpus import discover
from .index import ensure_page_translated, load_index
from .llm import OpenAILLM
from .lookup import translate_selection


class InputError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def make_handler(settings, llm):
    documents = discover(settings.pdf_dir)
    default_pdf = next(iter(documents), None)
    # Guards only the final index.json/cache.json read-modify-write per request, never
    # the model call itself -- so concurrent prefetches and a live selection all run
    # their (slow) network requests in parallel and just take turns on the quick save.
    lock = threading.Lock()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(settings.pdf_dir), **kwargs)

        def log_message(self, format, *args) -> None:  # keep stdout to our own lines
            pass

        def _json(self, status: int, value: dict) -> None:
            body = json.dumps(value).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _read_json(self) -> dict:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 16384:
                raise InputError("Request body missing or too large.", 413)
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise InputError("JSON object expected.")
            return payload

        def do_POST(self) -> None:
            # Embedded in the main app these arrive under /translate-api, because the
            # app server owns /api there. Standalone they arrive under /api. Accept both
            # so the viewer can use one path in either place.
            path = self.path
            if path.startswith("/translate-api/"):
                path = "/api/" + path[len("/translate-api/"):]
            try:
                if path == "/api/translate":
                    self._translate()
                elif path == "/api/translate-page":
                    self._translate_page()
                elif path == "/api/ask":
                    self._ask()
                else:
                    self._json(404, {"error": "Not found."})
            except InputError as error:
                self._json(error.status, {"error": str(error)})
            except ConfigError as error:
                self._json(500, {"error": str(error)})
            except ValueError as error:  # e.g. "run index-book first"
                self._json(400, {"error": str(error)})
            except Exception as error:  # model/network failures surface to the caller, not a crash
                self._json(502, {"error": f"Request failed: {error}"})

        def _translate(self) -> None:
            payload = self._read_json()
            if not isinstance(payload.get("text"), str):
                raise InputError("JSON object with a 'text' string is required.")
            page = payload.get("page")
            if page is not None and not isinstance(page, int):
                raise InputError("page must be an integer.")
            pdf_name = payload.get("pdf") or default_pdf
            result = translate_selection(
                payload["text"], index=load_index(settings.index_path), cache_path=settings.cache_path,
                llm=llm, model=settings.require_model(), target_lang=settings.target_lang,
                pdf_name=pdf_name, page=page, lock=lock,
            )
            self._json(200, result)

        def _translate_page(self) -> None:
            payload = self._read_json()
            page = payload.get("page")
            if not isinstance(page, int) or page < 1:
                raise InputError("page must be a positive integer.")
            pdf_name = payload.get("pdf") or default_pdf
            document = documents.get(pdf_name)
            if document is None:
                raise InputError("Unknown PDF.", 404)
            ensure_page_translated(
                llm, settings.require_model(), settings.target_lang, document, page,
                settings.index_path, lock=lock,
            )
            self._json(200, {"status": "ready"})

        def _ask(self) -> None:
            payload = self._read_json()
            if not isinstance(payload.get("question"), str):
                raise InputError("JSON object with a 'question' string is required.")
            pdf_name = payload.get("pdf") or default_pdf
            document = documents.get(pdf_name)
            if document is None:
                raise InputError("Unknown PDF.", 404)
            result = ask_question(
                payload["question"], book_index=load_book_index(settings.book_index_path),
                document=document, llm=llm, model=settings.require_model(),
            )
            self._json(200, result.to_dict())

    return Handler


def serve() -> None:
    settings = load_settings()
    llm = OpenAILLM(settings.require_key())
    settings.require_model()
    handler = make_handler(settings, llm)
    server = ThreadingHTTPServer((settings.host, settings.port), handler)
    print(f"Folio translation server: http://{settings.host}:{settings.port}/")
    print(f"Translating selections into {settings.target_lang} with {settings.model}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
