import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  ExerciseSchema,
  configurationIdentity,
  type ExerciseConfiguration,
  type PracticeProgress,
} from '../../../packages/music-domain/src/practice.js';
export type Database = pg.Pool | pg.PoolClient | pg.Client;
export const LOCAL_PRACTICE_OWNER = 'local';
export function practiceFailure(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
export const configurationKey = (c: ExerciseConfiguration) =>
  createHash('sha256').update(configurationIdentity(c)).digest('hex');
export async function masteryStatus(
  db: Database,
  owner: string,
  id: string,
  version: number,
  key: string,
) {
  const result = await db.query(
    `SELECT coalesce(bool_or(mastered) FILTER(WHERE scope='exercise'),false) AS exercise,coalesce(bool_or(mastered) FILTER(WHERE configuration_key=$4),false) AS configuration FROM practice_mastery WHERE owner_id=$1 AND exercise_id=$2 AND exercise_version=$3`,
    [owner, id, version, key],
  );
  return result.rows[0] as { exercise: boolean; configuration: boolean };
}
export async function exercise(db: Database, id: string, version?: number) {
  const row = await db.query(
    'SELECT document FROM practice_exercises WHERE id=$1 ' +
      (version === undefined
        ? 'ORDER BY version DESC LIMIT 1'
        : 'AND version=$2'),
    version === undefined ? [id] : [id, version],
  );
  if (!row.rowCount) throw practiceFailure(404, 'Exercise not found');
  return ExerciseSchema.parse(row.rows[0].document);
}
export async function practiceTransaction<T>(
  pool: pg.Pool,
  owner: string,
  scope: string,
  action: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO practice_owners(id) VALUES($1) ON CONFLICT DO NOTHING',
      [owner],
    );
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',
      [owner, scope],
    );
    const value = await action(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function saveConfiguration(
  db: Database,
  owner: string,
  config: ExerciseConfiguration,
) {
  const key = configurationKey(config);
  await db.query(
    'INSERT INTO practice_configurations(owner_id,configuration_key,exercise_id,exercise_version,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [
      owner,
      key,
      config.exerciseId,
      config.exerciseVersion,
      JSON.stringify(config),
    ],
  );
  return key;
}
export async function progress(
  db: Database,
  owner: string,
  id: string,
): Promise<PracticeProgress> {
  const row = await db.query(
    'SELECT owner_id AS "ownerId",exercise_id AS "exerciseId",last_practiced AS "lastPracticed",session_count AS "sessionCount",highest_bpm AS "highestBpm",status,last_rating AS "lastRating",mastered,mastered_configurations AS "masteredConfigurations" FROM practice_progress WHERE owner_id=$1 AND exercise_id=$2',
    [owner, id],
  );
  return (
    row.rows[0] ?? {
      ownerId: owner,
      exerciseId: id,
      lastPracticed: null,
      sessionCount: 0,
      highestBpm: null,
      status: 'Nog niet begonnen',
      lastRating: null,
      mastered: false,
      masteredConfigurations: 0,
    }
  );
}
export async function recomputeProgress(
  db: Database,
  owner: string,
  id: string,
) {
  await db.query(
    `WITH stats AS (
 SELECT count(*)::int AS n,max(bpm) AS best,max(ended_at) AS last FROM practice_sessions WHERE owner_id=$1 AND exercise_id=$2
), mastery AS (
 SELECT coalesce(bool_or(mastered) FILTER(WHERE scope='exercise'),false) AS overall,count(*) FILTER(WHERE scope='configuration' AND mastered)::int AS configs
 FROM practice_mastery WHERE owner_id=$1 AND exercise_id=$2 AND exercise_version=(SELECT max(version) FROM practice_exercises WHERE id=$2)
)
INSERT INTO practice_progress(owner_id,exercise_id,last_practiced,session_count,highest_bpm,status,last_rating,mastered,mastered_configurations)
SELECT $1,$2,stats.last,stats.n,stats.best,CASE WHEN mastery.overall THEN 'Beheerst' WHEN stats.n>0 THEN 'Uitgevoerd' ELSE 'Aan het oefenen' END,
 (SELECT rating FROM practice_sessions WHERE owner_id=$1 AND exercise_id=$2 ORDER BY ended_at DESC,id DESC LIMIT 1),mastery.overall,mastery.configs FROM stats,mastery
ON CONFLICT(owner_id,exercise_id) DO UPDATE SET last_practiced=excluded.last_practiced,session_count=excluded.session_count,highest_bpm=excluded.highest_bpm,status=excluded.status,last_rating=excluded.last_rating,mastered=excluded.mastered,mastered_configurations=excluded.mastered_configurations`,
    [owner, id],
  );
  return progress(db, owner, id);
}
export async function writeMastery(
  db: Database,
  owner: string,
  id: string,
  version: number,
  key: string | null,
  mastered: boolean,
) {
  const result = await db.query(
    `INSERT INTO practice_mastery(owner_id,exercise_id,exercise_version,scope,scope_key,configuration_key,mastered) VALUES($1,$2,$3,$4,$5,$6,$7)
 ON CONFLICT(owner_id,exercise_id,exercise_version,scope_key) DO UPDATE SET mastered=excluded.mastered,updated_at=now() RETURNING updated_at`,
    [
      owner,
      id,
      version,
      key ? 'configuration' : 'exercise',
      key ?? '*',
      key,
      mastered,
    ],
  );
  return new Date(result.rows[0].updated_at).toISOString();
}
