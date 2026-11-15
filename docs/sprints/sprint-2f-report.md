# Sprint 2F — Song Workspace v3

V3 replaces the old editor with a canonical multi-track workspace. There is no compatibility editor or mode switch. Existing documents and original imports remain protected by the established conversion, revision, history and backup contracts.

## Delivered

- Full-width six-string tablature with shared measure systems, rational positions, automatic or explicit 2/3/4 columns and internal mobile scrolling.
- Independent vocal/guitar/custom tracks; manager for names, roles, creation, duplication, confirmed deletion, order, visibility, collapse and active track.
- Physical fret entry 0–24 with an explicit two-digit Enter/Escape buffer; chord tones, rests, durations, selection and complete-document undo/redo.
- Lyrics/chords above the score, per-track linked syllable lanes, manual syllables, cross-bar melisma/sustain, reciprocal highlighting and explicit text-anchor review.
- Reused chord editor and fretboard with physical tuning/capo context, simultaneous polyphonic tones and three neck states.
- Shared-engine Practice with five views, range/repeat/tempo/transport, progress/fullscreen and validated Practice Room snapshots/return.
- Existing search/import/LRCLIB workflows, original source/timing inspection and complete schema-2 JSON transfer.
- One validated document/autosave queue, offline draft export/retry, optimistic conflicts and historical revision export/confirmed restore.

Implementation is split between `WorkspaceV3`, `ScoreSystem`, `TrackManager`, `LyricLinkEditor`, `WorkspaceDialogs`, `useScorePractice`, the canonical `useSong` hook and pure `workspace-editor` commands. The old Workspace and TabEditor files were removed. Only scoped semantic CSS and existing DS v2 colors/fonts are used. Import creation writes new Songs directly as schema 2. No SQL migration, extra persistence table, new audio engine or dependency was added.

See [component and storage architecture](../architecture/song-workspace-v3-ui.md) and the [38-scenario/26-gate acceptance matrix](../qa/sprint-2f-acceptance.md).

## Validation

Local acceptance is PASS. The complete installed-Chrome run passed all 49 cases in 14.2 minutes. A final focused rerun also passed after tightening the duration/technique context when selecting a linked word. Merge/CI/issue closure are separate completion gates and are recorded in the PR after they occur.

| Check                                              | Result                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Unit/domain/audio/import                           | 130 passed                                                                     |
| PostgreSQL canonical/import/owner/revision/history | 39 passed                                                                      |
| Installed Chrome regressions                       | 49/49 passed; Chrome 157.0.8103.51 on Windows; final focused regression passed |
| V3 prototype acceptance                            | 38/38 passed through numbered real-app steps                                   |
| Accessibility                                      | 56/56 scans; zero violations at every severity                                 |
| Lint/typecheck/design-system/build                 | PASS                                                                           |
| Formatting/diff                                    | PASS                                                                           |
| PR and merged develop CI                           | Required green before/after merge                                              |

Tests use an isolated PostgreSQL test database and synthetic original lyrics. The separate user database retained all 3 Songs with an equal document/revision digest through local acceptance; private digest evidence is not committed. No real user database was converted or rewritten. Existing integration assertions additionally verify that new personal LRCLIB imports are stored directly as schema 2 while retaining original source/provenance/synchronization. Real provider transport is replaced by the existing injected fixture adapter; application routes, signed receipts, transactions and persistence remain real.

## Visual review and deviations

The supplied full-width, desktop-dark and track-manager reference screenshots were inspected. Production uses the same stacked lyrics/score/neck hierarchy and shared multi-track systems. It retains the application's navigation rail, original logo, accessible form controls and source/permission review. Controls are larger than the isolated prototype, and score systems scroll vertically inside their panel. Expanded mobile neck/system content scrolls horizontally inside its own panel, with no page overflow. The active staff exposes detailed empty entry points while inactive bars render existing events and an entry point, reducing DOM size without changing musical data.

Visual review confirms full-width aligned systems, six distinguishable strings, readable links below notes, per-track controls and all three neck states. The final mobile check additionally verifies that adjacent string targets do not overlap. Native manager dialogs scroll internally to later tracks and actions.

All screenshots use original fixtures. The [machine-readable evidence summary](../qa/screenshots/sprint-2f/axe-summary.json) records all 56 checks, viewports, themes and browser version.

| Review                | Screenshots                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full-width desktop    | [Dark](../qa/screenshots/sprint-2f/workspace-dark.jpg), [light](../qa/screenshots/sprint-2f/workspace-light.jpg)                                                                |
| Track manager         | [Dark](../qa/screenshots/sprint-2f/track-manager-dark.jpg), [light](../qa/screenshots/sprint-2f/track-manager-light.jpg)                                                        |
| Syllables and melisma | [Editor](../qa/screenshots/sprint-2f/syllables-dialog.jpg), [linked bars](../qa/screenshots/sprint-2f/lyrics-melisma.jpg)                                                       |
| Neck                  | [Compact](../qa/screenshots/sprint-2f/neck-compact.jpg), [expanded](../qa/screenshots/sprint-2f/neck-expanded.jpg)                                                              |
| Responsive            | [Mobile dark](../qa/screenshots/sprint-2f/mobile-dark.jpg), [mobile light](../qa/screenshots/sprint-2f/mobile-light.jpg), [tablet](../qa/screenshots/sprint-2f/tablet-dark.jpg) |
| Practice/import       | [Practice](../qa/screenshots/sprint-2f/practice-dark.jpg), [wizard](../qa/screenshots/sprint-2f/import-dialog.jpg)                                                              |

## Explicit limits

- The import wizard exposes new Song, new arrangement and append. It does not offer a selected-track destination without an explicit validated timing map. Original ASCII and millisecond timing remain intact; neither is guessed into note positions.
- Practice uses the existing metronome rather than synthesized tab audio. A mixed-meter range requires selecting a homogeneous passage; its actual meter is never silently changed.
- The old split-pane/mobile-tab editor and its measure clipboard were not retained. V3 has its own selection and editing model, following the user's instruction that backwards compatibility is unnecessary.
- A stored legacy document that cannot be safely represented requires manual migration review. It is not rewritten or opened through a second editor. Supported legacy fixtures are covered by conversion and source/history preservation tests.

## Repository completion

One checkout and branch `feature/song-workspace-v3`; milestone #8; only Sprint 2F issues #65–73. One PR targets develop. Main, release tags and deployment remain untouched. The final PR completion record must identify the merge commit, exact-head CI, merged develop CI and closure of only this sprint's issues/milestone.
