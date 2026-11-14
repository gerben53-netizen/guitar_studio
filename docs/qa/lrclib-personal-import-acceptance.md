# LRCLIB personal import acceptance

The source-time matrix maps all 19 requested gates. The PR completion record supplies actual final full Chrome/exact-head CI/develop CI/merge/closure status, without claiming future runs in this document.

| #   | Criterion                | Evidence / gate                                                                         |
| --- | ------------------------ | --------------------------------------------------------------------------------------- |
| 1   | Select LRCLIB Song       | Existing title/artist search, selected full record, provider unit/browser tests         |
| 2   | Full available preview   | Plain/LRC/safe word sources, original source and timing inspection                      |
| 3   | Correct lyrics           | Editable title/artist/text, additions/removals; original source retained                |
| 4   | Explicit personal import | Personal-use checkbox and final action; strict server confirmation                      |
| 5   | Persistent lyrics        | Existing transaction + JSONB/provenance, subsequent saves/reload                        |
| 6   | Open Workspace           | Successful commit opens existing editor; normal later text edit/save                    |
| 7   | Retained source          | Provider/ID/original title/artist/album/URL/date/method/flags in source/provenance      |
| 8   | Timing                   | Original raw LRC and Lyricsfile plus parsed line/word ms, no beat inference             |
| 9   | Owner isolation          | Signed trusted-owner preview; scoped Song/history/provenance; foreign requests rejected |
| 10  | No silent overwrite      | Append/new-arrangement preserve old lyrics/chords/tab/tracks; revision checks           |
| 11  | Safe duplicates          | Advisory UUID lock/hash, concurrent retry/lost response/API-key restart replay          |
| 12  | Personal block replaced  | Actual server-persistable personal-only policy and React flow                           |
| 13  | No public distribution   | No public lyrics route/sharing/sync, no-store/private local owner boundary              |
| 14  | Existing formats         | All baseline parser/import/browser scenarios retained                                   |
| 15  | Chrome                   | Required full 37/37; five new cases already pass on installed Chrome/Windows 11         |
| 16  | PostgreSQL               | 39/39, plus actual PostgreSQL/API/new Chrome restart                                    |
| 17  | Axe                      | 16 new scans: zero violations, both stages/four viewports/both themes                   |
| 18  | Final CI                 | Required green quality/secrets on exact final PR head and develop merge commit          |
| 19  | Merged develop PR        | Single green PR; issue #63 closed after acceptance; main untouched                      |

[Policy and exact wire/recovery contract](../architecture/lrclib-personal-import-policy.md), [report](../sprints/lrclib-personal-import-report.md), [raw evidence](evidence/lrclib-personal), [16 screenshots](screenshots/lrclib-personal). Regular network tests use original injected provider fixtures with real application routes/storage; the live smoke only records metadata/counts and makes no permanent import. The actual restart proof verifies full source, timing, corrected text, revision/history and idempotent replay across process/key/database restart, then removes only the generated own Song.

Automated axe/keyboard/overflow acceptance is not a WCAG or physical-device certification. Owner-supplied LRCLIB guidance is not presented as independently verified copyright permission. Historical Sprint 2D policy statements describe the previous behavior and are superseded for this personal-only workflow.
