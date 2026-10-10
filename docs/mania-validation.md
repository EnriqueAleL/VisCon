# The Mania validation

Local browser validation passed on 2026-10-10. The final build passed the globe, Mania, and lecture suites with the complete LFS recordings present, including real-video seek/playback. The retained Arena suite passed its ranked/friendly, rating, reconnect, rematch, privacy, accessibility, and phone checks. The Mania report contains no page or console errors.

The final production server at `http://localhost:8080` also passed the deployment checker with `--require-videos --ask --load=12`: all 24 recordings were available, the grounded demo answer worked, and the concurrent-load smoke check passed. `git lfs fsck` passed for the complete recording corpus. This is a local production check; the managed-URL checks below remain separate.

Run `npm run build` first, then `npm test` and `npm run test:ui`. The browser runner starts the production server with a temporary SQLite database and shuts it down afterward. It preserves `.data/arena.sqlite` and uses local transcript search without model credentials.

For a focused rerun, use `BROWSER_SUITES=mania npm run test:ui` or `.venv/bin/python tests/run_browser.py --suites mania`. Available suite names are `lectures`, `arena`, `globe`, and `mania`. Python Playwright uses the installed Chrome; no browser download is necessary. Run the default suite to check all existing surfaces together.

The Mania suite checks:

- The complete DDCA index: 24 lectures, 512 total chapters, 463 substantive chapters, 49 excluded administrative chapters, and 24 cities. Other planets are explicitly unavailable.
- Galaxy, planet, city, globe controls, and the three-city daily route.
- The pre-reviewed load-use answer at lecture 11, **4720.044 seconds**, with its linked visualizer preset and video seek or honest transcript fallback.
- Editable pipeline instructions, an observable load-use bubble, reversible steps, forwarding, predictions, and malformed-instruction recovery.
- One identical cache trace across direct mapped, 2-way, and fully associative designs, with independently expected miss counts; prediction and lecture recovery.
- Virtual-memory translation, missing pages, and forbidden writes with outcome predictions.
- Answer-free public recall quests, exact wrong-answer sources, whole-quest city claims, replay rejection, identity isolation, and persisted progress.
- Separate demo history, including a canceled demo request that deliberately resolves late after switching back to real progress.
- A timed 12-city mixed exam, complete answer submission, exact explanation links, and weakness updates that do not falsely claim a city.
- A 60-second server-scored pipeline puzzle, an achievable 12-cycle solution, real-name leaderboard/mayor, session ownership, replay rejection, ignored forged score, demo exclusion, QR code, and projector countdown.
- Two independent students creating/joining a study table, synchronized steps, guest-control rejection, browser reload/reconnect, and host succession.
- City-scoped duels entering the retained Arena with three friendly DDCA rounds.
- 390×844 layouts for the galaxy, pipeline, cache, virtual memory, puzzle, and study table, with horizontal-overflow and browser-error checks.

Ground-truth recall answers are loaded by the local test process from the private server bank. They are never returned by the public quest endpoint. All writes belong to isolated test profiles.

Reports and screenshots are written to `.impeccable/review/`. The new report is `mania-report.json`, with screenshots named `mania-*.png`. Existing lecture, Arena, and globe suites retain their reports.

Local tests cover HTTP and default Socket.IO transports. The managed hackathon URL, proxy-injected identity headers, edu-ID access mode, restart after a VM reboot, and a physical phone on mobile data still require checks on the actual team VM. The deployment procedure is in [hackathon-deployment.md](hackathon-deployment.md).
