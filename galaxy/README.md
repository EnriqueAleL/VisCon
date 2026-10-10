# Lernraum Galaxie

The VisCon course tree as a place you fly through. Courses are planets, lectures are
cities on them, chapters are the lit houses in those cities. One continuous zoom
replaces the usual list-inside-a-list navigation.

## Run

The galaxy reads the live course catalogue, so it runs behind the app server:

```sh
npm run dev      # from the repository root
```

Visit <http://127.0.0.1:5173>. The galaxy is the front page; `/galaxy` is kept as an
alias. It is a plain page — no build step and no external runtime requests; three.js
and the three typefaces are vendored in `vendor/`, and the bundler copies the folder
to `dist/galaxy` untouched rather than running it through the pipeline, which would
return the stylesheet wrapped as a JS module.

The rest of the app sits one link away, in the galaxy's own chrome: `/learn` for
VisCon, `/arena` for Basis Arena, `/world` for the Mania study world (which used to
hold `/`).

## The three levels

| Level | What you see | Comes from |
|---|---|---|
| Galaxy | a planet per course, on its own orbit | the courses |
| Planet | light beams marking cities on the surface | that course's lectures |
| City | lit houses around a plaza | that lecture's chapters |

Click a planet, a beam or a house; or use the list in the panel, which stays in step
with the scene and is fully keyboard-navigable. `Esc` goes up one level.

**Height is data.** A chapter house is as tall as the chapter is long — roughly 2.3
units per minute of running time, so a short recap is visibly shorter than the proof
next to it. City size follows too: the ring, plaza and camera framing all scale with
the chapter count, which runs past 30 on some lectures. The dark blocks further out are scenery and
carry no meaning; only the lit, labelled houses are real chapters.

## Links into the galaxy

Every level has a URL, so a specific chapter can be linked and the browser's back
button walks back up the hierarchy:

```
#/                                    the galaxy
#/linear-algebra                      Lineare Algebra I
#/linear-algebra/vl-7                 Vorlesung 7, as a city
#/linear-algebra/vl-7/kapitel-2       with its second chapter selected
```

Course ids (`linear-algebra`, `analysis`, `informatics`) and episode numbers are the
same ones the web interface uses, so links stay valid across both.

## How the zoom works

Galaxy and planet are the same scene, so moving between them is a real camera dolly —
the planet simply grows and its cities fade in. A planet surface and a city street sit
about four orders of magnitude apart, far enough that holding both in one scene would
cost visible float precision, so landing swaps to a second scene behind a warp (an FOV
punch and a colour flash). The cut is hidden inside the motion and reads as the landing
itself. Taking off reverses it.

## Where everything comes from

`api.js` is the only file that talks to the backend, and it is the same backend the
rest of VisCon uses:

| Call | Builds |
|---|---|
| `GET /api/courses` | the planets, each in its course colour |
| `GET /api/lectures` | a city per lecture, a house per chapter |
| `GET /api/lectures/:id` | the playable recording behind a chapter |
| `POST /api/ask` | the lecture search the question box flies to |

Chapters come from the LLM chapter index in `../qa/`, falling back to raw transcript
segments for a lecture that has not been indexed. Nothing here is hardcoded: at the
time of writing the catalogue serves four courses, 27 lectures and 521 chapters, and
the layout scales to whatever it returns.

## What you can do

- **Fly the tree.** Click a planet, a city beam or a house; or use the panel list,
  which stays in step with the scene and is keyboard-navigable. `Esc` goes up a level.
- **Open a moment.** Clicking a house opens that chapter in the recording, seeked to
  its start — `/media/lectures/...` with byte ranges, so seeking is immediate.
- **Ask.** The box top right runs the lecture Q&A. A hit flies the camera to that
  lecture's city, lands on the chapter that contains the timestamp, and opens it. A
  near miss is labelled as one rather than presented as an answer.

## Files

| File | Role |
|---|---|
| `index.html` | markup and the HUD shell |
| `styles.css` | the HUD, labels, and boot/failure states |
| `api.js` | every call to the backend |
| `app.js` | scene building, camera flights, routing |
| `vendor/three/` | three.js r128 (MIT) |
| `vendor/fonts/` | Chakra Petch, IBM Plex Sans, IBM Plex Mono (OFL 1.1), latin + latin-ext + greek |

Single theme by choice: a galaxy has no light mode, so every colour is painted
explicitly rather than inherited. `prefers-reduced-motion` turns off the ambient
drift and makes every flight instant, which also skips the warp.

Needs a browser with WebGL; without it the page says so instead of showing a blank
canvas.
