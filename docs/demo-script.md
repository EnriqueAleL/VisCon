# The Mania: three-minute demo

Prepare two browser windows at the **actual managed URL**. Replace `NN` everywhere
below. Keep a phone on mobile data as an audience device. Set portal access to
**Authentication only** before audience participation, verify real proxy identity,
and test Socket.IO polling through that URL. Choose one presenter and one operator.

Have these tabs ready:

- Semester and labelled demo history: `https://NN.hackathon.ethz.ch/?demo=1`
- Audience challenge: `https://NN.hackathon.ethz.ch/?puzzle=pipeline-reorder`
- Projected board: `https://NN.hackathon.ethz.ch/?puzzle=pipeline-reorder&projector=1`
- Lecture library fallback: `https://NN.hackathon.ethz.ch/learn`

Use the puzzle screen's share QR for the audience link. Do not send participants
to the demo-history tab: simulated history stays separate from real public scores.
The projector query is an explicit presentation mode; validate it after every
final frontend build, at the venue's screen dimensions.

| Clock | Presenter and operator |
| --- | --- |
| 0:00–0:15 | “Twenty-four DDCA lectures. Who remembers pipelining hazards?” Show the semester galaxy, the exam sun, and the available DDCA planet. Open the planet and its course cities. Other subjects are labelled coming soon. |
| 0:15–0:40 | Ask exactly: **“why does a load followed by add stall even with forwarding?”** The prepared grounded response flies to Pipelining and opens the lecture at the cited second. State that every answer links to its actual transcript source. |
| 0:40–1:05 | Open **Visualize this**. Step through the load-use example and show the bubble. Compare forwarding on/off; predict the next step before advancing. One residual load-use stall remains with forwarding in the five-stage model. |
| 1:05–1:20 | Show the cache landmark. Run the same access sequence with direct mapping, two ways, and full associativity. Point to the address tag/index/offset and the measured hit/miss totals. |
| 1:20–1:40 | Return to the labelled week-of-history demo. Show one dimming city, the daily route's review/new/weak stops, and readiness. Say **“a spaced-review estimate from recall, not an exam-grade prediction.”** Submit a prepared recall quest and show the city's changed light. Use whatever percentage the app actually computes. |
| 1:40–2:40 | Put the challenge QR on screen: **“Sixty seconds: reorder the instructions for the fewest stalls.”** Switch to the projector board. Names appear only after real submissions. Explain that the server checks dependencies and counts cycles, so it is practice on the machine model. Keep presenting while students play. |
| 2:40–3:00 | Show actual live presence if participants are connected. “Lectures tell you. The Mania shows you, at the exact second you need it.” Leave the QR and board visible while the audience votes. |

In the closed stakeholder session, let Micha and Andres use the app on their own
laptops. Ask them to try one recall quest, one visualization, and a search. The
route to evidence matters more than presenting every feature in three minutes.
Keep tables, the shared visualizer, virtual memory, duels, and PDF-to-lecture
matching ready for questions; only demonstrate completed working paths.

## Rehearse once without the model

The exact pipeline demo question has a prepared, cited answer. Still test it with
the production backend before the deadline. Use the local search setting if
necessary, and explain the returned source accurately. If a video is unavailable,
show the transcript and timestamp instead of claiming playback occurred. Do not
invent population, weather, exam dates, other courses, or audience scores.

## Recorded local backup and final venue rehearsal

A real **75-second silent local backup** was recorded from the final production
build at `http://localhost:8080` on 2026-10-10. It is saved outside source in
`.impeccable/review/mania-backup-demo.mp4` (1280×844 H.264 MP4, approximately
2 MB). Native Chrome playback, finite duration, and seeking near the end passed;
the report is `.impeccable/review/mania-backup-report.json`.

The clip shows labelled simulated history, the course map, the real DDCA lecture
playing from 4720.044 seconds, pipeline prediction/forwarding controls, and the
same cache trace across three designs. It ends on the actual empty leaderboard
and local QR/projector screen. No scores or audience participation were invented.
Chrome's installed native recorder produced the file without additional downloads.

This local clip has no narration, and its QR points to localhost. Rehearse the
full three-minute path through the **actual managed URL**, verify the audience QR
on a phone using mobile data, and record a narrated venue backup before losing
VM access:

1. On macOS, use **Shift–Command–5** to record the app window; on the venue laptop,
   use its built-in screen recorder. Record the three-minute path at a readable
   resolution and include the actual lecture seeking and visualizer steps.
2. Record real device participation or an empty leaderboard. Keep any simulated
   history visibly labelled; do not fabricate a crowd filling the board.
3. Save an MP4 locally and on a second team laptop. Play it through once, checking
   audio, legible text, seeking, and the end frame. Keep it outside the source
   repository and away from keys or private browser session details.
4. If the live site fails in the room, announce that this is a recording of the
   tested build, play it, and keep the managed challenge URL visible for retries.

The final operator checklist is one tested URL, one tested QR, the correct public
access mode, a real leaderboard, charged phones, and an independently playable
backup. Use the final deployment checks in [the VM runbook](hackathon-deployment.md).
