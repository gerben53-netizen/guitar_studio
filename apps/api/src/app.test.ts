import { expect, it } from 'vitest';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
it('reports database failure without leaking internal details', async () => {
  const app = buildApp(() =>
    Promise.reject(new Error('secret connection string')),
  );
  try {
    const res = await app.inject('/health');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable', database: 'down' });
  } finally {
    await app.close();
  }
});
it('rejects invalid config and shared test database', () => {
  expect(() => readConfig({ DATABASE_URL: 'invalid' })).toThrow();
  expect(() =>
    readConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://localhost/dev',
      TEST_DATABASE_URL: 'postgres://localhost/dev',
    }),
  ).toThrow();
});
it('centralizes validation failures', async () => {
  const app = buildApp(async () => {});
  app.get(
    '/validated',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['value'],
          properties: { value: { type: 'integer' } },
        },
      },
    },
    async () => ({ ok: true }),
  );
  try {
    const res = await app.inject('/validated?value=no');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  } finally {
    await app.close();
  }
});
