---
name: "VisCon"
description: "Existing workspaces, with galaxy and Versus sharing the course universe."
colors:
  ground: "#111315"
  surface: "#191c1f"
  surface-raised: "#22262a"
  surface-hover: "#292e33"
  ink: "#edf0f3"
  muted: "#a5adb7"
  subtle: "#818b97"
  line: "#30363d"
  line-strong: "#454e58"
  accent: "#69c49a"
  accent-hover: "#86d8b0"
  accent-ink: "#101e17"
  accent-soft: "#1c3229"
  focus: "#86d8b0"
  success: "#80cba5"
  success-soft: "#1c3229"
  danger: "#ed9494"
  danger-soft: "#382426"
  ochre: "#e1bc7b"
  warning-soft: "#342e22"
  info: "#9bbde1"
  info-soft: "#24313f"
  overlay: "#080a0dcc"
  galaxy-void: "#070a12"
  galaxy-deep: "#0d1524"
  galaxy-algebra: "#526cb7"
  galaxy-analysis: "#bd754b"
  galaxy-informatics: "#5f8c78"
  galaxy-starlight: "#e9edf6"
  galaxy-dim: "#78859f"
  galaxy-faint: "#5a6881"
  galaxy-line: "#1e2a40"
  versus-surface: "#0d1524"
  versus-surface-raised: "#121e31"
  versus-surface-hover: "#192840"
  versus-muted: "#a3afc5"
  versus-subtle: "#90a0b9"
  versus-line: "#26344c"
  versus-line-strong: "#40516e"
  versus-accent: "#a6baff"
  versus-accent-hover: "#c0ceff"
  versus-accent-ink: "#10172c"
  versus-accent-soft: "#182741"
  versus-focus: "#c0ceff"
  versus-success: "#9ccdb1"
  versus-success-soft: "#152c27"
  versus-danger: "#f0a2aa"
  versus-danger-soft: "#32202c"
  versus-ochre: "#e2b48d"
  versus-warning-soft: "#30251f"
  versus-info: "#abc5f1"
  versus-info-soft: "#17253c"
  versus-overlay: "#030711d9"
  versus-primary-hover: "#4864b3"
  versus-primary-ink: "#fff"
typography:
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  button:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
  galaxy-headline:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.2
  versus-display:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 600
    lineHeight: 1.15
  versus-headline:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.35
  versus-title:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.35
  versus-body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  versus-button:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  versus-trail:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.06em"
  versus-score:
    fontFamily: "IBM Plex Mono, ui-monospace, SF Mono, monospace"
    fontSize: "27px"
    fontWeight: 500
rounded:
  control: "6px"
  panel: "8px"
  versus-control: "4px"
  versus-panel: "6px"
  galaxy-panel: "3px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  versus-button-primary:
    backgroundColor: "{colors.galaxy-algebra}"
    textColor: "{colors.versus-primary-ink}"
    typography: "{typography.versus-button}"
    rounded: "{rounded.versus-control}"
    padding: "10px 18px"
  versus-button-primary-hover:
    backgroundColor: "{colors.versus-primary-hover}"
  versus-button-secondary:
    backgroundColor: "{colors.versus-surface}"
    textColor: "{colors.galaxy-starlight}"
    typography: "{typography.versus-button}"
    rounded: "{rounded.versus-control}"
    padding: "10px 18px"
  versus-field:
    backgroundColor: "{colors.versus-surface}"
    textColor: "{colors.galaxy-starlight}"
    rounded: "{rounded.versus-control}"
    padding: "0 12px"
  versus-navigation:
    backgroundColor: "{colors.galaxy-void}"
    textColor: "{colors.versus-muted}"
  versus-badge:
    backgroundColor: "{colors.versus-surface-raised}"
    textColor: "{colors.versus-muted}"
    rounded: "{rounded.versus-control}"
    padding: "4px 7px"
  versus-question-panel:
    backgroundColor: "{colors.versus-surface}"
    textColor: "{colors.galaxy-starlight}"
    rounded: "{rounded.versus-panel}"
    padding: "24px"
  versus-player:
    backgroundColor: "{colors.versus-surface}"
    textColor: "{colors.versus-accent}"
    size: "68px"
---

# Design System: VisCon

## Overview

**Creative North Star: "One VisCon workspace"**

VisCon connects course exploration, lecture study and competition. Its existing galaxy supplies the spatial identity for Versus: dark navy space, angular headings, readable text and precise orbital geometry. The user-authorized ship and cockpit extension gives this competitive destination a physical place in that universe: boarding approaches the ship, and completed round results drive brief combat exchanges. This continues the existing galaxy, recorded in PRODUCT.md on 10 October 2026; it does not replace the identities of the other workspaces.

Study World, Lectures, Campus controls and the standalone video demonstration retain the incumbent charcoal, Inter and green system. These workspaces keep their direct, compact study workflows and shared product header. NeetCode Versus remains a functional reference for match setup and invitations, not the visual authority for the galaxy destination.

**Key Characteristics:**

- Existing galaxy and Versus share space, typography and course-aware navigation.
- The galaxy ship and Versus cockpit share procedural geometry; confirmed results drive bounded combat effects.
- Other workspaces retain charcoal neutrals, local Inter and green actions.
- Clear questions, subject availability, scores and results take priority over decoration.
- Fine boundaries and tonal surfaces organize compact controls.
- Native video, code workspaces and accessible interaction remain intact.

### Scope and sources

| Route or surface | Visual ownership |
| --- | --- |
| `/` (also `/galaxy/`) | Existing galaxy exploration scene and its HUD |
| `/arena`, `/room/:id`, `/history`, `/leaderboard`, `/profile`, `/java` | Versus, inheriting galaxy through its scoped presentation layer |
| `/world` | Mania / Study World; existing shared workspace theme |
| `/learn` | Lecture workspace; existing shared workspace theme |
| `/campus` | Preserved satellite scene; existing shared product shell |
| Standalone video demo | Existing shared workspace theme |

| Source | Responsibility |
| --- | --- |
| `galaxy/theme.css` | Shared galaxy colors and font stacks; canonical source for galaxy and Versus inheritance |
| `galaxy/vendor/fonts/fonts.css` and adjacent WOFF2 files | Vendored Chakra Petch, IBM Plex Sans and IBM Plex Mono |
| `galaxy/styles.css` | Existing galaxy overlays, breadcrumb, course panel, HUD and ship boarding controls |
| `galaxy/app.js`, `galaxy/index.html` | Selectable galaxy ship, anchored entry button, camera approach, cancellation and course-aware destination |
| `galaxy/duel-scene.js` | Shared procedural ship, separate 3D cockpit viewport, bounded laser/impact effects and renderer lifecycle |
| `src/versus/versus.css` | Versus-only semantic overrides, navigation and responsive adaptations; retains former orbital intro styles |
| `src/versus/VersusSpace.tsx` | Static decorative page background and resize handling; separate from the cockpit viewport |
| `src/versus/FlightDeck.tsx`, `src/versus/combat.ts` | Cockpit instruments, public-result combat presentation, impact totals, pause and fallback states |
| `src/versus/cockpit.css` | Canopy HUD, communications strip, sticky match viewport and mobile timer offsets |
| `src/versus/VersusHeader.tsx` | Galaxy breadcrumb, platform links and Versus tabs |
| `src/versus/context.ts` | Course correspondence and safe return context |
| `src/App.tsx` | Versus route rendering and active-room navigation protection |
| `shared/design/tokens.css` | Incumbent semantic workspace colors, font stacks, corners and header dimensions |
| `shared/design/fonts.css`, `shared/design/fonts/` | Local Inter faces (400/500/600/700), WOFF2 assets and license |
| `shared/design/base.css`, `shared/design/ProductHeader.tsx` | Shared reset, focus, typography, scrollbar and workspace header |
| `src/styles.css` | Existing competitive layouts, controls, matches, tables, results and editor, inherited by Versus |
| `src/mania/*.css` | Study World, recall, puzzles, study tables and teaching visualizers |
| `web-interface/src/styles.css` | Lecture navigation, search, library, picker and player |
| `video-pull-up/demo/demo.css` | Standalone demonstration layout |
| `src/GlobeArrival.css` | Campus imagery and scene overlays |

Frontmatter tokens are normative snapshots of these sources. Unprefixed token names retain the shared workspace meaning; `galaxy-` names describe the shared space source; `versus-` names describe the scoped competitive adaptation. In code, Versus overrides semantic variables only while its shell is present through `:root:has(.versus-shell)`. Components continue to reuse the existing layout and control rules. The standalone demo imports `/design/base.css` through its server's explicit asset allowlist. All fonts are local; no external font service is required.

## Colors

The galaxy uses navy depth and starlight; its competitive destination raises control-text contrast. The separate shared workspace palette remains charcoal with restrained green actions.

### Primary

- **Workspace action green:** `accent`, `accent-hover`, `accent-ink` and `accent-soft` retain primary actions, focus and selected states in shared workspaces. Filled green buttons use dark action ink.
- **Galaxy orbital blue:** `galaxy-algebra` is the inherited blue and the Versus primary button fill. Its paired white text is `versus-primary-ink`; the button hover is `versus-primary-hover`.
- **Versus readable blue:** `versus-accent`, `versus-accent-hover`, `versus-accent-ink`, `versus-accent-soft` and `versus-focus` provide links, active navigation, selected answers, supporting fills and focus. The brighter link token is not the primary button fill.

### Secondary

- **Galaxy course colors:** `galaxy-analysis` and `galaxy-informatics` retain the existing warm and green course distinctions.
- **Workspace status:** `success`, `danger`, `ochre` and `info`, with their soft fills, preserve success, error/loss, opponent/warning and information roles.
- **Versus status:** the corresponding `versus-` status tokens adapt those roles to navy. Every status retains a label or icon; color alone is insufficient.

### Neutral

- **Workspace canvas:** `ground`, `surface`, `surface-raised` and `surface-hover` cover page/editor, control/dialog, secondary and hover surfaces. `ink`, `muted`, `subtle`, `line`, `line-strong` and `overlay` preserve their existing text, boundary and overlay roles.
- **Galaxy space:** `galaxy-void` is the shared ground; `galaxy-deep` is its deep navy; `galaxy-starlight` is the main text. `galaxy-dim`, `galaxy-faint` and `galaxy-line` belong to the existing exploratory HUD.
- **Versus reading surfaces:** `versus-surface`, `versus-surface-raised`, `versus-surface-hover`, `versus-muted`, `versus-subtle`, `versus-line`, `versus-line-strong` and `versus-overlay` supply legible controls and bounded content. Versus inherits ground and primary text directly from the galaxy source rather than copying the HUD's dim text into controls.

**The Scoped Inheritance Rule.** Galaxy and Versus inherit `galaxy/theme.css`; Study World, Lectures, Campus controls and the video demo retain `shared/design/`. Do not spread either scope's semantic overrides into the other.

Normal content text should meet a 4.5:1 contrast ratio; dimmed disabled controls are not normal text. Accent color marks decisions and state rather than washing every surface.

## Typography

**Galaxy and Versus:** Chakra Petch is the display face; IBM Plex Sans carries reading text; IBM Plex Mono carries measurements, scores, clocks, room codes and code. Use the shared local font definitions. Angular headings and measured numerals continue the existing galaxy without lowering control readability.

**Other workspaces:** Inter remains the interface font with the platform monospace stack for code. KaTeX keeps its domain-specific formula faces. Ordinary weights are 400, 500 and 600; normal UI letter spacing remains zero.

### Hierarchy

- **Shared workspace:** body (14px), compact controls (12–13px), labels (11–12px), panel titles (16–18px) and page titles (28px). Immersive Campus headings may retain their existing larger sizes (36–48px).
- **Galaxy panel heading:** `galaxy-headline` preserves the existing compact scene panel title.
- **Versus display:** `versus-display` retains the former entry-title token and its source styles. The active cockpit landing title uses Chakra Petch at 36px/1.2, reducing to 30px below 780px; the room title uses 24px, then 20px below 780px and 17px during a mobile match.
- **Versus headline and title:** `versus-headline` and `versus-title` establish page and section hierarchy. Mobile title rows use 27px. Question headings use 25px, reducing to 23px below 650px.
- **Versus reading:** `versus-body` is the inherited body scale. Question prompts use 15px/1.85 with a 65ch maximum, reducing to 14px on mobile. Fields and primary controls use 13px; field labels use 12px.
- **Versus measurement:** `versus-score` is the rating size; clocks use 24px, reducing to 19px on mobile. Numbers remain tabular.
- **Versus breadcrumb:** `versus-trail` uses uppercase display text. The brand is weight 700 with 0.18em tracking. This navigation treatment does not establish an eyebrow style for content sections.

**The Stable Numbers Rule.** Use tabular numerals and stable geometry for scores and timers.

## Layout

Shared workspaces retain their 4px rhythm and existing compact controls. Their product header is 64px high on desktop and 100px below 650px, with navigation on a second row. Study World is at `/world`; its knowledge map and teaching diagrams retain their content geometry. Lecture course selection retains year/semester/study-year structure, course/chat rail, search and library. Campus stays full width with imagery and visible attribution. The video demo retains its work-first search and playback composition.

Versus retains the 1240px content limit and inherits the competitive layouts from `src/styles.css`. Desktop gutters are 40px, reducing to 28px below 1000px and 18px below 650px. Its two header bands each have a 56px minimum; the layout header token is 112px on desktop and 144px on mobile. The top band wraps on mobile; profile details reduce to the avatar while all three Versus tabs remain visible.

The Versus entry now leads with the cockpit viewport in place of the orbital-avatar introduction. Subject setup and the separate join/rating area use a 1.65fr/1fr division, with a 280px minimum aside and 40px gap; the main layout stacks below 780px. The primary create-room action directly follows subject setup. Lobby settings, invitation and readiness remain visible; match score/progress strips lead into question and answer surfaces. Results, history and rankings retain compact summaries and comparable tables.

The cockpit window is 332px high on the landing page and 276px in a room, reducing to 286px and 230px below 780px. During countdown, questions and review, the flight deck sticks to the top of the viewport and compresses to a 224px window, or 180px below 780px. Its mobile communications strip is 64px high; the mobile timer sits below the deck at 245px and answer controls use a 312px scroll margin. These dimensions keep the opponent, current result and remaining time visible while the answer console scrolls.

Tables, code and long navigation scroll locally rather than widening the page. Long names wrap or truncate within their own controls. Preserve the readable 390px and 320px compositions, and keep the live match timer visible while answers scroll. Java keeps bounded code scrolling.

## Elevation & Depth

Shared workspaces use tonal layering and fine separators. Their existing overlay shadow remains reserved for dialogs, popovers and toasts; ordinary sections are unframed layouts or full-width bands. Galaxy depth comes from its existing scene, translucent HUD, vignette and spatial geometry. These scene materials are native to exploration, not a directive to add panel shadows throughout the product.

Versus uses opaque navy question/answer surfaces, flat score bands, fine boundaries and restrained orbital geometry. Dialogs explicitly have no box shadow; inherited toasts may retain the overlay shadow. The decorative page sky is fixed behind content, ignores pointer events and is hidden from assistive technology. Its opacity is 0.8 at rest and 0.24 during a match, with a 0.5s transition disabled under reduced motion. `VersusSpace.tsx` uses deterministic Canvas 2D stars and three orbit traces, draws on mount/resize, caps pixel density at 2 and uses no render loop or WebGL dependency.

The separate cockpit viewport uses the locally vendored Three.js renderer and shared procedural ship geometry. Solid canopy ribs, gun housings and a distant opponent supply scene depth inside its bounded window. Idle drift stops during countdown, questions and review; laser, shield, spark and brief impact effects last about 1.5 seconds after a newly confirmed round. The renderer caps pixel density at 1.75, limits active drawing to about 30 frames per second, pauses its loop when offscreen or in a hidden tab, and disposes its resources on unmount. Pause and reduced motion preserve the instruments and result text without combat bursts.

**The Quiet Match Rule.** Keep the decorative page sky static and dim during questions. The separate cockpit remains still during active rounds and may show brief combat bursts only after a public round result; pause and reduced motion suppress those bursts.

**The Flat Workspaces Rule.** Ordinary workspace sections do not gain decorative shadows or nested cards. Keep scene depth in the galaxy, tonal panels in Versus and overlay elevation only where the existing component uses it.

## Shapes

Shared controls retain 6px corners; repeated items and dialogs stay at or below 8px. Versus controls use 4px corners and question/dialog panels use 6px; course rows, score bands and results are flat with separators. The galaxy's existing HUD panel keeps 3px corners. Circular radio indicators, status dots, planetary bodies and Versus player avatars are intentional functional forms.

The active Versus cockpit uses angular structural canopy ribs, a square viewport boundary and a bracket-shaped target reticle. Pilot and opponent names remain readable instruments over the scene; compact controls retain the existing 4px corners. The former orbital-avatar introduction is replaced by this cockpit. Its source styles and `versus-player` token remain compatibility residue, not the active landing composition.

## Components

### Buttons

Shared workspaces retain their neutral secondary and green primary commands, stable 36–40px control heights and existing focus treatment. Versus reuses the control structure with a 42px minimum, 13px text and 10px 18px padding; horizontal padding reduces to 14px on mobile. Its primary command uses orbital blue with white text and a darker blue hover. Secondary buttons use navy surface/hover tones and a strong boundary. Focus uses a visible 2px ring with 3px offset. Disabled controls retain the existing state and must not imply unavailable functionality works.

### Chips

Existing compact badges identify mode, difficulty and status using raised surfaces, fine borders and text. The cockpit's inline 1v1 mode label uses IBM Plex Mono (12px); ordinary badges retain the shared compact construction. Do not use these as decorative section kickers.

### Cards / Containers

Versus question and answer panels are functional reading surfaces with fine borders, 6px corners and 24px internal padding, reducing to 20px 18px on mobile. Score and result bands have only horizontal borders and square corners. Subject choices are flat rows; selected rows use the soft accent fill and hover uses the neutral hover surface. Shared workspace sections keep their established unframed or banded layout; avoid nested cards.

### Inputs / Fields

Shared fields keep neutral surfaces, strong boundaries, 6px corners and visible focus. Versus fields use navy surfaces, 4px corners and a 44px minimum height. Labels remain explicit; placeholder text is not a label. Disabled fields use the ground and muted text, and error messages use the danger role. Keep native select behavior and meaningful state text.

### Navigation

Shared workspaces continue to use `ProductHeader`. Versus uses `VersusHeader`: VisCon / Galaxy / Versus breadcrumb, separate Lectures and Study World links, then Play / Match history / Leaderboard tabs and profile. Active tabs have both brighter text and a bottom rule. Mobile wraps the platform band and keeps the local navigation legible. The current room remains represented by Play.

The galaxy link returns to the stored course/lecture/chapter when available, otherwise `/`. The context parser accepts only local galaxy hash paths, and unsupported courses display an availability notice rather than selecting a fictitious bank. Navigation out of an active room uses the existing leave confirmation and forfeit rules. Preserve course return and these protections when extending navigation; implementation details live in `docs/versus.md`.

### Ship entry and flight deck

The drifting galaxy ship is selectable through its hull or its scene-anchored, keyboard-accessible boarding button. Boarding moves the existing camera toward that ship over 1.8 seconds before entering Versus, retaining the course return context. A visible cancel action and Escape restore the prior camera; reduced motion makes the camera transition immediate. The ship button keeps a 44px minimum height and visible focus.

The flight deck pairs the 3D view with ordinary DOM controls: opponent and pilot identity, labeled hits dealt/taken, a status announcement, pause control and expandable combat rules. Correct answers produce outgoing fire; missed answers produce incoming fire. Both correct or both missed produces reciprocal fire. Effects derive only from completed public rounds, never submission state or private correctness. Impact totals reconstruct on reload without replaying historical bursts. These are presentation counters, not health: each correct answer still earns 1,000 points and total score decides the winner, with no speed bonus or early destruction.

Pause and reduced motion retain textual results and counters. The canvas is decorative to assistive technology. A failed renderer or lost WebGL context displays a clear unavailable message while the match remains usable; the reticle and target label are hidden in that fallback.

### Match, media and code

Keep paired score/progress, mobile timer, labeled practice bot, demo/source distinction and friendly/ranked status. Results and Elo use comparable numbers. Java execution remains visibly unavailable without its configured executor. Lecture search, citations, genuine thumbnails, native video controls, timestamps, bookmarks and missing-recording fallback retain their current behavior. Campus preserves image attribution, reduced motion and unavailable-tile fallback.

## Do's and Don'ts

### Do:

- **Do** reuse each route's established token source and navigation component.
- **Do** keep galaxy and Versus aligned through the shared local fonts, ground and orbital blue.
- **Do** preserve charcoal, Inter and green rules in the other workspaces.
- **Do** keep normal content text at 4.5:1 contrast and give status a label or icon.
- **Do** preserve keyboard focus, labeled controls, dialog focus handling and reduced motion.
- **Do** keep active timers visible on mobile and bound code/table overflow locally.
- **Do** keep cockpit fire tied to confirmed public results and preserve its textual status, pause and fallback states.
- **Do** preserve course-aware return, active-room protection and honest availability labels.
- **Do** use real content imagery with visible attribution and native playback controls.

### Don't:

- **Don't** apply Versus semantic overrides to Study World, Lectures, Campus or the video demo.
- **Don't** restore the old plum Arena palette or separate blue demo theme.
- **Don't** add an unrelated palette, font service or navigation treatment within an existing scope.
- **Don't** add a marketing hero before match setup or lecture search.
- **Don't** nest cards or decorate ordinary workspace panels with shadows.
- **Don't** animate the decorative match background or fire cockpit effects before the server publishes a completed round.
- **Don't** turn compact galaxy HUD labels into new content-section eyebrows or use its dim text tokens for Versus form controls.
- **Don't** scale interface text continuously with viewport width; use the established responsive steps.
