import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { isAllowedKey } from '@fluxion/shared';
import { commands } from '../db/schema.js';
import { requireHost } from '../auth/session.js';
import { isUniqueViolation } from '../db/client.js';

type CommandBody = { keyword: string; key: string; holdMs: number; cooldownMs: number; enabled?: boolean };

const fields = {
  keyword: { type: 'string', pattern: '^\\S{1,32}$' },
  key: { type: 'string' },
  holdMs: { type: 'integer', minimum: 10, maximum: 5000 },
  cooldownMs: { type: 'integer', minimum: 0, maximum: 600000 },
  enabled: { type: 'boolean' },
} as const;

const idParam = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } as const;

export async function commandRoutes(app: FastifyInstance) {
  const { db } = app;
  app.addHook('preHandler', requireHost);

  app.get('/', async (req) => db.select().from(commands).where(eq(commands.hostId, req.hostId)));

  app.post<{ Body: CommandBody }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['keyword', 'key', 'holdMs', 'cooldownMs'],
          properties: fields,
        },
      },
    },
    async (req, reply) => {
      if (!isAllowedKey(req.body.key)) return reply.code(400).send({ error: `Key not allowed: ${req.body.key}` });
      const [created] = await db
        .insert(commands)
        .values({ ...req.body, keyword: req.body.keyword.toLowerCase(), hostId: req.hostId })
        .onConflictDoNothing()
        .returning();
      if (!created) return reply.code(409).send({ error: 'Keyword already exists' });
      await app.live.reload(req.hostId);
      return reply.code(201).send(created);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<CommandBody> }>(
    '/:id',
    {
      schema: {
        params: idParam,
        body: { type: 'object', additionalProperties: false, minProperties: 1, properties: fields },
      },
    },
    async (req, reply) => {
      const { key, keyword } = req.body;
      if (key !== undefined && !isAllowedKey(key)) return reply.code(400).send({ error: `Key not allowed: ${key}` });
      const patch = { ...req.body, ...(keyword !== undefined && { keyword: keyword.toLowerCase() }) };
      try {
        const [updated] = await db
          .update(commands)
          .set(patch)
          .where(and(eq(commands.id, req.params.id), eq(commands.hostId, req.hostId)))
          .returning();
        if (!updated) return reply.code(404).send({ error: 'Command not found' });
        await app.live.reload(req.hostId);
        return updated;
      } catch (err) {
        if (isUniqueViolation(err)) return reply.code(409).send({ error: 'Keyword already exists' });
        throw err;
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/:id', { schema: { params: idParam } }, async (req, reply) => {
    const [deleted] = await db
      .delete(commands)
      .where(and(eq(commands.id, req.params.id), eq(commands.hostId, req.hostId)))
      .returning({ id: commands.id });
    if (!deleted) return reply.code(404).send({ error: 'Command not found' });
    await app.live.reload(req.hostId);
    return reply.code(204).send();
  });
}
