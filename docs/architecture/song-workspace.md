# Song Workspace architecture

The accepted source is the user's original Guitar-Studio-Prototype.zip/HTML, design review and screenshots. React components replace its imperative HTML/event dispatch; original source is not executed inside the application. Original fictional demo lyrics are explicitly opt-in seeded into PostgreSQL with `npm run seed:demo`, never fabricated as dashboard totals.

## Ownership and persistence

`StudioSong` is the application aggregate, composing Sprint 0's InstrumentProfile, Measure, NoteEvent, MusicalTime and pitch validators. It adds shared tokenized lyric sections, independently editable musical arrangements, word-anchored chord grips, metadata, favorite/archive state and manual practice progress. Song document `schemaVersion: 1` and the `guitar-studio` JSON envelope `version: 1` are explicit. Unknown export versions are rejected. Future upgrades require deliberate converters/migrations rather than best-effort field loss.

An arrangement references shared lyrics by ID. Its own sections, measures, events and chord placements have independent IDs. Duplication generates new musical IDs and remaps measure references while sharing lyric IDs within a song. Adding/reordering shared sections preserves existing IDs and reorders arrangement references, not musical events. A chord refers to a stable token and measure; section membership defines the associated measure passage. This is manual linkage, not word-to-note playback synchronization.

PostgreSQL migration 002 adds `studio_songs` and cascading `studio_song_versions`; the existing foundation table/migration is untouched. The JSONB aggregate is appropriate for atomic personal-workspace edits in this sprint; normalized cross-song query models can be added later. Every create/update validates the entire aggregate, reference integrity, duplicate IDs, physical pitches and measure bounds. Parameterized queries isolate song deletion. The deleted song's own versions cascade; other songs are untouched.

REST endpoints: GET/POST `/api/v1/songs`, PUT/DELETE `/api/v1/songs/:id`, GET `/api/v1/songs/:id/history`. Updates require the observed revision and increment it atomically. A stale update/delete returns 409 instead of replacing somebody else's newer version. Revision history is written in the same transaction; the latest 20 successful snapshots remain available. Restoring writes a new revision, preserving the current snapshot in history. DELETE requires a revision and a user confirmation in the UI.

## Editing and save lifecycle

`useSong` owns the current draft, session Undo/Redo (100 snapshots), server revision and serialized save queue. After a 600 ms debounce, one write runs at a time; edits made during a request are written afterwards against its new revision. Comparison uses the submitted snapshot, avoiding JSONB key-order differences causing endless writes. No song content is placed in localStorage; only theme preference is stored there.

Pending/saving/saved/failed states are visible. Failed saves retain the draft, offer explicit retry and JSON export, and block switching to another song until saved. A conflict offers export or explicitly loading the server version. Unsaved content triggers the browser's leave warning. Server failure does not produce a false saved indicator. Browser closure or an OS crash before a successful save can still lose the unsaved RAM draft; this is not offline-first storage.

## Stable lyrics anchors (#9)

Words, whitespace and line breaks are tokens with stable IDs. A bounded LCS reconciliation preserves unchanged tokens across local spelling edits/insertions. Repeated tokens with changed multiplicity are treated conservatively as ambiguous. A removed/ambiguous chord anchor becomes null while its chord, grip, original word and musical reference remain. The UI shows a targeted warning and lets the user pick a replacement word or explicitly remove it. Undo includes text and chords together. This intentionally differs from the prototype's destructive reset.

## UI and accessibility

The shell, library, import wizard, workspace, tab, neck and chord editor are typed components. Native dialogs support modal focus, Escape and focus return. The tab and neck each use a roving focus stop with arrow navigation. The resizer supports pointer and keyboard changes. Mobile panel switches retain the shared measure/time/string cursor and display it above the panel tabs. Theme uses copper/sage semantic tokens and component/state CSS classes; no utility framework/classes are used. Runtime CSS variables describe resizer/grid geometry; progress uses semantic HTML.

No authentication, shared-user concurrency UI, audio, tuner, automatic transcription, provider scraping or production hosting is introduced. Keep the development stack bound to loopback and design authorization before future network hosting.
