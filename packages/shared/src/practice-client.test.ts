import { expect, it } from 'vitest';
import {
  createPracticeClient,
  type PracticeTransport,
} from './practice-client';
it('reuses an injected request transport and encodes filters/IDs without accepting owner selectors', async () => {
  const calls: { path: string; init?: unknown }[] = [];
  const transport: PracticeTransport = async <T>(
    path: string,
    init?: unknown,
  ) => {
    calls.push({ path, init });
    return {} as T;
  };
  const client = createPracticeClient(transport);
  await client.exercises({ lab: 'scale', search: 'C & D' });
  expect(calls[0]!.path).toBe('/practice/exercises?lab=scale&search=C+%26+D');
  await client.session('id/other');
  expect(calls[1]!.path).toBe('/practice/sessions/id%2Fother');
  await client.sessions({ limit: 10, offset: 20 });
  expect(calls[2]!.path).toBe('/practice/sessions?limit=10&offset=20');
  await client.setMastery({
    exerciseId: 's3',
    exerciseVersion: 1,
    scope: 'exercise',
    configurationKey: null,
    mastered: true,
    confirmed: true,
  });
  expect(calls[3]).toMatchObject({
    path: '/practice/mastery',
    init: { method: 'PUT' },
  });
});
