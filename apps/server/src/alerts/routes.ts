import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { ALERT_EVENTS, ALERT_SOUNDS, type AlertEvent, type AlertSound } from '@fluxion/shared';
import { alertRules, hosts } from '../db/schema.js';
import { requireHost } from '../auth/session.js';
import { fillTemplate } from './engine.js';

type Body = {
  event: AlertEvent;
  giftName?: string | null;
  likeStep?: number | null;
  template: string;
  sound?: AlertSound | null;
  speak?: boolean;
  enabled?: boolean;
};

const fields = {
  event: { enum: ALERT_EVENTS },
  giftName: { type: ['string', 'null'], maxLength: 64 },
  likeStep: { type: ['integer', 'null'], minimum: 1, maximum: 1_000_000 },
  template: { type: 'string', minLength: 1, maxLength: 200 },
  sound: { enum: [...ALERT_SOUNDS, null] },
  speak: { type: 'boolean' },
  enabled: { type: 'boolean' },
} as const;

const idParam = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } as const;

// Event-specific fields only mean something for their own event; anything else is cleared.
function normalize(event: AlertEvent, body: Partial<Body>) {
  return {
    giftName: event === 'gift' ? body.giftName?.trim().toLowerCase() || null : null,
    likeStep: event === 'likes' ? (body.likeStep ?? null) : null,
  };
}

export async function alertRoutes(app: FastifyInstance) {
  const { db } = app;
  app.addHook('preHandler', requireHost);

  app.get('/', async (req) => db.select().from(alertRules).where(eq(alertRules.hostId, req.hostId)).orderBy(alertRules.event));

  app.post<{ Body: Body }>(
    '/',
    { schema: { body: { type: 'object', additionalProperties: false, required: ['event', 'template'], properties: fields } } },
    async (req, reply) => {
      const { event } = req.body;
      if (event === 'likes' && !req.body.likeStep) return reply.code(400).send({ error: 'Like alerts need a step, e.g. every 1000 likes' });
      const [created] = await db
        .insert(alertRules)
        .values({ ...req.body, ...normalize(event, req.body), hostId: req.hostId })
        .returning();
      await app.live.reload(req.hostId);
      return reply.code(201).send(created);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<Body> }>(
    '/:id',
    { schema: { params: idParam, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: fields } } },
    async (req, reply) => {
      const where = and(eq(alertRules.id, req.params.id), eq(alertRules.hostId, req.hostId));
      const [existing] = await db.select().from(alertRules).where(where);
      if (!existing) return reply.code(404).send({ error: 'Alert not found' });
      const merged = { ...existing, ...req.body };
      if (merged.event === 'likes' && !merged.likeStep) return reply.code(400).send({ error: 'Like alerts need a step' });
      const [updated] = await db
        .update(alertRules)
        .set({ ...req.body, ...normalize(merged.event, merged) })
        .where(where)
        .returning();
      await app.live.reload(req.hostId);
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>('/:id', { schema: { params: idParam } }, async (req, reply) => {
    const [deleted] = await db
      .delete(alertRules)
      .where(and(eq(alertRules.id, req.params.id), eq(alertRules.hostId, req.hostId)))
      .returning({ id: alertRules.id });
    if (!deleted) return reply.code(404).send({ error: 'Alert not found' });
    await app.live.reload(req.hostId);
    return reply.code(204).send();
  });

  // Shows an alert on the overlay with sample values, live or not, so hosts can check sound and voice.
  app.post<{ Params: { id: string } }>('/:id/test', { schema: { params: idParam } }, async (req, reply) => {
    const [rule] = await db
      .select({ rule: alertRules, voice: hosts.ttsVoice })
      .from(alertRules)
      .innerJoin(hosts, eq(hosts.id, alertRules.hostId))
      .where(and(eq(alertRules.id, req.params.id), eq(alertRules.hostId, req.hostId)));
    if (!rule) return reply.code(404).send({ error: 'Alert not found' });
    const text = fillTemplate(rule.rule.template, {
      viewer: 'test_viewer',
      count: 5,
      gift: rule.rule.giftName ?? 'Rose',
      total: rule.rule.likeStep ?? 1000,
    });
    app.hub.sendToOverlays(req.hostId, { type: 'alert', text, sound: rule.rule.sound, speak: rule.rule.speak, voice: rule.voice });
    return { ok: true };
  });
}
