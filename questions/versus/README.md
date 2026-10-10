# Versus question banks

120 original practice questions, with **30 different quiz questions per subject**.
The language matches the existing English Versus interface. Every question has
four distinct choices, one correct option, an explanation and a difficulty level.
These are VisCon-authored exercises, not official ETH questions or claimed lecture quotations.

| File | Subject | Questions | Topic groups |
| --- | --- | ---: | ---: |
| [discrete.json](discrete.json) | Discrete Mathematics | 30 | 12 |
| [linear.json](linear.json) | Linear Algebra | 30 | 13 |
| [programming.json](programming.json) | Introduction to Programming / Java | 30 | 11 |
| [ddca.json](ddca.json) | Digital Design & Computer Architecture | 30 | 10 |

`server/questions.ts` loads these private JSON arrays by default. They replace the
old repetitive quiz templates. Existing numeric exercises, Java coding tasks and
the separate DDCA lecture recall bank are preserved, so the in-game total can be
higher than 30. `QUESTION_BANK_PATH` continues to override the default bank; the
existing DDCA course recall registration remains separate from that override.

To edit or add a question, follow [the question contract](../../docs/question-contract.md).
Keep IDs stable and unique. `answer` is one of the option IDs (`o0`–`o3`), not its
text. Difficulty is `foundation`, `standard` or `challenge`. Restart the server
after editing a bank. Run `npm test` to validate the files and answer privacy.

**Keep these files on the server.** They contain answer keys. Do not move them into
`public`, `galaxy`, or a frontend import. The API's `publicQuestion` strips the
answer and explanation until the server closes the round.
