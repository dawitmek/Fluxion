import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { hosts } from '../db/schema.js';
import { MODES, type Mode } from '@fluxion/shared';
import { requireHost } from '../auth/session.js';

type Body = {
  tiktokUsername?: string | null;
  actionsPerSecond?: number;
  mode?: Mode;
  voteWindowMs?: number;
  turnMs?: number;
  giftBoosts?: boolean;
};

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireHost);

  app.patch<{ Body: Body }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tiktokUsername: { type: ['string', 'null'], pattern: '^@?[A-Za-z0-9_.]{1,24}$' },
            actionsPerSecond: { type: 'integer', minimum: 1, maximum: 50 },
            mode: { enum: MODES },
            voteWindowMs: { type: 'integer', minimum: 1000, maximum: 30000 },
            turnMs: { type: 'integer', minimum: 5000, maximum: 300000 },
            giftBoosts: { type: 'boolean' },
          },
        },
      },
    },
    async (req) => {
      const { tiktokUsername, ...rest } = req.body;
      const patch = {
        ...rest,
        ...(tiktokUsername !== undefined && { tiktokUsername: tiktokUsername?.replace(/^@/, '') ?? null }),
      };
      if (Object.keys(patch).length === 0) return { ok: true };
      await app.db.update(hosts).set(patch).where(eq(hosts.id, req.hostId));
      await app.live.reload(req.hostId);
      return { ok: true };
    },
  );
}
