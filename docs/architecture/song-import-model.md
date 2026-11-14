# Song import foundation / Work handoff

The existing React wizard is extended, not replaced by a new workspace/design system. Backend contracts and parsers do not depend on React. Future Work designs can call the same endpoints and render `ImportDocument` directly.

## Contracts

- `POST /api/v1/imports/preview`: strict `{text, format?, title?, artist?, sourceName?, method?}`. Formats: auto, lyrics, chordpro, ascii; methods: paste/file. Returns typed version-1 `ImportDocument`, never writes.
- `POST /api/v1/imports`: `{requestId: UUID, confirmed:true, rightsConfirmed:true, input, target}`. Target is `new-song`, `new-arrangement` with song ID/revision, or `append` with song ID/arrangement ID/revision. No normalized document or provider rights supplied by a caller is trusted. Backend reparses input and validates the resulting existing Song schema.
- Response: existing `{song,revision,updatedAt}`; 201 for first commit, 200 for exact replay. Identical owner/request UUID and canonical input/target replay returns the current song; changed input with that UUID returns 409. Clients retain UUID after unknown network outcomes, regenerate on edits. Stale target revisions and incompatible append metadata return 409; nothing is overwritten.

`song-import-model.ts` defines text lines, text-column chord anchors (normalized pitch classes, no fake grip), ordered sections, multiple six-string tab blocks with source line/column, standard tuning, fret 0–24, aligned bar columns, simultaneous note columns, repeat markers, and explicit `rhythmicUncertainty:true`. Metadata carries key/BPM/meter/tuning/capo when actually present. Original source, unknown fragments, warnings, source policy and recognition status are retained. UTF-16 column indices match JavaScript editor offsets; they are not typographic glyph widths. No numerical confidence claims.

## Parser support and limits

Plain text preserves line breaks/empty lines after CRLF normalization, section labels and literal repetition descriptions. The byte-exact decoded original is kept separately. Title/artist labels and ChordPro metadata are recognized. Lyrics anchors support bracket chords and all-chord lines above lyrics; compound symbols with supported root/accidental/quality/bass syntax are retained. Existing grip presets are reused only for known fingerings; unknown fingerings stay in source rather than becoming invented shapes. Words/columns are not musical event positions. Imported grip anchors use the first blank measure as the existing editor's container; no rhythmic placement is claimed.

Supported ChordPro: title/t, artist, key, tempo, time, capo; chorus/soc/eoc, verse/sov/eov, bridge/sob/eob; tab/sot/eot wrappers; inline chords. Unknown/invalid directives, comments, formatting, definitions, grid/transpose/other extensions remain original fragments with warnings. No rendering directives or executable content run. [ChordPro reference](https://www.chordpro.org/chordpro/chordpro-directives/).

ASCII requires six strings e B G D A E with equal widths and aligned bar separators. Open/two-digit frets and multiple blocks/measures are parsed. h/p, slides, bends, vibrato and other techniques remain warned source fragments; no corresponding rich articulation model exists. Dashes are not assumed rests, repeat markers are recorded without ambiguous expansion, and horizontal spacing never becomes exact durations. Frets outside 0–24 or misaligned blocks require correction. The editable rational-time tab raster remains blank: imported untimed notes are available in the Workspace's expandable source panel for manual timing, rather than false playback. Alternate tuning/tab formats need future explicit support.

Files `.txt`, `.cho`, `.chordpro`, `.pro`: maximum 240 KB, decoded UTF-8 (fatal errors), 60,000 characters, no binary control characters except tabs/newlines. Extensions are an initial filter; the same content validation/parsers apply to pasted and file text. Text and metadata are editable before reconfirmed preview. Source correction may require going back one step; invalid/correction-required imports cannot commit. Cancellation writes nothing.

## Persistence and isolation

Additive migration 005 assigns existing songs to the prior trusted `local` principal and adds `studio_songs.owner_id`; existing JSON/schemaVersion/revisions/history remain valid. Song list/history/create/update/delete and import use the existing injectable owner resolver, not request-supplied owner IDs. Production still has no new authentication; trusted local use is the existing boundary. `studio_imports` stores owner/request UUID, canonical SHA-256 input identity, song/arrangement IDs, server import timestamp and provenance JSON. FK cascade follows deleted songs.

One transaction and advisory lock cover replay check, locked target/revision, song write, history and provenance. Rollback is tested after the document write. New arrangements append lyrics with fresh IDs and leave existing entities byte-semantically unchanged. Append adds new sections only, retains prior notes/anchors/metadata, rejects incompatible explicitly supplied BPM/meter/capo and respects existing schema limits. Original/normalized user sources are additive `song.importDocuments` (maximum 30), included in existing JSON export/recovery and Workspace source view. They are immutable import snapshots conceptually; later editor changes are separate song entities. This is not a secure audit log against a trusted user's own edits.

## Multi-track and synchronization seam

Future track objects can reference a source document/block index and map source note columns to existing rational musical events once a human supplies timing. No current column is a track, onset or duration. Multiple blocks preserve order/section/source positions without destructively migrating arrangements. Lyrics synchronization uses millisecond line/word timestamps independently of tempo/meter and never becomes tab notes. A future mapping can connect source sync-line/word indices and track/event IDs while retaining original timing/source. No new multi-track UI/model is shipped.
