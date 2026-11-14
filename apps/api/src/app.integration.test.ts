import { expect, it } from 'vitest';
import pg from 'pg';
import { readConfig } from './config.js';
import { buildApp } from './app.js';
it('connects to migrated test PostgreSQL through the HTTP API', async () => {
  const config = readConfig({ ...process.env, NODE_ENV: 'test' });
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const app = buildApp(() => pool.query('SELECT 1'));
  try {
    expect((await app.inject('/health')).json()).toEqual({
      status: 'ok',
      database: 'up',
    });
    expect(
      (
        await pool.query('SELECT value FROM app_metadata WHERE key=$1', [
          'schema_version',
        ])
      ).rows[0].value,
    ).toBe('1');
  } finally {
    await app.close();
    await pool.end();
  }
});
