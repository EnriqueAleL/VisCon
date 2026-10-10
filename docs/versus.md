# Versus in the course galaxy

Versus is the existing multiplayer application at `/arena`. Room invitations,
history, leaderboard, profile and Java routes retain their URLs and server logic.
The galaxy, lecture workspace and Study World link to it as **Versus**.

`galaxy/theme.css` is the common source for the existing navy space palette,
Chakra Petch headings, IBM Plex Sans text and IBM Plex Mono measurements. All
fonts are already vendored in the repository. `src/versus/versus.css` applies
matching semantic tokens only while `.versus-shell` is present. The other
workspaces retain their previous themes. Secondary Versus pages use a static 2D
starfield. Arena and rooms use a full-viewport Three.js cabin, viewed from behind a
seated astronaut. One compact DOM console carries setup, questions and results.
The canvas draws only on resize, camera manipulation, arrival or combat; reduced
motion and the pause control suppress automatic movement and impact effects.

The galaxy's Versus link sends `course` and a local `returnTo` hash path. This
context survives room navigation and reloads in session storage, including the
selected lecture/chapter. Only galaxy hash paths are accepted as return targets.
Storage being unavailable does not prevent creating or joining a match.

| Galaxy course | Available Versus bank |
| --- | --- |
| `computer-architecture` | `ddca` — source-linked lecture practice |
| `linear-algebra` | `linear` — labelled demo practice |
| `informatics` | `programming` — labelled demo practice |
| Other courses | No inferred bank; show availability notice and let the player choose |

Platform links and Versus tabs ask before leaving an active room. Cancelling
keeps the room; confirming uses the server's existing leave/forfeit rules and
continues to the requested destination. Existing sessions, rankings and game
rules remain unchanged. Java execution still requires the configured judge.

## Spaceship and cockpit

In the galaxy overview, the moving Versus ship can be selected directly or through
its keyboard-accessible projected button. Boarding first aligns behind the ship,
then moves forward through its rear into the actual cabin and pilot model.
Escape/Cancel restores exploration. The same `createCabin` geometry and `cabinPose`
run on both sides of navigation. A transient rendered frame bridges document loading
until the matching camera is ready; it expires, is removed after use, and is never
saved as a project asset. Course positions, ship origin/rotation and star rotations
carry through session storage. Direct entry uses the live course catalogue.

The enemy is absent on entry and in the lobby. When a two-player or bot duel starts,
it approaches the windshield; reduced motion places it immediately. It leaves the
view when the match finishes or is cancelled. The score remains server-owned.

- `galaxy/duel-scene.js`: shared ship, physical cabin and seated pilot, course
  planet shader and deterministic stars, shoulder camera, enemy arrival and fire.
- `galaxy/boarding-bridge.js`: validated, short-lived navigation frame.
- `src/versus/FlightDeck.tsx`: renderer lifecycle, keyboard/drag camera controls,
  pause/reduced motion and public combat results. WebGL loss keeps the quiz usable.
- `src/versus/combat.ts`: deterministic presentation of completed server rounds.
- `src/versus/cockpit.css`: fullscreen cabin, desktop side console, mobile bottom
  console and one sticky score/timer strip. Explore cockpit hides the console.

Home uses a subject selector and create/practise actions; joining and subject/combat
information are disclosures. Lobby prioritizes invitations and readiness; all quiz,
numeric, Java, difficulty, time, round-count and ranked settings remain under Match
settings. Secondary destinations stay in the VisCon menu. Each question/answer
and explanation stays in normal accessible DOM, rather than being painted on WebGL.

Correct answers fire. Missed answers draw return fire. When both answers are
correct, both ships fire; when both are missed, both take return fire. A correct
pilot against an incorrect pilot has the one-sided exchange. These are visual
hits, not health or points: each correct answer still earns 1,000 points and total
score still decides the winner. No speed bonus or early correctness reveal is added.
Reloads show the result without replaying earlier bursts. New rounds clear active
effects. Animation pauses outside the viewport or in a hidden tab; materials, geometries and observers are
disposed when the cockpit unmounts.

Verification:

```sh
npm test
npm run build
npm run test:ui -- --suites cockpit,versus,arena,lectures
```

The `versus` suite verifies the actual galaxy-to-chapter journey, course selection,
safe return targets, leave confirmation, keyboard focus, responsive layouts and
theme isolation. The Arena suite verifies the complete ranked and friendly match
flows. Captures and reports are saved under `.impeccable/review/`.

The `cockpit` suite boards the actual galaxy ship, checks camera cancellation,
uses two real players for outgoing/incoming/tied exchanges and reconnects, and
checks mobile, reduced motion and WebGL fallbacks. Its evidence is saved under
`.impeccable/review/immersive-cockpit/`.
