import type { FastifyInstance } from 'fastify';
import { BADGES, type Badge, type RoomStats, type ViewerEvent } from '@fluxion/shared';
import { requireHost } from '../auth/session.js';
import { LiveError, type Source } from './session-manager.js';

export async function liveRoutes(app: FastifyInstance) {
  const { live } = app;
  app.addHook('onRequest', requireHost);

  app.post<{ Body: { source: Source } }>(
    '/start',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
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

  // A fake comment ({viewer, text}), gift ({viewer, gift, count}), follow/share/join/like/subscribe/emote
  // ({viewer, event, count}), or room stats ({viewers, topGifters}). `badges` stands in for TikTok's.
  app.post<{
    Body: {
      viewer?: string;
      text?: string;
      gift?: string;
      event?: 'follow' | 'share' | 'join' | 'like' | 'subscribe' | 'emote';
      count?: number;
      diamonds?: number;
      badges?: Badge[];
      viewers?: number;
      topGifters?: string[];
    };
  }>(
    '/simulate',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          oneOf: [{ required: ['viewer', 'text'] }, { required: ['viewer', 'gift'] }, { required: ['viewer', 'event'] }, { required: ['viewers'] }],
          properties: {
            viewer: { type: 'string', minLength: 1, maxLength: 64 },
            text: { type: 'string', minLength: 1, maxLength: 200 },
            gift: { type: 'string', minLength: 1, maxLength: 64 },
            event: { enum: ['follow', 'share', 'join', 'like', 'subscribe', 'emote'] },
            count: { type: 'integer', minimum: 1, maximum: 1000 },
            diamonds: { type: 'integer', minimum: 0, maximum: 100000 },
            badges: { type: 'array', uniqueItems: true, items: { enum: BADGES } },
            viewers: { type: 'integer', minimum: 0, maximum: 10_000_000 },
            topGifters: { type: 'array', maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 64 } },
          },
        },
      },
    },
    async (req, reply) => {
      const { text, gift, event: kind, count = 1, diamonds = 1, badges, viewers, topGifters = [] } = req.body;
      const viewerId = req.body.viewer!;
      const base = { viewerId, at: Date.now(), ...(badges && { badges }) };
      const event: ViewerEvent | RoomStats =
        viewers !== undefined
          ? { viewers, topGifters }
          : gift !== undefined
            ? { ...base, kind: 'gift', giftId: 0, giftName: gift, count, diamonds }
            : kind === 'like'
              ? { ...base, kind: 'like', count }
              : kind === 'subscribe'
                ? { ...base, kind: 'subscribe', months: count }
                : kind === 'emote'
                  ? { ...base, kind: 'emote', emoteId: 'test' }
                  : kind !== undefined
                    ? { ...base, kind }
                    : { ...base, kind: 'comment', text: text! };
      if (!live.simulate(req.hostId, event)) {
        return reply.code(409).send({ error: 'Start a simulated session first' });
      }
      return { ok: true };
    },
  );
}
