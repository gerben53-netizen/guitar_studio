# Sprint 2B baseline and migration matrix

2026-11-14: clean develop f4d4b78c497f8c40f8f01df689d71c8d2df95507; CI43611072549 PASS. Sprint2A is merged and retained. One checkout, no worktrees. Branch feature/design-system-v2-integration. Main remains6d7e249. Existing local React/Vite/Fastify/PostgreSQL app has no URL router: state selects dashboard/library/workspace/practice. Theme uses localStorage key theme and documentElement data-theme; no body.light in production. Existing modal uses native dialog/showModal, Escape and focus restoration. Domain/API/schema/ownership/session/audio contracts are outside styling scope.

ZIP documentation, tokens, CSS, assets and screenshots were inspected as reference; prototype JavaScript, data and browser storage are not production source. Actual develop overrides historical9384545. Full Labs remain future Sprint2C. #6/#8/#18 stay open; #14 stays open and its wider legacy scope is not silently accepted by viewport/axe checks.

## Mapping recorded before implementation

| Current | v2 migration |
| --- | --- |
| --bg / --panel / --card | --color-bg / --color-surface / --color-surface-raised |
| --line / --text / --muted | --color-border / --color-text-primary / --color-text-secondary |
| --accent / --ink | --color-accent-primary / --color-on-accent |
| --green / --select / --wood / --shadow | --color-success / --color-surface-interactive / --color-fretboard / --shadow-dialog |
| --split / --tab-columns | retain runtime custom properties |
| generic button/input/label/dialog base | explicit gs-button/gs-input/gs-field/gs-dialog component classes |
| panel/panelhead/badge/notice/primary | add gs-panel/gs-panel__header/gs-badge/gs-notice/gs-button--primary |
| shell/rail/top/brand | real logo + supplied plectrum, compact dark carrier in both themes |
| hero Artwork | approved original logo on navy artwork carrier; card SVG retained with semantic fills |
| Library, Workspace, ImportWizard, editors | preserve DOM/behavior; existing layout selectors scoped to gs-song-app |
| tabcell/fretboard/chord-diagram | shared musical role tokens and classes; no domain changes |
| production style.css | entrypoint layered reset→tokens→base→components→music→screens→brand→states; remove legacy token blocks and hex colors |

Prefer direct token migration over aliases. Source token registry is authoritative; implementation generator removes body.light compatibility. Existing700px mobile boundary moves to approved650px with matching CSS/media behavior. Preserve desktop compact editor, split state, internal tab/fret scroll and keyboard behavior.

Logo manifest originals are validated against ZIP. Separately attached PNG SHA2566e53a8ae2fd995313ab534fbbc6856c111f976a594c5c425ccd6351b54c04a1b differs from ZIP original1ede40b8c583d973b814c3e98b8801b73d543a9d52a27596ae4628fb10a8cfc2 (different raster dimensions). Use attached PNG byte-for-byte as primary browser logo; use manifest-verified ZIP plectrum/favicon/appicons. No vectorization or image generation.

Validation planned: unchanged34 unit/9 PG integration, existing8 browser tests plus theme/DOM/axe/contrast/screenshot checks in dark/light at1440×900,1280×800,1024×768,390×844; real Chrome on Windows11 and Chromium. CI lint/format/types/build/audit/secrets/Docker/migrate retained. Add no dependencies or new PWA.
