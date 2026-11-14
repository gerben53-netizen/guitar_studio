# Sprint 1 acceptance

Tested on 2026-11-14 against the integrated React/Fastify/PostgreSQL application, not the standalone prototype. The original source reports/screenshots are design reference only. Local Chromium/Playwright tests use real HTTP persistence; failure cases deliberately inject 503 responses and a real stale-revision conflict. Test-owned song IDs are cleaned up; the three original fictional demos remain in the local database.

## Automated evidence

- Lint, strict TypeScript, frontend/backend builds: PASS.
- Unit tests: 15 PASS (including original foundation tests, stable anchors, meter/duration bounds, profiles, cloning, JSON version rejection and prototype conversion).
- Real PostgreSQL integration tests: 2 PASS (foundation readiness and atomic CRUD/revisions/history/deletion isolation).
- Chromium tests: 7 PASS in the complete local run. The suite is also required in GitHub Actions; CI retains reports, screenshots and failure traces.
- Responsive workspaces: 1440×900, 1024×768 and 390×844 PASS; document width never exceeds the viewport. Mobile panel changes preserve active measure, rational position and string; tab/neck targets are 44 px high.
- Axe WCAG 2/2.1 A/AA rules: zero violations in the tested desktop workspace. This is an automated sample, not complete WCAG certification.
- Central authoring workflow: zero page exceptions and zero browser console errors. Injected 503/409 cases are expected network errors, visibly handled without discarding the draft.

## Required functional scenarios

| #   | Scenario                       | Result / executable evidence                                                                       |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | Create/open song               | PASS — import-to-practice browser flow and library reopen                                          |
| 2   | Import lyrics                  | PASS — manual input and real UTF-8 file input, rights gate and source metadata                     |
| 3   | Edit lyrics without chord loss | PASS — insertion preserves chord; removed word leaves visible retained anchor; targeted reposition |
| 4   | Add/reorder sections           | PASS — add Bridge and move up, IDs/reference integrity retained                                    |
| 5   | Place/change chords            | PASS — C to G on a selected word; stable anchor follows edits                                      |
| 6   | Custom fingering               | PASS — named custom Am grip with changed high-e fret is persisted                                  |
| 7   | Fingering to tab               | PASS — manual command writes simultaneous positioned tones                                         |
| 8   | Neck input                     | PASS — clicking the neck immediately changes the selected tab event                                |
| 9   | Tab edits                      | PASS — digits change frets, including two-digit fret 12                                            |
| 10  | Simultaneous notes             | PASS — multiple strings at one rational start, matching neck markers                               |
| 11  | Duplicate measure              | PASS — extra independent measure; multi-measure copy/paste also verified                           |
| 12  | Undo/Redo                      | PASS — fret correction and restoring a server version are undoable; redo verified                  |
| 13  | Duplicate arrangement          | PASS — separate IDs/data, shared lyrics, selected arrangement survives reload                      |
| 14  | Tuning/capo/instrument         | PASS — Drop D, acoustic/electric, capo 2, unchanged absolute frets and correct F2 output           |
| 15  | Practice Mode                  | PASS — chords/tab, manual progress and section completion; actual Chromium fullscreen entry/exit   |
| 16  | Persistence                    | PASS — reload and a new API read retain content; container restart check recorded in sprint report |
| 17  | JSON export/import             | PASS — browser download re-import preserves grips/sections/tones; unknown version rejected         |

Additional library coverage: metadata search, status/difficulty/tag filters, favorites, list/card toggle, independent song duplication, archive/restore, confirmed deletion and unrelated song retention. Storage tests retain an unsaved note during failure, retry successfully, reject a stale writer and explicitly reload the newer server version. History snapshots can be restored as a new revision.

## Screenshots

The following are actual screenshots from this implementation's Playwright suite. They are full-page captures at fixed browser viewports; a full-page PNG may be taller than the viewport. Content includes deliberately edited acceptance examples.

| View               | File                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| Dashboard          | [01-dashboard](screenshots/sprint-1/01-dashboard.png)                           |
| Song library       | [02-songbibliotheek](screenshots/sprint-1/02-songbibliotheek.png)               |
| Lyrics import      | [03-lyricsimport](screenshots/sprint-1/03-lyricsimport.png)                     |
| Combined workspace | [04-workspace-gecombineerd](screenshots/sprint-1/04-workspace-gecombineerd.png) |
| Tab editor         | [05-tablatuureditor](screenshots/sprint-1/05-tablatuureditor.png)               |
| Linked fretboard   | [06-gitaarhals](screenshots/sprint-1/06-gitaarhals.png)                         |
| Chord editor       | [07-akkoordeditor](screenshots/sprint-1/07-akkoordeditor.png)                   |
| Practice Mode      | [08-practice-mode](screenshots/sprint-1/08-practice-mode.png)                   |
| Mobile workspace   | [09-mobiele-workspace](screenshots/sprint-1/09-mobiele-workspace.png)           |
| Light mode         | [10-light-mode](screenshots/sprint-1/10-light-mode.png)                         |
| Tablet             | [11-tablet-workspace](screenshots/sprint-1/11-tablet-workspace.png)             |
| Desktop            | [12-desktop-workspace](screenshots/sprint-1/12-desktop-workspace.png)           |

## Acceptance limits — issue #14 remains open

Chromium at the three requested sizes, keyboard navigation, DOM accessibility names, modal focus and automated Axe checks are verified. No physical iPhone/iPad, Safari, VoiceOver or NVDA session was available. Desktop Chromium sizing does not prove mobile virtual-keyboard, physical touch or screenreader behavior. Keep #14 open for those broader existing acceptance requirements; do not infer a complete accessibility PASS from Axe alone. These limits do not conceal an automated test failure.
