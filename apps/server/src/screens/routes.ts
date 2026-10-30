import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { ALERT_POSITIONS, MAX_WIDGETS, WIDGET_SPOTS, WIDGET_TYPES, type OverlayScreen } from '@fluxion/shared';
import { overlayScreens } from '../db/schema.js';
import { requireHost } from '../auth/session.js';
import { newToken } from '../crypto.js';

type Row = typeof overlayScreens.$inferSelect;
export const toScreen = ({ hostId: _h, token: _t, position: _p, ...screen }: Row): OverlayScreen => screen;

const MAX_SCREENS = 8;
const fields = {
  name: { type: 'string', minLength: 1, maxLength: 40 },
  alerts: { type: 'boolean' },
  feed: { type: 'boolean' },
  leaderboard: { type: 'boolean' },
  mode: { type: 'boolean' },
  audio: { type: 'boolean' },
  alertPosition: { enum: ALERT_POSITIONS },
  scale: { type: 'integer', minimum: 50, maximum: 200 },
  widgets: {
    type: 'array',
    maxItems: MAX_WIDGETS,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'spot'],
      properties: {
        type: { enum: WIDGET_TYPES },
        spot: { enum: WIDGET_SPOTS },
        minDiamonds: { type: 'integer', minimum: 1, maximum: 10_000_000 },
        goalId: { type: 'string', format: 'uuid' },
      },
    },
  },
} as const;
const idParam = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } as const;

// Overlay screens. Their tokens are returned here (each screen's address) but never to the overlay itself.
export async function screenRoutes(app: FastifyInstance) {
  const { db, hub } = app;
  app.addHook('preHandler', requireHost);

  app.get('/', async (req) => {
    const rows = await db.select().from(overlayScreens).where(eq(overlayScreens.hostId, req.hostId)).orderBy(overlayScreens.position);
    return rows.map((r) => ({ ...toScreen(r), token: r.token }));
  });

  // A new screen shows only alerts, silently: most extra screens are for putting alerts somewhere else.
  app.post<{ Body: { name: string } }>(
    '/',
    { schema: { body: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: fields.name } } } },
    async (req, reply) => {
      const existing = await db.select({ id: overlayScreens.id }).from(overlayScreens).where(eq(overlayScreens.hostId, req.hostId));
      if (existing.length >= MAX_SCREENS) return reply.code(400).send({ error: `You can have up to ${MAX_SCREENS} screens` });
      const [created] = await db
        .insert(overlayScreens)
        .values({ hostId: req.hostId, name: req.body.name.trim(), token: newToken(), feed: false, leaderboard: false, mode: false, audio: false })
        .returning();
      return reply.code(201).send({ ...toScreen(created!), token: created!.token });
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<Omit<OverlayScreen, 'id' | 'main'>> }>(
    '/:id',
    { schema: { params: idParam, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: fields } } },
    async (req, reply) => {
      const patch = { ...req.body, ...(req.body.name !== undefined && { name: req.body.name.trim() }) };
      const [updated] = await db
        .update(overlayScreens)
        .set(patch)
        .where(and(eq(overlayScreens.id, req.params.id), eq(overlayScreens.hostId, req.hostId)))
        .returning();
      if (!updated) return reply.code(404).send({ error: 'Screen not found' });
      const screen = toScreen(updated);
      hub.sendToScreen(req.hostId, screen.id, { type: 'screen', screen });
      return { ...screen, token: updated.token };
    },
  );

  app.delete<{ Params: { id: string } }>('/:id', { schema: { params: idParam } }, async (req, reply) => {
    const where = and(eq(overlayScreens.id, req.params.id), eq(overlayScreens.hostId, req.hostId));
    const [screen] = await db.select({ main: overlayScreens.main }).from(overlayScreens).where(where);
    if (!screen) return reply.code(404).send({ error: 'Screen not found' });
    if (screen.main) return reply.code(400).send({ error: "The main screen can't be deleted" });
    await db.delete(overlayScreens).where(where);
    hub.sendToScreen(req.hostId, req.params.id, null);
    await app.live.reload(req.hostId);
    return reply.code(204).send();
  });
}
