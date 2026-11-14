import type { MultitrackSong } from '../../../packages/music-domain/src/multitrack';
import type {
  SongRecord,
  StudioSong,
} from '../../../packages/music-domain/src/workspace';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public currentRevision?: number,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/v1' + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.error?.message ?? 'Verbinding mislukt. Probeer opnieuw.',
      response.status,
      data.currentRevision,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const listSongs = () => request<SongRecord[]>('/songs');
export const createSong = (song: StudioSong | MultitrackSong) =>
  request<SongRecord>('/songs', { method: 'POST', body: JSON.stringify(song) });
