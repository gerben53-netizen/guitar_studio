# Practice database

PostgreSQL 17 migration 003 is additive. Existing studio_songs and revision history remain unchanged. The established runner serializes via advisory lock, verifies SQL checksums, applies migrations and seeds the catalog in one transaction. Every `npm run migrate` checks/seeds all original versions; an existing changed version fails rather than overwriting history. Add a new version for editorial/music changes and a new migration for schema changes.

| Table                      | Identity and role                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| practice_owners            | Trusted owner text PK; current local principal; future account bridge                                      |
| practice_exercise_ids      | Stable exercise ID parent across versions                                                                  |
| practice_exercises         | Composite (id,version) PK, catalog document + filter columns                                               |
| practice_configurations    | (owner_id,configuration_key) PK, immutable versioned document; composite exercise/version/key uniqueness   |
| practice_exercise_settings | (owner_id,exercise_id) PK; revision-checked pointer to scoped configuration                                |
| practice_sessions          | (owner_id,id UUID) PK; immutable snapshot/document + indexed aggregate fields                              |
| practice_mastery           | (owner_id,exercise_id,exercise_version,scope_key) PK; * for explicit overall, configuration hash otherwise |
| practice_progress          | (owner_id,exercise_id) PK; current aggregate projection                                                    |
| song_practice_origins      | (owner_id,id UUID) PK; snapshot and nullable source_song_id                                                |

Catalog, configuration and owner references use foreign keys. Settings/sessions/configuration mastery use composite owner/exercise/version/key references, preventing cross-owner or mismatched exercise associations. Owner deletion cascades private practice resources. Song deletion sets only origin source_song_id null; its historical JSON survives. Catalog history is retained. Constraints cover scope/key consistency, session duration/rating/BPM/results and supported progress statuses. Indexes support latest catalog/filter queries, session history by owner/exercise/time, configuration selection, mastery and source song lookup. See migration 003 for exact SQL.

An owner/exercise advisory transaction lock serializes settings, completed sessions, mastery and projection recomputation. Session writes + explicit configuration mastery + progress commit atomically. An optimistic settings revision protects concurrent editor drafts. Immutable keys ensure settings changes never rewrite earlier session snapshots. Catalog seeding preserves all versions and recomputes existing owner progress when a new version is inserted, so prior mastery cannot silently carry to changed content.

Seeding runs automatically during Compose startup through the migrate service; no manual catalog demo command is required. Only the 18 exercises and local principal are seeded; no demo sessions, fake progress or mastery. Test database is separately configured and guarded against using the development URL.

Validation covers repeated migrations/seeding, immutable version rejection, new-version history preservation, concurrent session writes, duplicate rejection, owner isolation, actual FK violation 23503 and persistence through fresh Fastify instances. Local acceptance also restarts the actual PostgreSQL/API containers with the same named volume, compares settings/session/progress/origin responses and cleans only its random test owner/song. Never use down -v for this check.
