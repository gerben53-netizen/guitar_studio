# Guitar Studio

Guitar Studio is a personal workspace for acoustic/electric guitar: persistent songs, shared lyrics, independent arrangements, word-anchored chords, structured six-line tablature, a linked fretboard and manual Practice Mode. Sprint 1 follows the original approved UX prototype. GPL v3; the original LICENSE is preserved. Sprint 2A adds a typed Practice foundation, 18-exercise catalog, persistent settings/sessions/progress/mastery, music theory and a shared Web Audio metronome service. Practice Room Home and Rhythm Lab are available in Sprint 2C; other Labs follow later. No microphone recognition, external lyrics provider, PDF export or deployment is implemented.

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

Open http://localhost:5173. The status indicator checks API/database readiness every 15 seconds. Create a song using your own text or a UTF-8 file, confirm your usage rights, and edit lyrics/chords/tab in the studio. Song content is stored in PostgreSQL; localStorage only stores theme preference. Compose runs a development Vite server, not a production hosting setup.

Optionally load the supplied original fictional prototype demos (existing songs are never overwritten):

```powershell
docker compose run --rm --no-deps api npm run seed:demo
```

The library supports search/filter, favorites, duplication, archive/restore and confirmed deletion. JSON export/import transfers the versioned song/arrangement document, independently of the deferred PDF feature. Save failures retain the current draft with retry/export actions; the last 20 successful server revisions can be restored. Unsaved changes still need a successful save or export before closing the browser.

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

Migrations are ordered SQL files in `apps/api/migrations`. A transaction and advisory lock serialize execution; checksums reject edits to applied migrations. Add a new migration rather than rewriting history. Migration 001 preserves the Sprint 0 foundation; 002 adds song documents, optimistic revisions and transactional recovery history. Additive migration 003 adds Practice tables; the migration transaction seeds/checks all 18 immutable original exercise versions automatically, without fake session/mastery data.

For integration tests in containers, use the separate TEST_DATABASE_URL from `.env`:

```powershell
docker compose run --rm -e NODE_ENV=test -e TEST_DATABASE_URL=<your-test-url-with-host-db> api npm run migrate
docker compose run --rm -e NODE_ENV=test -e TEST_DATABASE_URL=<your-test-url-with-host-db> api npm run test:integration
```

With host Node, set DATABASE_URL and TEST_DATABASE_URL in the shell, set NODE_ENV to `test`, run `npm run migrate` twice and `npm run test:integration`. The configuration rejects missing or identical test/development URLs. Unit tests do not need PostgreSQL.

For Chromium acceptance against the running Compose application:

```powershell
npx playwright install chromium
$env:PLAYWRIGHT_SCREENSHOT_DIR = 'test-results/sprint-2a-screenshots'
npm run test:browser
# Official Sprint 2A target: installed Google Chrome on Windows 11
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:browser
Remove-Item Env:PLAYWRIGHT_CHANNEL
```

Tests create and clean up their own song IDs; do not run against a production database. Screenshots are written to `docs/qa/screenshots/sprint-1`, and failures retain traces in ignored `test-results/`. CI additionally installs browser OS dependencies, runs the same tests and uploads the evidence. When using a different preview port set `PLAYWRIGHT_BASE_URL`; start a custom Vite port with `npm run dev -w @guitar/web -- --port 5174` and set `API_PROXY_TARGET` for a custom API port.

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

`apps/web`: typed React screens and semantic component/state CSS; `apps/api`: Fastify REST service/migrations; `packages/shared`: HTTP contract; `packages/music-domain`: pure types, validated workspace aggregate, explicit prototype converter and tests; `packages/ui`: shared UI foundation; `infrastructure/docker`: local infrastructure; `docs`: architecture, ADRs, product and sprint evidence. Read [Song Workspace](docs/architecture/song-workspace.md), [tab editor](docs/architecture/tab-editor.md) and [Sprint 1 acceptance](docs/qa/sprint-1-acceptance.md).

`main` is stable, `develop` integrates, `feature/*` branches target develop. `release/*` is for stabilization; `hotfix/*` starts at main and is later reconciled into develop. Changes reach develop through reviewed green PRs. Sprint 0 does not merge to main, create release tags or deploy. See [system overview](docs/architecture/system-overview.md), [decisions](docs/decisions/0001-foundation.md) and [sprint report](docs/sprints/sprint-0-report.md).

## Practice Room foundation (Sprint 2A)

Read [domain and Sprint 2B components](docs/architecture/practice-domain.md), [API and examples](docs/architecture/practice-api.md), [database](docs/architecture/practice-database.md), [metronome lifecycle](docs/architecture/metronome-engine.md), [Song origins](docs/architecture/song-practice-integration.md) and [acceptance](docs/qa/sprint-2a-acceptance.md). Query `http://localhost:3000/api/v1/practice/exercises` after normal Compose startup. There is no new product route or CSS in 2A. `packages/audio` is the shared testable output engine; `apps/web/test-support/metronome.html` is an unstyled development test harness, not a production screen.

Practice uses the server-owned local principal until account support exists. Before multi-user exposure, add trusted authentication plus Song ownership authorization. Existing semantic CSS and editors remain the basis for the separate Design System v2/Sprint 2B implementation. #6, #8, #14 and EPIC #18 stay open.

## Design System v2 (Sprint 2B)

The production screens use the accepted navy/cyan v2 token registry and original neon PNG. Existing theme preferences use `data-theme` on the root and the same localStorage key. Read [integration architecture](docs/architecture/design-system-v2-integration.md), [baseline/migration mapping](docs/sprints/sprint-2b-baseline.md) and [design acceptance](docs/qa/sprint-2b-design-system-acceptance.md).

Run `npm run design:tokens` after changing the semantic registry, and `npm run design:check` to verify token CSS, brand hashes and 32 contrast pairs. These checks are part of CI. No new dependency, API/schema change or Practice Room Lab is introduced. New browser acceptance writes evidence under ignored test-results by default; set DESIGN_EVIDENCE_DIR to keep a separate evidence directory when comparing runs. Keep PLAYWRIGHT_SCREENSHOT_DIR set to avoid replacing historical Sprint 1 screenshots.

## Practice Room Home and Rhythm Lab (Sprint 2C)

After normal Compose startup/migration, choose **Oefenen** in primary navigation. Home opens a Rhythm exercise in at most two further actions. All18 API exercises are discoverable in the library and four-level path; Scale/Chord/Technique explicitly remain future modules. Edit rational strokes/rests/accents/durations, save settings, start the shared metronome and finish with a personal reflection. In 6/8 BPM is a dotted quarter. Manual tempo overrides disable ramp. Explicit confirmed mastery applies only to that configuration.

Sessions, goals, progress, ramp and last settings persist in PostgreSQL; no practice localStorage is used. Drafts and unfinished sessions prompt before discard; saved sessions survive browser/DB restarts. New GET/PUT preferences endpoint uses the same trusted local owner boundary. Migration 004 is additive and applies with normal `npm run migrate`; old applied SQL files remain unchanged.

[Architecture](docs/architecture/practice-room-rhythm.md), [report](docs/sprints/sprint-2c-report.md), [acceptance/screenshots](docs/qa/sprint-2c-acceptance.md). Browser acceptance includes real writes: use a disposable test database/CI environment rather than user data. New evidence defaults to test-results/sprint-2c; PRACTICE_EVIDENCE_DIR can select a separate directory. Preserve historical screenshots with PLAYWRIGHT_SCREENSHOT_DIR. #6/#8/#14/#18 remain open for their separate scopes.

## Song Discovery and Import (Sprint 2D)

Use **Nieuwe song** in the existing wizard: explicit LRCLIB search, temporary lyric/sync preview, paste or UTF-8 `.txt`/`.cho`/`.chordpro`/`.pro` import. Review/correct source and metadata, confirm your storage rights and choose a new song, new arrangement or append-only sections. ASCII-tab source includes frets/bar positions but no invented rhythmic playback; open the Workspace import-source panel for later manual timing. LRCLIB lyrics cannot be permanently imported while content-storage rights remain unverified.

Migration 005 is additive; normal migration/Compose startup applies it. Existing songs remain owned by the existing local principal. No new authentication is added. Optional LRCLIB_APP_ID and LRCLIB_API_KEY are server-only environment variables; no key is required for basic use. Never expose them through VITE variables. Regular tests mock the provider network; live LRCLIB is not a CI dependency. Set IMPORT_EVIDENCE_DIR and PLAYWRIGHT_SCREENSHOT_DIR to ignored test-results paths when running acceptance against an isolated test database.

[Providers](docs/architecture/song-discovery-providers.md), [LRCLIB adapter](docs/architecture/lrclib-provider.md), [import model/Work handoff](docs/architecture/song-import-model.md), [Sprint report](docs/sprints/sprint-2d-report.md), [acceptance](docs/qa/sprint-2d-acceptance.md).

## Multi-track foundation (Sprint 2E)

SchemaVersion 2 adds independent tracks over shared rational measures, stable syllables and explicit LyricsLinks. This is a domain/API/persistence foundation; the existing editor remains the interface. It safely projects one designated track and preserves the other tracks on saves. Operations that would damage hidden tracks or links are refused for review. JSON export/import and Song duplication retain all tracks and remap copied identifiers.

Migration 006 is additive and never rewrites existing Song JSON. Conversion is explicit and revision-checked; raw original documents and history are backed up transactionally before conversion. Use the canonical `/api/v1/songs/:id/multitrack` document API and typed shared client for future editor work. Read the [domain/API contract](docs/architecture/multitrack-domain.md), [event mapping](docs/architecture/multitrack-note-events.md), [lyrics links](docs/architecture/lyrics-links.md), [migration/recovery procedure](docs/architecture/multitrack-migration.md), [report](docs/sprints/sprint-2e-report.md) and [acceptance](docs/qa/sprint-2e-acceptance.md).

Browser acceptance must use an isolated database. Set PLAYWRIGHT_SCREENSHOT_DIR to `test-results/sprint-2e-regression` and optionally MULTITRACK_EVIDENCE_DIR for the new converted-Song evidence. The v3 full-width editor and track-management UI belong to Sprint 2F. Existing semantic CSS, themes and assets are unchanged.
