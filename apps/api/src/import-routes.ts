import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  legacyRecord,
  mergeWorkspaceWrite,
  type StoredSong,
} from './song-documents.js';
import {
  legacyView,
  toMultitrack,
} from '../../../packages/music-domain/src/multitrack.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ImportCommitSchema,
  ImportRequestInputSchema,
} from '../../../packages/music-domain/src/song-import-model.js';
import { personalLyricsDocument } from '../../../packages/music-domain/src/lrclib-personal-import.js';
import type { PersonalImportReceipts } from './personal-import-receipts.js';
import { parseSongImport } from '../../../packages/music-domain/src/song-import.js';
import {
  importToSong,
  mergeImport,
} from '../../../packages/music-domain/src/import-to-song.js';
import { canonical } from '../../../packages/music-domain/src/practice.js';
import type { PracticeAccess } from './practice-routes.js';
const fail = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });
export function registerImports(
  app: FastifyInstance,
  pool: pg.Pool,
  access: PracticeAccess,
  receipts: PersonalImportReceipts,
) {
  const owner = async (request: import('fastify').FastifyRequest) =>
    z
      .string()
      .min(1)
      .max(200)
      .parse(await (access.resolveOwner?.(request) ?? 'local'));
  const prepare = (value: unknown, who: string) => {
    const { personalReceipt, ...input } = ImportRequestInputSchema.parse(value);
    if (!personalReceipt) return parseSongImport(input);
    const original = receipts.verify(personalReceipt, who);
    try {
      return personalLyricsDocument(
        original.document,
        original.album,
        input,
        new Date().toISOString(),
      );
    } catch {
      throw fail(400, 'Corrigeer de songtekst vóór persoonlijke import.');
    }
  };
  app.post('/api/v1/imports/preview', async (request) => {
    z.strictObject({}).parse(request.query);
    return prepare(request.body, await owner(request));
  });
  app.post('/api/v1/imports', async (request, reply) => {
    z.strictObject({}).parse(request.query);
    const input = ImportCommitSchema.parse(request.body),
      who = await owner(request);
    const hash = createHash('sha256')
      .update(canonical({ input: input.input, target: input.target }))
      .digest('hex');
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        who + ':' + input.requestId,
      ]);
      const prior = await db.query(
        'SELECT input_hash,song_id FROM studio_imports WHERE owner_id=$1 AND request_id=$2',
        [who, input.requestId],
      );
      if (prior.rowCount) {
        if (prior.rows[0].input_hash !== hash)
          throw fail(409, 'Import-ID is al gebruikt voor andere inhoud.');
        const existing = await db.query(
          'SELECT document AS song,revision,updated_at AS "updatedAt" FROM studio_songs WHERE id=$1 AND owner_id=$2',
          [prior.rows[0].song_id, who],
        );
        if (!existing.rowCount) throw fail(404, 'Song niet gevonden.');
        await db.query('COMMIT');
        return legacyRecord(existing.rows[0]);
      }
      const doc = prepare(input.input, who);
      if (
        ['invalid', 'correction-required'].includes(doc.status) ||
        !doc.title.trim()
      )
        throw fail(400, 'Corrigeer de import vóór opslag.');
      const imported = importToSong(doc);
      let song: StoredSong = toMultitrack(imported),
        revision = 1;
      if (input.target.kind !== 'new-song') {
        const existing = await db.query(
          'SELECT document,revision FROM studio_songs WHERE id=$1 AND owner_id=$2 FOR UPDATE',
          [input.target.songId, who],
        );
        if (!existing.rowCount) throw fail(404, 'Song niet gevonden.');
        if (existing.rows[0].revision !== input.target.revision)
          throw Object.assign(
            fail(409, 'Song gewijzigd. Herlaad vóór import.'),
            { currentRevision: existing.rows[0].revision },
          );
        try {
          song = mergeWorkspaceWrite(
            existing.rows[0].document,
            mergeImport(
              legacyView(existing.rows[0].document),
              imported,
              input.target.kind === 'append'
                ? input.target.arrangementId
                : undefined,
            ),
          );
        } catch {
          throw fail(
            409,
            'Import past niet veilig in deze bestemming. Kies een nieuw arrangement of controleer de limieten.',
          );
        }
        revision = existing.rows[0].revision + 1;
      }
      const result =
        input.target.kind === 'new-song'
          ? await db.query(
              'INSERT INTO studio_songs(id,owner_id,document) VALUES($1,$2,$3) RETURNING document AS song,revision,updated_at AS "updatedAt"',
              [song.id, who, JSON.stringify(song)],
            )
          : await db.query(
              'UPDATE studio_songs SET document=$1,revision=$2,updated_at=now() WHERE id=$3 AND owner_id=$4 RETURNING document AS song,revision,updated_at AS "updatedAt"',
              [JSON.stringify(song), revision, song.id, who],
            );
      await db.query(
        'INSERT INTO studio_song_versions(song_id,revision,document) VALUES($1,$2,$3)',
        [song.id, revision, JSON.stringify(song)],
      );
      await db.query(
        'INSERT INTO studio_imports(owner_id,request_id,input_hash,song_id,arrangement_id,provenance) VALUES($1,$2,$3,$4,$5,$6)',
        [
          who,
          input.requestId,
          hash,
          song.id,
          song.lastArrangementId,
          JSON.stringify({
            ...doc.source,
            contentType: doc.contentType,
            title: doc.title,
            artist: doc.artist,
            format: doc.format,
            importedAt:
              doc.source.personalImport?.importedAt ?? new Date().toISOString(),
            timingFormat: doc.synchronization?.kind ?? 'plain',
          }),
        ],
      );
      await db.query('COMMIT');
      return reply.code(201).send(legacyRecord(result.rows[0]));
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  });
}
