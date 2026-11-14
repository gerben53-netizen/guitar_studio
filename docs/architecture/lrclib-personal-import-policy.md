# LRCLIB personal lyrics import policy

## Project decision and attribution

The project owner reports direct contact with LRCLIB's author: LRCLIB contains community transcriptions made by listening to music; these may contain errors; downloading and local use are intended applications. This is **information supplied by the project owner**, not an independently verified copyright licence. The implementation does not represent all LRCLIB lyrics as rights-free.

Three things remain distinct: LRCLIB's intended API/download use; the underlying songwriters'/publishers' rights in original lyrics; and this application's personal, non-public library. The project decision enables deliberate personal-library import. It does not establish a general release of every transcription, commercial republication permission or permission to distribute to others. No legal conclusion about an individual song is inferred from API access or the server's software licence.

The [official LRCLIB technical documentation](https://lrclib.net/docs.txt) describes the API, not a blanket content copyright grant. Technical docs were checked 2026-11-14. Historical Sprint 2D reports describe the earlier absolute block; this decision supersedes that block specifically for the personal workflow.

## User workflow

Search by title/artist using the existing LRCLIB provider, select a full record, inspect available lyrics/timing and choose **Tekst controleren voor import**. The wizard explains that community transcriptions may contain mistakes. Correct title/artist/text, add/remove lines, affirm personal-only use, choose new Song/new arrangement/append-only sections and explicitly choose **Toevoegen aan mijn bibliotheek**. Instrumental, empty and unsafe-only sources have no import action. Cancelling previews writes nothing. An intentionally separate new import may create a new copy; repeated confirmation of the same request cannot.

No public lyrics service, automatic sharing, cross-user synchronization or commercial distribution feature is added. Existing explicit local JSON backup/export remains a user action, not publication. Personal import does not modify the existing manual/text/ChordPro/ASCII rights-confirmed workflow.

## Trusted preview and storage

Selected detail remains preview-only and no-store. The server issues a stateless HMAC-SHA256 receipt over the original validated ImportDocument, album, trusted owner, version and 30-minute expiry. Client data cannot replace the signed source. Receipt signature/expiry/owner are verified on preview/correction and first commit. The process-random key is never sent or stored with lyrics; an API restart invalidates uncommitted previews, which must be selected again. Receipts are request-body data, never URLs, logs or persistent documents.

The strict existing import endpoint adds optional `input.personalReceipt` and requires `personalUseConfirmed:true` when present, alongside existing confirmed/rightsConfirmed flags. Both existing confirmations retain their wire contract; the personal UI checkbox confirms scope, not a blanket copyright licence. The existing parser processes corrections; no new provider/parser is introduced. Raw client provider documents and arbitrary storage flags remain rejected.

Personal stored sources have external/lrclib/provider identity, numeric record ID and fixed HTTPS source URL, `storage:personal-only`, plus `personalImport` metadata: personal scope, server import date/method, original title/artist/album, timing format and text/metadata correction flags. Corrected lyrics live in normal editable Song sections; rawText retains the original available plain/derived text and synchronization retains original raw LRC/Lyricsfile and parsed line/word timing. Source references survive later Song edits, JSON transfer and v2 conversion. Timing is explicitly associated with the original text; corrections are not automatically aligned to milliseconds or bars. Unsafe YAML is never executed or treated as valid word timing; if usable plain/LRC exists its unparsed string may remain escaped original source for inspection.

## Persistence, isolation and recovery

No migration or new database architecture: existing JSONB import documents/provenance support additive optional metadata. Song/current history/import provenance commit in the same PostgreSQL 17 transaction. Owner/request UUID advisory locking plus canonical input/target hash makes replay idempotent, including a lost response or signing-key restart. Replay is checked before transient receipt validation, but only after current owner and confirmation validation; a different payload gets 409. Target revision checks and owner-scoped row locks prevent overwrites; stale import responses include currentRevision. Append and new-arrangement keep old lyrics/chords/tablature/tracks/links through the existing 2E merge.

Song writes and multi-track import seams share the same stored-source predicate: user-confirmed user content or validated personal-only LRCLIB source. Preview-only documents remain non-persistable. No new owner selector is trusted from the request. Current production uses the existing trusted local principal; Compose publishes only loopback ports. This is not newly authenticated multi-user hosting: exposing the application publicly still requires trusted authentication/authorization. No public lyrics endpoint is provided. All API responses are no-store. Import/discovery/Song error logging records codes without source-bearing messages or payloads; response validation messages are generic. No lyric analytics are introduced. Database backups contain private user data and must remain private/ignored.

## Boundaries and handoff

Search still uses v2 with v1 fallback, existing pacing/Retry-After/client identification and safe LRC/YAML parsers. No automatic chord/tab generation, seconds-to-measures conversion, syllable/event matching or new multi-track model. Sprint 2E's importDocuments and origin contracts remain authoritative. Future v3 UI can use these original synchronization sources for explicit manual mapping. Browser/PG evidence uses original test compositions; a live service smoke retains only metadata/counts and never stores external lyrics in repository evidence.
