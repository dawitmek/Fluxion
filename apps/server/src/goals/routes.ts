import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { GOAL_METRICS, type Goal, type GoalMetric } from '@fluxion/shared';
import { goals } from '../db/schema.js';
import { requireHost } from '../auth/session.js';

type Body = { name: string; metric: GoalMetric; target: number; enabled?: boolean };
const fields = {
  name: { type: 'string', minLength: 1, maxLength: 40 },
  metric: { enum: GOAL_METRICS },
  target: { type: 'integer', minimum: 1, maximum: 100_000_000 },
  enabled: { type: 'boolean' },
} as const;
const idParam = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } as const;
const MAX_GOALS = 10;

const listed = { id: goals.id, name: goals.name, metric: goals.metric, target: goals.target, enabled: goals.enabled };

export async function goalRoutes(app: FastifyInstance) {
  const { db } = app;
  app.addHook('preHandler', requireHost);

  app.get('/', async (req): Promise<Goal[]> => db.select(listed).from(goals).where(eq(goals.hostId, req.hostId)).orderBy(goals.position));

  app.post<{ Body: Body }>(
    '/',
    { schema: { body: { type: 'object', additionalProperties: false, required: ['name', 'metric', 'target'], properties: fields } } },
    async (req, reply) => {
      const existing = await db.select({ id: goals.id }).from(goals).where(eq(goals.hostId, req.hostId));
      if (existing.length >= MAX_GOALS) return reply.code(400).send({ error: `You can have up to ${MAX_GOALS} goals` });
      const [created] = await db
        .insert(goals)
        .values({ ...req.body, name: req.body.name.trim(), hostId: req.hostId })
        .returning(listed);
      await app.live.reload(req.hostId);
      return reply.code(201).send(created);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<Body> }>(
    '/:id',
    { schema: { params: idParam, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: fields } } },
    async (req, reply) => {
      const [updated] = await db
        .update(goals)
        .set({ ...req.body, ...(req.body.name !== undefined && { name: req.body.name.trim() }) })
        .where(and(eq(goals.id, req.params.id), eq(goals.hostId, req.hostId)))
        .returning(listed);
      if (!updated) return reply.code(404).send({ error: 'Goal not found' });
      await app.live.reload(req.hostId);
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>('/:id', { schema: { params: idParam } }, async (req, reply) => {
    const [deleted] = await db
      .delete(goals)
      .where(and(eq(goals.id, req.params.id), eq(goals.hostId, req.hostId)))
      .returning({ id: goals.id });
    if (!deleted) return reply.code(404).send({ error: 'Goal not found' });
    await app.live.reload(req.hostId);
    return reply.code(204).send();
  });
}
