import { PracticePreferencesInputSchema } from '../../../packages/music-domain/src/practice-transport.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  LabSchema,
  LevelSchema,
  ExerciseIdSchema,
  ConfigurationSchema,
  SessionInputSchema,
  MasteryInputSchema,
  OriginInputSchema,
  canonical,
  type PracticeOrigin,
} from '../../../packages/music-domain/src/practice.js';
import {
  sourceSnapshot,
  findPassage,
  resolveOrigin,
} from '../../../packages/music-domain/src/practice-origin.js';
import { parseStoredSong } from './song-documents.js';
import {
  LOCAL_PRACTICE_OWNER,
  configurationKey,
  exercise,
  practiceFailure as fail,
  practiceTransaction,
  saveConfiguration,
  progress,
  recomputeProgress,
  writeMastery,
  masteryStatus,
} from './practice-store.js';
export interface PracticeAccess {
  resolveOwner?: (request: FastifyRequest) => string | Promise<string>;
  canReadSong?: (
    owner: string,
    songId: string,
    db: pg.PoolClient | pg.Pool,
  ) => boolean | Promise<boolean>;
}
export function registerPractice(
  app: FastifyInstance,
  pool: pg.Pool,
  access: PracticeAccess = {},
) {
  const prefix = '/api/v1/practice';
  app.addHook('preValidation', async (request) => {
    if (!request.url.startsWith(prefix)) return;
    const path = request.url.split('?')[0];
    if (
      request.method === 'GET' &&
      (path === prefix + '/exercises' || path === prefix + '/sessions')
    )
      return;
    z.strictObject({}).parse(request.query);
  });
  const owner = async (request: FastifyRequest) =>
    z
      .string()
      .min(1)
      .max(200)
      .parse(await (access.resolveOwner?.(request) ?? LOCAL_PRACTICE_OWNER));
  const mayReadSong =
    access.canReadSong ??
    (async (who: string, songId: string, db: pg.PoolClient | pg.Pool) =>
      !!(
        await db.query(
          'SELECT 1 FROM studio_songs WHERE id=$1 AND owner_id=$2',
          [songId, who],
        )
      ).rowCount);
  app.get(prefix + '/preferences', async (request) => {
    const who = await owner(request);
    const result = await pool.query(
      'SELECT goals,last_exercise_id AS "lastExerciseId",revision FROM practice_preferences WHERE owner_id=$1',
      [who],
    );
    return result.rows[0] ?? { goals: [], lastExerciseId: null, revision: 0 };
  });
  app.put(prefix + '/preferences', async (request) => {
    const who = await owner(request),
      input = PracticePreferencesInputSchema.parse(request.body);
    if (input.lastExerciseId) await exercise(pool, input.lastExerciseId);
    return practiceTransaction(pool, who, 'preferences', async (db) => {
      const inserted = await db.query(
        'INSERT INTO practice_preferences(owner_id,goals,last_exercise_id,revision) SELECT $1,$2,$3,1 WHERE $4::int=0 ON CONFLICT DO NOTHING RETURNING revision',
        [
          who,
          JSON.stringify(input.goals),
          input.lastExerciseId,
          input.revision,
        ],
      );
      let revision = inserted.rows[0]?.revision;
      if (!revision) {
        const updated = await db.query(
          'UPDATE practice_preferences SET goals=$2,last_exercise_id=$3,revision=revision+1 WHERE owner_id=$1 AND revision=$4 RETURNING revision',
          [
            who,
            JSON.stringify(input.goals),
            input.lastExerciseId,
            input.revision,
          ],
        );
        revision = updated.rows[0]?.revision;
      }
      if (!revision)
        throw fail(
          409,
          'Voorkeuren gewijzigd; laad opnieuw voordat je opslaat',
        );
      return { ...input, revision };
    });
  });
  const params = z.strictObject({ id: ExerciseIdSchema });
  const query = z.strictObject({
    lab: LabSchema.optional(),
    level: LevelSchema.optional(),
    category: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
  });
  app.get(prefix + '/exercises', async (request) => {
    const filters = query.parse(request.query);
    const clauses: string[] = [],
      values: unknown[] = [];
    for (const [key, column] of [
      ['lab', 'lab'],
      ['level', 'level'],
      ['category', 'category'],
      ['search', 'title'],
    ] as const)
      if (filters[key] !== undefined) {
        values.push(filters[key]);
        clauses.push(
          key === 'search'
            ? column + " ILIKE '%' || $" + values.length + " || '%'"
            : column + '=$' + values.length,
        );
      }
    const result = await pool.query(
      'SELECT document FROM (SELECT DISTINCT ON(id) * FROM practice_exercises ORDER BY id,version DESC) latest ' +
        (clauses.length ? 'WHERE ' + clauses.join(' AND ') : '') +
        ' ORDER BY id',
      values,
    );
    return result.rows.map((r) => r.document);
  });
  app.get(prefix + '/exercises/:id', async (request) => {
    const { id } = params.parse(request.params);
    return exercise(pool, id);
  });
  app.get(prefix + '/exercises/:id/settings', async (request) => {
    const who = await owner(request),
      { id } = params.parse(request.params),
      current = await exercise(pool, id);
    const result = await pool.query(
      'SELECT c.document AS configuration,c.configuration_key AS key,s.revision,s.exercise_version AS version FROM practice_exercise_settings s JOIN practice_configurations c ON c.owner_id=s.owner_id AND c.configuration_key=s.configuration_key WHERE s.owner_id=$1 AND s.exercise_id=$2',
      [who, id],
    );
    if (result.rowCount)
      return {
        ...result.rows[0],
        needsUpgrade: result.rows[0].version !== current.version,
        mastery: await masteryStatus(
          pool,
          who,
          id,
          result.rows[0].version,
          result.rows[0].key,
        ),
      };
    const key = configurationKey(current.defaultConfiguration);
    return {
      configuration: current.defaultConfiguration,
      key,
      revision: 0,
      version: current.version,
      needsUpgrade: false,
      mastery: await masteryStatus(pool, who, id, current.version, key),
    };
  });
  app.put(prefix + '/exercises/:id/settings', async (request) => {
    const who = await owner(request),
      { id } = params.parse(request.params);
    const { configuration, revision } = z
      .strictObject({
        configuration: ConfigurationSchema,
        revision: z.number().int().nonnegative(),
      })
      .parse(request.body);
    const current = await exercise(pool, id);
    if (configuration.exerciseId !== id) throw fail(400, 'Exercise mismatch');
    if (configuration.exerciseVersion !== current.version)
      throw fail(409, 'Catalog version changed; review the new version');
    if (
      current.lab !== configuration.specific.lab ||
      !current.compatibleInstruments.includes(configuration.instrument.type)
    )
      throw fail(400, 'Incompatible configuration');
    return practiceTransaction(pool, who, id, async (db) => {
      const key = await saveConfiguration(db, who, configuration);
      const row = await db.query(
        `INSERT INTO practice_exercise_settings(owner_id,exercise_id,exercise_version,configuration_key,revision) SELECT $1,$2,$3,$4,1 WHERE $5::int=0
 ON CONFLICT(owner_id,exercise_id) DO NOTHING RETURNING revision`,
        [who, id, current.version, key, revision],
      );
      let next = row.rows[0]?.revision;
      if (!next) {
        const update = await db.query(
          'UPDATE practice_exercise_settings SET configuration_key=$1,exercise_version=$2,revision=revision+1 WHERE owner_id=$3 AND exercise_id=$4 AND revision=$5 RETURNING revision',
          [key, current.version, who, id, revision],
        );
        next = update.rows[0]?.revision;
      }
      if (!next)
        throw fail(409, 'Practice settings changed; reload before saving');
      await recomputeProgress(db, who, id);
      const stored = await db.query(
        'SELECT document FROM practice_configurations WHERE owner_id=$1 AND configuration_key=$2',
        [who, key],
      );
      return {
        configuration: stored.rows[0].document,
        key,
        revision: next,
        version: current.version,
        needsUpgrade: false,
        mastery: await masteryStatus(db, who, id, current.version, key),
      };
    });
  });
  const sessionFilters = z
    .strictObject({
      exerciseId: ExerciseIdSchema.optional(),
      lab: LabSchema.optional(),
      result: z.enum(['Uitgevoerd', 'Beheerst']).optional(),
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
    })
    .refine((f) => !f.from || !f.to || f.from <= f.to, 'Invalid date range');
  app.get(prefix + '/sessions', async (request) => {
    const who = await owner(request),
      f = sessionFilters.parse(request.query);
    const values: unknown[] = [who],
      clauses = ['s.owner_id=$1'];
    for (const [value, expression] of [
      [f.exerciseId, 's.exercise_id ='],
      [f.lab, 'e.lab ='],
      [f.result, 's.result ='],
      [f.from, 's.ended_at >='],
      [f.to, 's.ended_at <='],
    ] as const)
      if (value !== undefined) {
        values.push(value);
        clauses.push(expression + ' $' + values.length);
      }
    const where = clauses.join(' AND ');
    const count = await pool.query(
      'SELECT count(*)::int AS total FROM practice_sessions s JOIN practice_exercises e ON e.id=s.exercise_id AND e.version=s.exercise_version WHERE ' +
        where,
      values,
    );
    values.push(f.limit, f.offset);
    const rows = await pool.query(
      'SELECT s.document FROM practice_sessions s JOIN practice_exercises e ON e.id=s.exercise_id AND e.version=s.exercise_version WHERE ' +
        where +
        ' ORDER BY s.ended_at DESC,s.id DESC LIMIT $' +
        (values.length - 1) +
        ' OFFSET $' +
        values.length,
      values,
    );
    return {
      items: rows.rows.map((r) => r.document),
      total: count.rows[0].total,
      limit: f.limit,
      offset: f.offset,
    };
  });
  app.get(prefix + '/sessions/:id', async (request) => {
    const who = await owner(request),
      { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
    const row = await pool.query(
      'SELECT document FROM practice_sessions WHERE owner_id=$1 AND id=$2',
      [who, id],
    );
    if (!row.rowCount) throw fail(404, 'Session not found');
    return row.rows[0].document;
  });
  app.post(prefix + '/sessions', async (request, reply) => {
    const who = await owner(request),
      input = SessionInputSchema.parse(request.body);
    await exercise(pool, input.exerciseId, input.snapshot.exerciseVersion);
    if (configurationKey(input.snapshot) !== input.configurationKey)
      throw fail(400, 'Snapshot/key mismatch');
    const value = await practiceTransaction(
      pool,
      who,
      input.exerciseId,
      async (db) => {
        const config = await db.query(
          'SELECT document FROM practice_configurations WHERE owner_id=$1 AND configuration_key=$2 AND exercise_id=$3 AND exercise_version=$4',
          [
            who,
            input.configurationKey,
            input.exerciseId,
            input.snapshot.exerciseVersion,
          ],
        );
        if (!config.rowCount) throw fail(404, 'Configuration not found');
        if (
          canonical(configurationKey(config.rows[0].document)) !==
          canonical(input.configurationKey)
        )
          throw fail(409, 'Configuration mismatch');
        const document = {
          ...input,
          ownerId: who,
          createdAt: new Date().toISOString(),
          bpm: input.snapshot.bpm,
          instrument: input.snapshot.instrument,
        };
        const row = await db.query(
          'INSERT INTO practice_sessions(owner_id,id,exercise_id,exercise_version,configuration_key,started_at,ended_at,duration_seconds,bpm,rating,repetitions,result,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING RETURNING id',
          [
            who,
            input.id,
            input.exerciseId,
            input.snapshot.exerciseVersion,
            input.configurationKey,
            input.startedAt,
            input.endedAt,
            input.durationSeconds,
            input.snapshot.bpm,
            input.rating,
            input.repetitions,
            input.result,
            JSON.stringify(document),
          ],
        );
        if (!row.rowCount) throw fail(409, 'Session already exists');
        if (input.result === 'Beheerst')
          await writeMastery(
            db,
            who,
            input.exerciseId,
            input.snapshot.exerciseVersion,
            input.configurationKey,
            true,
          );
        await recomputeProgress(db, who, input.exerciseId);
        return document;
      },
    );
    return reply.code(201).send(value);
  });
  app.get(prefix + '/progress', async (request) => {
    const who = await owner(request);
    z.strictObject({}).parse(request.query);
    const ids = await pool.query(
      'SELECT id FROM practice_exercise_ids ORDER BY id',
    );
    return Promise.all(ids.rows.map((r) => progress(pool, who, r.id)));
  });
  app.get(prefix + '/progress/:id', async (request) => {
    const who = await owner(request),
      { id } = params.parse(request.params);
    await exercise(pool, id);
    return progress(pool, who, id);
  });
  app.put(prefix + '/mastery', async (request) => {
    const who = await owner(request),
      input = MasteryInputSchema.parse(request.body);
    await exercise(pool, input.exerciseId, input.exerciseVersion);
    return practiceTransaction(pool, who, input.exerciseId, async (db) => {
      if (input.configurationKey) {
        const row = await db.query(
          'SELECT configuration_key FROM practice_configurations WHERE owner_id=$1 AND exercise_id=$2 AND exercise_version=$3 AND configuration_key=$4',
          [
            who,
            input.exerciseId,
            input.exerciseVersion,
            input.configurationKey,
          ],
        );
        if (!row.rowCount) throw fail(404, 'Configuration not found');
      }
      const updatedAt = await writeMastery(
        db,
        who,
        input.exerciseId,
        input.exerciseVersion,
        input.configurationKey,
        input.mastered,
      );
      const current = await recomputeProgress(db, who, input.exerciseId);
      return {
        mastery: { ...input, ownerId: who, updatedAt },
        progress: current,
      };
    });
  });
  app.post(prefix + '/origins', async (request, reply) => {
    const who = await owner(request),
      input = OriginInputSchema.parse(request.body);
    if (new Set(input.stringSelection).size !== input.stringSelection.length)
      throw fail(400, 'Duplicate string selection');
    const result = await practiceTransaction(
      pool,
      who,
      'song:' + input.songId,
      async (db) => {
        if (!(await mayReadSong(who, input.songId, db)))
          throw fail(404, 'Source not found');
        const row = await db.query(
          'SELECT document,revision FROM studio_songs WHERE id=$1 FOR SHARE',
          [input.songId],
        );
        if (!row.rowCount) throw fail(404, 'Source not found');
        const song = parseStoredSong(row.rows[0].document),
          found = findPassage(song, input);
        if ('reason' in found) throw fail(404, 'Source passage not found');
        const origin: PracticeOrigin = {
          ...input,
          id: randomUUID(),
          ownerId: who,
          sourceConfiguration: sourceSnapshot(
            song,
            input,
            row.rows[0].revision,
          ),
          createdAt: new Date().toISOString(),
        };
        await db.query(
          'INSERT INTO song_practice_origins(owner_id,id,source_song_id,document) VALUES($1,$2,$3,$4)',
          [who, origin.id, input.songId, JSON.stringify(origin)],
        );
        return origin;
      },
    );
    return reply.code(201).send(result);
  });
  app.get(prefix + '/origins/:id', async (request) => {
    const who = await owner(request),
      { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
    const originRow = await pool.query(
      'SELECT document FROM song_practice_origins WHERE owner_id=$1 AND id=$2',
      [who, id],
    );
    if (!originRow.rowCount) throw fail(404, 'Origin not found');
    const origin = originRow.rows[0].document as PracticeOrigin;
    const allowed = await mayReadSong(who, origin.songId, pool);
    const row = allowed
      ? await pool.query('SELECT document FROM studio_songs WHERE id=$1', [
          origin.songId,
        ])
      : null;
    return resolveOrigin(
      origin,
      row?.rowCount ? parseStoredSong(row.rows[0].document) : null,
    );
  });
}
