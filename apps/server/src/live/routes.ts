import type { FastifyInstance } from 'fastify';
import type { ViewerEvent } from '@fluxion/shared';
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

  // A fake comment ({viewer, text}) or gift ({viewer, gift, count}).
  app.post<{ Body: { viewer: string; text?: string; gift?: string; count?: number; diamonds?: number } }>(
    '/simulate',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['viewer'],
          oneOf: [{ required: ['text'] }, { required: ['gift'] }],
          properties: {
            viewer: { type: 'string', minLength: 1, maxLength: 64 },
            text: { type: 'string', minLength: 1, maxLength: 200 },
            gift: { type: 'string', minLength: 1, maxLength: 64 },
            count: { type: 'integer', minimum: 1, maximum: 100 },
            diamonds: { type: 'integer', minimum: 0, maximum: 100000 },
          },
        },
      },
    },
    async (req, reply) => {
      const { viewer, text, gift, count = 1, diamonds = 1 } = req.body;
      const at = Date.now();
      const event: ViewerEvent =
        gift !== undefined
          ? { kind: 'gift', viewerId: viewer, giftId: 0, giftName: gift, count, diamonds, at }
          : { kind: 'comment', viewerId: viewer, text: text!, at };
      if (!live.simulate(req.hostId, event)) {
        return reply.code(409).send({ error: 'Start a simulated session first' });
      }
      return { ok: true };
    },
  );
}
