# ADR 0002 — Atomic song documents with optimistic revisions

Status: accepted, 2026-11-14.

Persist a validated song aggregate in PostgreSQL JSONB, with monotonically increasing revision and 20 transactional recovery snapshots. Keep the existing pg/SQL/Fastify stack rather than adding a second database or browser song storage. Song owns shared lyrics and independent arrangements, so a whole-document transaction prevents partially saved text/chord/tab edits. Conditional UPDATE/DELETE prevents stale writers from silently winning. History makes deliberate recovery independent of the current Undo stack.

Tradeoffs: whole-document writes and aggregate validation cost more as songs grow; histories are bounded, not permanent backups; no offline editing guarantee or multi-user collaboration is claimed. Future normalized search models can be projections of this versioned aggregate. Future document upgrades need explicit migration tests. Existing SQL migrations and development/test database separation remain authoritative.
