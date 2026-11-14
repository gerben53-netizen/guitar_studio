import type pg from 'pg';
import { practiceCatalog } from '../../../packages/music-domain/src/practice-catalog.js';
import {
  canonical,
  type Exercise,
} from '../../../packages/music-domain/src/practice.js';
import { recomputeProgress } from './practice-store.js';
/** Caller supplies the migration transaction; existing versions are immutable. */
export async function seedPractice(
  client: pg.Client | pg.PoolClient,
  catalog: readonly Exercise[] = practiceCatalog,
) {
  for (const e of catalog) {
    await client.query(
      'INSERT INTO practice_exercise_ids(id) VALUES($1) ON CONFLICT DO NOTHING',
      [e.id],
    );
    const existing = await client.query(
      'SELECT document FROM practice_exercises WHERE id=$1 AND version=$2',
      [e.id, e.version],
    );
    if (existing.rowCount) {
      if (canonical(existing.rows[0].document) !== canonical(e))
        throw new Error(
          'Catalog version is immutable: ' + e.id + ' v' + e.version,
        );
      continue;
    }
    await client.query(
      'INSERT INTO practice_exercises(id,version,lab,level,category,title,document) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [e.id, e.version, e.lab, e.level, e.category, e.title, JSON.stringify(e)],
    );
    const owners = await client.query(
      'SELECT owner_id FROM practice_progress WHERE exercise_id=$1',
      [e.id],
    );
    for (const row of owners.rows)
      await recomputeProgress(client, row.owner_id, e.id);
  }
}
