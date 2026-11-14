import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readConfig } from './config.js';
const client = new pg.Client({ connectionString: readConfig().databaseUrl });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(730001)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const dir = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(dir))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const sql = await readFile(new URL(name, dir), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query<{ checksum: string }>(
      'SELECT checksum FROM schema_migrations WHERE name=$1',
      [name],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== hash)
        throw new Error('Applied migration changed: ' + name);
      continue;
    }
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [name, hash],
    );
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
