# Sprint 2B Design System v2 acceptance

Official environment: Microsoft Windows 11 Home 10.0.26200, Google Chrome 157.0.8103.51. Additional Playwright Chromium 159.0.8154.6. Only these browsers are in scope. Viewports are 1440×900, 1280×800, 1024×768 and 390×844; no physical mobile-device acceptance or full WCAG certification is claimed.

## Acceptance matrix

| #   | Gate                                     | Technical evidence / integration condition                                                                                                                                              |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Original logo and brand assets           | PASS: attached original PNG unchanged, five browser asset SHA-256 checks, all ZIP manifest entries checked; dark carrier in both themes                                                 |
| 2   | Dark/light tokens and persistence        | PASS: exact registry-generated CSS, theme switch/reload, actual body and carrier colors; existing preference key retained                                                               |
| 3   | Shared semantic CSS and isolation        | PASS: gs-* controls/panels/fields/music, explicit layers, screen root boundary, no old color aliases/hex colors outside tokens or body.light                                            |
| 4   | All existing production screens migrated | PASS: dashboard/library/workspace/lyrics/tab/hals/chord/import/Practice Mode; 72 committed Chrome screenshots                                                                           |
| 5   | Music and persistence preserved          | PASS: unchanged domain/API/DB/owner/useSong/request source; 34 unit, 9 PG integration and existing functional regressions                                                               |
| 6   | Four viewports Chrome/Chromium           | PASS: four two-theme cases + eight existing scenarios + targeted splitter/scroll case in each browser                                                                                   |
| 7   | DOM, keyboard, dialog, axe               | PASS: 144 axe scans across two browsers, zero violations in chosen WCAG tags; landmarks, heading/label semantics, tab/fret keyboard, explicit dialog wrap/Escape/restore, visible focus |
| 8   | Quality/security/CI                      | Local lint/types/format/build/design checks/migrations/integration/audit PASS; exact PR-head quality/secrets and final develop CI are required before completion                        |
| 9   | Documentation/evidence                   | PASS: baseline mapping, architecture, report, raw axe/contrast/environment records and screenshot index                                                                                 |
| 10  | Merged clean develop                     | Integration gate: only after green exact-head CI; final PR completion record records merge SHA, develop CI and clean tree                                                               |

## Tests and evidence

Local browser execution: 12/12 suite tests in Chromium, 12/12 in installed Chrome; one additional targeted split/scroll/focus test PASS in each (13 distinct scenarios per browser). New design suite has four viewport cases, each visiting nine screen states in dark/light: 72 axe scans per browser, 144 total. Each uses WCAG2A/AA and WCAG2.1AA tags; violations are zero, including no serious/critical issues. This is not an exhaustive screen-reader or best-practice audit. Complete raw scans and environments are in [evidence/sprint-2b](evidence/sprint-2b).

The targeted case tests actual keyboard and pointer splitter changes, preserved split and fret scroll across a dialog, both directions of focus wrapping, Escape/restoration, mobile pane access and 44px pane controls. Browser suites check document overflow at every screen state. Only internal musical scrolling is allowed. Tests also type tab notes and arrow between frets; existing regressions cover lyric anchors/chord placement/custom grip/Undo/Redo/import rights and file validation/tuning/capo/manual Practice Mode/save/reload/JSON/recovery/outage/conflicts.

`npm run design:check` recomputes 32 approved token contrasts: normal text ≥4.5:1 and the designated focus/interactive borders/tab lines ≥3:1. [Computed ratios](evidence/sprint-2b/contrast.json) are distinct from axe's checks of actual rendered pages. Structural borders and disabled controls are not claimed to meet interactive contrast thresholds. Focus and status text remain separate from color.

Theme tests retain the existing localStorage key and verify reloading in both modes. There are no API/schema/music-domain/storage modifications. Migration runner executes twice against the separate PostgreSQL test database. Docker builds and starts the normal Compose app without deleting volumes; CI additionally tests fresh migrations/catalog seeding and HTTP health. npm audit reports zero vulnerabilities; CI scans Git history for secrets.

## Visual evidence

All 72 screenshots are in [screenshots/sprint-2b](screenshots/sprint-2b). Filename pattern: WIDTH-THEME-SCREEN.jpg. Screens: dashboard, library, workspace, lyrics, chord, import, tab, fretboard, practice. Each exists at all four widths and both themes. Representative comparisons:

- [Dashboard dark](screenshots/sprint-2b/1440-dark-dashboard.jpg) / [light](screenshots/sprint-2b/1440-light-dashboard.jpg).
- [Workspace](screenshots/sprint-2b/1440-dark-workspace.jpg), [tab](screenshots/sprint-2b/1440-dark-tab.jpg), [fretboard](screenshots/sprint-2b/1440-dark-fretboard.jpg), [chord dialog](screenshots/sprint-2b/1440-dark-chord.jpg).
- [Library](screenshots/sprint-2b/1440-light-library.jpg), [import](screenshots/sprint-2b/1440-light-import.jpg), [lyrics](screenshots/sprint-2b/1440-light-lyrics.jpg), [Practice Mode](screenshots/sprint-2b/1440-light-practice.jpg).
- [1280 compact](screenshots/sprint-2b/1280-dark-workspace.jpg), [1024 compact](screenshots/sprint-2b/1024-light-workspace.jpg), [390 mobile](screenshots/sprint-2b/390-dark-workspace.jpg), [mobile hals](screenshots/sprint-2b/390-light-fretboard.jpg).

Compared with accepted ZIP screenshots: same navy/cyan roles, original horizontal brand, dark carrier, panel separation and music styling. Production keeps real song counts/server statuses/profile/grid/recovery/JSON controls; no mock Practice Room link, fake song flow or localStorage song persistence is copied. Existing vertical navigation and production mobile pane flow are retained. These differences are intentional; see architecture for details.

## Findings, fixes and limitations

A new backward keyboard probe exposed native dialog behavior that could move focus outside the modal toward browser chrome. Dialog now explicitly wraps Tab/Shift+Tab on its visible enabled controls, uses unique heading IDs and preserves native Escape/return focus. Import validation now associates invalid fields with the error and announces busy creation. Card headings use h2 in the library and h3 under the dashboard collection. Existing backend functionality remains authoritative.

No Safari/Firefox/Edge, physical phone, screen-reader speech, OS audio latency or WCAG certification tested. #14 remains open rather than replacing its existing scope with automated acceptance. #6/#8/#18 stay open for actual user feature work. Practice Room Labs, navigation/session UI and Design System integration into those future components remain Sprint 2C. Source-time repository gates are finalized in the linked PR completion record after merge.
