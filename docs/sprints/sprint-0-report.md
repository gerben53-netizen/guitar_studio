# Sprint 0 — Foundation

Status: validation in progress. Final evidence and integration details will be recorded before closure.

Implemented: npm workspace applications and concrete shared packages; responsive navigation placeholders with light/dark mode and live API status; Fastify health, environment validation, central errors and PostgreSQL pool; transaction/checksum migrations; six-string acoustic/electric domain types and core validators; Docker Compose and CI; architecture and operations documentation.

Excluded: song CRUD/editor, live fretboard, real microphone access, pitch detection, provider integration, lyrics storage, authentication, release tags, main merge and deployment.

Tracking: milestone Sprint 0 — Foundation; #1 monorepo/Gitflow/CI, #2 frontend/API/database, #3 music domain, #4 documentation. All implementation travels through feature/sprint-0-foundation -> develop. Original GPL license and initial commit remain intact.

See ADR 0001 for exact stack and dependency rationale. Validation evidence, PR, CI run and merge commit follow after all checks pass. Open architecture limitations include future aggregate validation, audio algorithm benchmarking, provider rights review and production security/deployment design. Sprint 1 should implement one small song/arrangement editing flow with persistence, ownership and reference-integrity validation.
