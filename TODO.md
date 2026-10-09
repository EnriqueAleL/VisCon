# TODO

## Show chapter timestamps on the videos
`qa/data/chapters/` has the chapters of every lecture, generated from the transcript index:
`lecN.json` (`[{id, start, end, title}]`, seconds) and `lecN.chapters.vtt` (WebVTT chapters).
- [ ] Show them in the video player: markers on the timeline and a clickable chapter list.
      Plain `<video>` needs `<track kind="chapters" src="lecN.chapters.vtt">` plus a player that
      renders chapters (e.g. Video.js, Plyr), or a custom list built from the JSON.
- [ ] Use them in `web-interface/` instead of the made-up example data.

## Index the slides / scripts and match them to the transcript
Courses come as PDF scripts, LaTeX, or slide decks (one per lecture or one for the whole course).
- [ ] Convert everything to PDF (compile LaTeX, export PPTX) so there is one ingestion path.
- [ ] Extract text per page / slide, keeping the page or slide number.
- [ ] Match slides to transcript chapters: which slides each chapter (`qa/data/index.json`)
      covers, e.g. by letting the LLM assign page ranges per chapter, or by comparing text.
- [ ] Use the slides in answers and summaries: cite "Lecture 7 @ 29:53, slide 23", and use the
      slide text to fix formulas and terms the speech recognition got wrong.

## Also open
- [ ] Test set: 15-20 questions with known lecture + time, and a script that scores `ask`.
- [ ] Quiz mode ("ask me questions about ...").
- [ ] Lecture dates: map dates to lecture numbers so "the lecture on <date>" works.
- [ ] Small HTTP API around `qa/` so the frontend can call ask / summary.
