# Sprint 0 — Foundation

Technical acceptance: PASS, verified on 2026-11-14. Integration acceptance is gated by the final green PR checks and merge into develop. The canonical integration record is [PR #5](https://github.com/gerben53-netizen/guitar_studio/pull/5): its merged state, mergeCommit and checks identify the final result without embedding a self-referential commit hash in this file.

Implemented: npm workspace applications and concrete shared packages; responsive navigation placeholders with light/dark mode and live API status; Fastify health, environment validation, central errors and PostgreSQL pool; transaction/checksum migrations; six-string acoustic/electric domain types and core validators; Docker Compose and CI; architecture and operations documentation.

Excluded: song CRUD/editor, live fretboard, real microphone access, pitch detection, provider integration, lyrics storage, authentication, release tags, main merge and deployment.

Tracking: milestone Sprint 0 — Foundation; #1 monorepo/Gitflow/CI, #2 frontend/API/database, #3 music domain, #4 documentation. All implementation travels through feature/sprint-0-foundation -> develop. Original GPL license and initial commit remain intact.

## Acceptance evidence

| Criterion                                             | Result     | Evidence                                                                                                                                             |
| ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository initialized, history and license preserved | PASS       | Original commit remains ancestor; LICENSE diff is empty                                                                                              |
| develop exists                                        | PASS       | Created from original main, published to origin                                                                                                      |
| Gitflow                                               | PASS       | One checkout, feature branch targets develop, no worktrees                                                                                           |
| Reproducible monorepo install                         | PASS       | npm ci in CI and Linux Docker build; committed lockfile                                                                                              |
| Frontend/backend start locally                        | PASS       | Compose API and web healthchecks healthy                                                                                                             |
| PostgreSQL works                                      | PASS       | Real test-database integration and readiness SELECT 1                                                                                                |
| Migrations work                                       | PASS       | Development/test databases migrated; repeated application succeeds                                                                                   |
| Health endpoint reachable                             | PASS       | HTTP 200, status ok, database up; simulated outage returns 503                                                                                       |
| Frontend shows API status                             | PASS       | Browser visibly shows API en database beschikbaar; proxy HTTP 200                                                                                    |
| Music domain documented                               | PASS       | Types for all requested entities; four core domain tests                                                                                             |
| Instrument profiles                                   | PASS       | Acoustic/electric types and validated tuning, capo, fret range, input method                                                                         |
| Microphone architecture                               | PASS       | Local-only future pipeline and explicit confirmation; no capture code                                                                                |
| Lyrics architecture                                   | PASS       | Provider boundary, rights gate and optional lyrics; no integration                                                                                   |
| Required tests/builds                                 | PASS       | 7 unit tests, 1 PostgreSQL integration test, lint, formatting, strict types, both builds                                                             |
| GitHub Actions                                        | PASS       | [Verified full run 43598636261](https://github.com/gerben53-netizen/guitar_studio/actions/runs/43598636261); final head must pass again before merge |
| Documentation complete                                | PASS       | README, all requested architecture/product/sprint documents and ADR                                                                                  |
| Issues handled                                        | Merge gate | #1–#4 close only after final PR merge; milestone closes afterwards                                                                                   |
| PR integrated into develop                            | Merge gate | PR #5 is the authoritative merge/commit record; main remains unchanged                                                                               |

Dependency audit: zero vulnerabilities after a scoped minimatch 11.0.1 override. Gitleaks scans full Git history with no findings. A local custom-format pg_dump was restored successfully into a separate empty database and schema_version=1 verified; that temporary database was removed afterwards. The development volume is retained. `.env` contains generated local credentials and is excluded from Git and Docker build context.

The first validation attempts exposed a non-root Vite cache permission issue and a CI database port collision. Both were fixed. A workflow-context validation error during that repair was also corrected. No failed run was treated as acceptance. Official checkout/setup-node actions were subsequently moved to verified v6 commit pins to avoid the Node 20 action-runtime deprecation; the final head is revalidated before merge.

## Delivered structure and stack

```text
apps/api/                 Fastify, pg, SQL migrations, config, HTTP tests
apps/web/                 React/Vite shell, navigation, theme and API status
packages/shared/          HTTP health contract
packages/music-domain/    Musical types, Zod validation and domain tests
packages/ui/              Shared panel component
infrastructure/docker/    Non-root Node image and test database initializer
.github/                  Quality/secret CI and Dependabot
docs/architecture/        Baseline, system, music, audio, lyrics, deployment
docs/decisions/            Stack ADR
docs/product/             Product vision
docs/sprints/             This report
```

See ADR 0001 and package-lock.json for exact versions: Node 24, TypeScript 6.0.2, React 19.3.1, Vite 8.3.8, Fastify 5.12.8, Zod 4.6.7, pg 8.23.1, PostgreSQL 17, Vitest 5.1.0, ESLint 10.15.0, Prettier 3.10.1.

## Remaining risks and Sprint 1 preparation

Branch protection is currently absent; require quality and secrets on develop before adding contributors. Production hosting/security is deliberately deferred; the Compose Vite server must stay local. Container major tags need regular patch rebuilds and production digest pinning. Future aggregate write operations require cross-entity reference validation and lyrics-span rebasing. Audio accuracy needs algorithm/hardware benchmarks; lyrics providers need rights/terms review.

Sprint 1 should agree one small song/arrangement editor slice, ownership/authentication requirements, persistence constraints and reference-integrity tests. Keep microphone and external lyrics work separate until those contracts are stable. No main merge, tag, release or deployment was performed in Sprint 0.
