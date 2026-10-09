---
name: Basis Arena
description: A light Campus scorebook for shared study and friendly competition.
colors:
  ground: "#f3f5fa"
  surface: "#ffffff"
  ink: "#29264b"
  plum: "#29264b"
  accent: "#6b54ad"
  accent-hover: "#594392"
  focus: "#a48bce"
  muted: "#685d75"
  line: "#dde0ea"
  success: "#267465"
  danger: "#9a4555"
  ochre: "#a2692d"
  nav-active: "#c6b7ed"
  nav-label: "#cdc8de"
  field-border: "#d4d7e2"
  secondary-border: "#d7d4e2"
  secondary-hover: "#f6f3fc"
  lavender-wash: "#e9e4f3"
  badge-ink: "#68547d"
  format-selected: "#f5f1fc"
  player-wash: "#e9e3f6"
  player-ink: "#5d458d"
  opponent-wash: "#f5e8d9"
  opponent-ink: "#885924"
typography:
  display:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "44px"
    fontWeight: 750
    lineHeight: 1.14
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "36px"
    fontWeight: 750
    lineHeight: 1.18
    letterSpacing: "-0.03em"
  question:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "26px"
    fontWeight: 740
    lineHeight: 1.28
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "20px"
    fontWeight: 740
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
  button:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.5
  nav:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "13px"
    fontWeight: 550
    lineHeight: 1.5
  badge:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.5
  score:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "30px"
    fontWeight: 680
    lineHeight: 1.5
    letterSpacing: "-0.03em"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
rounded:
  tag: "4px"
  control: "6px"
  choice: "7px"
  readiness: "10px"
  panel: "12px"
  badge: "20px"
  avatar: "50%"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "28": "28px"
  "32": "32px"
  "40": "40px"
  "64": "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    padding: "3px 0"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "47px"
    width: "100%"
  nav:
    backgroundColor: "{colors.plum}"
    textColor: "{colors.nav-label}"
    typography: "{typography.nav}"
    height: "80px"
  badge:
    backgroundColor: "{colors.lavender-wash}"
    textColor: "{colors.badge-ink}"
    typography: "{typography.badge}"
    rounded: "{rounded.badge}"
    padding: "6px 11px"
  work-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "30px"
  format-option:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.choice}"
    padding: "15px 14px"
  format-option-selected:
    backgroundColor: "{colors.format-selected}"
    padding: "14px 13px"
  round-mark:
    backgroundColor: "#e8e5ef"
    textColor: "{colors.muted}"
    rounded: "{rounded.tag}"
    height: "19px"
  editor:
    rounded: "{rounded.choice}"
    typography: "{typography.code}"
---

# Design System: Basis Arena

## Overview

**Creative North Star: "Campus scorebook"**

A clear university score sheet gives shared study a friendly competitive rhythm. Cool paper, white work areas, and a dark plum navigation bar hold the interface together. Violet identifies the player's actions; warm ochre distinguishes the opponent. The light appearance is the user-selected visual identity.

The atmosphere is composed, approachable, and focused on reading. Strong sentence-case headings sit above compact labels and generous work areas. Paired scores and round marks make the contest visible while questions, formulas, and code remain the main work. Imagery is code-native: Lucide SVG icons, mathematical notation, and a simple SVG rating chart.

**Key Characteristics:**
- Cool light ground with flat white work panels.
- Self-hosted Manrope for headings, controls, and prose.
- Violet player actions and ochre opponent identity.
- Paired scores and aligned strips of round outcomes.
- Restrained borders, moderate corners, and quiet state changes.

This is a scan of the implemented system in `src/tokens.css`, `src/styles.css`, `src/App.tsx`, and `src/JavaEditor.tsx`. The frontmatter owns primitive values; `.impeccable/design.json` supplies preview snippets, metadata, breakpoints, shadows, and motion. Source values take precedence over earlier concept values. Generated tonal ramps are preview metadata, not additional production colors.

## Colors

The palette feels like cool paper marked with plum ink, violet selections, and warm opponent annotations. Values live in the frontmatter; the names below describe their use.

### Primary

- **Study Violet** (`accent`, `accent-hover`): primary actions, selected answers, the player's score, and rating-chart strokes.
- **Focus Lavender** (`focus`): visible keyboard outlines.
- **Lavender Wash** (`lavender-wash`, `format-selected`): readiness and compact contextual badges, with a lighter tint for a selected format.

### Secondary

- **Opponent Ochre** (`ochre`): the opposing score. `opponent-wash` and `opponent-ink` distinguish the opposing avatar.
- **Success Teal** (`success`): readiness, correct answers, and positive rating changes.
- **Error Rose** (`danger`): incorrect answers, negative changes, and urgent or failed states. Labels and icons accompany these meanings.

### Neutral

- **Cool Paper** (`ground`) and **Work White** (`surface`): the page and its working areas.
- **Plum Ink** (`ink`, `plum`): readable text and the full-width navigation field. These preserve two semantic source tokens with the same color.
- **Muted Plum** (`muted`): supporting copy, timestamps, chart labels, and placeholders.
- **Paper Line** (`line`, `field-border`, `secondary-border`): boundaries between panels, controls, and quiet actions.
- **Navigation Lavender** (`nav-active`, `nav-label`): the wordmark accent, active underline, and inactive navigation text.
- **Player Lavender** (`player-wash`, `player-ink`) and **Badge Ink** (`badge-ink`): avatar identity and contextual badge copy.

**The Color Has a Job Rule.** Use violet for the player's actions and selections, ochre for the opposing player, and success or error colors for outcomes with a written or icon cue.

## Typography

**Display and Body Font:** Manrope Variable, self-hosted through `@fontsource-variable/manrope`, with a sans-serif fallback.

**Code Font:** the platform monospace stack recorded as `typography.code`. KaTeX retains its mathematical type for formulas.

Manrope provides one consistent, clear voice. Heavy headings and tabular numbers create hierarchy without an additional display family. Labels remain sentence case. Type is responsive rather than a single proportional scale.

### Hierarchy

- **Display:** the home invitation uses `display`; it grows to 48px at the wide breakpoint and becomes 32px on phones.
- **Headline:** page titles use `headline`; common compact page titles become 29px on phones.
- **Question:** `question` titles become 23px on compact screens. Prompts use body-sized text with a more open line-height (1.9 desktop, 1.8 mobile) and a reading measure up to 65ch.
- **Title:** `title` anchors panels. Answer panels use a smaller local title (18px), while question titles retain their own role.
- **Body:** `body` establishes ordinary text; paragraphs have a maximum measure of 72ch.
- **Label and controls:** `label`, `button`, `nav`, and `badge` capture their implemented roles. Supporting metadata varies locally from 9–12px; this range is descriptive, not a default for new primary content.
- **Score and code:** `score` uses tabular numerals. Timers, rating values, result scores, and numeric inputs also use tabular numerals; code remains monospace.

**The Stable Numbers Rule.** Use tabular numerals for changing scores, clocks, ratings, and comparable numeric answers so columns and digit widths stay steady.

## Layout

The shared desktop container has a maximum width of 1440px. Navigation and page content align to 64px horizontal gutters; the page begins with 40px of top space. Panels group a task, while rows and separators organize information inside each panel. Spacing commonly uses the recorded 4px steps, with local optical adjustments rather than a rigid universal grid.

The home uses a wider course area and a narrower companion column. The lobby uses a 1.8:1 split with a minimum 330px player column. Standard matches use two equal working columns separated by 28px; Java grants slightly more width to the editor. Profile uses a 360px identity column beside progress. These are component compositions, not mandatory layouts for every new page.

- At 1150px and below, outer gutters become 32px and inter-panel spacing tightens.
- At 900px and below, gutters become 24px; home and profile reorganize, while the lobby retains a 300px companion column. Lobby fields stack inside the narrower settings panel.
- At 650px and below, gutters become 20px, lobby and match work areas become a single column, and primary home actions stack. The navigation wraps into a second row while the profile avatar stays visible. Lobby fields return to two compact columns within the now full-width panel.
- At 1500px and above, the container stays capped while home headings and top spacing increase.

On phones, the active match has a sticky plum timer strip at the top of the viewport. The question and answer panels scroll naturally beneath it. Tables use local horizontal scrolling; formulas and code can also scroll inside their own boundaries. The rating chart uses a responsive SVG with visible start/latest values, dates, and a chronological caption.

## Elevation & Depth

Ordinary surfaces are flat. White panels, cool page ground, soft lavender regions, and restrained borders establish separation. Depth appears for temporary layers: a plum toast has an ambient shadow, and the leave dialog has a larger soft shadow over a translucent plum scrim. There are no hard offset shadows or decorative gradients in the implemented world.

### Shadow Vocabulary

- **Toast:** `0 8px 28px #29264b22`, for transient confirmation above content.
- **Dialog:** `0 15px 60px #21162d30`, for a modal decision over the scrim (`#23182b66`).

**The Flat Work Surface Rule.** Keep ordinary cards and answer panels flat; reserve shadows for transient overlays.

## Shapes

Work panels have moderate corners (`rounded.panel`). Buttons and text fields use smaller control corners; answer choices, format tiles, and the editor use `rounded.choice`. Readiness and table containers use the intermediate readiness radius. Small tags and round marks use compact corners, while avatars are circular and contextual badges are pill-shaped.

Borders are generally 1px. Selected formats use a 2px violet stroke with padding reduced by 1px to preserve geometry. The active navigation uses a 3px underline. A dashed avatar outline signals an empty player place. Lucide icons use SVG strokes and familiar silhouettes; icons are not rendered as text glyphs.

## Components

### Buttons

Confident and compact. Primary buttons use Study Violet with white text; secondary buttons use white with a fine border. Both use the frontmatter control radius and padding, a minimum height of 45px, and a 10px icon gap. Readiness actions fill their region and have a minimum height of 48px.

Hover deepens the primary fill or softly tints the secondary fill over 150ms. Text actions remain unfilled and gain an underline on hover. Keyboard focus uses a 3px lavender outline; buttons, inputs, and selects offset it by 4px. Disabled buttons retain their shape at 0.48 opacity and use a not-allowed cursor. Do not synthesize an unimplemented pressed animation.

### Chips and tags

Contextual badges use a lavender wash, compact sentence-case copy, and the badge radius. Small identity tags use compact corners. Outcome tags combine a tinted surface and success, error, or muted text with the explicit words Won, Lost, or Draw. These are information labels, not universal action pills.

### Cards / Containers

White work panels use Paper Line borders and the panel radius. Question, answer, and profile panels use 30px desktop padding; settings uses 28px 32px. Compact layouts reduce padding to roughly 20–24px according to the component. Lists inside panels use separators instead of nested shadows. Lavender readiness areas visually gather status, action, and the short explanation beneath them.

### Inputs / Fields

White text inputs and native selects have a fine field border, the control radius, and the frontmatter field dimensions. Desktop labels sit 9px above the control. On phones, lobby controls are 44px high with 9px horizontal padding. Numeric answers get a larger 65px field and 24px tabular text. Placeholders use Muted Plum at full opacity. Errors remain adjacent to their field; disabled configuration fields receive a pale fill.

Format tiles combine a Lucide icon, a short name, and a description. Selection is conveyed by the violet border, pale fill, and check icon. Multiple-choice answers use a letter marker plus the answer, then add selection color and a check; the chosen answer remains legible after locking.

### Navigation

The plum topbar holds the Manrope wordmark, text navigation, and a profile identity. Active navigation is white with a lavender bottom border; hover turns inactive labels white. Desktop navigation is 80px tall, reduces to 72px on tablets, and wraps on phones. The avatar remains an operable profile target after the profile text is hidden. A keyboard skip link precedes the header.

### Paired scorebook

Two mirrored player identities and scores flank a shared clock. Aligned strips below show the same round positions for both players. Current rounds use player-specific tints; correct and incorrect rounds use semantic color with check or cross marks. On phones the scoreboard becomes compact while the separate sticky timer keeps the deadline visible during answer selection.

### Java editor and mathematical content

The editor is a light CodeMirror surface inside the choice-radius border, with a quiet file tab and a 310px editing area. Code uses the recorded monospace stack. Focus uses a 2px lavender editor outline. Example execution is a secondary button followed by readable notices or test output. The preview sidecar illustrates its visual shell; the production CodeMirror component owns editing and syntax behavior. Mathematical formulas are rendered with KaTeX and can scroll horizontally within the question.

### Feedback and motion

Notices pair an icon with text on a pale contextual surface. Toasts and the keyboard-contained leave dialog use the overlay vocabulary. Round review enters with a 4px upward settle and a slight brightness change over 220ms with ease-out. Loading icons rotate over one second. The reduced-motion preference removes animations and transitions. Motion never changes the scorebook's geometry during reading.

## Do's and Don'ts

### Do:

- **Do** keep the user-selected light ground, white work panels, and plum navigation across new surfaces.
- **Do** use self-hosted Manrope, sentence-case labels, and tabular numerals for scores and clocks.
- **Do** preserve written or icon cues beside meaningful status colors.
- **Do** keep both players' round positions aligned and the active timer visible on phones.
- **Do** use local scrolling for long code, formulas, and tables while the page fits its viewport.
- **Do** retain visible keyboard focus and honor reduced-motion preferences.

### Don't:

- **Don't** substitute the earlier sketch's color values for the implemented tokens.
- **Don't** add decorative photography or illustration to this code-native study world.
- **Don't** add shadows to ordinary work panels or nest shadowed cards inside them.
- **Don't** turn score, rating, and time numerals into proportional-width text.
- **Don't** use a system display face or text glyphs in place of the shipped Manrope and SVG icon vocabulary.
