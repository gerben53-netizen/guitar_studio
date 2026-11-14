# Sprint 1 gap analysis

Baseline inspected 2026-11-14: develop `05fc8a8`, clean checkout, Sprint 0 milestone closed (four completed issues), final develop CI 43599273216 successful. No missing foundation blocks Sprint 1. Existing React shell has four placeholders, theme and health status; Fastify has health/config/error handling; PostgreSQL has only foundation metadata. Music-domain provides rational timing, six-string profiles, pitch mapping and note/measure validation, but no persisted song aggregate.

UX source: original Guitar-Studio-Prototype.zip and matching HTML in the user's Downloads. ZIP contains design review, acceptance report, original demo data and 16 screenshots. Sources were extracted locally to ignored `.reference/sprint-1`; they are reference material, not executable application architecture. Original source reports are not evidence of this implementation passing.

Source fingerprints (SHA-256): ZIP `6BDDA0DE38B1BC80E811E87BC2606F7DDF9D5A1DAC290B5CB780AF0A877D61C2`; HTML `53D73EF40C1445D843980FEBF38509876A37ED7B625B16515390D248B9DB1C39`.

| Area              | Gap and planned resolution                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual shell      | Replace placeholder layout with typed rail, cards, copper/sage tokens, split workspace and responsive panel tabs matching original screenshots                                                     |
| Songs / dashboard | Add validated PostgreSQL song aggregate, library metadata/actions, persisted recent/favorite/progress data and independent arrangements                                                            |
| Lyrics / #9       | Stable token IDs and conservative reconciliation; retain unmatched chord anchors visibly for targeted repositioning instead of deleting them                                                       |
| Timing / #10      | Reuse rational whole-note positions/durations, explicit meter, 1/16 and triplet-capable cursor; derive visual grid rather than storing ticks                                                       |
| Input / #11       | Roving tab focus, arrows, fret digits, passage selection/copy/paste, predictable selection shared with neck                                                                                        |
| Profiles / #12    | Per-arrangement acoustic/electric, standard/Drop D and explicit absolute-domain versus capo-relative display; preserve positions or explicitly warn on conflicts                                   |
| Persistence / #13 | Revision-checked atomic writes, server history/recovery, visible save/retry/conflict states, versioned validated JSON transfer                                                                     |
| Mobile / #14      | Context strip and panel tabs retain measure/time/string; keyboard, Chromium sizes, accessibility-tree and console checks; physical Safari/touch/screenreader acceptance requires separate evidence |
| Import / #15      | Manual/file wizard, explicit rights confirmation/provenance, heading-based section proposals; blank lines do not silently create sections; external search disabled                                |

Maintain Node/React/Vite/Fastify/Zod/pg and the existing CI, SQL migrations and Docker workflow. Use one local repository without worktrees; all changes target develop through a green PR. No audio, metronome, PDF, automatic transcription, external lyrics service, main change, release or deployment. Issue #14's broader physical-device/Safari acceptance is tracked separately if unavailable; do not close an issue whose full acceptance is unverified.
