# Sprint 2D acceptance

Final CI/merge/issue gates are completed in the Sprint 2D PR completion record; the source-time matrix does not claim a future merge. Original user-owned test fixtures are used for all persistent/browser evidence; live external lyrics are never copied to evidence or database.

| #   | Criterion                | Evidence / gate                                                                                                       |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Existing import retained | Three-step paste/UTF-8 flow and existing full Workspace suite retained                                                |
| 2   | Provider architecture    | Typed injectable provider, registration and deterministic HTTP tests                                                  |
| 3   | Real search API          | LRCLIB v2 live smoke; API query/normalization mocks                                                                   |
| 4   | Actual usable provider   | LRCLIB metadata and selected temporary lyric/sync preview live verified                                               |
| 5   | Honest limitations       | Preview-only policy in result/detail/UI/server; no online chord/tab claims                                            |
| 6   | Plain lyrics             | Unicode, blank lines, headings/repetition/source preservation unit/browser                                            |
| 7   | Chords + lyrics          | Above-text and inline text-column anchors, slash/accidental roots, existing grips                                     |
| 8   | ChordPro                 | Metadata, aliases, chorus/verse/bridge, unknown directives warned/preserved                                           |
| 9   | Six-string ASCII         | Multiple blocks, notes/bar columns, mismatched blocks require correction                                              |
| 10  | Two-digit frets          | 0/10/12/13 and simultaneous notes verified                                                                            |
| 11  | No invented rhythm       | Source columns/uncertainty retained, no NoteEvents generated from spacing                                             |
| 12  | Preview                  | Server normalization/status/sections/chords/tab/unknown-source inspection                                             |
| 13  | Manual correction        | Metadata and source editing; invalid/correction-required cannot commit                                                |
| 14  | Transactions             | Song/history/provenance atomic; injected post-write failure rolls back                                                |
| 15  | Existing data            | New arrangement and safe append preserve original entity content; revision guard                                      |
| 16  | Provenance               | Owner, UUID, server timestamp, source/method/type and input hash in PostgreSQL                                        |
| 17  | Multi-track preparation  | Multiple source blocks, section/source indices and untimed notes; no destructive model migration                      |
| 18  | React flow               | Search, source links, paste/files, preview/correct/destination/confirm/open/cancel                                    |
| 19  | Chrome acceptance        | Seven new Chrome scenarios passed; final full-suite evidence in completion record                                     |
| 20  | PostgreSQL               | 17 integration tests passed, repeated migration compatibility; restart proof in final evidence                        |
| 21  | Regression               | Existing 20 browser scenarios retained (file-import response observer updated to `/imports`); final full run required |
| 22  | Final CI                 | Required: green quality/secrets on exact PR head and final develop                                                    |
| 23  | Issues                   | Required: close only #44–51 and milestone #6 after accepted green merge                                               |
| 24  | Merge                    | Required: single PR to develop, clean local/origin equality, untouched main                                           |

## LRCLIB supplement

All 18 supplement criteria map to the same implementation/evidence: real provider/v2/details via live smoke; deterministic v1 fallback on unavailable/incompatible beta (never empty); summary normalization and lyric availability; plain/LRC/strict word-YAML parsing; instrumental/missing statuses; retry/cooldown/client identification; no credential payloads; source/rights policy enforced on commit and ordinary Song writes; existing wizard/regression; Chrome/PG and exact-head/final-develop CI. Permanent external lyrics storage is blocked, so permitted online import is conditional/unavailable, not falsely marked operational. Provider previews have no-store and no database writes.

## Test interpretation

Unit/provider tests cover Unicode/line preservation, text anchor roots/columns, supported metadata/directives, ASCII frets/bars/techniques/invalid blocks, LRC repeated/invalid stamps and no inferred ends; safe YAML rejects tags/aliases/duplicates/wrong versions/invalid timing; provider tests cover structured/free/artist search, normalized detail, v1 fallback, empty results, client identification, non-JSON/invalid schema/network/timeout/abort, 400/401/404/429/503, Retry-After cooldown/retry/serialization and fixed-host/strict query protection. PG tests exercise new/arrangement/append, replay/conflict, revision safety, rollback, original data/history, provenance and owner isolation.

Browser suite adds seven cases: complete persistent flow/lost response/replay/destinations, online UI/error/instrumental/sync/cancellation, four file extensions/binary rejection/manual correction/cancel, plus four viewports × both themes with axe/keyboard/overflow/screenshots. Online UI regular tests intercept application API with original fixtures; actual provider behavior is independently tested with mocked HTTP and a limited real smoke. These are not fabricated production results. No physical-device or assistive-technology certification is claimed. Any failed development runs are excluded from final acceptance counts; only successful final runs count.
