import type { FastifyInstance } from 'fastify';
import { requireHost } from '../auth/session.js';
import { LiveError, type Source } from './session-manager.js';

export async function liveRoutes(app: FastifyInstance) {
  const { live } = app;
  app.addHook('preHandler', requireHost);

  app.post<{ Body: { source: Source } }>(
    '/start',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['source'],
          properties: { source: { enum: ['tiktok', 'simulated'] } },
        },
      },
    },
    async (req, reply) => {
      try {
        await live.start(req.hostId, req.body.source);
      } catch (err) {
        if (err instanceof LiveError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
      return live.status(req.hostId);
    },
  );

  app.post('/stop', async (req) => {
    await live.stop(req.hostId);
    return live.status(req.hostId);
  });

  app.get('/status', async (req) => live.status(req.hostId));

  app.post<{ Body: { viewer: string; text: string } }>(
    '/simulate',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['viewer', 'text'],
          properties: {
            viewer: { type: 'string', minLength: 1, maxLength: 64 },
            text: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!live.simulate(req.hostId, req.body.viewer, req.body.text)) {
        return reply.code(409).send({ error: 'Start a simulated session first' });
      }
      return { ok: true };
    },
  );
}
