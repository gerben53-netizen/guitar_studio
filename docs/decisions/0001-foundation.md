# ADR 0001 — TypeScript workspace foundation

Status: accepted, 2026-11-14.

Use npm workspaces and a committed lockfile, Node 24 LTS, React 19.3.1, Vite 8.3.8 with React plugin 6.3.0, Fastify 5.12.8, PostgreSQL 17, pg 8.23.1, Zod 4.6.7, TypeScript 6.0.2, Vitest 5.1.0, ESLint 10.15.0 with typescript-eslint 8.72.2 and Prettier 3.10.1. Direct dependencies are exact; transitive versions live in package-lock.json. PostgreSQL and Node images follow their maintained major lines and need scheduled rebuilds.

Versions were queried from npm; compatibility is proven by installation, strict typechecking, tests and builds. TypeScript 7.0.2 was rejected because typescript-eslint supports less than 6.1. The current parser pulls a vulnerable minimatch; a scoped override pins minimatch 11.0.1, validated by lint and a zero-vulnerability audit. Revisit the override when upstream updates.

React provides a component boundary without imposing hosting. Vite provides local proxying and static export. Fastify offers JSON Schema request validation, structured logs and in-process HTTP testing. Zod validates environment and domain inputs. Direct pg and versioned SQL avoid an ORM before persistence requirements exist. Migrations are transactional, checksum-protected and serialized using a PostgreSQL advisory lock. Separate test configuration refuses an identical development URL.

No task runner, service mesh, cloud SDK or empty framework packages. Shared packages already have concrete consumers or domain tests. The UI package begins with one panel; it is not a finished design system. API builds preserve workspace-relative paths; production command runs the emitted server entrypoint. Source-based exports serve local development only, not external package publication.

Primary compatibility references: [Vite requirements](https://vite.dev/guide/), [Fastify v5 migration](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/), [typescript-eslint dependency versions](https://typescript-eslint.io/users/dependency-versions/), [PostgreSQL version policy](https://www.postgresql.org/support/versioning/).
