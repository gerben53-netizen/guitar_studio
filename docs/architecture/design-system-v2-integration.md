# Design System v2 integration

The accepted Work ZIP is a design reference; the existing React components, server persistence and music-domain remain the application. No demo renderer, JavaScript, fictitious songs, prototype storage or Practice Room Labs are imported. Baseline is the merged Sprint 2A develop, not the historical reference commit in the ZIP.

## Register and cascade

`apps/web/src/design-system/tokens.json` is the original v2 semantic register. `npm run design:tokens` regenerates gs.tokens.css using existing Prettier; `npm run design:check` checks exact generation, five browser asset hashes, color centralization and 32 contrast pairs. There are no new dependencies. Change the register, regenerate, then review visual evidence; do not edit generated token CSS alone.

The style.css entrypoint declares `reset → tokens → base → components → music → screens → brand → states` before imports. Foundation/components/music come from the provided framework, with production integration additions in gs.brand.css. Existing production layout selectors are retained in gs.song.css inside `.gs-song-app`, using native CSS nesting supported by the Chrome baseline. The shell itself uses `&.shell`; descendant screen rules cannot affect a future sibling Practice root. No prototype data-layout adapter is used. Global reset/base rules live only in foundation; screen rules are all bounded. Legacy color token blocks are removed, not kept as competing themes or aliases. The baseline contains the complete token/component migration matrix.

Runtime inline style values remain only `--split` and `--tab-columns`; no inline colors. Artwork SVG uses semantic fills/strokes. Fretboard strings/wires/nut, selected notes, tablature, chords and future I/III/V shapes share musical token roles. Structural borders are distinct from contrast-tested interactive borders. A structural border is not claimed to have 3:1 contrast.

## Component mapping

| Production component | Applied contract                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| App                  | gs-song-app shell, brand carrier, original PNG, plectrum rail, root data-theme, active navigation                           |
| Library              | gs-button/input/badge, scoped cards/filters/progress, hero logo and semantic artwork; correct h2/h3 card hierarchy          |
| Workspace            | existing panel/settings/section/view controls, save status, lyrics and Practice Mode; aria-pressed for view/section choices |
| TabEditor            | gs-panel/header/tab-note/input/button, existing rational grid and keyboard handlers                                         |
| Fretboard            | gs-fretboard/button, musical wire/nut/selection tokens; existing six-string/capo/tuning calculation unchanged               |
| ChordEditor          | gs-dialog/fields/buttons, existing grip diagram/presets/custom-grip behavior                                                |
| ImportWizard         | gs-dialog/fields/notices/buttons, existing rights/file/source/validation flows                                              |
| Dialog               | native modal + unique title ID, explicit Tab/Shift+Tab boundary wrapping, Escape and original focus restoration             |

Navigation remains the application's existing state-selection buttons with aria-current; no URL router or artificial links are added to simplify styling. One banner header is outside the one main landmark, and the labeled navigation stays distinct. Input labels and existing roving tab/fret keyboard handling are retained. Error notices have text and role=alert; save/API feedback has status semantics. Disabled uses native disabled. Reduced motion is implemented in the final states layer. The automated tests verify rendered DOM, not just source classes.

## Theme and assets

DocumentElement `data-theme=dark|light` is the sole selector. The existing localStorage `theme` preference is preserved; invalid values fall back to dark. No body.light path exists. Test cases switch and reload both themes and check actual body/brand colors. The original horizontal logo is contained, never recolored or stretched, on the fixed dark brand carrier even in light. Header is 72px desktop/66px mobile; the logo is at most 176×59 or 150×50. The extra desktop height follows the approved v2 compact brand header.

The separately attached original PNG is the browser logo, byte-identical to that attachment. Its raster dimensions/hash differ from the equivalent ZIP raster; both hashes are documented in the baseline. Plectrum, favicon and 192/512 app icons come unchanged from verified ZIP manifest entries. Favicon and apple-touch-icon links are added; there is no PWA manifest, service worker or install behavior. Raster-containing SVG wrappers are not used or described as vectors.

## Visual comparison and deliberate differences

Source screenshots inspected include dashboard, Workspace and mobile references. Delivered screenshots cover nine screen states in both themes at four requested viewports. Navy/cyan roles, surfaces, logo, controls and music readability follow v2. Actual song content/counts, API status and server storage differ from the fictitious demo. Production retains instrument/profile selection, rational grid options, source/rights checks, recovery controls, explicit manual song progress and JSON transfer that simplified prototype flows omit. These differences preserve functionality.

The existing vertical production rail and mobile pane selection remain; there is no new Practice Room link or four-Lab UI. The original 700px mobile breakpoint is aligned to approved 650px; the existing compact desktop layout stays intact. Only tab/fretboard have internal horizontal scroll; tests check the document does not overflow at 1440×900, 1280×800, 1024×768 and 390×844. These are browser viewports, not physical-device acceptance.

## Future Practice Room

Sprint 2C can reuse the same gs-button/field/panel/notice/dialog contracts and music tokens under a distinct gs-practice-app root. Keep all Sprint 2A services, owner boundaries, theory and metronome unchanged. Future Labs still need actual React UI/navigation, explicit mastery confirmation, active-session tracking and metronome route cleanup. No empty Lab components or prototype practice CSS are installed in this visual sprint. #6, #8 and EPIC #18 stay open; this is not full WCAG certification or physical speaker/device acceptance.
