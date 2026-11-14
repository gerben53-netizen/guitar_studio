# Sprint 2E acceptance

The matrix maps all 23 requested gates to implementation/evidence. Repository-state gates 21–23 are completed and linked in the single PR completion record after green exact-head CI and final develop CI; this source document does not claim future CI or merge results.

| #   | Criterion               | Evidence / gate                                                                    |
| --- | ----------------------- | ---------------------------------------------------------------------------------- |
| 1   | Versioned model         | Canonical Song/arrangement schemaVersion 2; existing metadata reused               |
| 2   | Multiple tracks         | Up to 32 independent tracks, six-string instruments and roles                      |
| 3   | Independent edits       | Pure/API track/event CRUD, copy, order, active/visible/collapsed                   |
| 4   | Shared timeline         | Section/measure IDs owned once; reduced rational start/duration                    |
| 5   | NoteEvent compatibility | Existing tones/measure validator; bidirectional grouped positional adapter         |
| 6   | Chords preserved        | Multi-tone/rest/polyphonic fixtures, complete round-trip assertions                |
| 7   | Stable words/syllables  | Deterministic legacy IDs; manual divisions; repeated words/reorder tests           |
| 8   | LyricsLinks             | Explicit validated references; update/delete cleanup; notes retained               |
| 9   | Melisma                 | One-to-many events, cross-bar sustain, cloned link mapping                         |
| 10  | Referential integrity   | Foreign song/arrangement/measure/track/event/syllable cases rejected               |
| 11  | PostgreSQL              | 32 integration cases; JSONB/current/history/backup transactions                    |
| 12  | Safe conversion         | Six own legacy fixtures; no eager rewrite; backup/restore digest equality          |
| 13  | History retained        | All original versions archived; >20 revision retention and restore tests           |
| 14  | Revision conflicts      | Parallel/stale writes return 409/currentRevision, no partial writes                |
| 15  | Owner isolation         | Trusted owner resolution, scoped locks/history/backups and FK                      |
| 16  | API contracts           | GET/PUT/PATCH; strict command/result validation; typed shared client               |
| 17  | Import compatibility    | Reuses normalized 2D parser/source; explicit track replacement; no inferred timing |
| 18  | Practice compatibility  | Track/range/events/return cursor snapshots; safe changed/missing fallback          |
| 19  | Existing Workspace      | Legacy guarded merge; original regression; complete v2 JSON transfer/recovery      |
| 20  | Chrome regression       | Required full 32/32, Windows installed Chrome, four viewports/both themes          |
| 21  | Final CI                | Required exact PR head quality/secrets green and final develop run green           |
| 22  | Sprint issues           | Close only #54–61 and milestone #7 after acceptance/merge                          |
| 23  | Single develop PR       | Green merge; clean local/origin develop equality; main untouched                   |

## Reproducible verification

Run lint, format:check, design:check, typecheck, npm test and frontend/backend build. With a separate TEST_DATABASE_URL, run migrations twice and npm run test:integration. Use an isolated test API/database and Vite proxy for browser acceptance; set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_CHANNEL=chrome and PLAYWRIGHT_SCREENSHOT_DIR=test-results/sprint-2e-regression. CI runs the same full suite on Chromium with disposable PostgreSQL/Compose services. Tests use original fixtures and clean up their own Song IDs.

The new browser functional scenario checks converted-song lyrics/fret edits, saving, reload, Undo/Redo, hidden track/links, all-track JSON export/import with independent IDs, and refusal/recovery export of destructive linked-text edits. Four further cases check 1440×900, 1280×800, 1024×768 and 390×844, each dark/light, keyboard, overflow, screenshots and axe wcag2a/wcag2aa/wcag21aa. Mobile uses the existing Tablatuur tab. Existing 27 scenarios still cover chords, fretboard, Practice Mode/Room/audio, library, import/LRCLIB and v2 design system.

New eight axe scans must report zero violations in each browser run. Existing design/import/Practice accessibility suites also run. This is automated acceptance, not physical-device or assistive-technology certification. Browser HTTP/provider mocks are deterministic and do not claim new live-provider verification in this sprint.

## No-data-loss gate

[Private dump restore proof](evidence/sprint-2e/backup-restore.json) and [migration preservation](evidence/sprint-2e/migration-preservation.json) compare the exact local 2 Song/15 history documents and revisions using content digests. No dump, credentials or user lyrics are published. [Real PostgreSQL restart/fresh browser proof](evidence/sprint-2e/restart.json) verifies unchanged full canonical document/revision/history/backups, hidden tracks and cross-bar links after an actual database restart and new Chrome process/empty context. The own restart fixture was removed. [Eight converted-Song screenshots](screenshots/sprint-2e) and four viewport axe JSON records under [evidence](evidence/sprint-2e) contain original test content: eight scans, zero violations, installed Chrome 157.0.8103.51 on Windows 11 Home 10.0.26200. Final full-suite and CI results are recorded in the PR completion comment. Unsupported v1 conversion fails closed; original storage stays readable in the existing workspace. Rollback and restored-history integration tests exercise post-write failures and checksummed original recovery. Any unexplained loss/reference change is NO-GO.
