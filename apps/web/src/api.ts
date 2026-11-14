import type {
  SongRecord,
  StudioSong,
} from '../../../packages/music-domain/src/workspace';
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
    throw new Error(
      data.error?.message ?? 'Verbinding mislukt. Probeer opnieuw.',
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const listSongs = () => request<SongRecord[]>('/songs');
export const createSong = (song: StudioSong) =>
  request<SongRecord>('/songs', { method: 'POST', body: JSON.stringify(song) });
