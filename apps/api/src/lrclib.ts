import { z } from 'zod';
import type {
  DiscoveryProvider,
  DiscoveryQuery,
  DiscoveryResult,
  DiscoverySearch,
} from '../../../packages/shared/src/discovery.js';
import { parseSongImport } from '../../../packages/music-domain/src/song-import.js';
import {
  parseLrc,
  parseLyricsfile,
} from '../../../packages/music-domain/src/lyrics-sync.js';
export class DiscoveryError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
const metadata = z.object({
  id: z.number().int().positive().safe(),
  trackName: z.string().max(200),
  artistName: z.string().max(200),
  albumName: z.string().max(300),
  duration: z.number().nonnegative().max(86400),
  instrumental: z.boolean(),
  hasWordSync: z.boolean().default(false),
});
const v2 = metadata.extend({
  hasPlainLyrics: z.boolean(),
  hasSyncedLyrics: z.boolean(),
  hasLyricsfile: z.boolean(),
});
const record = metadata.extend({
  plainLyrics: z.string().max(60000).nullable(),
  syncedLyrics: z.string().max(60000).nullable(),
  lyricsfile: z.string().max(60000).default(''),
});
export function normalizeLrclib(
  raw: unknown,
  version: 'v1' | 'v2',
): DiscoveryResult {
  const row = version === 'v2' ? v2.parse(raw) : record.parse(raw);
  const available =
    version === 'v2'
      ? (row as z.infer<typeof v2>)
      : {
          hasPlainLyrics: !!(row as z.infer<typeof record>).plainLyrics,
          hasSyncedLyrics: !!(row as z.infer<typeof record>).syncedLyrics,
          hasLyricsfile: !!(row as z.infer<typeof record>).lyricsfile,
        };
  return {
    provider: 'lrclib',
    id: String(row.id),
    title: row.trackName,
    artist: row.artistName,
    album: row.albumName,
    duration: row.duration,
    instrumental: row.instrumental,
    hasWordSync: row.hasWordSync,
    hasPlainLyrics: available.hasPlainLyrics,
    hasSyncedLyrics: available.hasSyncedLyrics,
    hasLyricsfile: available.hasLyricsfile,
    sourceUrl: `https://lrclib.net/record/${row.id}`,
    availability:
      available.hasPlainLyrics ||
      available.hasSyncedLyrics ||
      available.hasLyricsfile
        ? 'preview'
        : 'metadata',
    storage: 'preview-only',
  };
}
interface Options {
  fetch?: typeof fetch;
  timeoutMs?: number;
  gapMs?: number;
  now?: () => number;
  random?: () => number;
  appId?: string;
  apiKey?: string;
}
export function createLrclib(options: Options = {}): DiscoveryProvider {
  const fetcher = options.fetch ?? fetch,
    now = options.now ?? Date.now,
    random = options.random ?? Math.random;
  let tail: Promise<unknown> = Promise.resolve(),
    nextAt = 0,
    queued = 0;
  const wait = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DiscoveryError(499, 'Zoekopdracht geannuleerd.'));
        return;
      }
      const abort = () => {
        clearTimeout(timer);
        reject(new DiscoveryError(499, 'Zoekopdracht geannuleerd.'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', abort, { once: true });
    });
  async function json(path: string, signal?: AbortSignal) {
    if (queued >= 8)
      throw new DiscoveryError(
        429,
        'Zoekdienst is bezet. Probeer later opnieuw.',
        2,
      );
    if (nextAt - now() > 5000)
      throw new DiscoveryError(
        429,
        'LRCLIB vraagt een pauze. Probeer later opnieuw.',
        Math.ceil((nextAt - now()) / 1000),
      );
    queued++;
    const run = tail
      .catch(() => {})
      .then(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (nextAt - now() > 5000)
            throw new DiscoveryError(
              429,
              'LRCLIB vraagt een pauze.',
              Math.ceil((nextAt - now()) / 1000),
            );
          await wait(Math.max(0, nextAt - now()), signal);
          const timeout = AbortSignal.timeout(options.timeoutMs ?? 7000),
            combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
          const headers: Record<string, string> = {
            'User-Agent':
              'GuitarStudio/0.2.0 (https://github.com/gerben53-netizen/guitar_studio)',
            Accept: 'application/json',
          };
          if (options.appId) headers['Lrclib-App-Id'] = options.appId;
          if (options.apiKey) headers['Lrclib-Api-Key'] = options.apiKey;
          try {
            const response = await fetcher('https://lrclib.net' + path, {
              headers,
              signal: combined,
              redirect: 'error',
            });
            nextAt = Math.max(nextAt, now() + (options.gapMs ?? 350));
            if (!response.ok) {
              const retryValue = response.headers.get('retry-after');
              const retry = retryValue
                ? /^\d+(?:\.\d+)?$/.test(retryValue)
                  ? +retryValue * 1000
                  : Math.max(0, Date.parse(retryValue) - now())
                : 1000 * 2 ** attempt;
              if ([429, 500, 503].includes(response.status)) {
                const delay =
                  Math.max(1000, Number.isFinite(retry) ? retry : 1000) *
                  (1 + random() * 0.3);
                nextAt = Math.max(nextAt, now() + delay);
                if (attempt === 0 && delay <= 3000) continue;
                throw new DiscoveryError(
                  response.status === 429 ? 429 : 503,
                  'LRCLIB tijdelijk niet beschikbaar. Probeer later opnieuw.',
                  Math.ceil(delay / 1000),
                );
              }
              throw new DiscoveryError(
                response.status,
                response.status === 401
                  ? 'LRCLIB-clientconfiguratie is niet geldig.'
                  : response.status === 404
                    ? 'LRCLIB-record niet gevonden.'
                    : 'LRCLIB heeft het verzoek geweigerd.',
              );
            }
            if (!response.headers.get('content-type')?.includes('json'))
              throw new DiscoveryError(502, 'LRCLIB retourneerde geen JSON.');
            // Bound streamed bodies even when Content-Length is absent or dishonest.
            const reader = response.body?.getReader();
            let size = 0,
              text = '';
            const decoder = new TextDecoder();
            if (!reader)
              throw new DiscoveryError(502, 'LRCLIB gaf een leeg antwoord.');
            try {
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.length;
                if (size > 2_000_000) {
                  await reader.cancel();
                  throw new DiscoveryError(502, 'LRCLIB-antwoord te groot.');
                }
                text += decoder.decode(chunk.value, { stream: true });
              }
            } finally {
              reader.releaseLock();
            }
            try {
              return JSON.parse(text + decoder.decode()) as unknown;
            } catch {
              throw new DiscoveryError(502, 'LRCLIB gaf ongeldige JSON.');
            }
          } catch (error) {
            if (error instanceof DiscoveryError) throw error;
            if (signal?.aborted)
              throw new DiscoveryError(499, 'Zoekopdracht geannuleerd.');
            throw new DiscoveryError(
              timeout.aborted ? 504 : 503,
              'Geen verbinding met LRCLIB. Probeer opnieuw.',
            );
          }
        }
        throw new DiscoveryError(503, 'LRCLIB niet beschikbaar.');
      });
    tail = run;
    try {
      return await run;
    } finally {
      queued--;
    }
  }
  return {
    info: {
      id: 'lrclib',
      name: 'LRCLIB',
      contentTypes: ['lyrics'],
      searchBy: ['title', 'artist', 'combined', 'album', 'q'],
      pagination: false,
      maxResults: 20,
      restrictions:
        'Communityteksten: controleer op fouten. Expliciete import voor je persoonlijke bibliotheek; geen publieke verspreiding. Geen chords of tablatuur.',
    },
    async search(
      query: DiscoveryQuery,
      signal?: AbortSignal,
    ): Promise<DiscoverySearch> {
      if (query.contentType !== 'lyrics' && query.contentType !== 'mixed')
        return { results: [], apiVersion: 'v2', pagination: false };
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      else if (!query.title && query.artist)
        params.set('q', query.artist); // provider requires q or track_name
      else {
        if (query.title) params.set('track_name', query.title);
        if (query.artist) params.set('artist_name', query.artist);
        if (query.album) params.set('album_name', query.album);
      }
      let version: 'v1' | 'v2' = 'v2',
        rows: unknown;
      try {
        rows = await json('/api/v2/search?' + params, signal);
        rows = z.array(v2).max(20).parse(rows);
      } catch (error) {
        if (
          signal?.aborted ||
          (error instanceof DiscoveryError &&
            ![404, 405, 500, 502, 503, 504].includes(error.statusCode))
        )
          throw error;
        version = 'v1';
        rows = await json('/api/search?' + params, signal);
      }
      try {
        const results = z
          .array(version === 'v2' ? v2 : record)
          .max(20)
          .parse(rows)
          .map((r) => normalizeLrclib(r, version));
        return {
          results: results.slice(0, query.limit),
          apiVersion: version,
          pagination: false,
        };
      } catch {
        throw new DiscoveryError(
          502,
          'LRCLIB-resultaten hebben een onbekend formaat.',
        );
      }
    },
    async get(id, signal) {
      if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(+id))
        throw new DiscoveryError(400, 'Ongeldig LRCLIB-ID.');
      let row: z.infer<typeof record>;
      try {
        row = record.parse(await json('/api/get/' + id, signal));
      } catch (error) {
        if (error instanceof DiscoveryError) throw error;
        throw new DiscoveryError(
          502,
          'LRCLIB-record heeft een onbekend formaat.',
        );
      }
      if (String(row.id) !== id)
        throw new DiscoveryError(502, 'LRCLIB-record-ID komt niet overeen.');
      const document = parseSongImport({
        text: row.plainLyrics ?? '',
        title: row.trackName,
        artist: row.artistName,
      });
      document.source = {
        origin: 'external',
        provider: 'lrclib',
        recordId: id,
        name: 'LRCLIB',
        url: `https://lrclib.net/record/${id}`,
        method: 'provider',
        storage: 'preview-only',
      };
      if (row.syncedLyrics) {
        const parsed = parseLrc(row.syncedLyrics);
        document.synchronization = parsed.synchronization;
        document.warnings.push(...parsed.warnings);
        if (!row.plainLyrics)
          document.sections[0]!.lines = parsed.synchronization.lines.map(
            (l) => l.text,
          );
      }
      if (row.lyricsfile) {
        try {
          const parsed = parseLyricsfile(row.lyricsfile, row.hasWordSync);
          document.synchronization = {
            ...parsed.synchronization,
            rawLrc: row.syncedLyrics || null,
          };
          document.warnings.push(...parsed.warnings);
          if (!row.plainLyrics && !row.syncedLyrics)
            document.sections[0]!.lines = (
              parsed.plain ||
              parsed.synchronization.lines.map((l) => l.text).join('\n')
            ).split('\n');
        } catch {
          document.warnings.push(
            'Lyricsfile niet veilig/volledig herkenbaar; ongewijzigde bron alleen tijdelijk beschikbaar.',
          );
          if (document.synchronization)
            document.synchronization.rawLyricsfile = row.lyricsfile;
          else
            document.synchronization = {
              kind: 'plain',
              unit: 'milliseconds',
              lines: [],
              rawLrc: null,
              rawLyricsfile: row.lyricsfile,
            };
        }
      }
      if (row.instrumental)
        document.warnings.push(
          'Instrumentaal nummer: geen songtekst verwacht.',
        );
      else if (!row.plainLyrics && !row.syncedLyrics && !row.lyricsfile)
        document.warnings.push('Geen lyrics beschikbaar.');
      document.rawText =
        row.plainLyrics ||
        document.sections.map((s) => s.lines.join('\n')).join('\n\n');
      document.title = row.trackName;
      document.artist = row.artistName;
      document.status = document.warnings.length ? 'warnings' : 'valid';
      return {
        result: normalizeLrclib(row, 'v1'),
        document,
        instrumental: row.instrumental,
        storageReason:
          'Deze songtekst is door de community aangeleverd en kan fouten bevatten. Controleer de inhoud voordat je deze toevoegt aan je persoonlijke bibliotheek. Publieke verspreiding wordt niet ondersteund.',
      };
    },
  };
}
