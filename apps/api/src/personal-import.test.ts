import { describe, it, expect } from 'vitest';
import {
  personalFixtureProvider,
  originalText,
} from '../test-support/personal-lyrics-fixtures.js';
import { createPersonalImportReceipts } from './personal-import-receipts.js';
import { createLrclib } from './lrclib.js';
import { personalRecord } from '../test-support/personal-lyrics-fixtures.js';
import {
  personalLyricsDocument,
  canStoreImport,
} from '../../../packages/music-domain/src/lrclib-personal-import.js';
import {
  ImportSourceSchema,
  ImportCommitSchema,
} from '../../../packages/music-domain/src/song-import-model.js';
describe('personal lyrics policy and verified source preservation', () => {
  it.each([900001, 900002, 900003])(
    'imports plain/LRC/word source %s with corrections and original timing intact',
    async (id) => {
      const detail = await personalFixtureProvider().get(String(id));
      const before = structuredClone(detail.document);
      const original = detail.document.sections
        .map((s) => s.lines.join('\n'))
        .join('\n\n');
      const doc = personalLyricsDocument(
        detail.document,
        detail.result.album,
        {
          title: 'Gecorrigeerde titel',
          artist: 'Gecorrigeerde artiest',
          text: original + '\nNieuwe eigen regel',
        },
        new Date().toISOString(),
      );
      expect(doc.source).toMatchObject({
        provider: 'lrclib',
        recordId: String(id),
        storage: 'personal-only',
        personalImport: {
          scope: 'personal',
          album: 'Eigen testalbum',
          textCorrected: true,
          metadataCorrected: true,
        },
      });
      expect(doc.rawText).toBe(before.rawText);
      expect(doc.synchronization).toEqual(before.synchronization);
      expect(doc.sections.map((s) => s.lines.join('\n')).join()).toContain(
        'Nieuwe eigen regel',
      );
      expect(canStoreImport(doc)).toBe(true);
      expect(canStoreImport(before)).toBe(false);
      expect(detail.document).toEqual(before);
      if (id === 900003) {
        expect(doc.synchronization?.kind).toBe('word');
        expect(doc.synchronization?.rawLrc).toContain('[00:01.00]');
        expect(doc.synchronization?.rawLyricsfile).toContain('offset_ms');
      }
    },
  );
  it.each([900004, 900005, 900006])(
    'never offers an import receipt for instrumental/missing/unsafe-only source %s',
    async (id) => {
      const detail = await personalFixtureProvider().get(String(id));
      expect(
        createPersonalImportReceipts().issue(detail, 'owner'),
      ).toBeUndefined();
    },
  );
  it('requires explicit confirmation, rejects unsigned/tampered/foreign/expired previews and different server keys', async () => {
    let now = 1000;
    const receipts = createPersonalImportReceipts({ now: () => now });
    const detail = await personalFixtureProvider().get('900001'),
      token = receipts.issue(detail, 'owner')!;
    expect(receipts.verify(token, 'owner').document.rawText).toBe(originalText);
    for (const value of ['fake', token + 'a'])
      expect(() => receipts.verify(value, 'owner')).toThrow('ongeldig');
    expect(() => receipts.verify(token, 'other')).toThrow('ongeldig');
    expect(() => createPersonalImportReceipts().verify(token, 'owner')).toThrow(
      'ongeldig',
    );
    const input = {
      requestId: crypto.randomUUID(),
      confirmed: true,
      rightsConfirmed: true,
      input: { text: originalText, title: 'Eigen', personalReceipt: token },
      target: { kind: 'new-song' },
    };
    expect(ImportCommitSchema.safeParse(input).success).toBe(false);
    expect(
      ImportCommitSchema.safeParse({ ...input, personalUseConfirmed: true })
        .success,
    ).toBe(true);
    now += 30 * 60 * 1000;
    expect(() => receipts.verify(token, 'owner')).toThrow('verlopen');
  });
  it('refuses empty corrections, spoofed source policies and invalid control characters', async () => {
    const detail = await personalFixtureProvider().get('900001');
    for (const text of ['', '   ', '\u0000'])
      expect(() =>
        personalLyricsDocument(
          detail.document,
          'Album',
          { text, title: 'Eigen' },
          new Date().toISOString(),
        ),
      ).toThrow();
    expect(
      ImportSourceSchema.safeParse({
        ...detail.document.source,
        storage: 'personal-only',
      }).success,
    ).toBe(false);
    expect(
      personalLyricsDocument(
        detail.document,
        'Album',
        { text: 'e|---\nEigen tekst', title: 'Eigen' },
        new Date().toISOString(),
      ).status,
    ).toBe('correction-required');
    const record = personalRecord();
    const metadata = await createLrclib({
      gapMs: 0,
      fetch: async () =>
        Response.json({
          ...record,
          plainLyrics: '{title: Andere titel}\nEigen tekst',
        }),
    }).get(String(record.id));
    expect(metadata.document.title).toBe(record.trackName);
    expect(metadata.document.artist).toBe(record.artistName);
  });
});
