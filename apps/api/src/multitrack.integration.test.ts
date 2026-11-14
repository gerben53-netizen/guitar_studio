import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { legacyFixture } from '../../../packages/music-domain/test-support/multitrack-fixtures.js';
import {
  toMultitrack,
  type MultitrackSong,
} from '../../../packages/music-domain/src/multitrack.js';
import { emptyTrack } from '../../../packages/music-domain/src/multitrack-operations.js';
import {
  uid,
  fraction,
  type StudioSong,
} from '../../../packages/music-domain/src/workspace.js';
describe('multi-track JSONB/version/backup/owner contracts', () => {
  const pool = new pg.Pool({
      connectionString: readConfig({ ...process.env, NODE_ENV: 'test' })
        .databaseUrl,
    }),
    owner = 'multi-' + randomUUID(),
    other = 'multi-' + randomUUID();
  const app = buildApp(() => pool.query('SELECT 1'), false, pool, {
    resolveOwner: (r) => String(r.headers['x-test-owner'] ?? owner),
  });
  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
    who = owner,
  ) =>
    app.inject({
      method,
      url,
      headers: { 'x-test-owner': who, 'content-type': 'application/json' },
      ...(payload === undefined
        ? {}
        : { payload: JSON.stringify(payload) ?? 'null' }),
    });
  async function create(index = 0) {
    const song = legacyFixture(index),
      response = await call('POST', '/api/v1/songs', song);
    expect(response.statusCode).toBe(201);
    return { song, url: '/api/v1/songs/' + song.id + '/multitrack' };
  }
  async function upgrade(index = 0) {
    const f = await create(index),
      response = await call('PATCH', f.url, {
        revision: 1,
        mutation: { op: 'upgrade', confirmed: true },
      });
    expect(response.statusCode).toBe(200);
    return {
      ...f,
      record: response.json() as { document: MultitrackSong; revision: number },
    };
  }
  beforeAll(async () => app.ready());
  afterAll(async () => {
    await pool.query('DELETE FROM studio_songs WHERE owner_id=ANY($1)', [
      [owner, other],
    ]);
    await pool.query('DELETE FROM practice_owners WHERE id=ANY($1)', [
      [owner, other],
    ]);
    await app.close();
    await pool.end();
  });
  it.each([0, 1, 2, 3, 4, 5])(
    'previews, backs up and losslessly upgrades legacy fixture %i including historical versions',
    async (index) => {
      const { song, url } = await create(index),
        preview = await call('GET', url);
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({
        storageSchemaVersion: 1,
        revision: 1,
      });
      expect((await call('GET', url + '?view=backups')).json().entries).toEqual(
        [],
      );
      song.favorite = true;
      expect(
        (await call('PUT', '/api/v1/songs/' + song.id, { song, revision: 1 }))
          .statusCode,
      ).toBe(200);
      const response = await call('PUT', url, {
        document: toMultitrack(song),
        revision: 2,
        confirmedUpgrade: true,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().revision).toBe(3);
      expect(response.json().document.arrangements).toHaveLength(
        song.arrangements.length,
      );
      const legacy = (await call('GET', '/api/v1/songs'))
        .json()
        .find((r: { song: StudioSong }) => r.song.id === song.id);
      expect(legacy.song).toEqual(song);
      expect((await call('GET', url)).json().document).toEqual(
        response.json().document,
      );
      const backups = (await call('GET', url + '?view=backups')).json().entries;
      expect(backups).toHaveLength(2);
      expect(backups[0].document).toEqual(song);
      expect(backups[1].document.favorite).toBe(false);
      const history = (await call('GET', url + '?view=history')).json().entries;
      expect(
        history.map(
          (r: { document: { schemaVersion: number } }) =>
            r.document.schemaVersion,
        ),
      ).toEqual([2, 1, 1]);
      const repeated = await call('PATCH', url, {
        revision: 3,
        mutation: { op: 'upgrade', confirmed: true },
      });
      expect(repeated.json().revision).toBe(3);
      expect(
        (await call('GET', url + '?view=backups')).json().entries,
      ).toHaveLength(2);
    },
  );
  it('runs track CRUD/selection/reorder, independent events and multi-event syllable links atomically', async () => {
    const f = await upgrade(2);
    let record = f.record;
    const a = record.document.arrangements[0]!,
      base = a.tracks[0]!;
    async function mutate(mutation: unknown) {
      const r = await call('PATCH', f.url, {
        revision: record.revision,
        mutation,
      });
      expect(r.statusCode, r.body).toBe(200);
      record = r.json();
      return record;
    }
    const added = emptyTrack(
      record.document,
      a.id,
      'Eigen melodie',
      'vocal_melody',
    );
    await mutate({ op: 'add-track', arrangementId: a.id, track: added });
    const event = { ...structuredClone(base.events[0]!), id: uid() };
    await mutate({
      op: 'put-event',
      arrangementId: a.id,
      trackId: added.id,
      event,
    });
    const next = {
      ...structuredClone(event),
      id: uid(),
      measureId: a.sections[0]!.measures[1]!.id,
    };
    await mutate({
      op: 'put-event',
      arrangementId: a.id,
      trackId: added.id,
      event: next,
    });
    const word = record.document.lyrics[0]!.lines[0]!.tokens.find(
        (w) => w.text === 'water',
      )!,
      now = new Date().toISOString(),
      link = {
        id: uid(),
        trackId: added.id,
        syllableId: word.syllables[0]!.id,
        eventIds: [event.id, next.id],
        sustain: true,
        createdAt: now,
        updatedAt: now,
      };
    await mutate({ op: 'put-link', arrangementId: a.id, link });
    await mutate({
      op: 'duplicate-track',
      arrangementId: a.id,
      trackId: added.id,
    });
    const copy = record.document.arrangements[0]!.tracks[2]!;
    expect(
      copy.events.every((e) => e.id !== event.id && e.id !== next.id),
    ).toBe(true);
    await mutate({
      op: 'update-track',
      arrangementId: a.id,
      trackId: copy.id,
      patch: { name: 'Eigen tweede melodie', visible: false, collapsed: true },
    });
    await mutate({ op: 'select-track', arrangementId: a.id, trackId: copy.id });
    await mutate({
      op: 'reorder-tracks',
      arrangementId: a.id,
      trackIds: [copy.id, base.id, added.id],
    });
    await mutate({
      op: 'delete-event',
      arrangementId: a.id,
      trackId: added.id,
      eventId: event.id,
      confirmed: true,
    });
    expect(
      record.document.arrangements[0]!.lyricsLinks.find(
        (l) => l.id === link.id,
      )!.eventIds,
    ).toEqual([next.id]);
    await mutate({
      op: 'delete-track',
      arrangementId: a.id,
      trackId: copy.id,
      confirmed: true,
    });
    expect(record.document.arrangements[0]!.tracks).toHaveLength(2);
    expect(record.document.arrangements[0]!.tracks[0]!.events).toEqual(
      base.events,
    );
  });
  it('rejects stale concurrent writes with currentRevision and no partial overwrite', async () => {
    const f = await upgrade();
    const a = f.record.document.arrangements[0]!,
      t = a.tracks[0]!;
    const results = await Promise.all(
      ['First', 'Second'].map((name) =>
        call('PATCH', f.url, {
          revision: f.record.revision,
          mutation: {
            op: 'update-track',
            arrangementId: a.id,
            trackId: t.id,
            patch: { name },
          },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      results.find((r) => r.statusCode === 409)!.json().currentRevision,
    ).toBe(3);
    expect((await call('GET', f.url)).json().revision).toBe(3);
  });
  it('isolates canonical, legacy, history, backup, restore and Practice access by trusted owner', async () => {
    const f = await upgrade();
    for (const suffix of ['', '?view=history', '?view=backups'])
      expect(
        (await call('GET', f.url + suffix, undefined, other)).statusCode,
      ).toBe(404);
    expect(
      (await call('GET', '/api/v1/songs', undefined, other)).json(),
    ).toEqual([]);
    expect(
      (
        await call(
          'GET',
          '/api/v1/songs/' + f.song.id + '/history',
          undefined,
          other,
        )
      ).json(),
    ).toEqual([]);
    expect(
      (
        await call(
          'PATCH',
          f.url,
          {
            revision: 2,
            mutation: {
              op: 'restore-backup',
              sourceRevision: 1,
              confirmed: true,
            },
          },
          other,
        )
      ).statusCode,
    ).toBe(404);
  });
  it('keeps the current Workspace writable while preserving additional tracks/links, rejecting destructive legacy changes', async () => {
    const f = await upgrade(2),
      a = f.record.document.arrangements[0]!;
    let record = (
      await call('PATCH', f.url, {
        revision: 2,
        mutation: {
          op: 'duplicate-track',
          arrangementId: a.id,
          trackId: a.tracks[0]!.id,
        },
      })
    ).json();
    const extra = structuredClone(record.document.arrangements[0].tracks[1]);
    let legacy = (await call('GET', '/api/v1/songs'))
      .json()
      .find((r: { song: StudioSong }) => r.song.id === f.song.id);
    legacy.song.title = 'Eigen gewijzigde metadata';
    const saved = await call('PUT', '/api/v1/songs/' + f.song.id, {
      song: legacy.song,
      revision: legacy.revision,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    record = (await call('GET', f.url)).json();
    expect(record.document.arrangements[0].tracks[1]).toEqual(extra);
    legacy = (await call('GET', '/api/v1/songs'))
      .json()
      .find((r: { song: StudioSong }) => r.song.id === f.song.id);
    legacy.song.arrangements[0].sections[0].measures.shift();
    legacy.song.arrangements[0].sections[0].chords = [];
    const rejected = await call('PUT', '/api/v1/songs/' + f.song.id, {
      song: legacy.song,
      revision: legacy.revision,
    });
    expect(rejected.statusCode).toBe(409);
    expect((await call('GET', f.url)).json().revision).toBe(record.revision);
  });
  it('requires explicit destructive/upgrade confirmation and rejects malformed ownership/timing/references', async () => {
    const f = await create(2),
      doc = toMultitrack(f.song);
    expect(
      (await call('PUT', f.url, { document: doc, revision: 1 })).statusCode,
    ).toBe(409);
    expect(
      (
        await call('PUT', f.url, {
          document: doc,
          revision: 1,
          confirmedUpgrade: true,
        })
      ).statusCode,
    ).toBe(200);
    const a = doc.arrangements[0]!,
      event = a.tracks[0]!.events[0]!;
    for (const mutation of [
      { op: 'put-event', arrangementId: a.id, trackId: 'foreign', event },
      {
        op: 'put-event',
        arrangementId: a.id,
        trackId: a.tracks[0]!.id,
        event: { ...event, start: { numerator: -1, denominator: 8 } },
      },
      {
        op: 'delete-track',
        arrangementId: a.id,
        trackId: a.tracks[0]!.id,
        confirmed: true,
      },
      { op: 'reorder-tracks', arrangementId: a.id, trackIds: ['foreign'] },
    ])
      expect(
        (await call('PATCH', f.url, { revision: 2, mutation })).statusCode,
      ).toBe(400);
    const removed = structuredClone(doc);
    removed.arrangements[0]!.tracks[0]!.events = [];
    expect(
      (await call('PUT', f.url, { revision: 2, document: removed })).statusCode,
    ).toBe(409);
    expect((await call('GET', f.url)).json().revision).toBe(2);
    const cross = structuredClone(doc);
    cross.arrangements[0]!.songId = 'foreign';
    expect(
      (await call('PUT', f.url, { revision: 2, document: cross })).statusCode,
    ).toBe(400);
  });
  it('retains all historical versions, restores a checksummed original backup and backs up the replaced canonical state', async () => {
    const f = await upgrade(2);
    let revision = 2;
    for (let i = 0; i < 22; i++) {
      const r = await call('PATCH', f.url, {
        revision,
        mutation: {
          op: 'update-track',
          arrangementId: f.record.document.arrangements[0]!.id,
          trackId: f.record.document.arrangements[0]!.tracks[0]!.id,
          patch: { name: 'Versie ' + i },
        },
      });
      expect(r.statusCode).toBe(200);
      revision = r.json().revision;
    }
    expect(
      (await call('GET', f.url + '?view=history')).json().entries,
    ).toHaveLength(24);
    const restored = await call('PATCH', f.url, {
      revision,
      mutation: { op: 'restore-backup', sourceRevision: 1, confirmed: true },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().document).toEqual(f.song);
    expect(restored.json().storageSchemaVersion).toBe(1);
    const backups = (await call('GET', f.url + '?view=backups')).json().entries;
    expect(
      backups.some(
        (b: { document: { schemaVersion: number } }) =>
          b.document.schemaVersion === 2,
      ),
    ).toBe(true);
    const saved = await call('PUT', '/api/v1/songs/' + f.song.id, {
      revision: restored.json().revision,
      song: { ...f.song, favorite: true },
    });
    expect(saved.statusCode).toBe(200);
    expect(
      (await call('GET', f.url + '?view=history')).json().entries,
    ).toHaveLength(26);
    await expect(
      pool.query(
        "UPDATE studio_song_schema_backups SET checksum='invalid' WHERE owner_id=$1 AND song_id=$2",
        [owner, f.song.id],
      ),
    ).rejects.toThrow();
  });
  it('rolls back upgrade, history and backup together when the history insert fails', async () => {
    const f = await create(),
      originalConnect = pool.connect.bind(pool);
    let injected = false;
    const connect = vi
      .spyOn(pool, 'connect')
      .mockImplementationOnce(async () => {
        const db = await originalConnect(),
          query = db.query.bind(db),
          spy = vi.spyOn(db, 'query');
        spy.mockImplementation((...args: unknown[]) => {
          if (
            typeof args[0] === 'string' &&
            args[0].startsWith('INSERT INTO studio_song_versions')
          ) {
            injected = true;
            return Promise.reject(new Error('Injected upgrade failure'));
          }
          return (query as (...a: unknown[]) => unknown)(...args);
        });
        const release = db.release.bind(db);
        db.release = () => {
          spy.mockRestore();
          db.release = release;
          release();
        };
        return db;
      });
    try {
      expect(
        (
          await call('PATCH', f.url, {
            revision: 1,
            mutation: { op: 'upgrade', confirmed: true },
          })
        ).statusCode,
      ).toBe(500);
      expect(injected).toBe(true);
      const row = await pool.query(
        'SELECT document,revision FROM studio_songs WHERE id=$1',
        [f.song.id],
      );
      expect(row.rows[0]).toEqual({ document: f.song, revision: 1 });
      expect(
        (await call('GET', f.url + '?view=backups')).json().entries,
      ).toEqual([]);
    } finally {
      connect.mockRestore();
    }
  });
  it('persists a bounded large arrangement with 12 independent tracks and 80 shared measures', async () => {
    const f = await create(),
      doc = toMultitrack(f.song),
      a = doc.arrangements[0]!,
      s = a.sections[0]!,
      template = structuredClone(a.tracks[0]!.events.slice(0, 3));
    s.measures = Array.from({ length: 80 }, () => ({
      id: uid(),
      timeSignature: { beats: 4, beatUnit: 4 as const },
    }));
    a.sections = [s];
    a.timeSignature = { beats: 4, beatUnit: 4 };
    a.tracks = Array.from({ length: 12 }, (_, order) => ({
      ...emptyTrack(doc, a.id, 'Partij ' + order),
      order,
      events: s.measures.flatMap((m) =>
        template.map((e) => ({
          ...structuredClone(e),
          id: uid(),
          measureId: m.id,
        })),
      ),
    }));
    a.trackOrder = a.tracks.map((t) => t.id);
    a.activeTrackId = a.legacyTrackId = a.trackOrder[0]!;
    a.chordAnchors = [];
    const response = await call('PUT', f.url, {
      document: doc,
      revision: 1,
      confirmedUpgrade: true,
      confirmedDestructive: true,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(
      (await call('GET', f.url)).json().document.arrangements[0].tracks,
    ).toHaveLength(12);
    expect(
      response
        .json()
        .document.arrangements[0].tracks.reduce(
          (n: number, t: { events: unknown[] }) => n + t.events.length,
          0,
        ),
    ).toBe(2880);
  });
  it('keeps normalized import and extended Practice context compatible with canonical storage', async () => {
    const f = await upgrade(2),
      a = f.record.document.arrangements[0]!,
      t = a.tracks[0]!,
      s = a.sections[0]!;
    const context = {
      songId: f.song.id,
      arrangementId: a.id,
      sectionId: s.id,
      measureId: s.measures[0]!.id,
      position: fraction(0, 1),
      stringSelection: [1],
      exerciseType: 'rhythm',
      trackIds: [t.id],
      measureRange: {
        fromMeasureId: s.measures[0]!.id,
        toMeasureId: s.measures[1]!.id,
      },
      eventIds: [t.events[0]!.id],
      returnCursor: {
        trackId: t.id,
        measureId: s.measures[0]!.id,
        position: fraction(0, 1),
        string: 1,
      },
    };
    const origin = await call('POST', '/api/v1/practice/origins', context);
    expect(origin.statusCode, origin.body).toBe(201);
    expect(
      (await call('GET', '/api/v1/practice/origins/' + origin.json().id)).json()
        .selection.trackIds,
    ).toEqual([t.id]);
    const imported = await call('POST', '/api/v1/imports', {
      requestId: uid(),
      confirmed: true,
      rightsConfirmed: true,
      input: { title: 'Eigen bijlage', text: '[Am]Eigen importwoorden' },
      target: { kind: 'new-arrangement', songId: f.song.id, revision: 2 },
    });
    expect(imported.statusCode, imported.body).toBe(201);
    expect(imported.json().song.schemaVersion).toBe(1);
    const canonical = (await call('GET', f.url)).json();
    expect(canonical.document.arrangements).toHaveLength(3);
    expect(canonical.document.arrangements[0].tracks[0]).toEqual(t);
    const changed = await call('PATCH', f.url, {
      revision: canonical.revision,
      mutation: {
        op: 'delete-event',
        arrangementId: a.id,
        trackId: t.id,
        eventId: t.events[0]!.id,
        confirmed: true,
      },
    });
    expect(changed.statusCode).toBe(200);
    expect(
      (
        await call('GET', '/api/v1/practice/origins/' + origin.json().id)
      ).json(),
    ).toMatchObject({
      status: 'missing-source',
      reason: 'event',
      fallback: 'library',
    });
  });
});
