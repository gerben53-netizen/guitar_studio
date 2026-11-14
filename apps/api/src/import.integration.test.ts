import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { parseSongImport } from '../../../packages/music-domain/src/song-import.js';
import type { SongRecord } from '../../../packages/music-domain/src/workspace.js';
describe('transactional owner-isolated import', () => {
  const pool = new pg.Pool({
    connectionString: readConfig({ ...process.env, NODE_ENV: 'test' })
      .databaseUrl,
  });
  const owner = 'import-test-' + randomUUID(),
    other = 'import-test-' + randomUUID();
  const app = buildApp(() => pool.query('SELECT 1'), false, pool, {
    resolveOwner: (r) => String(r.headers['x-test-owner'] ?? owner),
  });
  const payload = (title = 'Own test song', text = '[Am]Own test words') => ({
    requestId: randomUUID(),
    confirmed: true,
    rightsConfirmed: true,
    input: { text, title },
    target: { kind: 'new-song' },
  });
  beforeAll(async () => {
    await app.ready();
  });
  afterAll(async () => {
    await pool.query('DELETE FROM studio_songs WHERE owner_id=ANY($1)', [
      [owner, other],
    ]);
    await app.close();
    await pool.end();
  });
  it('previews without writes, persists provenance/original source and recovers duplicated requests', async () => {
    const before = await pool.query(
      'SELECT count(*) FROM studio_songs WHERE owner_id=$1',
      [owner],
    );
    const input = payload();
    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      payload: input.input,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().sections[0].chords[0].symbol).toBe('Am');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM studio_songs WHERE owner_id=$1',
          [owner],
        )
      ).rows,
    ).toEqual(before.rows);
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/imports', payload: input }),
      app.inject({ method: 'POST', url: '/api/v1/imports', payload: input }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().song.id).toBe(b.json().song.id);
    const song = a.json().song;
    expect(song.importDocuments[0].rawText).toBe(input.input.text);
    expect(song.arrangements[0].sections[0].chords[0].grip.name).toBe('Am');
    const provenance = await pool.query(
      'SELECT * FROM studio_imports WHERE owner_id=$1 AND request_id=$2',
      [owner, input.requestId],
    );
    expect(provenance.rowCount).toBe(1);
    expect(provenance.rows[0].provenance).toMatchObject({
      origin: 'user',
      method: 'paste',
      provider: null,
      contentType: 'chords',
    });
    expect(provenance.rows[0].imported_at).toBeTruthy();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/imports',
          payload: { ...input, input: { ...input.input, text: 'Changed' } },
        })
      ).statusCode,
    ).toBe(409);
  });
  it('creates arrangement and appends sections without overwriting existing entities; rejects stale writes', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      payload: payload(),
    });
    const original = created.json() as SongRecord;
    const input = {
      ...payload('Import part', '{tempo: 120}\n{time: 3/4}\n[C]Own new words'),
      target: {
        kind: 'new-arrangement',
        songId: original.song.id,
        revision: original.revision,
      },
    };
    const arranged = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      payload: input,
    });
    expect(arranged.statusCode).toBe(201);
    const second = arranged.json() as SongRecord;
    expect(second.song.arrangements[0]).toEqual(original.song.arrangements[0]);
    expect(second.song.lyrics[0]).toEqual(original.song.lyrics[0]);
    expect(second.song.arrangements[1]!.tempo).toBe(120);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/imports',
          payload: { ...input, requestId: randomUUID() },
        })
      ).statusCode,
    ).toBe(409);
    const append = {
      ...payload('Section', '[G]Own appended words'),
      target: {
        kind: 'append',
        songId: original.song.id,
        arrangementId: original.song.arrangements[0]!.id,
        revision: second.revision,
      },
    };
    const appended = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      payload: append,
    });
    expect(appended.statusCode).toBe(201);
    expect(appended.json().song.arrangements[0].sections[0]).toEqual(
      original.song.arrangements[0]!.sections[0],
    );
    expect(appended.json().song.arrangements[0].sections).toHaveLength(2);
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      payload: {
        ...payload('Bad', '{tempo: 160}\nOwn'),
        target: { ...append.target, revision: 3 },
      },
    });
    expect(conflict.statusCode).toBe(409);
    const history = await app.inject(
      '/api/v1/songs/' + original.song.id + '/history',
    );
    expect(history.json()).toHaveLength(3);
  });
  it('isolates new and existing song lists, history, writes, deletion, target and request IDs by trusted owner', async () => {
    const input = payload();
    const own = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      payload: input,
    });
    const row = own.json() as SongRecord;
    const headers = { 'x-test-owner': other };
    const section = row.song.arrangements[0]!.sections[0]!;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/practice/origins',
          headers,
          payload: {
            songId: row.song.id,
            arrangementId: row.song.arrangements[0]!.id,
            sectionId: section.id,
            measureId: section.measures[0]!.id,
            position: { numerator: 0, denominator: 1 },
            stringSelection: [1],
            exerciseType: 'rhythm',
          },
        })
      ).statusCode,
    ).toBe(404);

    expect(
      (await app.inject({ url: '/api/v1/songs', headers })).json(),
    ).toEqual([]);
    expect(
      (
        await app.inject({
          url: '/api/v1/songs/' + row.song.id + '/history',
          headers,
        })
      ).json(),
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/songs/' + row.song.id,
          headers,
          payload: row,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/songs/' + row.song.id + '?revision=1',
          headers,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/imports',
          headers,
          payload: {
            ...payload(),
            target: {
              kind: 'new-arrangement',
              songId: row.song.id,
              revision: 1,
            },
          },
        })
      ).statusCode,
    ).toBe(404);
    const otherImport = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers,
      payload: input,
    });
    expect(otherImport.statusCode).toBe(201);
    expect(otherImport.json().song.id).not.toBe(row.song.id);
  });
  it('rejects missing rights/confirmation, malformed tabs and client-supplied external policy; never stores previews', async () => {
    const before = await pool.query(
      'SELECT count(*) FROM studio_imports WHERE owner_id=$1',
      [owner],
    );
    for (const changes of [
      { confirmed: false },
      { rightsConfirmed: false },
      { input: { title: 'Bad tab', text: 'e|---', format: 'ascii' } },
      { input: { title: 'External', text: 'lyrics', provider: 'lrclib' } },
      {
        document: {
          ...parseSongImport({ text: 'Own' }),
          source: { origin: 'external' },
        },
      },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/imports',
            payload: { ...payload(), ...changes },
          })
        ).statusCode,
      ).toBe(400);
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/imports',
        payload: payload(),
      })
    ).json() as SongRecord;
    created.song.importDocuments![0]!.source.origin = 'external';
    created.song.importDocuments![0]!.source.storage = 'preview-only';
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/songs/' + created.song.id,
          payload: created,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM studio_imports WHERE owner_id=$1',
          [owner],
        )
      ).rows[0].count,
    ).toBe(String(+before.rows[0].count + 1));
  });
  it('rolls back song/history when provenance insert fails after document write', async () => {
    const input = payload('Rollback own fixture');
    // Inject failure at the provenance write after song/history INSERTs, then verify transaction rollback.
    const originalConnect = pool.connect.bind(pool);
    let injected = false;
    const spy = await import('vitest');
    const connect = spy.vi
      .spyOn(pool, 'connect')
      .mockImplementationOnce(async () => {
        const db = await originalConnect(),
          query = db.query.bind(db);
        const querySpy = spy.vi.spyOn(db, 'query');
        querySpy.mockImplementation((...args: unknown[]) => {
          if (
            typeof args[0] === 'string' &&
            args[0].startsWith('INSERT INTO studio_imports')
          ) {
            injected = true;
            return Promise.reject(new Error('Injected provenance failure'));
          }
          return (query as (...a: unknown[]) => unknown)(...args);
        });
        const release = db.release.bind(db);
        db.release = () => {
          querySpy.mockRestore();
          db.release = release;
          release();
        };
        return db;
      });
    try {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/imports',
            payload: input,
          })
        ).statusCode,
      ).toBe(500);
      expect(injected).toBe(true);
      expect(
        (
          await pool.query(
            "SELECT id FROM studio_songs WHERE owner_id=$1 AND document->>'title'=$2",
            [owner, input.input.title],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      connect.mockRestore();
    }
  });
});
