import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import {
  personalFixtureProvider,
  originalText,
} from '../test-support/personal-lyrics-fixtures.js';
import { legacyFixture } from '../../../packages/music-domain/test-support/multitrack-fixtures.js';
import { toMultitrack } from '../../../packages/music-domain/src/multitrack.js';
import { applyMultitrackMutation } from '../../../packages/music-domain/src/multitrack-operations.js';
describe('personal LRCLIB PostgreSQL transactions and existing contracts', () => {
  const pool = new pg.Pool({
    connectionString: readConfig({ ...process.env, NODE_ENV: 'test' })
      .databaseUrl,
  });
  const owner = 'personal-' + randomUUID(),
    other = 'personal-' + randomUUID();
  const makeApp = () =>
    buildApp(
      () => pool.query('SELECT 1'),
      false,
      pool,
      { resolveOwner: (r) => String(r.headers['x-test-owner'] ?? owner) },
      { providers: [personalFixtureProvider()] },
    );
  const app = makeApp();
  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    payload?: unknown,
    who = owner,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        'x-test-owner': who,
        ...(payload ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload ? { payload: JSON.stringify(payload) } : {}),
    });
  async function input(id = 900001) {
    const detail = await call('GET', '/api/v1/discovery/results/lrclib/' + id);
    expect(detail.statusCode).toBe(200);
    return {
      requestId: randomUUID(),
      confirmed: true,
      rightsConfirmed: true,
      personalUseConfirmed: true,
      input: {
        title: 'Eigen persoonlijke import ' + randomUUID(),
        artist: 'Eigen correctie',
        text: 'Gecorrigeerde eigen regel\nNieuwe regel',
        personalReceipt: detail.json().personalImportReceipt,
      },
      target: { kind: 'new-song' },
    };
  }
  beforeAll(() => app.ready());
  afterAll(async () => {
    await pool.query('DELETE FROM studio_songs WHERE owner_id=ANY($1)', [
      [owner, other],
    ]);
    await app.close();
    await pool.end();
  });
  it.each([900001, 900002, 900003])(
    'persists source %s, corrections, provenance/timing and subsequent legacy/canonical saves',
    async (id) => {
      const body = await input(id),
        res = await call('POST', '/api/v1/imports', body);
      expect(res.statusCode).toBe(201);
      let record = res.json();
      const doc = record.song.importDocuments[0];
      expect(doc.source).toMatchObject({
        provider: 'lrclib',
        recordId: String(id),
        storage: 'personal-only',
        personalImport: {
          scope: 'personal',
          album: 'Eigen testalbum',
          textCorrected: true,
        },
      });
      expect(doc.rawText).toContain('Eigen bronregel');
      expect(
        record.song.lyrics[0].tokens
          .map((t: { text: string }) => t.text)
          .join(''),
      ).toContain('Gecorrigeerde');
      expect(doc.synchronization.kind).toBe(id === 900003 ? 'word' : 'line');
      const provenance = (
        await pool.query(
          'SELECT provenance FROM studio_imports WHERE owner_id=$1 AND request_id=$2',
          [owner, body.requestId],
        )
      ).rows[0].provenance;
      expect(provenance).toMatchObject({
        provider: 'lrclib',
        recordId: String(id),
        timingFormat: id === 900003 ? 'word' : 'line',
        personalImport: { album: 'Eigen testalbum' },
      });
      record.song.title += ' bewerkt';
      const saved = await call(
        'PUT',
        '/api/v1/songs/' + record.song.id,
        record,
      );
      expect(saved.statusCode).toBe(200);
      record = saved.json();
      expect(record.song.importDocuments[0]).toEqual(doc);
      const upgraded = await call(
        'PATCH',
        '/api/v1/songs/' + record.song.id + '/multitrack',
        {
          revision: record.revision,
          mutation: { op: 'upgrade', confirmed: true },
        },
      );
      expect(upgraded.statusCode).toBe(200);
      expect(upgraded.json().document.importDocuments[0]).toEqual(doc);
      const history = await call(
        'GET',
        '/api/v1/songs/' + record.song.id + '/history',
      );
      expect(history.json()).toHaveLength(3);
    },
  );
  it('replays concurrent/restarted requests without duplicates, even after the transient signing key changed', async () => {
    const body = await input();
    const responses = await Promise.all([
      call('POST', '/api/v1/imports', body),
      call('POST', '/api/v1/imports', body),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    const restart = makeApp();
    try {
      const replay = await restart.inject({
        method: 'POST',
        url: '/api/v1/imports',
        payload: body,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().song.id).toBe(responses[0]!.json().song.id);
      const newRequest = await restart.inject({
        method: 'POST',
        url: '/api/v1/imports',
        payload: { ...body, requestId: randomUUID() },
      });
      expect(newRequest.statusCode).toBe(409);
    } finally {
      await restart.close();
    }
    expect(
      (
        await call('POST', '/api/v1/imports', {
          ...body,
          input: { ...body.input, text: 'Anders' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await pool.query(
          'SELECT * FROM studio_imports WHERE owner_id=$1 AND request_id=$2',
          [owner, body.requestId],
        )
      ).rowCount,
    ).toBe(1);
  });
  it('binds preview to owner, requires personal confirmation and exposes no public lyrics route', async () => {
    const body = await input();
    expect(
      (await call('POST', '/api/v1/imports', body, other)).statusCode,
    ).toBe(409);
    expect(
      (
        await call('POST', '/api/v1/imports', {
          ...body,
          personalUseConfirmed: false,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', '/api/v1/imports', {
          ...body,
          input: { ...body.input, text: '' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', '/api/v1/imports', {
          ...body,
          input: { ...body.input, text: 'e|---\nEigen tekst' },
        })
      ).statusCode,
    ).toBe(400);
    const created = (await call('POST', '/api/v1/imports', body)).json();
    expect(
      (await call('GET', '/api/v1/songs', undefined, other)).json(),
    ).toEqual([]);
    expect(
      (
        await call(
          'GET',
          '/api/v1/songs/' + created.song.id + '/history',
          undefined,
          other,
        )
      ).json(),
    ).toEqual([]);
    expect(
      (
        await call(
          'GET',
          '/api/v1/songs/' + created.song.id + '/multitrack',
          undefined,
          other,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/api/v1/lyrics/' + created.song.id)).statusCode,
    ).toBe(404);
  });
  it('appends/new-arrangement imports preserve all existing multi-track content and reject stale revisions', async () => {
    let source = toMultitrack(legacyFixture(2));
    source = applyMultitrackMutation(source, {
      op: 'duplicate-track',
      arrangementId: source.arrangements[0]!.id,
      trackId: source.arrangements[0]!.tracks[0]!.id,
    });
    expect((await call('POST', '/api/v1/songs', source)).statusCode).toBe(201);
    const body = await input(),
      target = { kind: 'new-arrangement', songId: source.id, revision: 1 };
    expect(
      (await call('POST', '/api/v1/imports', { ...body, target })).statusCode,
    ).toBe(201);
    let current = (
      await call('GET', '/api/v1/songs/' + source.id + '/multitrack')
    ).json();
    expect(current.document.arrangements[0]).toEqual(source.arrangements[0]);
    const appended = await call('POST', '/api/v1/imports', {
      ...body,
      requestId: randomUUID(),
      target: {
        kind: 'append',
        songId: source.id,
        arrangementId: source.arrangements[0]!.id,
        revision: 2,
      },
    });
    expect(appended.statusCode).toBe(201);
    current = (
      await call('GET', '/api/v1/songs/' + source.id + '/multitrack')
    ).json();
    expect(current.document.arrangements[0].tracks).toEqual(
      source.arrangements[0]!.tracks,
    );
    expect(current.document.arrangements[0].sections.slice(0, 2)).toEqual(
      source.arrangements[0]!.sections,
    );
    const stale = await call('POST', '/api/v1/imports', {
      ...body,
      requestId: randomUUID(),
      target,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().currentRevision).toBe(3);
  });
  it('rolls back Song/history/provenance on post-write failure and keeps lyrics out of error logs', async () => {
    const body = await input();
    const connect = pool.connect.bind(pool);
    const spy = vi.spyOn(pool, 'connect').mockImplementationOnce(async () => {
      const db = await connect(),
        query = db.query.bind(db);
      const q = vi.spyOn(db, 'query');
      q.mockImplementation((...args: unknown[]) => {
        if (
          typeof args[0] === 'string' &&
          args[0].startsWith('INSERT INTO studio_imports')
        )
          return Promise.reject(new Error('Private ' + originalText));
        return (query as (...a: unknown[]) => unknown)(...args);
      });
      const release = db.release.bind(db);
      db.release = () => {
        q.mockRestore();
        db.release = release;
        release();
      };
      return db;
    });
    const logs = vi.spyOn(app.log, 'warn');
    try {
      const res = await call('POST', '/api/v1/imports', body);
      expect(res.statusCode).toBe(500);
      expect(res.body).not.toContain(originalText);
      expect(JSON.stringify(logs.mock.calls)).not.toContain(originalText);
      expect(
        (
          await pool.query(
            "SELECT * FROM studio_songs WHERE owner_id=$1 AND document->>'title'=$2",
            [owner, body.input.title],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await pool.query(
            'SELECT * FROM studio_imports WHERE owner_id=$1 AND request_id=$2',
            [owner, body.requestId],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      spy.mockRestore();
      logs.mockRestore();
    }
  });
});
