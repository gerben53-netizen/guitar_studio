import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLrclib, DiscoveryError, normalizeLrclib } from './lrclib.js';
import { DiscoveryQuerySchema } from '../../../packages/shared/src/discovery.js';
import { buildApp } from './app.js';
const summary = {
  id: 123,
  trackName: 'Own fixture',
  artistName: 'Test author',
  albumName: 'Test album',
  duration: 100,
  instrumental: false,
  hasWordSync: false,
  hasPlainLyrics: true,
  hasSyncedLyrics: true,
  hasLyricsfile: false,
};
const full = {
  ...summary,
  plainLyrics: 'An original test line',
  syncedLyrics: '[00:01.23]An original test line',
  lyricsfile: '',
};
const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const query = (input: unknown = { q: 'Own' }) =>
  DiscoveryQuerySchema.parse(input);
afterEach(() => vi.useRealTimers());
describe('LRCLIB real adapter with deterministic HTTP boundary', () => {
  it('v2 search sends structured parameters/client ID, strips lyrics and fetches detail only on selection', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json([{ ...summary, secretUnexpected: 'not returned' }]),
      )
      .mockResolvedValueOnce(json(full));
    const p = createLrclib({
      fetch: fetcher,
      gapMs: 0,
      appId: 'app',
      apiKey: 'server-only',
    });
    const result = await p.search(
      query({ title: 'Own', artist: 'Me', album: 'A', limit: 1 }),
    );
    expect(result.apiVersion).toBe('v2');
    expect(result.results[0]).toMatchObject({
      availability: 'preview',
      storage: 'preview-only',
      title: 'Own fixture',
    });
    expect(JSON.stringify(result)).not.toContain('secretUnexpected');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('track_name=Own&artist_name=Me&album_name=A');
    expect(init?.headers).toMatchObject({
      'User-Agent': expect.stringContaining('GuitarStudio/'),
      'Lrclib-Api-Key': 'server-only',
    });
    const detail = await p.get('123');
    expect(detail.document.synchronization?.lines[0]!.startMs).toBe(1230);
    expect(detail.document.source).toMatchObject({
      provider: 'lrclib',
      recordId: '123',
      storage: 'preview-only',
    });
  });
  it('q takes precedence, artist-only uses q, chords yield honest empty response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json([]));
    const p = createLrclib({ fetch: fetcher, gapMs: 0 });
    await p.search(query({ q: 'Free', title: 'Ignored', artist: 'Ignored' }));
    expect(String(fetcher.mock.calls[0]![0])).toContain('?q=Free');
    expect(String(fetcher.mock.calls[0]![0])).not.toContain('track_name');
    await p.search(query({ artist: 'Artist' }));
    expect(String(fetcher.mock.calls[1]![0])).toContain('?q=Artist');
    expect(
      (await p.search(query({ q: 'Own', contentType: 'chords' }))).results,
    ).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([404, 405, 502])(
    'falls back on incompatible/unavailable beta %s, not on empty results',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('unavailable', { status }))
        .mockResolvedValueOnce(json([full]));
      const p = createLrclib({ fetch: fetcher, gapMs: 0 });
      expect((await p.search(query())).apiVersion).toBe('v1');
      expect(String(fetcher.mock.calls[1]![0])).toContain('/api/search?');
      const empty = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => json([]));
      expect(
        (await createLrclib({ fetch: empty, gapMs: 0 }).search(query()))
          .results,
      ).toEqual([]);
      expect(empty).toHaveBeenCalledTimes(1);
    },
  );
  it('falls back on schema/JSON incompatibility, strips full v1 lyrics from search results', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ id: 'wrong' }]))
      .mockResolvedValueOnce(json([full]));
    const result = await createLrclib({ fetch: fetcher, gapMs: 0 }).search(
      query(),
    );
    expect(result.apiVersion).toBe('v1');
    expect(JSON.stringify(result)).not.toContain('An original test line');
    expect(normalizeLrclib(full, 'v1').hasSyncedLyrics).toBe(true);
  });
  it.each([400, 401])(
    'does not fallback or retry on client/credential HTTP %s',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('not JSON', { status }));
      await expect(
        createLrclib({ fetch: fetcher, gapMs: 0 }).search(query()),
      ).rejects.toMatchObject({ statusCode: status });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('honors long Retry-After across future requests and never immediately retries 429', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('rate limited', {
        status: 429,
        headers: { 'Retry-After': '60' },
      }),
    );
    const p = createLrclib({ fetch: fetcher, gapMs: 0, random: () => 0 });
    await expect(p.search(query())).rejects.toMatchObject({
      statusCode: 429,
      retryAfter: 60,
    });
    await expect(p.get('123')).rejects.toMatchObject({ statusCode: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounded retry waits for Retry-After on 503 with jitter and serializes concurrent requests', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('busy', { status: 503, headers: { 'Retry-After': '1' } }),
      )
      .mockImplementation(async () => json([]));
    const p = createLrclib({ fetch: fetcher, gapMs: 350, random: () => 0.2 });
    const first = p.search(query());
    const second = p.search(query());
    const complete = Promise.all([first, second]);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await complete;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('cancels obsolete/queued work, bounds queue and times out network requests', async () => {
    const aborted = new AbortController();
    aborted.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createLrclib({ fetch: fetcher, gapMs: 0 }).search(
        query(),
        aborted.signal,
      ),
    ).rejects.toMatchObject({ statusCode: 499 });
    expect(fetcher).not.toHaveBeenCalled();
    const hangs = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
      );
    await expect(
      createLrclib({ fetch: hangs, gapMs: 0, timeoutMs: 10 }).get('123'),
    ).rejects.toMatchObject({ statusCode: 504 });
  });
  it('handles network errors, non-JSON, malformed records and fixed-host SSRF defense', async () => {
    const broken = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network'));
    await expect(
      createLrclib({ fetch: broken, gapMs: 0 }).get('123'),
    ).rejects.toMatchObject({ statusCode: 503 });
    for (const response of [
      new Response('html', { headers: { 'content-type': 'text/html' } }),
      json({ id: 'wrong' }),
      new Response('{', { headers: { 'content-type': 'application/json' } }),
    ])
      await expect(
        createLrclib({
          fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
          gapMs: 0,
        }).get('123'),
      ).rejects.toMatchObject({ statusCode: 502 });
    const fetcher = vi.fn<typeof fetch>();
    const p = createLrclib({ fetch: fetcher });
    for (const id of [
      'http://localhost',
      '../123',
      '0',
      '123?url=http://localhost',
    ])
      await expect(p.get(id)).rejects.toMatchObject({ statusCode: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('handles instrumental and missing lyrics as statuses, preserves invalid YAML only in preview', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          ...full,
          instrumental: true,
          plainLyrics: null,
          syncedLyrics: null,
        }),
      )
      .mockResolvedValueOnce(
        json({
          ...full,
          plainLyrics: null,
          syncedLyrics: null,
          lyricsfile: '!!bad x',
        }),
      );
    const p = createLrclib({ fetch: fetcher, gapMs: 0 });
    expect((await p.get('123')).instrumental).toBe(true);
    const detail = await p.get('123');
    expect(detail.document.warnings.join()).toContain('Lyricsfile');
    expect(detail.document.synchronization?.rawLyricsfile).toBe('!!bad x');
  });
});
describe('typed discovery HTTP contracts', () => {
  it('returns selected preview with no-store and never exposes server configuration', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(full));
    const app = buildApp(
      async () => {},
      false,
      undefined,
      {},
      {
        providers: [
          createLrclib({
            fetch: fetcher,
            gapMs: 0,
            apiKey: 'private-test-key',
          }),
        ],
      },
    );
    const detail = await app.inject('/api/v1/discovery/results/lrclib/123');
    expect(detail.statusCode).toBe(200);
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(detail.json().document.source.storage).toBe('preview-only');
    expect(detail.body).not.toContain('private-test-key');
    expect(
      (await app.inject('/api/v1/discovery/providers')).body,
    ).not.toContain('private-test-key');
    expect(
      (
        await app.inject(
          '/api/v1/discovery/results/lrclib/123?url=https://localhost',
        )
      ).statusCode,
    ).toBe(400);
    await app.close();
  });
  it('registers providers, validates allowlist/query/IDs and supports unavailable providers', async () => {
    const app = buildApp(
      async () => {},
      false,
      undefined,
      {},
      { providers: [] },
    );
    expect((await app.inject('/api/v1/discovery/providers')).json()).toEqual(
      [],
    );
    for (const url of [
      '/api/v1/discovery/search',
      '/api/v1/discovery/search?q=x&provider=evil',
      '/api/v1/discovery/search?q=x&url=http://localhost',
      '/api/v1/discovery/search?q=x&page=2',
      '/api/v1/discovery/search?q=x&limit=21',
      '/api/v1/discovery/results/lrclib/nope',
    ])
      expect((await app.inject(url)).statusCode).toBe(400);
    expect(
      (await app.inject('/api/v1/discovery/search?q=own')).statusCode,
    ).toBe(503);
    await app.close();
  });
  it('normalizes API error with Retry-After and limits per-IP requests', async () => {
    const p = createLrclib();
    p.search = async () => {
      throw new DiscoveryError(429, 'Pauze', 30);
    };
    const app = buildApp(
      async () => {},
      false,
      undefined,
      {},
      { providers: [p] },
    );
    const response = await app.inject('/api/v1/discovery/search?q=own');
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('30');
    expect(response.json().error.message).toBe('Pauze');
    for (let i = 0; i < 30; i++)
      await app.inject('/api/v1/discovery/search?q=own');
    const limited = await app.inject('/api/v1/discovery/search?q=own');
    expect(limited.headers['retry-after']).toBe('60');
    await app.close();
  });
});
