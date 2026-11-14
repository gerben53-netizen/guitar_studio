import { createLrclib } from '../src/lrclib.js';
export const originalText = 'Eigen bronregel\nTweede eigen regel';
export function personalRecord(id = 900001) {
  return {
    id,
    trackName: 'Eigen LRCLIB fixture ' + id,
    artistName: 'Eigen testauteur',
    albumName: 'Eigen testalbum',
    duration: 120,
    instrumental: id === 900004,
    hasWordSync: id === 900003,
    plainLyrics: [900001, 900004].includes(id) ? originalText : null,
    syncedLyrics: [900001, 900002, 900003].includes(id)
      ? '[00:01.00]Eigen bronregel\n[00:03.00]Tweede eigen regel'
      : null,
    lyricsfile:
      id === 900003
        ? JSON.stringify({
            version: '1.0',
            metadata: {
              title: 'Eigen bron',
              artist: 'Eigen testauteur',
              offset_ms: 50,
            },
            lines: [
              {
                text: 'Eigen bronregel',
                start_ms: 1000,
                end_ms: 2500,
                words: [
                  { text: 'Eigen ', start_ms: 1000, end_ms: 1500 },
                  { text: 'bronregel', start_ms: 1500, end_ms: 2500 },
                ],
              },
            ],
          })
        : id === 900006
          ? '!!bad x'
          : '',
  };
}
export function personalFixtureProvider() {
  return createLrclib({
    gapMs: 0,
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.startsWith('/api/get/'))
        return Response.json(
          personalRecord(Number(url.pathname.split('/').at(-1))),
        );
      return Response.json(
        [900001, 900002, 900003, 900004, 900005, 900006].map((id) => {
          const r = personalRecord(id);
          return {
            ...r,
            hasPlainLyrics: !!r.plainLyrics,
            hasSyncedLyrics: !!r.syncedLyrics,
            hasLyricsfile: !!r.lyricsfile,
          };
        }),
      );
    },
  });
}
