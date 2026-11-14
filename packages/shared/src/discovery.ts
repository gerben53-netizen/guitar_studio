import { z } from 'zod';
import {
  ContentTypeSchema,
  type ImportDocument,
} from '../../music-domain/src/song-import-model.js';
export const DiscoveryQuerySchema = z
  .strictObject({
    q: z.string().trim().min(1).max(200).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    artist: z.string().trim().min(1).max(200).optional(),
    album: z.string().trim().min(1).max(200).optional(),
    provider: z.literal('lrclib').default('lrclib'),
    contentType: ContentTypeSchema.default('lyrics'),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .refine((v) => !!(v.q || v.title || v.artist), 'Zoek op titel en/of artiest');
export type DiscoveryQuery = z.infer<typeof DiscoveryQuerySchema>;
export interface DiscoveryProviderInfo {
  id: string;
  name: string;
  contentTypes: string[];
  searchBy: string[];
  pagination: boolean;
  maxResults: number;
  restrictions: string;
}
export interface DiscoveryResult {
  provider: string;
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  instrumental: boolean;
  hasWordSync: boolean;
  hasPlainLyrics: boolean;
  hasSyncedLyrics: boolean;
  hasLyricsfile: boolean;
  sourceUrl: string;
  availability: 'metadata' | 'preview' | 'importable';
  storage: 'preview-only';
}
export interface DiscoverySearch {
  results: DiscoveryResult[];
  apiVersion: 'v1' | 'v2';
  pagination: false;
}
export interface DiscoveryDetail {
  personalImportReceipt?: string;
  result: DiscoveryResult;
  document: ImportDocument;
  instrumental: boolean;
  storageReason: string;
}
export interface DiscoveryProvider {
  info: DiscoveryProviderInfo;
  search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoverySearch>;
  get(id: string, signal?: AbortSignal): Promise<DiscoveryDetail>;
}
