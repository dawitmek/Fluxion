import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { keyProblem, MAX_LEVEL, POINTS_CHECK, QUEUE_JOIN } from '@fluxion/shared';
import { commands } from '../db/schema.js';
import { requireHost } from '../auth/session.js';
import { isUniqueViolation } from '../db/client.js';
import { activeProfile, sendCommandsToCompanions } from '../profiles/active.js';

type CommandBody = { keyword: string; key: string; holdMs: number; cooldownMs: number; enabled?: boolean; minLevel?: number; cost?: number };

const fields = {
  keyword: { type: 'string', pattern: '^\\S{1,32}$' },
  key: { type: 'string', maxLength: 64 }, // a key or combination; keyProblem() checks it
  holdMs: { type: 'integer', minimum: 10, maximum: 5000 },
  cooldownMs: { type: 'integer', minimum: 0, maximum: 600000 },
  enabled: { type: 'boolean' },
  minLevel: { type: 'integer', minimum: 1, maximum: MAX_LEVEL },
  cost: { type: 'integer', minimum: 0, maximum: 1_000_000 },
} as const;

const reservedKeyword = (keyword: string | undefined) =>
  keyword?.toLowerCase() === QUEUE_JOIN
    ? `"${QUEUE_JOIN}" is reserved for joining the queue`
    : keyword?.toLowerCase() === POINTS_CHECK
      ? `"${POINTS_CHECK}" is reserved for checking points`
      : null;

const idParam = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } as const;

export async function commandRoutes(app: FastifyInstance) {
  const { db } = app;
  app.addHook('preHandler', requireHost);

  // Commands of the active profile; switching profiles switches the list.
  app.get('/', async (req) => {
    const profile = await activeProfile(db, req.hostId);
    return db.select().from(commands).where(eq(commands.profileId, profile.id)).orderBy(commands.position);
  });

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
      const problem = keyProblem(req.body.key);
      if (problem) return reply.code(400).send({ error: problem });
      const reserved = reservedKeyword(req.body.keyword);
      if (reserved) return reply.code(400).send({ error: reserved });
      const [created] = await db
        .insert(commands)
        .values({
          ...req.body,
          keyword: req.body.keyword.toLowerCase(),
          hostId: req.hostId,
          profileId: (await activeProfile(db, req.hostId)).id,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) return reply.code(409).send({ error: 'Keyword already exists' });
      await app.live.reload(req.hostId);
      await sendCommandsToCompanions(app, req.hostId);
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
      const problem = key === undefined ? null : keyProblem(key);
      if (problem) return reply.code(400).send({ error: problem });
      const reserved = reservedKeyword(keyword);
      if (reserved) return reply.code(400).send({ error: reserved });
      const patch = { ...req.body, ...(keyword !== undefined && { keyword: keyword.toLowerCase() }) };
      try {
        const [updated] = await db
          .update(commands)
          .set(patch)
          .where(and(eq(commands.id, req.params.id), eq(commands.hostId, req.hostId)))
          .returning();
        if (!updated) return reply.code(404).send({ error: 'Command not found' });
        await app.live.reload(req.hostId);
        await sendCommandsToCompanions(app, req.hostId);
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
    await sendCommandsToCompanions(app, req.hostId);
    return reply.code(204).send();
  });
}
