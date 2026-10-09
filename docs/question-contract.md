# Question import contract v1

The parser produces a UTF-8 JSON array. The server owns this file. The browser receives only the public question for the current round; answers, numeric tolerances, explanations and hidden tests are stripped until the appropriate reveal.

| Field | Meaning |
| --- | --- |
| `id` | Unique stable string; changing the question meaning should create a new ID |
| `subject` | Course identifier; existing demo identifiers are `discrete`, `linear`, `programming` |
| `topic` | Human-readable topic used by the lobby filter |
| `title`, `prompt` | English or source-language text; prompt supports line breaks |
| `formula` | Optional KaTeX expression, rendered with `trust: false` |
| `format` | `quiz`, `numeric`, or `java` |
| `difficulty` | `foundation`, `standard`, or `challenge`; `mixed` is a lobby filter |
| `source` | Honest source label or lecture reference shown to the player |
| `explanation` | Private until the round ends; explanatory text |

Quiz: provide `options: [{id, text}, ...]` and `answer` equal to the ID of exactly one correct option. Option IDs must be unique. There are at least two options. This version does not grade multiple selections.

Numeric: `answer` is a finite JSON number. Optional `tolerance` is a finite nonnegative absolute tolerance, default zero. Optional `unit` is displayed next to the answer input; players enter only the numerical magnitude in that unit. Decimal commas, decimal points and scientific notation are accepted. Arbitrary expressions, fractions and unit conversion are not supported yet.

Java: `starter` contains a complete or incomplete Java program using `public class Main`. `examples` contains public `{input, output}` string pairs. `tests` contains private pairs in the same format, with at least one test. `answer` is an explanatory label such as `Pass every test`. The player supplies the whole source file. The runner compiles and runs each test; every private test must pass for the round to earn 1,000 points. Hidden inputs and outputs are never sent to the player. Runner errors are distinct from wrong answers.

In this first version the host selects round count and time in the lobby; the parser need not calculate match duration or Elo. Each correct response earns 1,000 match points. Both players get the same shuffled selection, without repeating a question in a match. Unsupported formats, duplicate IDs and invalid answer specifications stop the server import with an error.

The current validator verifies shape and answer consistency; it cannot verify that an explanation or answer is academically correct. The content pipeline should review the generated questions before adding them to the active bank. Preserve provenance in `source`. Suggested future metadata: schema version, question revision, lecture timestamp, review state and per-question recommended time. Those extensions require an explicit adapter change.

Use `examples/questions.json` as a minimal import fixture. New rooms choose a format available for the selected subject and reduce their initial round count to fit a small bank. The TypeScript contracts are in `shared/types.ts` (`BankQuestion` for private imports and `Question` for live client data).
