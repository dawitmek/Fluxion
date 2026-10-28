import type { FastifyInstance } from 'fastify';
import { requireHost } from '../auth/session.js';

export async function leaderboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireHost);

  app.get('/', async (req) => app.stats.top(req.hostId, 20));

  app.delete('/', async (req, reply) => {
    await app.stats.reset(req.hostId);
    return reply.code(204).send();
  });
}
