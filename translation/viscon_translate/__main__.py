"""Command line: `python -m viscon_translate {index,index-book,serve,translate,ask,models}`."""
from __future__ import annotations

import argparse
import json
import sys

from . import corpus
from .ask import ask as ask_question
from .book_index import build_book_index, load_book_index
from .config import ConfigError, load_settings
from .index import build_index, load_index
from .llm import OpenAILLM
from .lookup import translate_selection
from .server import serve as run_server


def _select_documents(args, settings):
    documents = corpus.discover(settings.pdf_dir)
    if args.pdf:
        missing = sorted(set(args.pdf) - set(documents))
        if missing:
            raise ConfigError(f"No such PDF(s) in {settings.pdf_dir}: {missing}")
        documents = {name: documents[name] for name in args.pdf}
    return documents


def cmd_index(args, settings) -> None:
    documents = _select_documents(args, settings)
    llm = OpenAILLM(settings.require_key())
    build_index(
        llm, settings.require_model(), settings.target_lang, documents.values(),
        settings.index_path, force=args.force, only_pages=set(args.pages) if args.pages else None,
    )
    print(f"Index saved to {settings.index_path}")


def cmd_index_book(args, settings) -> None:
    documents = _select_documents(args, settings)
    llm = OpenAILLM(settings.require_key())
    build_book_index(
        llm, settings.require_model(), documents.values(),
        settings.book_index_path, force=args.force, only_pages=set(args.pages) if args.pages else None,
    )
    print(f"Book index saved to {settings.book_index_path}")


def cmd_serve(args, settings) -> None:
    run_server()


def cmd_translate(args, settings) -> None:
    llm = OpenAILLM(settings.require_key())
    result = translate_selection(
        args.text, index=load_index(settings.index_path), cache_path=settings.cache_path,
        llm=llm, model=settings.require_model(), target_lang=settings.target_lang,
        pdf_name=args.pdf, page=args.page,
    )
    print(result["translation"])


def cmd_ask(args, settings) -> None:
    documents = corpus.discover(settings.pdf_dir)
    pdf_name = args.pdf or next(iter(documents), None)
    document = documents.get(pdf_name) if pdf_name else None
    if document is None:
        raise ConfigError(f"No such PDF in {settings.pdf_dir}: {args.pdf!r}")
    llm = OpenAILLM(settings.require_key())
    result = ask_question(
        args.question, book_index=load_book_index(settings.book_index_path), document=document,
        llm=llm, model=settings.require_model(),
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
    elif result.found:
        print(f"\nPage {result.page}\n")
        print(result.answer)
    else:
        print(f"\nNot found. {result.answer}")
        if result.candidates:
            print("\nClosest pages:")
            for c in result.candidates:
                print(f"  Page {c.page}  {c.title}")


def cmd_models(args, settings) -> None:
    print("\n".join(OpenAILLM(settings.require_key()).list_models()))


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="viscon_translate", description="Translate selected PDF text.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("index", help="pre-translate every page (calls the LLM once per page)")
    p.add_argument("--pdf", nargs="+", metavar="NAME", help="only these PDFs (filenames)")
    p.add_argument("--pages", type=int, nargs="+", metavar="N", help="only these page numbers")
    p.add_argument("--force", action="store_true", help="re-translate pages that are already indexed")
    p.set_defaults(func=cmd_index)

    p = sub.add_parser("index-book", help="summarize every page for Q&A retrieval (calls the LLM once per page)")
    p.add_argument("--pdf", nargs="+", metavar="NAME", help="only these PDFs (filenames)")
    p.add_argument("--pages", type=int, nargs="+", metavar="N", help="only these page numbers")
    p.add_argument("--force", action="store_true", help="re-summarize pages that are already indexed")
    p.set_defaults(func=cmd_index_book)

    p = sub.add_parser("serve", help="run the viewer and the live translation/ask API")
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("translate", help="translate a snippet of text (for debugging)")
    p.add_argument("text")
    p.add_argument("--pdf", metavar="NAME")
    p.add_argument("--page", type=int)
    p.set_defaults(func=cmd_translate)

    p = sub.add_parser("ask", help="ask where/what something is covered in the book (needs index-book first)")
    p.add_argument("question")
    p.add_argument("--pdf", metavar="NAME")
    p.add_argument("--json", action="store_true", help="print the result as JSON")
    p.set_defaults(func=cmd_ask)

    p = sub.add_parser("models", help="list the models your API key can use")
    p.set_defaults(func=cmd_models)

    args = parser.parse_args(argv)
    try:
        args.func(args, load_settings())
    except (ConfigError, FileNotFoundError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
