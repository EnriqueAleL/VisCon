# Folio

A focused PDF workspace styled for the VisCon galaxy with continuous scrolling and selectable text. Opens `ti_book.pdf` by default. Pages automatically fit the available width and height, with a maximum width of 900 CSS pixels. Resizing preserves the reading position. Drop another PDF anywhere to open it. Left/right arrow keys change pages when the document area has focus. Select any text in the document to see it translated in a popover next to the selection. The optional reading companion answers questions about the indexed book and points you at the page.

## Setup

```sh
cd translation
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env            # then add OPENAI_API_KEY and TR_MODEL
.venv/bin/python -m viscon_translate models   # lists the models your key can use
```

## Run

```sh
.venv/bin/python -m viscon_translate serve
```

Visit http://127.0.0.1:8788. This single process serves the viewer, `ti_book.pdf`, the vendored PDF.js assets, and the live `/api/translate` endpoint — no separate static file server needed. No build step. Selected PDFs you drop into the viewer stay in the browser and are never uploaded anywhere; only text you select is sent out, to translate it.

## How translation works

Mirrors the lecture Q&A pipeline in `../qa/`: nothing is invented, everything cheap is cached, and an LLM call only happens when the cache can't answer.

1. **Index (optional, once):** `.venv/bin/python -m viscon_translate index` extracts every page's text with `pypdf`, splits it into paragraphs, and asks the model to translate each page's paragraphs in one call (same order in and out, count-checked, with a per-paragraph fallback if the model ever returns the wrong count). Saved to `data/index.json`, resumable like the lecture index — interrupting and rerunning only translates what's missing. Use `--pages 1 2 3` or `--pdf NAME` to index a subset; `--force` to redo.
2. **Background prefetch:** as each page scrolls into view, the viewer calls `/api/translate-page` in the background (one page at a time, queued — never bursts concurrent calls), which does the same per-page batch translate as step 1 and persists it to `data/index.json`. So revisiting a page you've already read resolves instantly.
3. **Live selection:** when you select text, the exact selected string (plus its page number) is sent to `/api/translate`, which checks, in order: (a) the precomputed index for an exact paragraph match, (b) a small on-disk cache (`data/cache.json`) keyed by the exact text, and only then (c) a fresh model call — which also gets cached.
4. The popover's position comes entirely from the browser's own selection `Range`, never from the model — the model only ever returns translated text.

```sh
.venv/bin/python -m viscon_translate translate "some text"   # ad-hoc translate, for debugging
.venv/bin/python -m viscon_translate index --pages 1 2        # pre-translate just a couple of pages
```

`TR_TARGET_LANG` (default `English`) in `.env` sets the translation language. Paragraph splitting from `pypdf` is a best-effort heuristic (blank-line grouping); it only affects how often a selection hits the precomputed index — arbitrary selections are always translated directly from their own text regardless of paragraph boundaries.

## How "ask about this document" works

Same shape as `qa/`'s lecture Q&A (`index.py`/`ask.py`), at page granularity instead of chapters:

1. **`index-book` (offline, once):** summarizes each page's paragraphs into a title, 1-2 sentence summary and key terms — one LLM call per page, saved to `data/book_index.json`, resumable (`--pages`/`--pdf`/`--force`, same as `index`). This step is required before asking works; it's separate from (and cheaper than) full-book translation.
2. **Ask:** the chat widget sends your question to `/api/ask`. Stage 1: the model reads every indexed page's title/summary/key terms and picks up to 3 candidate pages. Stage 2: the model reads those candidate pages' *raw* (untranslated) paragraphs, must quote verbatim evidence, and names which page it's on. A page number is only trusted if it's one of the candidates actually sent — nothing the model points at wasn't in the prompt, so it can't invent a page. If no page covers the question, it says so instead of guessing.

```sh
.venv/bin/python -m viscon_translate index-book --pages 28 29 30   # summarize a few pages to try it
.venv/bin/python -m viscon_translate ask "how is concatenation of two languages defined?"
```

Only pages that have been through `index-book` are searchable — this intentionally only covers the book, unconnected for now to the separate lecture Q&A in `../qa/`.

## Rendering

PDF.js 5.4.624 is vendored in `vendor/pdfjs`, including its Apache 2.0 license, worker, font resources, character maps, and WebAssembly resources. Only nearby pages render; distant pages retain lightweight placeholders, avoiding full-document canvas memory usage.

Each page uses the same viewport for a raster canvas, a selectable text layer, and a translation overlay that now holds the live popover. The hidden adjacent context region (`.page-context`) is still unused and remains a place for page-linked hints later.

Requires a modern browser supporting JavaScript modules and PDF.js, and Python 3.10+ for the backend.

## Galaxy workspace

Select a course planet, then choose a PDF in its **Dokumente** list. The Informatik course currently contains **Theoretische Informatik**; other courses show an empty state. The document opens as a full-window workspace; **Galaxie** closes it and preserves the camera, course, and lecture. Escape dismisses a translation first, then the question panel, then the workspace. The viewer uses the galaxy fonts and dark colors around the unmodified white pages.

The question panel opens on demand. Dropped/local PDFs support reading and selected-text translation, but document Q&A and background pretranslation are limited to the indexed `ti_book.pdf`; local PDFs are not uploaded. Only selected text is sent for translation.

From the repository root, `npm run dev` and `npm run build` copy the viewer into the app's public assets. Run the Python service separately on port 8788 for translation and book questions. Both development and production route `/translate-api` through the Node app's verified-account guard before forwarding to Python, configured with `TRANSLATION_SERVICE_URL` (default `http://127.0.0.1:8788`). The PDF remains readable when the service is unavailable. The book still needs its `index-book` index for Q&A.

## Course document catalogue

`documents.json` associates each available PDF with a `courseId`, title, kind and stable document ID. Put the PDF in this folder and add an entry to make it available to its course; `npm run dev`/`build` copies all PDFs and the catalogue into the app. Set `indexed` to true after preparing its translation and book indexes. Selecting a list item opens that document, and all translation/Q&A requests carry its filename. There is no global documents button.
