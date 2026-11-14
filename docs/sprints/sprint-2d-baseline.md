# Sprint 2D baseline

Develop starts at `0bf17fe7b9dafcbe9e73e54cb1225616e25f2e80` (Sprint 2C, PR #43). One checkout; no worktree. Existing product issues #6, #7, #8, #14 and #18 remain untouched. Milestone #6 and new issues #44–51 cover this sprint and LRCLIB together.

Existing: React Song Workspace, three-step paste/UTF-8 `.txt` wizard, section detection and original text tokenization, editable chord grips/anchors, six-string rational-time tab editor, JSON export/recovery, revisioned PostgreSQL songs/history, Practice API/catalog/Room/Rhythm Lab, shared audio engine, v2 themes/assets/tokens. Song storage currently represents a single trusted local principal; Practice has an injectable owner resolver. No online provider, general ChordPro/chord-over-lyrics/ASCII parser, provenance records or timing-aware lyrics import exists. Existing wizard search is honestly disabled.

Extensions: typed provider/search/detail contracts and LRCLIB v2/v1 adapter; bounded fixed-host requests, cancellation/throttling; independent loss-aware import and synchronization parsers; explicit preview and rights policy; transactional owner-scoped import/idempotency/provenance; minimal extension of the existing wizard and read-only source view in Workspace. ASCII spacing will never become invented rhythmic events. Existing editors remain authoritative; uncertain tab columns and original source remain separately available for later manual timing and multi-track work.

Validation will retain all 42 unit, 12 integration and 20 browser scenarios, add deterministic provider/parser/API/PG/browser cases, use the isolated test database, exercise Chrome/Chromium and four v2 viewports/themes, and perform a small live LRCLIB smoke outside CI. No main change, release or deployment.
