# VisCon Design System

One visual system for the whole repository: the learning world, Arena, Lectures, Campus, and the
standalone video demonstration. This replaces the earlier light/plum Arena and
the separate green/blue lecture interfaces.

## Direction

Modern SaaS B2B, influenced by the direct matchup workflow of
[NeetCode Versus](https://neetcode.io/versus). The product opens into useful work:
match configuration in Arena and course selection/search in Lectures. No
marketing hero precedes these workflows.

Use charcoal neutrals, readable Inter typography, compact controls, fine borders,
and a restrained green action accent. The design supports repeated study sessions:
questions, video moments, settings, opponents, and results take priority over
decoration. A common VisCon header identifies the active module.

## Source Of Truth

| File                              | Responsibility                                                          |
| --------------------------------- | ----------------------------------------------------------------------- |
| `shared/design/tokens.css`        | Semantic colors, font stacks, corners, header dimensions                |
| `shared/design/fonts.css`         | Local Inter font faces, weights 400/500/600/700                         |
| `shared/design/fonts/`            | WOFF2 assets and the Inter license                                      |
| `shared/design/base.css`          | Shared reset, typography, focus, scrollbar, product header              |
| `shared/design/ProductHeader.tsx` | Shared React navigation shell                                           |
| `src/styles.css`                  | Arena layouts, rooms, matches, results, tables, profile, editor         |
| `src/mania/*.css`                 | Learning world, recall, study tables, puzzles, and teaching visualizers |
| `web-interface/src/styles.css`    | Lecture navigation, search, library, picker, player                     |
| `video-pull-up/demo/demo.css`     | Standalone video demonstration layout                                   |
| `src/GlobeArrival.css`            | Campus imagery and scene-specific overlays                              |

React applications import shared styles through their CSS entry points. The
standalone demonstration imports `/design/base.css`; its server serves only the
explicitly allowed shared CSS/font assets. Fonts require no external CDN.

New UI must reuse these tokens and existing controls. Do not introduce a second
palette, independent font imports, decorative panel shadows, or unrelated
navigation styling. Satellite imagery, map shading, and code syntax highlighting
are content-specific exceptions, not alternative interface themes.

## Color

| Token              | Value     | Use                                          |
| ------------------ | --------- | -------------------------------------------- |
| `--ground`         | `#111315` | Page and editor canvas                       |
| `--surface`        | `#191c1f` | Header, inputs, repeated items, dialogs      |
| `--surface-raised` | `#22262a` | Secondary surfaces and media placeholders    |
| `--surface-hover`  | `#292e33` | Neutral hover state                          |
| `--ink`            | `#edf0f3` | Primary text                                 |
| `--muted`          | `#a5adb7` | Secondary text                               |
| `--subtle`         | `#818b97` | Low-priority labels and placeholders         |
| `--line`           | `#30363d` | Separators                                   |
| `--line-strong`    | `#454e58` | Input boundaries                             |
| `--accent`         | `#69c49a` | Primary actions, selected states, time links |
| `--accent-hover`   | `#86d8b0` | Primary hover and focus                      |
| `--accent-ink`     | `#101e17` | Text on green buttons                        |
| `--accent-soft`    | `#1c3229` | Selected item background                     |
| `--danger`         | `#ed9494` | Errors and losses                            |
| `--ochre`          | `#e1bc7b` | Opponent and warning context                 |
| `--info`           | `#9bbde1` | Informational context                        |

Status colors always have a label or icon. Use dark ink on accent-filled controls,
not white text. Normal content text should meet a 4.5:1 contrast ratio. Dimmed
disabled controls are not normal text. Avoid turning every surface green.

## Typography And Geometry

- Inter is the shared interface font. Java uses the shared monospace stack;
  formulas retain KaTeX's domain-specific faces.
- Body text is 14px, compact controls 12-13px, labels 11-12px, panel titles 16-18px,
  and page titles 28px. True immersive Campus headings may use 36-48px.
- Ordinary weights are 400, 500, and 600. Letter spacing is zero. Do not scale
  font size continuously with viewport width.
- Use tabular numerals for scores, ratings, clocks, and comparable numbers.
- Spacing follows a 4px rhythm: 8, 12, 16, 24, 32, and 40px.
- Controls use 6px corners; repeated items and dialogs use at most 8px. Circular
  radio indicators, status dots, and the Earth are functional exceptions.
- Controls have stable dimensions. Buttons are typically 36-40px high; icon
  buttons are square, labeled for assistive technology, and have hover titles.
- Shadows belong only to overlays. Ordinary sections are unframed layouts or
  full-width bands, not floating cards. Do not nest cards inside cards.

## Surface Rules

**Learning world:** The concurrent Mania frontend at `/` uses the same header,
neutral surfaces, controls, and Inter as the other modules. Its knowledge map and
teaching diagrams retain their content-specific geometry. Surrounding workspaces
and visualizer controls use the common compact system, not separate cyan/lime
themes. Arena remains available at `/arena`.

**Arena:** Immediate subject selection and matchup preview, with a separate
join-room area. Lobby settings, invitations, and readiness remain visible.
During matches, paired score/progress strips and a stable mobile timer support
the question. Results and history use compact summaries and comparable tables.

**Lectures:** Same header and neutrals, with a narrow icon rail for course/chat
context. Course selection keeps the year/semester/study-year structure. Search
answers, citations, and lecture thumbnails remain genuine content. The player
uses native video controls and the same timestamp, tab, bookmark, and dialog
styles. Missing recording files have an explicit fallback, not a fake player.

**Campus:** The preserved satellite journey lives at `/campus`, separate from the
work-first Arena screen. Its scene is full width, with shared type and controls.
Image attribution remains visible. Reduced motion and unavailable-tile fallbacks
remain supported.

**Video demo:** Same header, type, fields, buttons, status colors, and media
surfaces as the connected app. Retrieval and playback behavior remain unchanged.

## Responsive And Accessible

The header is 64px on desktop and 100px below 650px, with navigation on a second
row. Desktop workspaces use restrained content widths; mobile stacks columns.
Tables, code, and long navigation scroll locally instead of widening the page.
Text wraps within its own element and never overlaps adjacent controls.

Keep visible keyboard focus, labeled form controls, dialog focus handling,
native playback controls, reduced-motion support, and non-color status cues.
Do not hide a live match timer while the user scrolls to their answer.

## Verification

```sh
npm test
npm run build
npm run test:ui
cd web-interface
npm run build
```

The browser suite covers both connected applications at desktop and mobile
sizes. It checks match flows, contrast, overflow, course selection, search,
bookmarks, native demo-video playback, and timestamp seeking. Large imported
recordings require `git lfs pull`; without them the suite checks the explicit
missing-video fallback while still checking playback against the bundled demos.

The standalone demonstration also has
`video-pull-up/scripts/verify-browser.mjs`. Browser reports/screenshots go into
`.impeccable/review/` or `video-pull-up/artifacts/`, not production assets.
