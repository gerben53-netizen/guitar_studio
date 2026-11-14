# Lyrics import — provider design

Design only. No scraping, external provider calls, third-party lyrics or stored protected text ship in Sprint 0.

Future LyricsProvider contract: search({artist,title},signal) returns candidate metadata; resolve(candidate,signal) returns provenance, rights and optional content. Provider adapters declare capabilities (search, preview, persistence, attribution), limits and terms revision. Normalize outcomes into found, not-found, permission-denied, unavailable and rate-limited; support cancellation and bounded retries for transient failures. Credentials remain server-side.

Public accessibility does not grant storage/reuse permission. Rights gate precedes persistence: allowed requires an identified license or permission, permitted use, attribution and applicable terms. Unknown/forbidden content is not persisted. Record provider, source URL, terms URL, retrieved time, attribution and storagePermission. Revalidate terms when required. Search metadata must not silently cache lyrics. Specific legal rights need review before enabling a provider.

Manual input and UTF-8 text-file import will be separate local adapters. User confirmation of their right to use content is required before storage. Bound size, validate text encoding and render text without HTML interpretation. Songs may be created without Lyrics; absence is a supported state, not a failed song. Missing external lyrics offers manual entry, file import or continuation without text.

Lyric links use immutable lyrics ID, half-open Unicode code-point offsets, measure ID and rational time. Editing lyrics later must rebase or invalidate links explicitly. No provider architecture requires rearranging the music domain or song editor.
