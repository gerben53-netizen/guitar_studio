import {
  SongSchema,
  type SongRecord,
  type StudioSong,
} from '../../../packages/music-domain/src/workspace.js';
import {
  MultitrackSongSchema,
  legacyView,
  mergeLegacyWrite,
  type MultitrackSong,
} from '../../../packages/music-domain/src/multitrack.js';
export type StoredSong = StudioSong | MultitrackSong;
export const isMultitrack = (value: unknown): value is MultitrackSong =>
  (value as { schemaVersion?: number })?.schemaVersion === 2;
export function parseStoredSong(value: unknown): StoredSong {
  return isMultitrack(value)
    ? MultitrackSongSchema.parse(value)
    : SongSchema.parse(value);
}
export function legacyRecord<
  T extends { song: unknown; revision: number; updatedAt: string },
>(record: T): SongRecord {
  return {
    ...record,
    song: legacyView(record.song),
    storageSchemaVersion: isMultitrack(record.song) ? 2 : 1,
  };
}
export function mergeWorkspaceWrite(
  current: unknown,
  incoming: StudioSong,
): StoredSong {
  return isMultitrack(current)
    ? mergeLegacyWrite(MultitrackSongSchema.parse(current), incoming)
    : SongSchema.parse(incoming);
}
