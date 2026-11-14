# Explicit version conversion, backup and recovery

Migration 006 is additive DDL only: a composite Song owner key and `studio_song_schema_backups`. It never rewrites existing Song JSON or historical versions. Applied migrations 001–005 remain unchanged. Current canonical data still has a single source of truth in `studio_songs.document`. Backups are historical recovery snapshots, not a parallel live track model.

## Safe rollout

1. Record counts/digests of current songs and history without printing content.
2. Make a private PostgreSQL 17 custom-format dump before applying DDL. Keep it outside version control and container build context. Never print credentials or dump lyrics into logs.
3. Restore into a newly created, explicitly named empty disposable database using `pg_restore --single-transaction --exit-on-error --no-owner`, without `--clean` or `--create`. Compare row counts and document/revision/history digests. Do not overwrite the source database.
4. Apply 006 via the existing checksum-controlled migrator, then repeat it to verify idempotence. Compare original Song/history digests again.
5. User conversion is separate: GET previews v1 → v2 with deterministic identities; confirmed PATCH upgrade or confirmed PUT stores v2. Before the first actual conversion, the same transaction archives the raw current document and every existing historical version with source schema/revision and database-computed checksum. Optimistic row lock prevents another writer racing the backup.
6. Conversion changes revision and adds history; the source versions are retained. Converted songs (including ones restored later) no longer prune old history to 20. Repeated upgrade of a current v2 document is a no-op. Backup primary keys prevent duplicate snapshots. PostgreSQL constraints verify document identity/schema/checksum and owner FK.

`restore-backup` needs current revision, sourceRevision and confirmed:true. It verifies the checksum, validates the stored source, archives the state being replaced, restores the exact source document and adds a new history revision in one transaction. It does not reset revision counters or erase intervening versions. Full canonical historical restoration can also use reviewed PUT with explicit destructive confirmation. API backup/history views expose raw versions so no hidden track is lost in a legacy projection. Deleting a Song explicitly also deletes its owner-scoped backups through FK cascade, matching existing user deletion semantics.

Command pattern (private local files, existing environment configured):

```powershell
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/guitar-2e-before.dump'
docker compose cp db:/tmp/guitar-2e-before.dump .reference/sprint-2e/before.dump
# Create a distinct empty restore DB first; substitute only its verified name.
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d guitar_2e_restore_verified --single-transaction --exit-on-error --no-owner /tmp/guitar-2e-before.dump'
```

These match the [PostgreSQL 17 dump](https://www.postgresql.org/docs/17/app-pgdump.html) and [restore](https://www.postgresql.org/docs/17/app-pgrestore.html) mechanisms. Dumps execute trusted source database definitions when restored; this workflow uses only the user's local source and a new isolated target. Preserve the private archive until the user chooses their backup-retention policy. No automatic production-wide JSON rewrite or down-migration is run.

Tests cover six generated legacy compositions across 2/4, 3/4, 4/4, 6/8, multi-arrangement/section/chord/polyphonic/rest/capo/Drop-D data, repeat conversion, complete history, checksummed original restore, failed-history-write rollback, stale revisions, owner isolation and a 12-track/80-measure arrangement. Unsupported valid v1 data fails closed for review instead of disappearing. No-go remains mandatory for unexplained value/reference loss; a single demo Song is not sufficient acceptance.
