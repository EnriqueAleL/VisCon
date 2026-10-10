---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/versus/FlightDeck.tsx","src/versus/cockpit.css","galaxy/duel-scene.js","galaxy/app.js","galaxy/boarding-bridge.js"]
---

# Versus: inside the ship

Scope: galaxy boarding and `/arena` + room states. Mode: Experience containing an Operate console. User rejected the small viewport over a dense dashboard, requested a simpler UI with the character physically inside the 3D ship in the same universe, and explicitly chose **camera behind the pilot**. Preserve quiz controls, server scoring/Elo, correctness privacy, invites, safe navigation and course return.

THESIS: Sit behind the pilot inside the Versus ship; the galaxy fills the canopy and one compact console carries the current task.

OWN-WORLD: Existing galaxy navy, course planet colors, Chakra Petch and IBM Plex. Actual modeled cabin, seated suited pilot, helmet, arms at controls, chair and structural canopy. Shared planet shaders and star geometry; boarding hands off actual ship transform and course positions.

STORY: Board the drifting ship, see the seated pilot from behind, choose a subject and create/join/practise from one console. Invite and ready first; disclose settings. Answer from the console and see confirmed shots beyond the canopy. Explore the cabin by hiding the console and looking around; reopen it directly.

FIRST VIEWPORT: Full-screen three-dimensional interior, pilot left of centre, enemy beyond the windshield. A single compact right console on desktop; bottom console and uninterrupted top cabin view on mobile. One small navigation menu; no stacked dashboard, redundant impact counters or duplicate score rows. Questions and answer controls scroll within the console while score/time stay visible.

FORM: User-pinned code-led refinement. Camera behind pilot on every size. Real spatial model and constrained look controls, stable while solving, optional idle/combat motion with pause and reduced-motion support. Native DOM controls retain readability, keyboard access and WebGL fallback. No raster assets.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Verification: desktop 1440, mobile 390/320, pilot visibly seated, look/reset, console disclosure, real-world handoff, two-player combat/scoring/privacy, all quiz formats and settings, leave guard, course return, reduced motion, no WebGL. Fresh reassessment `.impeccable/review/immersive-cockpit/reassessment.md` requires rebuild of the bounded composition.

Latest user steering: the boarding animation must approach from the rear and continue seamlessly to the rear view of the astronaut. Build the same physical cabin/pilot inside the galaxy ship before navigation; preserve camera and a short-lived rendered frame across loading. The rival ship appears only during an active duel, entering ahead when both participants start, and is absent on entry, in the lobby and after completion. Bot practice follows the same active-duel rule.
