# Sprint 2E — Multi-track Domain & Persistence Foundation

Technical foundation implemented on `feature/multitrack-domain-foundation`, targeting develop from baseline `47941f3`. Milestone #7; implementation issues #54–61. The single PR completion record supplies final exact-head CI, merge/develop CI and issue closure evidence after those gates actually complete. No main/release/deployment work is included.

## Result and data structure

Schema 1 stores an instrument and measures with NoteEvents inside each arrangement section. Schema 2 keeps the same Song metadata/import contracts, shared sections/measures and rational timing, with independent six-string tracks referring to those measure IDs. Track tuning is the existing instrument.tuning, not a second source. NoteEvents keep simultaneous tones, duration, rests, physical frets/pitches and optional technique. The positional adapter retains grouping so chords never become sequential notes. Stable word/line/syllable identities and explicit validated LyricsLinks support cross-bar sustain/melisma.

Pure validated commands implement track CRUD/order/selection/flags, events, links, meter/capo and safe text/syllable editing. Last-track deletion, invalid references, same-string overlap and invalid meter changes fail without mutation. Canonical document API supplies revision-checked reads/writes/commands/history/backups using the existing owner boundary. Existing editor writes merge the designated compatibility track into the complete Song. Hidden tracks/links are preserved or the write is rejected. JSON transfer/duplication includes all tracks and remaps independent IDs. Unsafe unsaved legacy drafts export a recovery envelope containing the full base and draft for review. Undo/Redo returning to the saved snapshot now also resets its waiting status.

## Persistence and migration

PostgreSQL 17 retains current/history JSONB and optimistic revisions. Additive migration 006 adds checksummed owner-scoped source backups; old migrations are unchanged. Reads preview conversion without writes; explicit confirmed conversion archives original current/history and writes a new revision in one transaction. Repeated conversion is a no-op. Converted/restored songs retain all subsequent history. Confirmed restore creates a new revision without erasing intervening versions. No automatic batch conversion occurs.

Before local DDL, a private pg_dump archive was restored into a newly created isolated database using single-transaction pg_restore. Existing 2 songs/15 versions had identical document, owner, revision and history digests after restore and after repeated migration. The temporary restore database was removed; the private archive remains ignored. Evidence contains counts/hashes only. Six original representative legacy fixtures cover multiple arrangements/sections, four meters, chords/polyphony/rests, capo and Drop D; conversion is not accepted from one demo song.

## Validation

- 109 unit tests: existing 73 plus 36 foundation cases, including six representative round-trips, deterministic/idempotent conversion, grouping, exact timing, manual/repeated lyrics identities, links, references and compatibility safeguards.
- 32 PostgreSQL integration cases: existing 17 plus 15 foundation cases, exercising history/checksums/restore, transactions and injected failure rollback, concurrent revisions, owners, invalid writes, legacy editor writes, import/Practice and a 12-track/80-measure/2,880-event fixture.
- Browser regression: original 27 scenarios plus five converted-Song scenarios, four viewports and both themes. Final successful run/evidence and axe counts are recorded in acceptance and the PR completion record. Failed development runs do not count as acceptance.
- Lint, formatting, typecheck, domain/design checks, frontend/backend builds, audit and Docker startup remain required CI gates. Integration files run serially because existing tests assert global row counts; individual concurrency behavior is tested explicitly.

## Import, Practice and Sprint 2F handoff

Reuse the 2D normalized import source and parser. New songs/arrangements/append flows remain compatible; attaching source to a new/replacement track is a pure contract with explicit replacement confirmation and optional manually mapped events. Untimed ASCII columns never become invented musical timing. Preview-only external lyrics remain non-persistable.

Practice origins retain original fields and add selected tracks, shared measure range, event IDs and return cursor. Snapshots preserve selected data. Missing/changed selections fall back safely to the library with the original snapshot. Existing Practice UI/audio behavior is unchanged.

Sprint 2F can build the accepted full-width editor on these contracts: render shared timeline/independent tracks, review uncertain text/link changes before confirmation, connect manual syllable division and selection, and choose the legacy compatibility track deliberately. No v3 React editor, new track window, CSS framework or new visual component system is shipped here.

## Limits and risks

There is still a trusted local owner, not new multi-user authentication. No audio synthesis of technique metadata, automatic syllabification, or automatic lyric/music alignment. Limits are 32 tracks, 10,000 events per track and 2 MB API bodies; the stress fixture is a tested scale, not an unlimited performance claim. Existing valid v1 documents using unsupported actual frets above 24 or embedded-newline tokens refuse conversion for manual review while remaining intact. The old editor cannot review hidden links and rejects destructive edits; recovery envelopes require explicit review and are not silently imported. Post-conversion history is intentionally unpruned; future retention needs a separate policy. See architecture documents for details.
