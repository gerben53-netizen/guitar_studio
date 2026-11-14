import Fastify from 'fastify';
import type { HealthResponse } from '../../../packages/shared/src/index.js';
export function buildApp(
  checkDatabase: () => Promise<unknown>,
  logger = false,
) {
  const app = Fastify({ logger });
  app.setErrorHandler<import('fastify').FastifyError>(
    (error, request, reply) => {
      request.log.error(error);
      const status =
        error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
      void reply.code(status).send({
        error: {
          code: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
          message:
            status < 500 ? 'Invalid request' : 'An unexpected error occurred',
          requestId: request.id,
        },
      });
    },
  );
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
