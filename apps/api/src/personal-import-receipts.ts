import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ImportDocumentSchema } from '../../../packages/music-domain/src/song-import-model.js';
import { hasLyrics } from '../../../packages/music-domain/src/lrclib-personal-import.js';
import type { DiscoveryDetail } from '../../../packages/shared/src/discovery.js';
const payloadSchema = z.strictObject({
  version: z.literal(1),
  owner: z.string().min(1).max(200),
  expiresAt: z.number().int(),
  document: ImportDocumentSchema,
  album: z.string().max(300),
});
export function createPersonalImportReceipts(
  options: { now?: () => number; key?: Buffer } = {},
) {
  const key = options.key ?? randomBytes(32),
    now = options.now ?? Date.now;
  const sign = (value: string) =>
    createHmac('sha256', key).update(value).digest();
  return {
    issue(detail: DiscoveryDetail, owner: string) {
      if (detail.instrumental || !hasLyrics(detail.document)) return undefined;
      const payload = payloadSchema.parse({
        version: 1,
        owner,
        expiresAt: now() + 30 * 60 * 1000,
        document: detail.document,
        album: detail.result.album,
      });
      const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const receipt = value + '.' + sign(value).toString('base64url');
      if (receipt.length > 1_500_000) return undefined;
      return receipt;
    },
    verify(receipt: string, owner: string) {
      try {
        const parts = receipt.split('.');
        if (parts.length !== 2) throw new Error();
        const [value, signature] = parts as [string, string];
        const supplied = Buffer.from(signature, 'base64url'),
          expected = sign(value);
        if (
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        )
          throw new Error();
        const payload = payloadSchema.parse(
          JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
        );
        if (payload.owner !== owner || payload.expiresAt <= now())
          throw new Error();
        return payload;
      } catch {
        throw Object.assign(
          new Error(
            'Lyrics-preview verlopen of ongeldig. Selecteer de LRCLIB-song opnieuw; niets opgeslagen.',
          ),
          { statusCode: 409 },
        );
      }
    },
  };
}
export type PersonalImportReceipts = ReturnType<
  typeof createPersonalImportReceipts
>;
