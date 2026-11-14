import { expect, it } from 'vitest';
import pg from 'pg';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { newSong } from '../../../packages/music-domain/src/workspace.js';
it('atomically persists songs, rejects stale writes, keeps revisions and isolates deletion', async () => {
  const config = readConfig({ ...process.env, NODE_ENV: 'test' }),
    pool = new pg.Pool({ connectionString: config.databaseUrl }),
    app = buildApp(() => pool.query('SELECT 1'), false, pool);
  const song = newSong('Integration', '', 'Own text'),
    other = newSong('Other', '', '');
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/songs',
      payload: song,
    });
    expect(created.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/songs',
          payload: other,
        })
      ).statusCode,
    ).toBe(201);
    song.favorite = true;
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/songs/' + song.id,
      payload: { song, revision: 1 },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().revision).toBe(2);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/songs/' + song.id,
          payload: { song, revision: 1 },
        })
      ).statusCode,
    ).toBe(409);
    const history = await app.inject('/api/v1/songs/' + song.id + '/history');
    expect(history.json()).toHaveLength(2);
    expect(history.json()[1].song.favorite).toBe(false);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/songs/' + song.id,
          payload: { song: { ...song, title: '' }, revision: 2 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/songs/' + song.id + '?revision=1',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/songs/' + song.id + '?revision=2',
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await pool.query('SELECT id FROM studio_songs WHERE id=$1', [other.id]))
        .rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT * FROM studio_song_versions WHERE song_id=$1',
          [song.id],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await pool.query('DELETE FROM studio_songs WHERE id=ANY($1::text[])', [
      [song.id, other.id],
    ]);
    await app.close();
    await pool.end();
  }
});
