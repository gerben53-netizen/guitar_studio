# Guitar Studio

Sprint 0: a technical foundation for acoustic and electric guitar practice. GPL v3; the original LICENSE is preserved. No song editor, microphone capture, lyrics integration or deployment is implemented.

## Requirements and installation

Node 24 LTS, npm 11, Docker Desktop with Linux containers, Git. Use one checkout; no worktrees.

```powershell
npm ci
Copy-Item .env.example .env
```

Fill `.env` with your own local PostgreSQL username/password, database names and URLs. URL-encode username/password components. For Compose use host `db`, port `5432` in DATABASE_URL and TEST_DATABASE_URL. For Node on the host use `localhost`. Example URL shape: `postgres://<user>:<password>@db:5432/guitar_studio_dev`. `.env` is ignored; do not commit it. CI uses disposable credentials confined to the runner.

## Run and stop

```powershell
docker compose up -d --build --wait
docker compose ps
Invoke-RestMethod http://localhost:3000/health
```

Open http://localhost:5173. The status indicator checks API/database readiness every 15 seconds. Four navigation placeholders and light/dark preference are available. Compose runs a development Vite server, not a production hosting setup.

```powershell
docker compose down
```

Database data remains in a named volume. Do not use `down -v` unless you intend to delete local data. The separate test database is created on the first initialization of an empty volume.

For hot reload on the host: start `docker compose up -d db`, set URLs in `.env` to `localhost`, then run `node --env-file=.env node_modules/tsx/dist/cli.mjs apps/api/src/migrate.ts`, `npm run dev:api` and in another terminal `npm run dev`. Vite proxies `/health` to port 3000. Shell environment variables override `.env`.

## Validation and migrations

```powershell
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
docker compose run --rm migrate
```

Migrations are ordered SQL files in `apps/api/migrations`. A transaction and advisory lock serialize execution; checksums reject edits to applied migrations. Add a new migration rather than rewriting history. Sprint 0 creates only metadata, no song CRUD tables.

For integration tests in containers, use the separate TEST_DATABASE_URL from `.env`:

```powershell
docker compose run --rm -e NODE_ENV=test -e TEST_DATABASE_URL=<your-test-url-with-host-db> api npm run migrate
docker compose run --rm -e NODE_ENV=test -e TEST_DATABASE_URL=<your-test-url-with-host-db> api npm run test:integration
```

With host Node, set DATABASE_URL and TEST_DATABASE_URL in the shell, set NODE_ENV to `test`, run `npm run migrate` twice and `npm run test:integration`. The configuration rejects missing or identical test/development URLs. Unit tests do not need PostgreSQL.

## Backup and restore

Use PostgreSQL's custom archive format, keeping binary data out of PowerShell pipelines:

```powershell
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/guitar.dump'
docker compose cp db:/tmp/guitar.dump ./guitar.dump
# Restore only into an intentionally chosen empty database:
docker compose cp ./guitar.dump db:/tmp/guitar.dump
docker compose exec db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error /tmp/guitar.dump'
```

Protect backups as user data; move them outside the checkout and never commit them. Restore into an empty database provisioned separately; existing objects produce errors rather than being deleted automatically.

## Structure and workflow

`apps/web`: React shell; `apps/api`: Fastify REST service/migrations; `packages/shared`: HTTP contract; `packages/music-domain`: pure types, validation and tests; `packages/ui`: shared panel and starting design tokens in the web stylesheet; `infrastructure/docker`: local infrastructure; `docs`: architecture, ADRs, product and sprint evidence.

`main` is stable, `develop` integrates, `feature/*` branches target develop. `release/*` is for stabilization; `hotfix/*` starts at main and is later reconciled into develop. Changes reach develop through reviewed green PRs. Sprint 0 does not merge to main, create release tags or deploy. See [system overview](docs/architecture/system-overview.md), [decisions](docs/decisions/0001-foundation.md) and [sprint report](docs/sprints/sprint-0-report.md).
