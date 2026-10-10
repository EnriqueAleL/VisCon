---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css", "shared/design/tokens.css", "shared/design/ProductHeader.tsx"]
---

# VisCon Arena

Audience: ETH students preparing together. Primary flow: configure a subject,
create or join an invitation, agree on settings, answer synchronized rounds, and
review results and Elo. Match questions remain explicitly demonstrative.

## Direction Contract

Modern SaaS B2B inspired by the work-first NeetCode Versus matchup. Charcoal
canvas, neutral work surfaces, Inter typography, compact green commands, fine
separators, and corners no larger than 8px. Arena, Lectures, Campus, and the video
demo share the same design source in `shared/design/`.

The first viewport shows the matchup preview and usable setup. No marketing
hero precedes work. Lobby settings and paired progress remain scannable. The
question is the primary match work area; the live timer stays visible on phones.

The preserved satellite scene has its own `/campus` route, using the same header,
type, and controls. Imported lecture imagery and map assets retain attribution.

See `DESIGN.md` for the current contract. Earlier mock candidates are historical,
not sources of colors, typography, or layout for new work.

Scope: Home, Lobby, Match, Results, History, Leaderboard, Profile, Java, Lectures,
Campus, and the standalone video demo. Existing Node/Socket.IO rooms and SQLite
profiles/ratings remain intact. Java runs only through a configured isolated judge.
