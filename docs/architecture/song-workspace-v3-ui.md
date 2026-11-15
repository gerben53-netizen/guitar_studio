# Song Workspace v3 UI

V3 is the sole Song editor. The old Workspace/TabEditor and their timeout-based fret entry have been removed. This follows the user's explicit instruction that backwards compatibility is unnecessary. Existing stored documents, original imports, revision history and schema backups remain data preservation obligations; there is no old-editor toggle or test-only editor.

## Components and state

`main.tsx` fetches canonical `/songs/:id/multitrack` before mounting `WorkspaceV3`. `useSong` owns one validated `MultitrackSong`, full-document undo/redo and a serialized revision-aware autosave queue. UI-only cursor, selection, input buffer, layouts and collapsed panels live in `WorkspaceV3`. The library still uses the existing metadata projection; it is not an editable secondary document. New songs, duplicates and new-song imports are normalized to schema 2.

`ScoreSystem` groups the existing section/measure timeline into systems. Every visible ordered track renders against exactly the same measure IDs and widths. Each staff contains six horizontal string lines; positions are fractions of the actual meter capacity. Two, three, four or responsive automatic columns are presentation choices. Mobile systems scroll internally, while later systems remain vertically reachable. There is no grid/spreadsheet editor or wide track sidebar.

The active bar exposes sixteenth-note entry points. Other bars render event positions and an initial entry point; clicking an empty string selects a sixteenth-note position and keyboard movement exposes the exact cursor. Existing non-grid rational event positions are rendered unchanged. This avoids thousands of unnecessary empty controls in long arrangements. Percentages are derived presentation values and are never stored as musical time.

`TrackManager` calls Sprint 2E pure commands for add, rename, role, duplicate, delete, visibility, collapse, order and active selection. Duplicates remap events and links. Deletion displays the name, event count and link count, requires confirmation and cannot remove the final track.

`LyricsTextEditor` previews Sprint 2E `planLyricsEdit` before applying a shared text edit. Affected links, manually divided syllables and chord anchors require explicit confirmation; note events are never removed by text editing. `SyllableEditor` supports manual `wa|ter` divisions with stable IDs for unchanged parts. Explicit `LyricsLink` records connect syllables to one or more events, including across bars. The lane is independently visible per track. Word selection highlights linked notes; note selection identifies the linked word. Add, replace, unlink, melisma and sustain are separate actions.

`Fretboard` and `ChordEditor` are the existing components. The neck has collapsed, compact (default) and expanded states; it projects the active track for display without changing canonical storage. Physical fret numbers 0–24, tuning, capo and stored pitch are authoritative. Pitch-only notes are retained and identified without inventing a fingering. Chord shapes remain relative to capo in the chord editor and are converted explicitly when placed into physical tab positions.

## Editing and persistence

`workspace-editor.ts` provides pure commands for physical note insertion, independent simultaneous durations, chord-tone deletion, rests, cursor movement, arrangement duplication, selections and complete-document history. All results pass the existing strict schema and musical validation. Notes use the existing `NoteEvent.tones` model. Changing one string does not flatten a chord or another track's polyphony. Simultaneous notes with different articulations remain separate event groups; changing an existing fret preserves its articulation. Practice also respects the canonical track order.

Digits enter a visible buffer; only Enter or Plaats commits. Escape cancels, and no timer commits partial digits. Arrows move by selected duration and string; Shift extends selection. Ctrl/Meta plus click selects multiple tones; Shift plus a measure heading selects a contiguous bar range. Delete/Backspace removes the selected tones; Ctrl/Meta+Z and Ctrl/Meta+Shift+Z undo/redo. Native form text editing retains its own keyboard behavior. One roving tab stop keeps score navigation usable.

Autosave coalesces edits after 600 ms, serializes writes and uses the current revision. A 409 or outage retains the draft and enables complete JSON export, retry or an explicitly confirmed server reload. Full-document undo/redo is saved as a new revision. Opening a schema-1 document does not rewrite it. Its first write requires confirmation and uses the existing transactional original-document backup and history. A document that cannot be safely converted is rejected without modifying storage. Historical documents can be exported or explicitly restored as a new validated revision.

## Practice and import

`useScorePractice` acquires the existing shared metronome only after Start. The engine is reused, stopped on exit/range change and released on unmount. It provides start/pause/stop, tempo, repeat, current measure and selection/all-bar scopes. Views are lyrics, vocal, guitar, all tracks and tracks with explicit lyrics links. It does not synthesize tablature playback. Mixed-meter ranges are explicitly rejected; a homogeneous passage in 2/4, 3/4, 4/4 or 6/8 uses its actual meter rather than being silently retimed.

Practice Room handoff uses the existing origin endpoint with selected tracks, measure range and return cursor. Return resolves the source again; a changed or missing passage falls back to the library while preserving its original snapshot. No second audio engine or local Song storage was added.

The existing wizard/search/parser/LRCLIB receipt and transactional import routes remain shared. Normalized source text, ASCII tab blocks, attribution, personal-import metadata and original millisecond synchronization remain separately inspectable in v3. Musical positions are not inferred from source timing. The wizard supports new Song, new arrangement and append; this sprint does not expose importing a timed source directly into a selected track. The existing domain track adapter is retained, but an explicit validated mapping is required before such a UI can be offered. This is the documented import-destination limitation permitted by the sprint brief.

## Styling and boundaries

Only semantic CSS is used. The module is scoped beneath `.gs-workspace-v3` and imported after the design-system layers in `style.css`, preserving DS v2 layer order. Colors and fonts come from existing tokens; no utility framework, new design system or copied prototype JavaScript was introduced. The production navigation, original logo, permission review and import attribution remain. Unlike the isolated prototype, the editor retains the application's navigation rail and larger accessible controls. Long systems scroll inside the score; compact and expanded necks use internal horizontal scrolling.

No SQL migration or new persistence table is required. Owner resolution, canonical GET/PUT/PATCH, optimistic locks, revision history, schema backups and Practice origin validation are the Sprint 2E contracts. Import creation now writes canonical schema 2 directly. No user database was bulk-converted, and main/release/deployment are outside this sprint.
