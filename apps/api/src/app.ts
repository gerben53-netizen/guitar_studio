import Fastify from 'fastify';
import type pg from 'pg';
import { ZodError } from 'zod';
import { registerSongs } from './songs.js';
import { registerMultitrack } from './multitrack-routes.js';
import { registerDiscovery, type DiscoveryAccess } from './discovery-routes.js';
import { registerImports } from './import-routes.js';
import { registerPractice, type PracticeAccess } from './practice-routes.js';
import type { HealthResponse } from '../../../packages/shared/src/index.js';
export function buildApp(
  checkDatabase: () => Promise<unknown>,
  logger = false,
  pool?: pg.Pool,
  practiceAccess: PracticeAccess = {},
  discoveryAccess: DiscoveryAccess = {},
) {
  const app = Fastify({ logger, bodyLimit: 2_000_000 });
  app.setErrorHandler<import('fastify').FastifyError>(
    (error, request, reply) => {
      if (
        /^\/api\/v1\/(imports|discovery)/.test(request.url) ||
        /\/multitrack(?:\?|$)/.test(request.url)
      )
        request.log.warn(
          { code: error.code },
          'Import/discovery request failed (payload omitted)',
        );
      else request.log.error(error);
      const status =
        error instanceof ZodError
          ? 400
          : error.statusCode && error.statusCode < 500
            ? error.statusCode
            : 500;
      void reply.code(status).send({
        error: {
          code:
            status === 400
              ? 'VALIDATION_ERROR'
              : status === 409
                ? 'CONFLICT'
                : status === 404
                  ? 'NOT_FOUND'
                  : status === 403
                    ? 'FORBIDDEN'
                    : 'INTERNAL_ERROR',
          message:
            status === 409
              ? error.message
              : status === 404
                ? 'Niet gevonden.'
                : status < 500
                  ? 'Ongeldige invoer. Controleer tekst, timing en fretbereik.'
                  : 'Opslag niet bereikbaar. Je wijzigingen zijn nog niet opgeslagen.',
          requestId: request.id,
        },
        ...('currentRevision' in error &&
        Number.isInteger(error.currentRevision)
          ? { currentRevision: error.currentRevision }
          : {}),
      });
    },
  );
  if (pool) {
    registerSongs(app, pool, practiceAccess);
    registerMultitrack(app, pool, practiceAccess);
    registerImports(app, pool, practiceAccess);
    registerPractice(app, pool, practiceAccess);
  }
  registerDiscovery(app, discoveryAccess);
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health', async (_request, reply): Promise<HealthResponse> => {
    try {
      await checkDatabase();
      return { status: 'ok', database: 'up' };
    } catch {
      reply.code(503);
      return { status: 'unavailable', database: 'down' };
    }
  });
  return app;
}
