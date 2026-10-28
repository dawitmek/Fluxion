import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { companions, pairingCodes } from '../db/schema.js';
import { newToken, sha256 } from '../crypto.js';
import { requireHost } from '../auth/session.js';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I

const newPairingCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export async function companionRoutes(app: FastifyInstance) {
  const { db } = app;

  app.post('/pairing-code', { preHandler: requireHost }, async (req) => {
    const code = newPairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    await db.insert(pairingCodes).values({ codeHash: sha256(code), hostId: req.hostId, expiresAt });
    return { code, expiresAt };
  });

  // Called by the companion app, which has no session: the one-time code is the credential.
  app.post<{ Body: { code: string; name: string } }>(
    '/pair',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'name'],
          properties: {
            code: { type: 'string', minLength: 6, maxLength: 6 },
            name: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
      },
    },
    async (req, reply) => {
      const [pairing] = await db
        .delete(pairingCodes)
        .where(and(eq(pairingCodes.codeHash, sha256(req.body.code.toUpperCase())), gt(pairingCodes.expiresAt, new Date())))
        .returning();
      if (!pairing) return reply.code(400).send({ error: 'Invalid or expired code' });
      const token = newToken();
      const [companion] = await db
        .insert(companions)
        .values({ hostId: pairing.hostId, name: req.body.name, tokenHash: sha256(token) })
        .returning({ id: companions.id });
      return reply.code(201).send({ id: companion!.id, token });
    },
  );

  app.get('/', { preHandler: requireHost }, async (req) =>
    db
      .select({ id: companions.id, name: companions.name, lastSeenAt: companions.lastSeenAt })
      .from(companions)
      .where(eq(companions.hostId, req.hostId)),
  );

  app.delete<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: requireHost,
      schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
    },
    async (req, reply) => {
      const [deleted] = await db
        .delete(companions)
        .where(and(eq(companions.id, req.params.id), eq(companions.hostId, req.hostId)))
        .returning({ id: companions.id });
      if (!deleted) return reply.code(404).send({ error: 'Companion not found' });
      app.hub.disconnectCompanion(deleted.id);
      return reply.code(204).send();
    },
  );
}
