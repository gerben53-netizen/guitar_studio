import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  DiscoveryQuerySchema,
  type DiscoveryProvider,
} from '../../../packages/shared/src/discovery.js';
import { createLrclib, DiscoveryError } from './lrclib.js';
import type { PracticeAccess } from './practice-routes.js';
import type { PersonalImportReceipts } from './personal-import-receipts.js';
export interface DiscoveryAccess {
  providers?: DiscoveryProvider[];
}
export function registerDiscovery(
  app: FastifyInstance,
  options: DiscoveryAccess = {},
  access: PracticeAccess = {},
  receipts?: PersonalImportReceipts,
) {
  const providers = options.providers ?? [
    createLrclib({
      ...(process.env.LRCLIB_APP_ID
        ? { appId: process.env.LRCLIB_APP_ID }
        : {}),
      ...(process.env.LRCLIB_API_KEY
        ? { apiKey: process.env.LRCLIB_API_KEY }
        : {}),
    }),
  ];
  const rates = new Map<string, { start: number; count: number }>();
  const guard = (req: FastifyRequest) => {
    const now = Date.now();
    for (const [key, value] of rates)
      if (now - value.start >= 60000) rates.delete(key);
    if (!rates.has(req.ip) && rates.size >= 2000)
      throw new DiscoveryError(429, 'Zoekdienst is bezet. Wacht even.', 60);
    const rate = rates.get(req.ip) ?? { start: now, count: 0 };
    rate.count++;
    rates.set(req.ip, rate);
    if (rate.count > 30 || rates.size > 2000)
      throw new DiscoveryError(429, 'Te veel zoekverzoeken. Wacht even.', 60);
  };
  const run = async (
    request: FastifyRequest,
    reply: import('fastify').FastifyReply,
    action: (signal: AbortSignal) => Promise<unknown>,
  ) => {
    try {
      guard(request);
      const controller = new AbortController();
      const abort = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.once('close', abort);
      reply.header('Cache-Control', 'no-store');
      try {
        return await action(controller.signal);
      } finally {
        reply.raw.removeListener('close', abort);
      }
    } catch (error) {
      if (!(error instanceof DiscoveryError)) throw error;
      if (error.retryAfter) reply.header('Retry-After', error.retryAfter);
      return reply
        .code(
          error.statusCode >= 400 && error.statusCode <= 599
            ? error.statusCode
            : 502,
        )
        .send({ error: { code: 'DISCOVERY_ERROR', message: error.message } });
    }
  };
  app.get('/api/v1/discovery/providers', async (request) => {
    z.strictObject({}).parse(request.query);
    return providers.map((p) => p.info);
  });
  app.get('/api/v1/discovery/search', (request, reply) =>
    run(request, reply, async (signal) => {
      const query = DiscoveryQuerySchema.parse(request.query);
      const provider = providers.find((p) => p.info.id === query.provider);
      if (!provider)
        throw new DiscoveryError(503, 'Provider niet beschikbaar.');
      return provider.search(query, signal);
    }),
  );
  app.get('/api/v1/discovery/results/:providerId/:resultId', (request, reply) =>
    run(request, reply, async (signal) => {
      z.strictObject({}).parse(request.query);
      const params = z
        .strictObject({
          providerId: z.literal('lrclib'),
          resultId: z.string().regex(/^[1-9]\d{0,14}$/),
        })
        .parse(request.params);
      const provider = providers.find((p) => p.info.id === params.providerId);
      if (!provider)
        throw new DiscoveryError(503, 'Provider niet beschikbaar.');
      const detail = await provider.get(params.resultId, signal);
      const who = z
        .string()
        .min(1)
        .max(200)
        .parse(await (access.resolveOwner?.(request) ?? 'local'));
      const receipt = receipts?.issue(detail, who);
      return {
        ...detail,
        ...(receipt ? { personalImportReceipt: receipt } : {}),
      };
    }),
  );
}
