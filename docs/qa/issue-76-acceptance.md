# Issue 76 — production acceptance

Local acceptance: **38/38 mandatory scenarios PASS**. **157 unit tests, 50 PostgreSQL/API tests and 60 unique Chrome cases PASS** (49 existing regressions and 11 alignment cases). The complete 59-case browser run passed, followed by the final 11-case alignment run and a targeted rerun of ordinary fret editing/Undo and manual lyrics links after alignment-only hardening. There are no skipped or flaky cases in these runs. No GitHub Actions run was started.

Lint, format, typecheck, frontend/backend builds, semantic design checks, two idempotent test-database migration runs, local Docker build and npm audit PASS. Audit reports zero vulnerabilities. Vite emits a nonblocking bundle-size advisory for the 504.68 kB client chunk; the build completes successfully. The existing user app still responds HTTP 200 and retains its three songs; test servers use the separate test database.

Environment: Windows 11 Home build 26200, installed Google Chrome 157.0.8103.51 (headless, Playwright `channel: chrome`), Node 24.17.0. The real React app runs through Vite at 127.0.0.1:5174, proxied to a separate host API at 127.0.0.1:3001 with `NODE_ENV=test` and the separate PostgreSQL test database. The existing Docker app and its user database are not upgraded or deployed by these tests. No prototype storage or render loop is used. Physical touch, screen-reader and other-browser certification are not claimed.

## Evidence keys

Executable browser evidence is `e2e/lyrics-alignment.spec.ts`. B1: full-line workflow; B2: passage/line entries; B3: melisma/proposals; B4: existing-link conflicts; B5: selection/track/native keyboard/focus; B6: real second-session 409, failed-response retry and document Undo; B7: pitch-only/collapsed track/explicit measure/pending save. R1440/R1280/R1024/R390 are the parameterized theme/responsive/axe cases. Each uses a new test-owned canonical song and deletes only that song after the test.

The domain suite is `packages/music-domain/src/lyrics-alignment.test.ts`. The transaction suite is `apps/api/src/lyrics-alignment.integration.test.ts`. Machine-readable final test titles, results and counts are in `results/issue-76-local.json`; screenshots and four raw axe summaries are in `screenshots/issue-76/`. These are new production runs, independent of the supplied prototype's PASS matrix.

## Mandatory scenarios

| #   | Scenario                            | Production assertion/evidence                                                           | Result |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| 1   | Open workspace                      | B1 opens the test-owned library song in React v3                                        | PASS   |
| 2   | Choose arrangement                  | B1 switches to the second arrangement and back                                          | PASS   |
| 3   | Choose vocal track                  | B1 switches tracks and selects Zangmelodie                                              | PASS   |
| 4   | Start alignment                     | B1 manual-link entry; B2 selected-passage and line entries                              | PASS   |
| 5   | Choose lyrics line                  | B2 native line choice, repeated words retain distinct IDs/context                       | PASS   |
| 6   | First note                          | B1 exact initial 0/1 event, both chord tones represented once                           | PASS   |
| 7   | First bind                          | B1 Enter produces one candidate, no API write                                           | PASS   |
| 8   | Next note                           | B1 advances to the independent simultaneous bass-string event                           | PASS   |
| 9   | Next syllable                       | B1 advances Langs → het                                                                 | PASS   |
| 10  | Sequential full line                | B1 six Enter actions, six candidates/zero remaining                                     | PASS   |
| 11  | Previous note                       | B1 correction button, B5 ArrowLeft                                                      | PASS   |
| 12  | Next note                           | B1 correction button, B5 ArrowRight                                                     | PASS   |
| 13  | Previous syllable                   | B1 correction button, B5 ArrowUp                                                        | PASS   |
| 14  | Next syllable                       | B1 correction button, B5 ArrowDown                                                      | PASS   |
| 15  | Skip                                | B1 explicit skipped chip without automatic link; B5 S                                   | PASS   |
| 16  | Cross-bar melisma                   | B3 Shift+Enter holds syllable across the real bar boundary                              | PASS   |
| 17  | Correct melisma                     | B3 removes the second note while retaining the first                                    | PASS   |
| 18  | Sustain on/off                      | B3 checkbox and draft history; original event timing remains unchanged                  | PASS   |
| 19  | Inspect existing link               | B4 licht shows one existing note before edits                                           | PASS   |
| 20  | Change existing links as draft      | B4 overlap remains a candidate until explicit confirmation                              | PASS   |
| 21  | Recognize conflict                  | B4 conflict row and disabled commit; database unchanged                                 | PASS   |
| 22  | Resolve conflict                    | B4 explicit keep/new choices; replacing retains the other melisma note                  | PASS   |
| 23  | Propose distribution                | B3 unequal 6/8 reports uncertainty; equal 8/8 reports one-to-one                        | PASS   |
| 24  | Adjust proposal                     | B3 targets a chip, clears it and retains five candidates                                | PASS   |
| 25  | Confirm proposal                    | B3 explicit confirmation persists eight real links                                      | PASS   |
| 26  | Cancel proposal                     | B3 restores empty and existing candidates, Undo and Redo checkpoint                     | PASS   |
| 27  | Draft Undo                          | B1 button and B5 Ctrl+Z, independent of document history                                | PASS   |
| 28  | Draft Redo                          | B1 button and B5 Ctrl+Shift+Z restore the candidate                                     | PASS   |
| 29  | Cancel without saving               | B1 exact before/after canonical document, revision and history comparison               | PASS   |
| 30  | Confirm session                     | B1 precisely one new revision/history entry, all non-link fields equal                  | PASS   |
| 31  | Reload                              | B1 freshly opens and finds six persisted existing chips                                 | PASS   |
| 32  | Lyrics → note selection             | B5 selects licht and checks the linked score event                                      | PASS   |
| 33  | Note → lyrics selection             | B5 selects independent event and observes het selected                                  | PASS   |
| 34  | Track change choices                | B5 continue/review/discard-and-switch; no cross-track lyric writes                      | PASS   |
| 35  | Keyboard/native fields/dialog/focus | B3/B5/B6 routing, native select, Escape, restored entry focus, ordinary Undo            | PASS   |
| 36  | Dark/light                          | Four R cases change theme during the active draft without losing it                     | PASS   |
| 37  | Tablet                              | R1024 both themes: bind, visible active chip/event, internal scroll, preview and exit   | PASS   |
| 38  | Mobile                              | R390 both themes: bind, visible active chip/event, zero page overflow, preview and exit | PASS   |

## Additional production gates

- Exact rational ordering including 1/3, deterministic simultaneous events, multi-tone deduplication, cross-bar and narrow-passage melisma, rest exclusion, repeated word IDs and source-reference validation: domain suite plus B1/B2/B3/B7.
- Conservative source-change rejection, including changed/deleted notes and removed lyric words: domain and three real API 409 cases. No deleted source ID is resurrected.
- New candidates never enter autosave; earlier ordinary edits are flushed before capturing the fixed revision. Cancellation writes no alignment changes. Definite failed requests retain candidates; a successful confirmation installs one document Undo step. B1/B6/B7 and API transaction tests.
- PostgreSQL transaction fault injection after the current-row update proves rollback of both current/history; retry succeeds. Owner isolation, invalid references, fresh API reopen and one-version restore also pass.
- Imported schema-v2 source lyrics, original chord anchors and LRC milliseconds remain byte-for-byte structurally equal after alignment; no musical time is inferred from LRC.
- Axe-core checks the complete page with the active toolbar, an actual unresolved conflict preview, and the safe-exit dialog at all four sizes in both themes: 24 audits, zero WCAG 2 A/AA and 2.1 AA violations. This is automated coverage, not a full WCAG certification.
- All existing browser cases run through the single production v3 editor: manual LyricsLink editing, physical fret entry, normal Undo/Redo, track management, fretboard, Practice, metronome, library/settings, personal LRCLIB source flows, ChordPro/ASCII/file import and existing-song persistence. No legacy-editor test flag is introduced.

## Reproduction and boundaries

Use the repository's separate `TEST_DATABASE_URL`, never the user database. Start the host API with `NODE_ENV=test`, `HOST=127.0.0.1`, `PORT=3001`; configure URLs with the host-accessible PostgreSQL hostname. Start Vite with `API_PROXY_TARGET=http://127.0.0.1:3001` on port 5174. Run `npm test`, `npm run test:integration`, and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 PLAYWRIGHT_CHANNEL=chrome npm run test:browser` with those test environment variables. `ALIGNMENT_EVIDENCE_DIR` controls the new screenshot directory. Lint, format, typecheck, workspace build and design checks run locally too. Do not dispatch Actions without new explicit permission.

The implementation preserves the existing API transaction and schema-v2 model; no database migration is needed. Saved and candidate anchors have separate score lanes. Pitch-only notes remain MIDI-only until the user supplies a fingering. An already collapsed active track is expanded for alignment presentation without storing a preference change. Explicit measure selection includes pitch-only events; explicit note selection takes priority over a prior measure selection. Source changes require explicit exit/reload; ambiguous lost-success responses remain subject to the existing revision guard rather than an invented exactly-once guarantee. Bass expansion (#75), release/deployment and unrelated open issues remain outside this PR.
