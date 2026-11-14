import type { MultitrackSong } from '../../music-domain/src/multitrack.js';
import type { MultitrackMutation } from '../../music-domain/src/multitrack-operations.js';
export interface MultitrackRecord {
  document: MultitrackSong;
  revision: number;
  updatedAt: string;
  storageSchemaVersion: 1 | 2;
}
export interface MultitrackRequest {
  <T>(path: string, init?: RequestInit): Promise<T>;
}
export function multitrackClient(request: MultitrackRequest) {
  const path = (id: string) =>
    '/songs/' + encodeURIComponent(id) + '/multitrack';
  return {
    get: (id: string) => request<MultitrackRecord>(path(id)),
    save: (
      id: string,
      document: MultitrackSong,
      revision: number,
      confirmation: {
        confirmedUpgrade?: boolean;
        confirmedDestructive?: boolean;
      } = {},
    ) =>
      request<MultitrackRecord>(path(id), {
        method: 'PUT',
        body: JSON.stringify({ document, revision, ...confirmation }),
      }),
    mutate: (
      id: string,
      revision: number,
      mutation:
        | MultitrackMutation
        | { op: 'upgrade'; confirmed: true }
        | { op: 'restore-backup'; sourceRevision: number; confirmed: true },
    ) =>
      request<MultitrackRecord>(path(id), {
        method: 'PATCH',
        body: JSON.stringify({ revision, mutation }),
      }),
    versions: (
      id: string,
      view: 'history' | 'backups',
      beforeRevision?: number,
    ) =>
      request<{
        entries: { document: unknown; revision: number; updatedAt: string }[];
        nextBeforeRevision: number | null;
      }>(
        path(id) +
          '?' +
          new URLSearchParams({
            view,
            ...(beforeRevision
              ? { beforeRevision: String(beforeRevision) }
              : {}),
          }),
      ),
  };
}
