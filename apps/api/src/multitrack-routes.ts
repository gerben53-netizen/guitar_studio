import { canStoreImport } from '../../../packages/music-domain/src/lrclib-personal-import.js';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PracticeAccess } from './practice-routes.js';
import {
  toMultitrack,
  MultitrackSongSchema,
  type MultitrackSong,
} from '../../../packages/music-domain/src/multitrack.js';
import {
  applyMultitrackMutation,
  MultitrackMutationSchema,
} from '../../../packages/music-domain/src/multitrack-operations.js';
import { parseStoredSong, isMultitrack } from './song-documents.js';
const id = z.string().min(1).max(100),
  revision = z.number().int().positive().max(2147483646);
const mutation = z.union([
  MultitrackMutationSchema,
  z.strictObject({ op: z.literal('upgrade'), confirmed: z.literal(true) }),
  z.strictObject({
    op: z.literal('restore-backup'),
    sourceRevision: revision,
    confirmed: z.literal(true),
  }),
]);
export const MultitrackPutSchema = z.strictObject({
  revision,
  document: MultitrackSongSchema,
  confirmedUpgrade: z.boolean().default(false),
  confirmedDestructive: z.boolean().default(false),
});
export const MultitrackPatchSchema = z.strictObject({ revision, mutation });
const fail = (statusCode: number, message: string, currentRevision?: number) =>
  Object.assign(new Error(message), {
    statusCode,
    ...(currentRevision ? { currentRevision } : {}),
  });
function destructive(before: MultitrackSong, after: MultitrackSong) {
  const identities = (song: MultitrackSong) => [
    ...song.arrangements.map((a) => a.id),
    ...song.arrangements.flatMap((a) => [
      ...a.trackOrder,
      ...a.sections.map((s) => s.id),
      ...a.sections.flatMap((s) => s.measures.map((m) => m.id)),
      ...a.tracks.flatMap((t) => t.events.map((e) => e.id)),
      ...a.lyricsLinks.map((l) => l.id),
    ]),
    ...song.lyrics.flatMap((s) =>
      s.lines.flatMap((l) =>
        l.tokens.flatMap((t) => [t.id, ...t.syllables.map((s) => s.id)]),
      ),
    ),
  ];
  const next = new Set(identities(after));
  if (identities(before).some((id) => !next.has(id))) return true;
  const priorText = new Map(
    before.lyrics.flatMap((s) =>
      s.lines.flatMap((l) =>
        l.tokens.flatMap((t) =>
          t.syllables.map((s) => [s.id, s.text] as const),
        ),
      ),
    ),
  );
  return after.lyrics
    .flatMap((s) =>
      s.lines.flatMap((l) => l.tokens.flatMap((t) => t.syllables)),
    )
    .some((s) => priorText.has(s.id) && priorText.get(s.id) !== s.text);
}
export async function backupVersions(
  db: pg.PoolClient,
  owner: string,
  songId: string,
  currentRevision: number,
  document: unknown,
) {
  await db.query(
    "INSERT INTO studio_song_schema_backups(owner_id,song_id,source_revision,source_schema,document,checksum) SELECT $1,song_id,revision,(document->>'schemaVersion')::int,document,md5(document::text) FROM studio_song_versions WHERE song_id=$2 ON CONFLICT DO NOTHING",
    [owner, songId],
  );
  await db.query(
    "INSERT INTO studio_song_schema_backups(owner_id,song_id,source_revision,source_schema,document,checksum) VALUES($1,$2,$3,($4::jsonb->>'schemaVersion')::int,$4::jsonb,md5($4::jsonb::text)) ON CONFLICT DO NOTHING",
    [owner, songId, currentRevision, JSON.stringify(document)],
  );
}
export function registerMultitrack(
  app: FastifyInstance,
  pool: pg.Pool,
  access: PracticeAccess = {},
) {
  const owner = async (request: import('fastify').FastifyRequest) =>
    z
      .string()
      .min(1)
      .max(200)
      .parse(await (access.resolveOwner?.(request) ?? 'local'));
  app.get('/api/v1/songs/:id/multitrack', async (request) => {
    const songId = id.parse((request.params as { id: string }).id),
      who = await owner(request),
      query = z
        .strictObject({
          view: z.enum(['current', 'history', 'backups']).default('current'),
          beforeRevision: z.coerce.number().int().positive().optional(),
        })
        .parse(request.query);
    const current = await pool.query(
      'SELECT document,revision,updated_at AS "updatedAt" FROM studio_songs WHERE id=$1 AND owner_id=$2',
      [songId, who],
    );
    if (!current.rowCount) throw fail(404, 'Song niet gevonden.');
    if (query.view === 'current') {
      try {
        return {
          ...current.rows[0],
          storageSchemaVersion: current.rows[0].document.schemaVersion,
          document: toMultitrack(current.rows[0].document),
        };
      } catch {
        throw fail(
          409,
          'Deze bron vereist expliciete migratiereview; originele data is niet gewijzigd.',
          current.rows[0].revision,
        );
      }
    }
    const result =
      query.view === 'history'
        ? await pool.query(
            'SELECT document,revision,created_at AS "updatedAt" FROM studio_song_versions WHERE song_id=$1 AND revision<$2 ORDER BY revision DESC LIMIT 100',
            [songId, query.beforeRevision ?? 2147483647],
          )
        : await pool.query(
            'SELECT document,source_revision AS revision,source_schema AS "storageSchemaVersion",checksum,created_at AS "updatedAt" FROM studio_song_schema_backups WHERE song_id=$1 AND owner_id=$2 AND source_revision<$3 ORDER BY source_revision DESC LIMIT 100',
            [songId, who, query.beforeRevision ?? 2147483647],
          );
    return {
      entries: result.rows,
      nextBeforeRevision:
        result.rows.length === 100 ? result.rows.at(-1)!.revision : null,
    };
  });
  async function write(
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
    patch: boolean,
  ) {
    z.strictObject({}).parse(request.query);
    const songId = id.parse((request.params as { id: string }).id),
      who = await owner(request),
      input = patch
        ? MultitrackPatchSchema.parse(request.body)
        : MultitrackPutSchema.parse(request.body),
      db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query(
        'SELECT document,revision,updated_at AS "updatedAt" FROM studio_songs WHERE id=$1 AND owner_id=$2 FOR UPDATE',
        [songId, who],
      );
      if (!result.rowCount) throw fail(404, 'Song niet gevonden.');
      const row = result.rows[0];
      if (row.revision !== input.revision)
        throw fail(
          409,
          'Nieuwere serverrevision beschikbaar; geen wijzigingen opgeslagen.',
          row.revision,
        );
      const original = parseStoredSong(row.document);
      let before: MultitrackSong;
      try {
        before = toMultitrack(original);
      } catch {
        throw fail(
          409,
          'Migratiereview vereist; originele data blijft behouden.',
          row.revision,
        );
      }
      let document: ReturnType<typeof parseStoredSong>;
      if ('mutation' in input) {
        if (input.mutation.op === 'upgrade') {
          if (isMultitrack(original)) {
            await db.query('COMMIT');
            return { ...row, storageSchemaVersion: 2 };
          }
          document = before;
        } else if (input.mutation.op === 'restore-backup') {
          const backup = await db.query(
            'SELECT document FROM studio_song_schema_backups WHERE owner_id=$1 AND song_id=$2 AND source_revision=$3 AND checksum=md5(document::text)',
            [who, songId, input.mutation.sourceRevision],
          );
          if (!backup.rowCount) throw fail(404, 'Backup niet gevonden.');
          document = parseStoredSong(backup.rows[0].document);
        } else {
          if (!isMultitrack(original))
            throw fail(
              409,
              'Bevestig eerst de schema-conversie.',
              row.revision,
            );
          try {
            document = applyMultitrackMutation(before, input.mutation);
          } catch {
            throw fail(400, 'Ongeldige multi-trackmutatie; niets opgeslagen.');
          }
        }
      } else {
        if (input.document.id !== songId)
          throw fail(400, 'Cross-song document');
        if (!isMultitrack(original) && !input.confirmedUpgrade)
          throw fail(
            409,
            'Bevestig expliciet de schema-conversie.',
            row.revision,
          );
        if (destructive(before, input.document) && !input.confirmedDestructive)
          throw fail(
            409,
            'Review en bevestig destructieve wijzigingen.',
            row.revision,
          );
        document = input.document;
      }
      if (document.id !== songId) throw fail(400, 'Cross-song document');
      if (document.importDocuments?.some((d) => !canStoreImport(d)))
        throw fail(403, 'Preview-only bron mag niet worden opgeslagen.');
      if (
        original.schemaVersion !== document.schemaVersion ||
        ('mutation' in input && input.mutation.op === 'restore-backup')
      )
        await backupVersions(db, who, songId, row.revision, original);
      const saved = await db.query(
        'UPDATE studio_songs SET document=$1,revision=revision+1,updated_at=now() WHERE id=$2 AND owner_id=$3 RETURNING document,revision,updated_at AS "updatedAt"',
        [JSON.stringify(document), songId, who],
      );
      await db.query(
        'INSERT INTO studio_song_versions(song_id,revision,document) VALUES($1,$2,$3)',
        [songId, saved.rows[0].revision, JSON.stringify(document)],
      );
      await db.query('COMMIT');
      return reply.send({
        ...saved.rows[0],
        storageSchemaVersion: document.schemaVersion,
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  app.put('/api/v1/songs/:id/multitrack', (req, reply) =>
    write(req, reply, false),
  );
  app.patch('/api/v1/songs/:id/multitrack', (req, reply) =>
    write(req, reply, true),
  );
}
