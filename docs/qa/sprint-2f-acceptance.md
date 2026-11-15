# Sprint 2F acceptance

The supplied 38 prototype scenarios are implemented against the real React application, canonical API and PostgreSQL. `e2e/workspace-v3.spec.ts` uses original synthetic lyrics and independent tracks, not prototype JavaScript or Song localStorage. Scenario numbers are named Playwright steps; scenario 36 runs at 1440×900, 1280×800, 1024×768 and 390×844, in both themes. A passing prototype claim is not counted as production evidence.

## Prototype matrix

| #   | Scenario              | Production assertion                                                                                      |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Open Song             | Sole v3 root and correct active track; no old-editor control                                              |
| 2   | Choose arrangement    | Canonical arrangement and active-track IDs change together                                                |
| 3   | Edit lyrics           | Saved text changes; all track event documents remain equal                                                |
| 4   | Chord above word      | Existing ChordEditor stores and displays the chosen grip                                                  |
| 5   | Full-width score      | Score and lyrics have equal available width; six lines per staff                                          |
| 6   | Measures per system   | 2/3/4 choices and responsive automatic grouping                                                           |
| 7   | Multiple systems      | Measure five is reachable and becomes the cursor context                                                  |
| 8   | Add track             | Named vocal track appears through canonical command                                                       |
| 9   | Rename track          | Explicit renamed track is retained                                                                        |
| 10  | Duplicate track       | Same musical events with entirely new event IDs                                                           |
| 11  | Delete track          | Name/event count, cancellation and explicit confirmation                                                  |
| 12  | Visibility            | Hide/show toggles independently                                                                           |
| 13  | Collapse              | Collapse/expand toggles independently                                                                     |
| 14  | Order                 | Canonical order matches the moved track                                                                   |
| 15  | Active track          | Manager selection updates editor and status                                                               |
| 16  | Physical fret 12      | Snaar 3, measure 1, explicit Enter commit                                                                 |
| 17  | Delete note           | Selected string is cleared while other tones remain                                                       |
| 18  | Duration              | 1/8 is stored as a reduced rational value                                                                 |
| 19  | Chord                 | Snaar 4 is added to the same compatible event group                                                       |
| 20  | Multiple notes        | Ctrl-click retains both selected tones                                                                    |
| 21  | Multiple measures     | Shift selection covers measures 1–3 across tracks                                                         |
| 22  | Undo/redo             | Keyboard undo and redo restore the exact physical fret                                                    |
| 23  | Independent vocal     | Other tracks remain byte-for-byte structurally equal                                                      |
| 24  | Lyrics lane           | Per-track lyric visibility is explicit                                                                    |
| 25  | Single link           | Chosen syllable appears under the selected note                                                           |
| 26  | Melisma               | Two event IDs cross a bar boundary with sustain and lane marks                                            |
| 27  | Replace link          | Explicit replacement reduces link to chosen event                                                         |
| 28  | Unlink                | Links disappear; all note events remain equal                                                             |
| 29  | Note to word          | Selected note marks the correct word identity                                                             |
| 30  | Word to notes         | All linked event tones are selected/highlighted                                                           |
| 31  | Neck states           | Collapsed, compact default and expanded views                                                             |
| 32  | Neck insertion        | Physical string 4/fret 5 at exact 1/8 position                                                            |
| 33  | Digit buffer          | 24 remains uncommitted past one second; Escape cancels; 12 commits only on Enter                          |
| 34  | Practice Mode         | Real shared engine starts, pauses and stops                                                               |
| 35  | Practice views        | Lyrics/vocal/guitar/all/linked filter correct tracks                                                      |
| 36  | Themes/responsiveness | Both themes, four viewports, keyboard focus, no page overflow and seven axe surfaces                      |
| 37  | Persistence           | Save/reopen and complete v2 JSON export preserve the document                                             |
| 38  | Existing source       | Explicit safe conversion preserves source, arrangements, physical frets 0/1 and original schema-1 history |

Additional browser scenarios cover manual syllable editing and destructive text-anchor review, Practice Room track/range/return snapshots and changed-source fallback. Existing regressions continue to test import formats/discovery/provider failures, personal signed LRCLIB storage and replay, complete multi-track JSON transfer including hidden tracks, offline draft export/retry, stale revision protection, library isolation, dialogs, settings and Practice Room/audio lifecycle. Old split panes, mobile panel tabs, timeout entry and unsafe legacy draft recovery assertions were replaced by assertions for the sole canonical editor.

## Release gates

| #   | Requested criterion         | Evidence or completion gate                                                                                                       |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Functional Workspace        | V3 prototype matrix and original workflow regression                                                                              |
| 2   | Full available width        | Equal score/lyrics width and visual review                                                                                        |
| 3   | Six strings                 | Staff line count and keyboard positions                                                                                           |
| 4   | Multiple measures           | Explicit 2/3/4 system assertions                                                                                                  |
| 5   | Automatic wrapping          | Responsive systems, later bars reachable                                                                                          |
| 6   | Independent tracks          | Canonical event equality and polyphony unit tests                                                                                 |
| 7   | Track manager               | CRUD, order, visibility, collapse, role, active and last-track domain guard                                                       |
| 8   | Lyrics below tab            | Per-track explicit link lanes                                                                                                     |
| 9   | Syllable links              | Add/replace/unlink and reciprocal selection                                                                                       |
| 10  | Melisma                     | Cross-bar multi-event link with sustain                                                                                           |
| 11  | Compact neck                | Three states, compact default, internal scrolling                                                                                 |
| 12  | Direct fret input           | Explicit two-digit physical buffer and validation                                                                                 |
| 13  | Keyboard                    | Roving focus, arrows, Ctrl/Shift selection, Enter/Escape/Delete                                                                   |
| 14  | Undo/redo                   | Whole-document pure history and browser keyboard regression                                                                       |
| 15  | Multi-track Practice        | Five views, shared engine, selected range and source return                                                                       |
| 16  | Existing search/import      | Existing format/discovery browser and parser/API regressions                                                                      |
| 17  | Personal LRCLIB             | Existing real adapter/receipt/transaction/restart browser and PostgreSQL tests                                                    |
| 18  | Existing data               | No eager user-data rewrite; original/history/backup conversion tests                                                              |
| 19  | PostgreSQL                  | Existing canonical transactions and 39 integration cases                                                                          |
| 20  | Safe conflicts              | Offline draft retention and real stale-revision browser/API assertions                                                            |
| 21  | All 38 production scenarios | Numbered matrix above and complete Chrome run                                                                                     |
| 22  | Chrome regression           | Complete existing and new suite, installed Chrome locally                                                                         |
| 23  | Axe                         | Zero violations required on workspace, manager, linking, compact/expanded neck, Practice and import at all four sizes/both themes |
| 24  | Final CI                    | Exact final PR head quality/secrets green, then merged develop CI green                                                           |
| 25  | Issues complete             | Only #65–73 and milestone #8 close after verified merge                                                                           |
| 26  | Develop merge               | One PR from feature/song-workspace-v3; no main/release/deployment changes                                                         |

Repository-state gates 24–26 are recorded in the PR completion record after they occur. This source file does not claim future merge or CI results. Measured local results, screenshot locations and the visual review are recorded in the sprint report. No-data-loss remains an absolute gate.
