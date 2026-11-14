import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { PracticeAccess } from './practice-routes.js';
import { SongSchema } from '../../../packages/music-domain/src/workspace.js';

function failure(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
export function registerSongs(
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
  const input = z.object({
    song: SongSchema,
    revision: z.number().int().positive(),
  });
  app.get('/api/v1/songs', async (request) => {
    const who = await owner(request);
    const result = await pool.query(
      'SELECT document AS song,revision,updated_at AS "updatedAt" FROM studio_songs WHERE owner_id=$1 ORDER BY updated_at DESC',
      [who],
    );
    return result.rows;
  });
  app.post('/api/v1/songs', async (request, reply) => {
    const song = SongSchema.parse(request.body);
    const who = await owner(request);
    if (
      song.importDocuments?.some(
        (d) =>
          d.source.origin !== 'user' ||
          d.source.storage !== 'user-confirmation',
      )
    )
      throw failure(403, 'Externe lyrics mogen niet worden opgeslagen.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'INSERT INTO studio_songs(id,document,owner_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING document AS song,revision,updated_at AS "updatedAt"',
        [song.id, JSON.stringify(song), who],
      );
      if (!result.rowCount) throw failure(409, 'Deze song bestaat al.');
      await client.query(
        'INSERT INTO studio_song_versions(song_id,revision,document) VALUES($1,1,$2)',
        [song.id, JSON.stringify(song)],
      );
      await client.query('COMMIT');
      return reply.code(201).send(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
  app.get<{ Params: { id: string } }>(
    '/api/v1/songs/:id/history',
    async (request) => {
      const who = await owner(request);
      const result = await pool.query(
        'SELECT document AS song,revision,created_at AS "updatedAt" FROM studio_song_versions WHERE song_id=$1 AND EXISTS(SELECT 1 FROM studio_songs WHERE id=$1 AND owner_id=$2) ORDER BY revision DESC LIMIT 20',
        [request.params.id, who],
      );
      return result.rows;
    },
  );
  app.put<{ Params: { id: string } }>('/api/v1/songs/:id', async (request) => {
    const { song, revision } = input.parse(request.body);
    const who = await owner(request);
    if (
      song.importDocuments?.some(
        (d) =>
          d.source.origin !== 'user' ||
          d.source.storage !== 'user-confirmation',
      )
    )
      throw failure(403, 'Externe lyrics mogen niet worden opgeslagen.');
    if (song.id !== request.params.id)
      throw failure(400, 'Song-ID komt niet overeen.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'UPDATE studio_songs SET document=$1,revision=revision+1,updated_at=now() WHERE id=$2 AND revision=$3 AND owner_id=$4 RETURNING document AS song,revision,updated_at AS "updatedAt"',
        [JSON.stringify(song), song.id, revision, who],
      );
      if (!result.rowCount)
        throw failure(
          409,
          'Nieuwere versie beschikbaar. Exporteer je wijzigingen of laad de serverversie.',
        );
      await client.query(
        'INSERT INTO studio_song_versions(song_id,revision,document) VALUES($1,$2,$3)',
        [song.id, result.rows[0].revision, JSON.stringify(song)],
      );
      await client.query(
        'DELETE FROM studio_song_versions WHERE song_id=$1 AND revision <= $2',
        [song.id, result.rows[0].revision - 20],
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete<{ Params: { id: string }; Querystring: { revision: string } }>(
    '/api/v1/songs/:id',
    async (request, reply) => {
      const who = await owner(request);
      const revision = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.query.revision);
      const result = await pool.query(
        'DELETE FROM studio_songs WHERE id=$1 AND revision=$2 AND owner_id=$3',
        [request.params.id, revision, who],
      );
      if (!result.rowCount)
        throw failure(
          409,
          'Song gewijzigd of al verwijderd; laad de bibliotheek opnieuw.',
        );
      return reply.code(204).send();
    },
  );
}
