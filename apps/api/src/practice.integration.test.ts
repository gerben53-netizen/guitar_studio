import { expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { seedPractice } from './practice-seed.js';
import { practiceCatalog } from '../../../packages/music-domain/src/practice-catalog.js';
import {
  newSong,
  putTone,
  fraction,
} from '../../../packages/music-domain/src/workspace.js';
import type { ExerciseConfiguration } from '../../../packages/music-domain/src/practice.js';
const base = '/api/v1/practice';
async function fixture() {
  const pool = new pg.Pool({
      connectionString: readConfig({ ...process.env, NODE_ENV: 'test' })
        .databaseUrl,
    }),
    a = 'test-' + randomUUID(),
    b = 'test-' + randomUUID(),
    songs = new Set<string>();
  const app = buildApp(() => pool.query('SELECT 1'), false, pool, {
    resolveOwner: (r) => String(r.headers['x-test-owner'] ?? a),
    canReadSong: (owner, id) => owner === a && songs.has(id),
  });
  const call = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: unknown,
    owner = a,
  ) =>
    app.inject({
      method,
      url: base + url,
      headers: { 'x-test-owner': owner },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const save = async (id = 's3', owner = a, bpm?: number) => {
    const current = (
      await call('GET', '/exercises/' + id + '/settings', undefined, owner)
    ).json();
    const configuration: ExerciseConfiguration = structuredClone(
      current.configuration,
    );
    if (bpm) configuration.bpm = bpm;
    const response = await call(
      'PUT',
      '/exercises/' + id + '/settings',
      { configuration, revision: current.revision },
      owner,
    );
    expect(response.statusCode, response.body).toBe(200);
    return response.json();
  };
  const session = (
    settings: { key: string; configuration: ExerciseConfiguration },
    changes: object = {},
  ) => ({
    id: randomUUID(),
    exerciseId: settings.configuration.exerciseId,
    configurationKey: settings.key,
    startedAt: '2026-11-14T10:00:00Z',
    endedAt: '2026-11-14T10:04:00Z',
    durationSeconds: 200,
    repetitions: 8,
    rating: 4,
    notes: 'Manual reflection',
    result: 'Uitgevoerd',
    masteryConfirmed: false,
    snapshot: settings.configuration,
    ...changes,
  });
  const close = async () => {
    await pool.query('DELETE FROM studio_songs WHERE id=ANY($1::text[])', [
      [...songs],
    ]);
    await pool.query('DELETE FROM practice_owners WHERE id=ANY($1::text[])', [
      [a, b],
    ]);
    await app.close();
    await pool.end();
  };
  return { pool, app, a, b, songs, call, save, session, close };
}
it('seeds all 18 original exercises idempotently, filters latest versions and returns structured errors', async () => {
  const f = await fixture();
  try {
    const client = await f.pool.connect();
    try {
      await client.query('BEGIN');
      await seedPractice(client);
      await seedPractice(client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const catalog = await f.call('GET', '/exercises');
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toHaveLength(18);
    expect(
      (await f.call('GET', '/exercises?lab=technique')).json(),
    ).toHaveLength(6);
    expect(
      (await f.call('GET', '/exercises?level=Basis&lab=scale&search=majeur'))
        .json()
        .map((e: { id: string }) => e.id),
    ).toEqual(['s1']);
    expect(
      (await f.call('GET', '/exercises?category=Fingerstyle')).json(),
    ).toHaveLength(2);
    expect(
      (await f.call('GET', '/exercises/r1')).json().defaultConfiguration.bpm,
    ).toBe(60);
    expect((await f.call('GET', '/exercises/missing')).statusCode).toBe(404);
    expect((await f.call('GET', '/exercises?lab=invalid')).statusCode).toBe(
      400,
    );
    expect((await f.call('GET', '/sessions?limit=0')).statusCode).toBe(400);
    expect((await f.call('GET', '/sessions?ownerId=other')).statusCode).toBe(
      400,
    );
  } finally {
    await f.close();
  }
});
it('persists revision-checked settings, immutable snapshots, paginated sessions and correct chronological progress', async () => {
  const f = await fixture();
  try {
    const initial = (await f.call('GET', '/progress/s3')).json();
    expect(initial.status).toBe('Nog niet begonnen');
    const settings = await f.save();
    expect((await f.call('GET', '/progress/s3')).json().status).toBe(
      'Aan het oefenen',
    );
    const first = f.session(settings),
      second = f.session(settings, {
        rating: 2,
        startedAt: '2026-11-13T10:00:00Z',
        endedAt: '2026-11-13T10:04:00Z',
      });
    const result = await Promise.all([
      f.call('POST', '/sessions', first),
      f.call('POST', '/sessions', second),
    ]);
    expect(result.map((r) => r.statusCode)).toEqual([201, 201]);
    expect((await f.call('POST', '/sessions', first)).statusCode).toBe(409);
    expect(
      (await f.call('GET', '/sessions/' + first.id)).json().snapshot,
    ).toEqual(settings.configuration);
    const progress = (await f.call('GET', '/progress/s3')).json();
    expect(progress).toMatchObject({
      sessionCount: 2,
      highestBpm: 60,
      lastRating: 4,
      mastered: false,
      status: 'Uitgevoerd',
    });
    expect(
      (
        await f.call(
          'GET',
          '/sessions?exerciseId=s3&lab=scale&result=Uitgevoerd&limit=1&offset=1',
        )
      ).json(),
    ).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect((await f.call('GET', '/progress')).json()).toHaveLength(18);
    expect(
      (
        await f.call('PUT', '/exercises/s3/settings', {
          configuration: settings.configuration,
          revision: 0,
        })
      ).statusCode,
    ).toBe(409);
    const faster = await f.save('s3', f.a, 120);
    expect(faster.key).not.toBe(settings.key);
    expect(
      (await f.call('GET', '/sessions/' + first.id)).json().snapshot.bpm,
    ).toBe(60);
    const newApp = buildApp(() => f.pool.query('SELECT 1'), false, f.pool, {
      resolveOwner: () => f.a,
    });
    try {
      expect(
        (await newApp.inject(base + '/sessions/' + first.id)).json().snapshot
          .bpm,
      ).toBe(60);
    } finally {
      await newApp.close();
    }
    expect(
      (
        await f.call(
          'POST',
          '/sessions',
          f.session(faster, { durationSeconds: 500 }),
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(
          'POST',
          '/sessions',
          f.session(faster, { result: 'Beheerst' }),
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call('GET', '/sessions/' + randomUUID())).json().error.code,
    ).toBe('NOT_FOUND');
  } finally {
    await f.close();
  }
});
it('awards mastery only explicitly and independently by configuration, with explicit overall award/revocation', async () => {
  const f = await fixture();
  try {
    const settings = await f.save();
    expect(
      (
        await f.call(
          'POST',
          '/sessions',
          f.session(settings, { result: 'Beheerst', masteryConfirmed: true }),
        )
      ).statusCode,
    ).toBe(201);
    expect((await f.call('GET', '/progress/s3')).json()).toMatchObject({
      status: 'Uitgevoerd',
      mastered: false,
      masteredConfigurations: 1,
    });
    const input = {
      exerciseId: 's3',
      exerciseVersion: 1,
      scope: 'configuration',
      configurationKey: settings.key,
      mastered: true,
      confirmed: true,
    };
    expect(
      (await f.call('PUT', '/mastery', { ...input, confirmed: false }))
        .statusCode,
    ).toBe(400);
    expect(
      (await f.call('GET', '/exercises/s3/settings')).json().mastery,
    ).toEqual({ configuration: true, exercise: false });
    const other = structuredClone(settings.configuration);
    other.position = { from: 5, to: 9 };
    const selected = (
      await f.call('PUT', '/exercises/s3/settings', {
        configuration: other,
        revision: settings.revision,
      })
    ).json();
    expect(selected.key).not.toBe(settings.key);
    expect(selected.mastery).toEqual({ configuration: false, exercise: false });
    expect(
      (
        await f.pool.query(
          'SELECT * FROM practice_mastery WHERE owner_id=$1 AND configuration_key=$2',
          [f.a, selected.key],
        )
      ).rowCount,
    ).toBe(0);
    expect((await f.call('PUT', '/mastery', input)).statusCode).toBe(200);
    const all = {
      exerciseId: 's3',
      exerciseVersion: 1,
      scope: 'exercise',
      configurationKey: null,
      mastered: true,
      confirmed: true,
    };
    expect((await f.call('PUT', '/mastery', all)).json().progress.status).toBe(
      'Beheerst',
    );
    expect(
      (await f.call('PUT', '/mastery', { ...all, mastered: false })).json()
        .progress.status,
    ).toBe('Uitgevoerd');
    expect(
      (await f.call('PUT', '/mastery', { ...input, mastered: false })).json()
        .progress.masteredConfigurations,
    ).toBe(0);
  } finally {
    await f.close();
  }
});
it('isolates all private resources by the trusted owner boundary and enforces composite foreign keys', async () => {
  const f = await fixture();
  try {
    const a = await f.save(),
      b = await f.save('s3', f.b, 90);
    expect(a.key).not.toBe(b.key);
    const body = f.session(a);
    await f.call('POST', '/sessions', body);
    expect(
      (await f.call('GET', '/sessions/' + body.id, undefined, f.b)).statusCode,
    ).toBe(404);
    expect(
      (await f.call('GET', '/sessions', undefined, f.b)).json().items,
    ).toEqual([]);
    expect(
      (await f.call('GET', '/progress/s3', undefined, f.b)).json().sessionCount,
    ).toBe(0);
    expect((await f.call('POST', '/sessions', body, f.b)).statusCode).toBe(404);
    expect(
      (
        await f.call(
          'PUT',
          '/mastery',
          {
            exerciseId: 's3',
            exerciseVersion: 1,
            scope: 'configuration',
            configurationKey: a.key,
            mastered: true,
            confirmed: true,
          },
          f.b,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await f.call(
          'PUT',
          '/exercises/s3/settings',
          {
            configuration: a.configuration,
            revision: b.revision,
            ownerId: f.a,
          },
          f.b,
        )
      ).statusCode,
    ).toBe(400);
    await expect(
      f.pool.query(
        'INSERT INTO practice_exercise_settings(owner_id,exercise_id,exercise_version,configuration_key,revision) VALUES($1,$2,1,$3,1)',
        [f.a, 'r1', b.key],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const defaultApp = buildApp(() => f.pool.query('SELECT 1'), false, f.pool);
    try {
      expect(
        (
          await defaultApp.inject({
            url: base + '/sessions/' + body.id,
            headers: { 'x-test-owner': f.a },
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await defaultApp.close();
    }
  } finally {
    await f.close();
  }
});
it('captures immutable song origins for all four labs, restores IDs after edits and offers a deletion fallback', async () => {
  const f = await fixture();
  const song = newSong('Origin integration', '', 'Eigen tekst'),
    a = song.arrangements[0]!,
    s = a.sections[0]!,
    m = s.measures[0]!;
  putTone(a, m, fraction(1, 4), fraction(1, 16), 1, 3);
  f.songs.add(song.id);
  try {
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/v1/songs',
          payload: song,
        })
      ).statusCode,
    ).toBe(201);
    const context = {
      songId: song.id,
      arrangementId: a.id,
      sectionId: s.id,
      measureId: m.id,
      position: fraction(1, 4),
      stringSelection: [1],
      exerciseType: 'technique',
    };
    for (const lab of ['rhythm', 'scale', 'chord', 'technique']) {
      const created = await f.call('POST', '/origins', {
        ...context,
        exerciseType: lab,
      });
      expect(created.statusCode, created.body).toBe(201);
      const origin = created.json();
      expect(origin.sourceConfiguration.events[0].duration).toEqual(
        fraction(1, 16),
      );
      expect(
        (await f.call('GET', '/origins/' + origin.id)).json(),
      ).toMatchObject({ status: 'available', selection: { measureId: m.id } });
      expect(
        (await f.call('GET', '/origins/' + origin.id, undefined, f.b))
          .statusCode,
      ).toBe(404);
    }
    expect((await f.call('POST', '/origins', context, f.b)).statusCode).toBe(
      404,
    );
    expect(
      (await f.call('POST', '/origins', { ...context, measureId: 'missing' }))
        .statusCode,
    ).toBe(404);
    const origin = (await f.call('POST', '/origins', context)).json();
    const stored = await f.pool.query(
      'SELECT document FROM studio_songs WHERE id=$1',
      [song.id],
    );
    expect(stored.rows[0].document).toEqual(song);
    const settings = await f.save('r1', f.a, 150);
    expect(settings.configuration.bpm).toBe(150);
    expect(
      (
        await f.pool.query('SELECT document FROM studio_songs WHERE id=$1', [
          song.id,
        ])
      ).rows[0].document.arrangements[0].tempo,
    ).toBe(84);
    await f.app.inject({
      method: 'DELETE',
      url: '/api/v1/songs/' + song.id + '?revision=1',
    });
    expect((await f.call('GET', '/origins/' + origin.id)).json()).toMatchObject(
      {
        status: 'missing-source',
        reason: 'song',
        fallback: 'library',
        snapshot: { tempo: 84 },
      },
    );
  } finally {
    await f.close();
  }
});
it('refuses edits to immutable seed versions and preserves existing song data', async () => {
  const f = await fixture();
  try {
    const before = await f.pool.query(
      'SELECT count(*)::int AS n FROM studio_songs',
    );
    const client = await f.pool.connect();
    try {
      await client.query('BEGIN');
      const altered = structuredClone(practiceCatalog[0]!);
      altered.title = 'Changed without version bump';
      await client.query(
        'UPDATE practice_exercises SET document=$1 WHERE id=$2 AND version=1',
        [JSON.stringify(altered), altered.id],
      );
      await expect(seedPractice(client)).rejects.toThrow('immutable');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(
      (await f.pool.query('SELECT count(*)::int AS n FROM studio_songs')).rows,
    ).toEqual(before.rows);
  } finally {
    await f.close();
  }
});

it('retains historical sessions/settings/mastery when a new catalog version is seeded', async () => {
  const f = await fixture();
  try {
    const settings = await f.save('s3');
    const session = f.session(settings, {
      result: 'Beheerst',
      masteryConfirmed: true,
    });
    expect((await f.call('POST', '/sessions', session)).statusCode).toBe(201);
    await f.call('PUT', '/mastery', {
      exerciseId: 's3',
      exerciseVersion: 1,
      scope: 'exercise',
      configurationKey: null,
      mastered: true,
      confirmed: true,
    });
    const client = await f.pool.connect();
    try {
      await client.query('BEGIN');
      const v2 = structuredClone(practiceCatalog.find((e) => e.id === 's3')!);
      v2.version = 2;
      v2.defaultConfiguration.exerciseVersion = 2;
      await seedPractice(client, [v2]);
      expect(
        (
          await client.query(
            'SELECT mastered,mastered_configurations FROM practice_progress WHERE owner_id=$1 AND exercise_id=$2',
            [f.a, 's3'],
          )
        ).rows[0],
      ).toEqual({ mastered: false, mastered_configurations: 0 });
      expect(
        (
          await client.query(
            'SELECT exercise_version FROM practice_exercise_settings WHERE owner_id=$1 AND exercise_id=$2',
            [f.a, 's3'],
          )
        ).rows[0].exercise_version,
      ).toBe(1);
      expect(
        (
          await client.query(
            'SELECT document FROM practice_sessions WHERE owner_id=$1 AND id=$2',
            [f.a, session.id],
          )
        ).rows[0].document.snapshot,
      ).toEqual(settings.configuration);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS n FROM practice_mastery WHERE owner_id=$1 AND exercise_id=$2 AND exercise_version=1',
            [f.a, 's3'],
          )
        ).rows[0].n,
      ).toBe(2);
      await seedPractice(client, [v2]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await f.close();
  }
});
