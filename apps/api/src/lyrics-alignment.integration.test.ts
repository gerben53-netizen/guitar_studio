import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { alignmentFixture } from '../../../packages/music-domain/test-support/alignment-fixture.js';
import {
  startAlignment,
  alignmentAction,
  applyAlignment,
  planAlignment,
  type AlignmentSession,
} from '../../../packages/music-domain/src/lyrics-alignment.js';
import {
  toMultitrack,
  MultitrackSongSchema,
  type MultitrackSong,
} from '../../../packages/music-domain/src/multitrack.js';
import { parseSongImport } from '../../../packages/music-domain/src/song-import.js';
import { importToSong } from '../../../packages/music-domain/src/import-to-song.js';
describe('alignment commits through canonical PostgreSQL transactions', () => {
  const pool = new pg.Pool({
      connectionString: readConfig({ ...process.env, NODE_ENV: 'test' })
        .databaseUrl,
    }),
    owner = 'alignment-' + randomUUID(),
    other = 'alignment-' + randomUUID();
  const app = buildApp(() => pool.query('SELECT 1'), false, pool, {
    resolveOwner: (r) => String(r.headers['x-alignment-owner'] ?? owner),
  });
  const call = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: unknown,
    who = owner,
  ) =>
    app.inject({
      method,
      url,
      headers: { 'x-alignment-owner': who, 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  async function create() {
    const song = alignmentFixture(false);
    expect((await call('POST', '/api/v1/songs', song)).statusCode).toBe(201);
    return { song, url: '/api/v1/songs/' + song.id + '/multitrack' };
  }
  function session(song: MultitrackSong, revision = 1) {
    const a = song.arrangements[0]!;
    let s = startAlignment(
      song,
      {
        arrangementId: a.id,
        trackId: a.activeTrackId,
        sectionId: a.sections[0]!.id,
        lineId: song.lyrics[0]!.lines[0]!.id,
      },
      revision,
    );
    for (let i = 0; i < 6; i++) s = alignmentAction(s, { type: 'bind' });
    return s;
  }
  async function commit(
    url: string,
    song: MultitrackSong,
    s: AlignmentSession,
  ) {
    return call('PUT', url, {
      revision: s.startRevision,
      document: applyAlignment(song, s, new Date().toISOString()),
      confirmedDestructive: true,
    });
  }
  const get = async (url: string) =>
    (await call('GET', url)).json() as {
      document: MultitrackSong;
      revision: number;
    };
  beforeAll(() => app.ready());
  afterAll(async () => {
    await pool.query('DELETE FROM studio_songs WHERE owner_id=ANY($1)', [
      [owner, other],
    ]);
    await app.close();
    await pool.end();
  });
  it('commits a complete line in one revision and one history entry, preserving every non-link field', async () => {
    const { song, url } = await create(),
      s = session(song),
      res = await commit(url, song, s);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().revision).toBe(2);
    const current = await get(url);
    expect(current.document.arrangements[0]!.lyricsLinks).toHaveLength(6);
    const comparison = structuredClone(current.document);
    comparison.arrangements[0]!.lyricsLinks = [];
    expect(MultitrackSongSchema.parse(comparison)).toEqual(song);
    const history = (await call('GET', url + '?view=history')).json();
    expect(history.entries).toHaveLength(2);
    expect(
      history.entries.map((e: { revision: number }) => e.revision),
    ).toEqual([2, 1]);
  });
  it('cancel and proposal cancellation never write current, revision or history', async () => {
    const { song, url } = await create(),
      before = await get(url),
      s = session(song);
    expect(planAlignment(s, new Date().toISOString()).changed).toBe(true);
    expect(await get(url)).toEqual(before);
    expect(
      (await call('GET', url + '?view=history')).json().entries,
    ).toHaveLength(1);
  });
  it('rejects an actual second-session revision conflict and leaves both the winner and draft intact', async () => {
    const { song, url } = await create(),
      s = session(song),
      draft = structuredClone(s),
      remote = structuredClone(song);
    remote.progress = 25;
    expect(
      (await call('PUT', url, { revision: 1, document: remote })).statusCode,
    ).toBe(200);
    const loser = await commit(url, song, s);
    expect(loser.statusCode).toBe(409);
    expect(loser.json().currentRevision).toBe(2);
    expect(MultitrackSongSchema.parse((await get(url)).document)).toEqual(
      remote,
    );
    expect(s).toEqual(draft);
    expect(
      (await call('GET', url + '?view=history')).json().entries,
    ).toHaveLength(2);
  });
  it('owner isolation rejects commits/history reads without leaking the source', async () => {
    const { song, url } = await create(),
      s = session(song),
      document = applyAlignment(song, s, new Date().toISOString());
    expect(
      (await call('PUT', url, { revision: 1, document }, other)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', url + '?view=history', undefined, other)).statusCode,
    ).toBe(404);
    expect((await get(url)).revision).toBe(1);
  });
  it('server-side validation rejects foreign event references without partial writes', async () => {
    const { song, url } = await create(),
      document = applyAlignment(song, session(song), new Date().toISOString());
    document.arrangements[0]!.lyricsLinks[0]!.eventIds = ['missing'];
    expect((await call('PUT', url, { revision: 1, document })).statusCode).toBe(
      400,
    );
    expect((await get(url)).revision).toBe(1);
    expect(
      (await call('GET', url + '?view=history')).json().entries,
    ).toHaveLength(1);
  });
  it('rolls back current and history on storage failure, retains draft, then retries successfully', async () => {
    const { song, url } = await create(),
      s = session(song),
      draft = structuredClone(s),
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
            return Promise.reject(Error('Alignment transaction fault'));
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
      expect((await commit(url, song, s)).statusCode).toBe(500);
      expect(injected).toBe(true);
    } finally {
      connect.mockRestore();
    }
    expect((await get(url)).revision).toBe(1);
    expect(
      (await call('GET', url + '?view=history')).json().entries,
    ).toHaveLength(1);
    expect(s).toEqual(draft);
    expect((await commit(url, song, s)).statusCode).toBe(200);
    expect((await get(url)).revision).toBe(2);
  });
  it('reopens stored links through a fresh API instance and can restore/undo them as one new version', async () => {
    const { song, url } = await create();
    expect((await commit(url, song, session(song))).statusCode).toBe(200);
    const fresh = buildApp(() => pool.query('SELECT 1'), false, pool, {
      resolveOwner: () => owner,
    });
    try {
      await fresh.ready();
      const reopened = await fresh.inject({ method: 'GET', url });
      expect(reopened.json().document.arrangements[0].lyricsLinks).toHaveLength(
        6,
      );
    } finally {
      await fresh.close();
    }
    expect(
      (
        await call('PUT', url, {
          revision: 2,
          document: song,
          confirmedDestructive: true,
        })
      ).statusCode,
    ).toBe(200);
    expect((await get(url)).document.arrangements[0]!.lyricsLinks).toHaveLength(
      0,
    );
    expect(
      (await call('GET', url + '?view=history')).json().entries,
    ).toHaveLength(3);
  });
  it('aligns an imported v2 document without changing source lyrics, chord anchors or LRC milliseconds', async () => {
    const source = parseSongImport({
      title: 'Eigen geïmporteerde regel',
      text: '[Couplet]\n[C]Langs het water wordt licht',
      format: 'chordpro',
    });
    source.synchronization = {
      kind: 'line',
      unit: 'milliseconds',
      lines: [
        {
          text: 'Langs het water wordt licht',
          startMs: 1234,
          endMs: 5678,
          words: [],
        },
      ],
      rawLrc: '[00:01.234]Langs het water wordt licht',
      rawLyricsfile: null,
    };
    const song = toMultitrack(importToSong(source));
    const arrangement = song.arrangements[0]!,
      track = arrangement.tracks[0]!;
    const notes = alignmentFixture(false).arrangements[0]!.tracks[0]!.events;
    const oldBars = [...new Set(notes.map((n) => n.measureId))];
    track.events = notes.map((n) => ({
      ...n,
      measureId:
        arrangement.sections[0]!.measures[oldBars.indexOf(n.measureId)]!.id,
    }));
    expect((await call('POST', '/api/v1/songs', song)).statusCode).toBe(201);
    const url = '/api/v1/songs/' + song.id + '/multitrack';
    const s = session(song);
    expect((await commit(url, song, s)).statusCode).toBe(200);
    const saved = MultitrackSongSchema.parse((await get(url)).document);
    expect(saved.importDocuments).toEqual(song.importDocuments);
    expect(saved.arrangements[0]!.chordAnchors).toEqual(
      arrangement.chordAnchors,
    );
    saved.arrangements[0]!.lyricsLinks = [];
    expect(saved).toEqual(song);
  });
  it.each(['changed-note', 'deleted-note', 'deleted-word'] as const)(
    'rejects an old alignment after %s without resurrecting removed source IDs',
    async (kind) => {
      const { song, url } = await create(),
        s = session(song),
        winner = structuredClone(song);
      if (kind === 'changed-note')
        winner.arrangements[0]!.tracks[0]!.events[0]!.duration = {
          numerator: 1,
          denominator: 16,
        };
      if (kind === 'deleted-note')
        winner.arrangements[0]!.tracks[0]!.events.shift();
      if (kind === 'deleted-word') {
        const removed = winner.lyrics[0]!.lines[0]!.tokens.shift()!;
        for (const a of winner.arrangements)
          a.chordAnchors = a.chordAnchors.filter(
            (c) => c.tokenId !== removed.id,
          );
      }
      expect(
        (
          await call('PUT', url, {
            revision: 1,
            document: winner,
            confirmedDestructive: true,
          })
        ).statusCode,
      ).toBe(200);
      expect(() => applyAlignment(winner, s, new Date().toISOString())).toThrow(
        'bron is gewijzigd',
      );
      expect((await commit(url, song, s)).statusCode).toBe(409);
      expect(MultitrackSongSchema.parse((await get(url)).document)).toEqual(
        winner,
      );
      expect(
        (await call('GET', url + '?view=history')).json().entries,
      ).toHaveLength(2);
    },
  );
});
