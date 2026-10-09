"""Command line: `python -m viscon_qa {index,ask,lines,models}`."""
from __future__ import annotations

import argparse
import json
import sys

from . import corpus
from .ask import ask
from .chapters import export_chapters
from .config import ConfigError, load_settings
from .index import build_index, load_index
from .llm import OpenAILLM
from .player import open_at
from .summary import get_summary, render_summary
from .transcripts import format_time, parse_time, render_lines


def cmd_index(args, settings) -> None:
    lectures = corpus.discover(settings.lectures_dir)
    if args.lectures:
        missing = sorted(set(args.lectures) - set(lectures))
        if missing:
            raise ConfigError(f"No transcript for lecture(s): {missing}")
        lectures = {n: lectures[n] for n in args.lectures}
    llm = OpenAILLM(settings.require_key())
    index = build_index(llm, settings.require_model("index"), lectures.values(), settings.index_path, force=args.force)
    print(f"Index saved to {settings.index_path}")
    export_chapters(index, settings.index_path.parent / "chapters")
    print(f"Chapter markers saved to {settings.index_path.parent / 'chapters'}")


def cmd_chapters(args, settings) -> None:
    written = export_chapters(load_index(settings.index_path), settings.index_path.parent / "chapters")
    print(f"Wrote {len(written)} files to {settings.index_path.parent / 'chapters'}")


def cmd_ask(args, settings) -> None:
    llm = OpenAILLM(settings.require_key())
    result = ask(
        args.question,
        index=load_index(settings.index_path),
        lectures=corpus.discover(settings.lectures_dir),
        llm=llm,
        model=settings.require_model("answer"),
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
    elif result.found:
        print(f"\nLecture {result.lecture} @ {format_time(result.start)} - {format_time(result.end)}"
              f"   ({result.chapter})\n")
        print(result.answer)
    else:
        print(f"\nNot found. {result.answer}")
        if result.candidates:
            print("\nClosest chapters:")
            for c in result.candidates:
                print(f"  Lecture {c.lecture} @ {format_time(c.start)}  {c.title}")
    if args.open and result.found:
        if result.video:
            how = open_at(result.video, result.start, f"Lecture {result.lecture}")
            print(f"\nOpened in {how}.")
        else:
            print("\nNo video file for this lecture.")


def cmd_summary(args, settings) -> None:
    lecture = corpus.discover(settings.lectures_dir).get(args.lecture)
    if lecture is None:
        raise ConfigError(f"No transcript for lecture {args.lecture}")
    entry = load_index(settings.index_path)["lectures"].get(str(args.lecture))
    if entry is None:
        raise ConfigError(f"Lecture {args.lecture} isn't indexed yet. Run `index --lectures {args.lecture}` first.")
    llm = OpenAILLM(settings.require_key())
    summary = get_summary(
        llm, settings.require_model("answer"), lecture, entry,
        settings.index_path.parent / "summaries", force=args.force,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False) if args.json else render_summary(summary))


def cmd_lines(args, settings) -> None:
    lecture = corpus.discover(settings.lectures_dir).get(args.lecture)
    if lecture is None:
        raise ConfigError(f"No transcript for lecture {args.lecture}")
    start = parse_time(args.at + ".000") if args.at else 0.0
    lines = [l for l in lecture.lines if l.end >= start][: args.count]
    print(render_lines(lines))


def cmd_models(args, settings) -> None:
    print("\n".join(OpenAILLM(settings.require_key()).list_models()))


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="viscon_qa", description="Find moments in lecture videos.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("index", help="build the chapter index (calls the LLM once per lecture)")
    p.add_argument("--lectures", type=int, nargs="+", metavar="N", help="only these lectures")
    p.add_argument("--force", action="store_true", help="re-index lectures that are already indexed")
    p.set_defaults(func=cmd_index)

    p = sub.add_parser("ask", help="ask where/when something happens in the lectures")
    p.add_argument("question")
    p.add_argument("--open", action="store_true", help="open the video at the found moment")
    p.add_argument("--json", action="store_true", help="print the result as JSON")
    p.set_defaults(func=cmd_ask)

    p = sub.add_parser("chapters", help="export chapter markers per lecture (JSON + WebVTT); no LLM calls")
    p.set_defaults(func=cmd_chapters)

    p = sub.add_parser("summary", help="summarize a lecture (cached in data/summaries/)")
    p.add_argument("lecture", type=int)
    p.add_argument("--force", action="store_true", help="regenerate even if a cached summary exists")
    p.add_argument("--json", action="store_true", help="print the result as JSON")
    p.set_defaults(func=cmd_summary)

    p = sub.add_parser("lines", help="print a lecture's compacted transcript (for debugging)")
    p.add_argument("lecture", type=int)
    p.add_argument("--at", metavar="MM:SS", help="start from this time")
    p.add_argument("--count", type=int, default=40)
    p.set_defaults(func=cmd_lines)

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
