import type { PracticePreferences } from '../../music-domain/src/practice-transport.js';
import type {
  Exercise,
  ExerciseConfiguration,
  PracticeSession,
  PracticeSessionInput,
  PracticeProgress,
  PracticeOrigin,
  PracticeOriginInput,
  OriginResolution,
  PracticeMastery,
} from '../../music-domain/src/practice.js';
export interface PracticeSettingsRecord {
  configuration: ExerciseConfiguration;
  key: string;
  revision: number;
  version: number;
  needsUpgrade: boolean;
  mastery: { configuration: boolean; exercise: boolean };
}
export interface SessionPage {
  items: PracticeSession[];
  total: number;
  limit: number;
  offset: number;
}
export type PracticeTransport = <T>(
  path: string,
  init?: { method?: 'GET' | 'POST' | 'PUT'; body?: string },
) => Promise<T>;
/** Bind to the existing web request() helper; it owns base URL and centralized errors. */
export function createPracticeClient(request: PracticeTransport) {
  const query = (filters: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== undefined) params.set(key, String(value));
    return params.size ? '?' + params.toString() : '';
  };
  const json = (body: unknown) => JSON.stringify(body);
  return {
    preferences: () => request<PracticePreferences>('/practice/preferences'),
    savePreferences: (input: PracticePreferences) =>
      request<PracticePreferences>('/practice/preferences', {
        method: 'PUT',
        body: json(input),
      }),
    exercises: (
      filters: {
        lab?: Exercise['lab'];
        level?: Exercise['level'];
        category?: string;
        search?: string;
      } = {},
    ) => request<Exercise[]>('/practice/exercises' + query(filters)),
    exercise: (id: string) =>
      request<Exercise>('/practice/exercises/' + encodeURIComponent(id)),
    settings: (id: string) =>
      request<PracticeSettingsRecord>(
        '/practice/exercises/' + encodeURIComponent(id) + '/settings',
      ),
    saveSettings: (configuration: ExerciseConfiguration, revision: number) =>
      request<PracticeSettingsRecord>(
        '/practice/exercises/' +
          encodeURIComponent(configuration.exerciseId) +
          '/settings',
        { method: 'PUT', body: json({ configuration, revision }) },
      ),
    sessions: (
      filters: {
        exerciseId?: string;
        lab?: Exercise['lab'];
        result?: 'Uitgevoerd' | 'Beheerst';
        from?: string;
        to?: string;
        limit?: number;
        offset?: number;
      } = {},
    ) => request<SessionPage>('/practice/sessions' + query(filters)),
    session: (id: string) =>
      request<PracticeSession>('/practice/sessions/' + encodeURIComponent(id)),
    saveSession: (session: PracticeSessionInput) =>
      request<PracticeSession>('/practice/sessions', {
        method: 'POST',
        body: json(session),
      }),
    progress: (id: string) =>
      request<PracticeProgress>('/practice/progress/' + encodeURIComponent(id)),
    allProgress: () => request<PracticeProgress[]>('/practice/progress'),
    setMastery: (input: Omit<PracticeMastery, 'ownerId' | 'updatedAt'>) =>
      request<{ mastery: PracticeMastery; progress: PracticeProgress }>(
        '/practice/mastery',
        { method: 'PUT', body: json(input) },
      ),
    createOrigin: (input: PracticeOriginInput) =>
      request<PracticeOrigin>('/practice/origins', {
        method: 'POST',
        body: json(input),
      }),
    resolveOrigin: (id: string) =>
      request<OriginResolution>('/practice/origins/' + encodeURIComponent(id)),
  };
}
