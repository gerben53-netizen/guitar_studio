import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { readConfig } from './config.js';
import { fromPrototype } from '../../../packages/music-domain/src/prototype-import.js';
const client = new pg.Client({ connectionString: readConfig().databaseUrl });
await client.connect();
try {
  const values: unknown[] = JSON.parse(
    await readFile(
      new URL('../fixtures/prototype-demo-songs.json', import.meta.url),
      'utf8',
    ),
  );
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(730002)');
  for (const [index, value] of values.entries()) {
    const song = fromPrototype(value);
    song.id = 'original-demo-' + index;
    const inserted = await client.query(
      'INSERT INTO studio_songs(id,document) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',
      [song.id, JSON.stringify(song)],
    );
    if (inserted.rowCount)
      await client.query(
        'INSERT INTO studio_song_versions(song_id,revision,document) VALUES($1,1,$2)',
        [song.id, JSON.stringify(song)],
      );
  }
  await client.query('COMMIT');
  console.log(
    'Original prototype demo songs are available; existing songs were preserved.',
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
