# VisCon Q&A

Ask a question about the lectures and get the lecture, the timestamp and a short answer, e.g.
"when did they explain why MIPS is byte addressable?" → `Lecture 7 @ 29:53`.

## How it works

1. **Index (once):** every transcript (`../lectures/lecN.vtt`) is merged into ~25 s numbered lines.
   The LLM reads each lecture and writes a chapter list (title, summary, key terms, start line).
   Saved to `data/index.json`, which costs one LLM call per lecture.
2. **Ask:** the LLM reads the whole chapter index (~75k tokens for 24 lectures) and picks up to 3
   candidate chapters. It then reads those chapters' raw transcript lines and returns the label
   of the line where the answer starts. That's two LLM calls per question.

The model only returns chapter IDs and line labels. Every timestamp comes from the transcript,
and labels that weren't in the prompt are rejected, so the tool can't make up a time.

Full explanation, data formats, design decisions and costs: [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).

## Setup

```sh
cd qa
pip install -r requirements.txt
cp .env.example .env            # then add OPENAI_API_KEY and QA_INDEX_MODEL
python -m viscon_qa models      # lists the models your key can use
```

## Usage

```sh
python -m viscon_qa index --lectures 1 2 3     # start small; omit --lectures for all
python -m viscon_qa ask "when did they explain pipelining hazards?" --open
python -m viscon_qa ask "..." --json           # machine-readable output
python -m viscon_qa summary 7                  # study notes for lecture 7 (cached in data/summaries/)
python -m viscon_qa chapters                   # re-export chapter markers (also done after `index`)
python -m viscon_qa lines 7 --at 29:00         # inspect the compacted transcript
python -m pytest                               # offline tests, no API key needed
```

`--open` plays the video from that moment in VLC if it's installed, otherwise in the browser.
Indexing saves after every lecture, so an interrupted run resumes where it stopped.
`--force` re-indexes lectures that are already in the index.

## Chapter markers for the video player

`data/chapters/` holds two files per lecture:
- `lecN.json`: `[{id, start, end, title}]` in seconds, for any frontend
- `lecN.chapters.vtt`: WebVTT chapters, usable directly on a video element:

```html
<video src="lec7.mp4" controls>
  <track kind="chapters" src="lec7.chapters.vtt" srclang="en" default>
</video>
```

## Code

| File | Role |
|---|---|
| `viscon_qa/transcripts.py` | VTT/SRT parsing, merging into lines, prompt rendering |
| `viscon_qa/corpus.py` | finds `lecN.vtt` + `lecN.mp4` pairs |
| `viscon_qa/index.py` | chapter indexing prompt and `index.json` |
| `viscon_qa/ask.py` | two-stage question answering |
| `viscon_qa/llm.py` | OpenAI adapter (any class with `parse(...)` works) |
| `viscon_qa/player.py` | opens the video at a timestamp |
