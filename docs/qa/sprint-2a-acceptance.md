# Sprint 2A acceptance — 2026-11-14

Official local target: Microsoft Windows 11 Home 10.0.26200, installed Google Chrome 157.0.8103.51 through Playwright's chrome channel. Additional Chromium 159.0.8154.6 regression runs separately. Tests use normal click activation and real Web Audio without microphone/autoplay bypass. See committed [Chrome graph evidence](evidence/sprint-2a/chrome-audio.json), [Chromium evidence](evidence/sprint-2a/chromium-audio.json) and [actual database restart evidence](evidence/sprint-2a/restart.json). Digital waveform verification does not claim physical speaker/listening or OS timing precision. Lifecycle browser events are dispatched by the test; injected-clock tests verify exact musical scheduling.

| #   | Criterion              | Implementation evidence/status before integration                                                                       |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Typed Practice domain  | PASS: strict schemas, discriminated settings, immutable snapshots, typed client                                         |
| 2   | Reproducible catalog   | PASS: 18 original stable IDs/version 1, 4/4/4/6 lab split; no fictional achievements                                    |
| 3   | PostgreSQL migrations  | PASS: additive 003, repeated migration/checksum/seed, real PostgreSQL 17                                                |
| 4   | Persistent sessions    | PASS: UUID duplicate protection, immutable config snapshots, fresh-app and actual DB restart                            |
| 5   | Correct progress       | PASS: chronological last rating, count/highest BPM, all four statuses                                                   |
| 6   | Explicit mastery       | PASS: confirmed flag required; no automatic tempo/time/repetition promotion                                             |
| 7   | Configuration mastery  | PASS: different keys/positions independent; explicit overall grant/revoke; version upgrade retention                    |
| 8   | All endpoints tested   | PASS: catalog/settings/session lists+details/progress/mastery/origin create+resolve; invalid/filter/page/owner/FK tests |
| 9   | Music theory           | PASS: 48 scales, 36 progressions, I/III/V, all strings/frets0–24, DropD/capo, rational rhythm bounds                    |
| 10  | Metronome              | PASS: injected-clock/backend tests plus Chrome/Chromium real graph/lifecycle                                            |
| 11  | Stable Song references | PASS: IDs across reorder, source snapshot, missing source fallback, all four labs                                       |
| 12  | Workspace regression   | PASS: 7 existing browser scenarios in Chrome and Chromium; no production UI/CSS diff                                    |
| 13  | Unit/integration tests | PASS: 34 unit tests; 9 real-PostgreSQL integration tests                                                                |
| 14  | Docker/migrations      | PASS: Compose build/start/health/migrate, real DB/API restart; no volume deletion                                       |
| 15  | Final CI               | Required integration gate:quality+secrets must pass on exact PR head and final develop; links in PR/final handoff       |
| 16  | Documentation          | PASS: baseline/report, 5 architecture documents, ADR 0003, this acceptance matrix, README                               |
| 17  | Sprint issues          | Implementation complete:#20–26; close only after green accepted integration                                             |
| 18  | PR merged to develop   | Required integration gate:merge only after all technical acceptance and green exact-head CI                             |

## Validation commands and coverage

`npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=moderate`. Host integration: load ignored .env privately, replace URL host db with localhost, select NODE_ENV=test, migrate twice, `npm run test:integration`. Test fixtures use random owners/song IDs and clean only their own data.

`docker compose -p guitar-studio up -d --build --wait`; API/web health checked. An isolated test owner saved configuration/session/mastery/progress/origin, PostgreSQL and API containers were actually restarted with the same named volume, and all four API records compared equal after restart. Fixture owner/song were then removed; existing songs unaffected.

`PLAYWRIGHT_CHANNEL=chrome` and `PLAYWRIGHT_SCREENSHOT_DIR=test-results/sprint-2a-screenshots` select the official Chrome run without overwriting Sprint 1 screenshots. Remove the channel variable for Chromium. Both runs:8/8 PASS, including library, import/rights, lyrics/chords/tab/fretboard, arrangements/settings/recovery, manual Practice Mode, JSON transfer, 1440/1024/390 viewport and outage/conflict behavior. Existing accessibility automation continues; this sprint does not resolve the broader #14 acceptance.

No new Practice UI/CSS, auth, microphone recognition, automatic tab generation, deployment, release tag or main change. Final repository gate evidence is recorded in [PR #27](https://github.com/gerben53-netizen/guitar_studio/pull/27) and final handoff because the merge commit and its CI do not exist at source preparation time.
