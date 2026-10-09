# How the VisCon Q&A tool works

`qa/` takes the lecture recordings' transcripts and answers three kinds of requests:

| Request | Command | LLM calls |
|---|---|---|
| "When/where did they explain X?" → lecture, timestamp, short answer | `ask` | 2 per question |
| "Summarize lecture N" → study notes with timestamps | `summary` | 1 per lecture, cached |
| Chapter markers for the video player | `chapters` | none (derived from the index) |

All of them build on one artifact: the **chapter index** (`data/index.json`), which is created once.

```
 lectures/lecN.vtt ──► transcript lines ──► [LLM, once per lecture] ──► data/index.json
   (raw subtitles)      (~25 s each,                                       (chapters with
                         numbered)                                          times + summaries)
                                                                                 │
               ┌─────────────────────────────┬───────────────────────────────────┤
               ▼                             ▼                                   ▼
             ask                          summary                            chapters
   index → pick chapters → read       transcript + chapter list      data/chapters/lecN.json
   their lines → point at a line      → study notes                  data/chapters/lecN.chapters.vtt
```

---

## 1. Transcripts → numbered lines (`transcripts.py`, `corpus.py`)

The `.vtt` files contain short subtitle cues of 1–5 seconds each. `corpus.discover()` finds every
`lecN.vtt` in `../lectures/` (plus `lecN.mp4` if it exists). `transcripts.compact()` merges cues
into **lines of at most ~25 seconds**, starting a new line after a pause of more than 5 seconds.

A lecture of ~90 minutes becomes ~240 lines. Each line has a lecture number, an index, start/end
time and text. In prompts a line looks like this:

```
[64] 24:32 So memory is essentially an array of bits ...          (inside one lecture)
[L7-64] 24:32 So memory is essentially an array of bits ...       (when several lectures are mixed)
```

Why lines instead of raw cues: it roughly halves the tokens the LLM has to read, while 25 s is
still precise enough to land on the right moment.

Why `L7-64` and not `7:64`: the colon form looks like a time, and the model then quoted it as a
timestamp in its answers.

## 2. Building the chapter index (`index.py`) — `python -m viscon_qa index`

For each lecture, one LLM call gets the whole transcript (~20–25k tokens) and returns chapters:

```json
{ "start_line": 64,
  "title": "Memory organization: address space, addressability, bytes, and words",
  "summary": "Memory is defined as a bit array ... examples from LC-3, MIPS, and x86-64.",
  "key_terms": ["address space", "byte-addressable memory", "word-addressable memory", "MIPS"] }
```

The prompt asks for chapters that follow real topic changes (typically 3–15 minutes), specific
titles ("Proof that …", "Definition of …"), and correctly spelled terms. The speech recognition
garbles technical words ("exadecimal", "wordeducable"), and the index is where they get fixed.

**The model only returns a line number; the code turns it into a time.** Afterwards the code:
- drops chapters whose line number doesn't exist, and duplicates
- forces the first chapter to start at line 0
- computes `end_line` from the next chapter's start, and looks up `start`/`end` seconds

Stored entry per lecture in `data/index.json`:

```json
"7": { "lecture": 7, "title": "Lecture 7", "duration": 5572.75, "line_count": 243, "model": "gpt-5.5",
       "chapters": [ { "id": "7.6", "title": "...", "summary": "...", "key_terms": [...],
                       "start_line": 64, "end_line": 81, "start": 1472.16, "end": 1883.88 }, ... ] }
```

The file is saved after every lecture, so an interrupted run continues where it stopped.
Lectures that are already indexed are skipped unless `--force` is given. After indexing, the
chapter marker files are exported automatically (section 5).

Current state: all 24 lectures, 512 chapters, built with `gpt-5.5`.

## 3. Answering a question (`ask.py`) — `python -m viscon_qa ask "..."`

Two LLM calls. The first narrows the course down to a few chapters, the second finds the exact line.

**Stage 1: pick chapters.** The model gets the whole chapter index, one row per chapter:

```
7.6 | Lecture 7 | 24:32-31:23 | Memory organization: ... - Memory is defined as ... [address space, ...]
```

and returns up to 3 chapter ids, best first. Because it sees every chapter of the course at
once, it can match questions that use different words than the lecture ("when did they show it
converges" ↔ "proof of convergence"), which a keyword search would miss. If no chapter covers
the topic, it returns an empty list and the tool answers "not found" instead of guessing.

**Stage 2: find the moment.** The code collects the transcript lines of the picked chapters
(plus 3 lines of context on each side) and asks the model for:

| Field | Meaning |
|---|---|
| `evidence` | a verbatim quote where the lecturer talks about the topic, or `""` |
| `found` | whether the evidence really answers the question |
| `start_ref` / `end_ref` | labels of the first and last line of that part, e.g. `L13-104` |
| `answer` | 2–4 sentences answering the question |

`evidence` comes before `found` on purpose: the model has to commit to a quote before deciding.
Without it, it once answered "found" for a topic and then admitted in the text that the topic
wasn't mentioned.

**Checks in code:**
- unknown chapter ids from stage 1 are ignored
- `start_ref` must be one of the labels that were in the prompt, otherwise → not found
- empty `evidence` → not found
- an invalid `end_ref` falls back to the end of the chapter

The playback time is the start of that line minus 3 seconds, so the sentence isn't cut off.
`--open` plays the video from there (VLC if installed, otherwise a small page in the browser).

Example:

```
> python -m viscon_qa ask "when did they explain the Tomasulo algorithm?"
Lecture 13 @ 44:00 - 46:24   (Tomasulo's algorithm and the scheduler-centered pipeline)

They explain the Tomasulo algorithm right after introducing the scheduler ...
```

When nothing is found, the output lists the closest chapters, so the user still has a lead.

## 4. Lecture summaries (`summary.py`) — `python -m viscon_qa summary N`

One call gets the full transcript of the lecture plus its chapter list as a skeleton, and returns:
- an overview
- sections, each naming the chapter ids it covers, with 2–6 concrete points
- key takeaways, including what the lecturer stressed for the exam

The section timestamps come from the chapters in the index, not from the model. The code also
sorts sections by time, because the model doesn't always keep the lecture order.

Results are cached in `data/summaries/lecN.json`. A summary is regenerated automatically when
the lecture was re-indexed with a different model or when the summary model changes. `--force`
regenerates it by hand.

## 5. Chapter markers for the videos (`chapters.py`) — `python -m viscon_qa chapters`

Derived from the index without any LLM call. Per lecture:
- `data/chapters/lecN.json`: `[{id, start, end, title}]` in seconds
- `data/chapters/lecN.chapters.vtt`: WebVTT chapters for `<track kind="chapters">`

Each marker lasts until the next one starts, so a speech pause doesn't leave a gap on the timeline.

---

## Design principles

1. **The LLM never writes a timestamp.** It returns chapter ids or line labels; times are always
   looked up in the transcript, and labels that weren't in the prompt are rejected.
2. **Say "not found" rather than guess.** Empty chapter picks, missing evidence and unknown labels
   all lead to "not found", with the closest chapters as a hint.
3. **Pay once, reuse often.** The expensive reading of whole lectures happens once (index,
   summaries). Questions only read the index and a few chapters.
4. **Provider-independent.** All LLM access goes through `llm.py` (`parse(model, instructions,
   input, schema)` → a validated Pydantic object). Another provider means another class with
   that one method. The tests use a fake one.

## Models and costs

Configured in `qa/.env` (see `.env.example`):

| Setting | Used for | Current |
|---|---|---|
| `QA_INDEX_MODEL` | building the index | `gpt-5.5` |
| `QA_ANSWER_MODEL` | `ask` and `summary` | `gpt-5.4-mini` |

Measured sizes and estimates at OpenAI list prices from October 2026:

| Step | Tokens | Cost |
|---|---|---|
| Index all 24 lectures with `gpt-5.5` | ~600k in | ~$7, once |
| One question with `gpt-5.4-mini` | ~75k in (index), ~5–10k in (chapters) | ~$0.06; ~$0.02 once the index prefix is cached |
| One summary with `gpt-5.4-mini` | ~25k in | ~$0.02–0.03, then cached |

The chapter index is placed *before* the question in the stage 1 prompt, so the identical
prefix can be served from OpenAI's prompt cache on repeated questions.

`python -m viscon_qa models` lists the models your key can use.

## Limitations

- **Transcripts only.** Formulas, diagrams and slide content aren't seen yet; the speech
  recognition also mangles symbols. Indexing the slides/scripts is on the TODO list.
- **The stage 1 prompt grows with the course.** At 24 lectures the index is ~75k tokens. For
  several courses, filter by course first, or put a search step in front of stage 1.
- **Precision is ~25 s.** The answer lands on the right line, and playback starts 3 s before it.
- **No evaluation yet.** Results were checked by hand on a handful of questions; a scored test
  set is on the TODO list.

## Code map

| File | Role |
|---|---|
| `viscon_qa/transcripts.py` | VTT/SRT parsing, merging into lines, prompt rendering, time formatting |
| `viscon_qa/corpus.py` | finds `lecN.vtt` + `lecN.mp4` pairs |
| `viscon_qa/index.py` | indexing prompt, validation, `index.json` read/write |
| `viscon_qa/ask.py` | two-stage question answering |
| `viscon_qa/summary.py` | lecture summaries and their cache |
| `viscon_qa/chapters.py` | chapter marker export (JSON + WebVTT) |
| `viscon_qa/llm.py` | `LLM` protocol and the OpenAI adapter |
| `viscon_qa/config.py` | settings from `.env` |
| `viscon_qa/player.py` | opens a video at a timestamp |
| `viscon_qa/__main__.py` | command line |
| `tests/test_pipeline.py` | offline tests with a fake LLM (`python -m pytest`) |
