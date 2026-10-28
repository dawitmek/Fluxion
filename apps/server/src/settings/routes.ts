import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { hosts } from '../db/schema.js';
import { requireHost } from '../auth/session.js';

type Body = { tiktokUsername?: string | null; actionsPerSecond?: number };

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
          },
        },
      },
    },
    async (req) => {
      const { tiktokUsername, actionsPerSecond } = req.body;
      const patch = {
        ...(tiktokUsername !== undefined && { tiktokUsername: tiktokUsername?.replace(/^@/, '') ?? null }),
        ...(actionsPerSecond !== undefined && { actionsPerSecond }),
      };
      if (Object.keys(patch).length === 0) return { ok: true };
      await app.db.update(hosts).set(patch).where(eq(hosts.id, req.hostId));
      await app.live.reload(req.hostId);
      return { ok: true };
    },
  );
}
