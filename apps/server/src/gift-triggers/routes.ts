import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { commands, giftTriggers } from '../db/schema.js';
import { requireHost } from '../auth/session.js';

type Body = { giftName: string; commandId: string };

// Gift triggers press a command when a viewer sends a specific gift, in every mode.
export async function giftTriggerRoutes(app: FastifyInstance) {
  const { db } = app;
  app.addHook('preHandler', requireHost);

  app.get('/', async (req) =>
    db
      .select({ id: giftTriggers.id, giftName: giftTriggers.giftName, commandId: giftTriggers.commandId, keyword: commands.keyword })
      .from(giftTriggers)
      .innerJoin(commands, eq(giftTriggers.commandId, commands.id))
      .where(eq(giftTriggers.hostId, req.hostId)),
  );

  app.post<{ Body: Body }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['giftName', 'commandId'],
          properties: {
            giftName: { type: 'string', minLength: 1, maxLength: 64 },
            commandId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (req, reply) => {
      const [command] = await db
        .select({ id: commands.id })
        .from(commands)
        .where(and(eq(commands.id, req.body.commandId), eq(commands.hostId, req.hostId)));
      if (!command) return reply.code(400).send({ error: 'Command not found' });
      const [created] = await db
        .insert(giftTriggers)
        .values({ hostId: req.hostId, giftName: req.body.giftName.trim().toLowerCase(), commandId: command.id })
        .onConflictDoNothing()
        .returning();
      if (!created) return reply.code(409).send({ error: 'That gift already has a trigger' });
      await app.live.reload(req.hostId);
      return reply.code(201).send(created);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } },
    async (req, reply) => {
      const [deleted] = await db
        .delete(giftTriggers)
        .where(and(eq(giftTriggers.id, req.params.id), eq(giftTriggers.hostId, req.hostId)))
        .returning({ id: giftTriggers.id });
      if (!deleted) return reply.code(404).send({ error: 'Gift trigger not found' });
      await app.live.reload(req.hostId);
      return reply.code(204).send();
    },
  );
}
