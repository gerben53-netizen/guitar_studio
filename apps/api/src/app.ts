import Fastify from 'fastify';
import type pg from 'pg';
import { ZodError } from 'zod';
import { registerSongs } from './songs.js';
import type { HealthResponse } from '../../../packages/shared/src/index.js';
export function buildApp(
  checkDatabase: () => Promise<unknown>,
  logger = false,
  pool?: pg.Pool,
) {
  const app = Fastify({ logger, bodyLimit: 2_000_000 });
  app.setErrorHandler<import('fastify').FastifyError>(
    (error, request, reply) => {
      request.log.error(error);
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
                : 'INTERNAL_ERROR',
          message:
            status === 409
              ? error.message
              : status < 500
                ? 'Ongeldige invoer. Controleer tekst, timing en fretbereik.'
                : 'Opslag niet bereikbaar. Je wijzigingen zijn nog niet opgeslagen.',
          requestId: request.id,
        },
      });
    },
  );
  if (pool) registerSongs(app, pool);
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
