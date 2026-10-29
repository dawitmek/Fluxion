import type { FastifyInstance } from 'fastify';
import { and, eq, isNull, or } from 'drizzle-orm';
import { ACTION_TRIGGERS, ALERT_SOUNDS, AUDIENCES, POINTS_CHECK, QUEUE_JOIN, type ActionTrigger, type AlertSound, type Audience } from '@fluxion/shared';
import { actions, commands, hosts, media, overlayScreens, profiles } from '../db/schema.js';
import { requireHost } from '../auth/session.js';
import { activeProfile } from '../profiles/active.js';
import { alertMessage } from '../live/session-manager.js';
import { voiceConfig } from '../tts/speech.js';
import { fillTemplate, showsAlert } from './engine.js';
import { loadActionRules } from './load.js';

type Body = {
  name: string;
  enabled?: boolean;
  profileId?: string | null;
  trigger: ActionTrigger;
  giftName?: string | null;
  minDiamonds?: number | null;
  likeStep?: number | null;
  command?: string | null;
  audience?: Audience;
  audienceViewer?: string | null;
  cooldownMs?: number;
  viewerCooldownMs?: number;
  random?: boolean;
  text?: string | null;
  sound?: AlertSound | null;
  soundMediaId?: string | null;
  mediaId?: string | null;
  speak?: boolean;
  durationMs?: number;
  keyCommandId?: string | null;
  repeatWithCount?: boolean;
  points?: number;
  screenId?: string | null;
};

const nullableId = { type: ['string', 'null'], format: 'uuid' } as const;
const fields = {
  name: { type: 'string', minLength: 1, maxLength: 60 },
  enabled: { type: 'boolean' },
  profileId: nullableId,
  trigger: { enum: ACTION_TRIGGERS },
  giftName: { type: ['string', 'null'], maxLength: 64 },
  minDiamonds: { type: ['integer', 'null'], minimum: 1, maximum: 10_000_000 },
  likeStep: { type: ['integer', 'null'], minimum: 1, maximum: 1_000_000 },
  command: { type: ['string', 'null'], pattern: '^\\S{1,32}$' },
  audience: { enum: AUDIENCES },
  audienceViewer: { type: ['string', 'null'], maxLength: 64 },
  cooldownMs: { type: 'integer', minimum: 0, maximum: 3_600_000 },
  viewerCooldownMs: { type: 'integer', minimum: 0, maximum: 3_600_000 },
  random: { type: 'boolean' },
  text: { type: ['string', 'null'], maxLength: 200 },
  sound: { enum: [...ALERT_SOUNDS, null] },
  soundMediaId: nullableId,
  mediaId: nullableId,
  speak: { type: 'boolean' },
  durationMs: { type: 'integer', minimum: 1000, maximum: 60_000 },
  keyCommandId: nullableId,
  repeatWithCount: { type: 'boolean' },
  points: { type: 'integer', minimum: 0, maximum: 1_000_000 },
  screenId: nullableId,
} as const;

const idParam = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } as const;
type Row = typeof actions.$inferSelect;
type Problem = { error: string };

export async function actionRoutes(app: FastifyInstance) {
  const { db } = app;
  app.addHook('preHandler', requireHost);

  // Trigger-specific fields only mean something for their trigger; anything else is cleared. Files, commands and
  // profiles must be the host's own. A key press puts the action in its command's profile.
  async function check(hostId: string, a: Omit<Row, 'id' | 'hostId' | 'position'>): Promise<Problem | Partial<Row>> {
    const fixed: Partial<Row> = {
      giftName: a.trigger === 'gift' ? a.giftName?.trim().toLowerCase() || null : null,
      minDiamonds: a.trigger === 'gift' ? a.minDiamonds : null,
      likeStep: a.trigger === 'likes' ? a.likeStep : null,
      command: a.trigger === 'command' ? a.command?.trim().toLowerCase() || null : null,
      audienceViewer: a.audience === 'viewer' ? a.audienceViewer?.trim().replace(/^@/, '') || null : null,
      text: a.text?.trim() || null,
    };
    if (a.trigger === 'likes' && !fixed.likeStep) return { error: 'Likes actions need a step, e.g. every 1000 likes' };
    if (a.trigger === 'command' && !fixed.command) return { error: 'Command actions need the command, e.g. !dance' };
    if (fixed.command === QUEUE_JOIN || fixed.command === POINTS_CHECK) return { error: `"${fixed.command}" is already used by Fluxion` };
    if (a.audience === 'viewer' && !fixed.audienceViewer) return { error: 'Name the viewer this action is for' };
    for (const [id, kinds, what] of [
      [a.soundMediaId, ['audio'], 'sound'],
      [a.mediaId, ['image', 'video'], 'picture or video'],
    ] as const) {
      if (!id) continue;
      const [file] = await db.select({ kind: media.kind }).from(media).where(and(eq(media.id, id), eq(media.hostId, hostId)));
      if (!file || !(kinds as readonly string[]).includes(file.kind)) return { error: `That file isn't one of your uploaded ${what}s` };
    }
    if (a.screenId) {
      const [screen] = await db
        .select({ id: overlayScreens.id })
        .from(overlayScreens)
        .where(and(eq(overlayScreens.id, a.screenId), eq(overlayScreens.hostId, hostId)));
      if (!screen) return { error: 'Screen not found' };
    }
    if (a.keyCommandId) {
      const [command] = await db
        .select({ profileId: commands.profileId })
        .from(commands)
        .where(and(eq(commands.id, a.keyCommandId), eq(commands.hostId, hostId)));
      if (!command) return { error: 'Command not found' };
      fixed.profileId = command.profileId;
    } else if (a.profileId) {
      const [profile] = await db.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.id, a.profileId), eq(profiles.hostId, hostId)));
      if (!profile) return { error: 'Profile not found' };
    }
    return fixed;
  }

  // Actions that apply with the active profile: the host's general ones and the profile's own.
  app.get('/', async (req) => {
    const profile = await activeProfile(db, req.hostId);
    return db
      .select()
      .from(actions)
      .where(and(eq(actions.hostId, req.hostId), or(isNull(actions.profileId), eq(actions.profileId, profile.id))))
      .orderBy(actions.position);
  });

  app.post<{ Body: Body }>(
    '/',
    { schema: { body: { type: 'object', additionalProperties: false, required: ['name', 'trigger'], properties: fields } } },
    async (req, reply) => {
      const defaults = {
        enabled: true,
        profileId: null,
        giftName: null,
        minDiamonds: null,
        likeStep: null,
        command: null,
        audience: 'everyone' as const,
        audienceViewer: null,
        cooldownMs: 0,
        viewerCooldownMs: 0,
        random: false,
        text: null,
        sound: null,
        soundMediaId: null,
        mediaId: null,
        speak: false,
        durationMs: 5000,
        keyCommandId: null,
        repeatWithCount: false,
        points: 0,
        screenId: null,
      };
      const merged = { ...defaults, ...req.body, name: req.body.name.trim() };
      const fixed = await check(req.hostId, merged);
      if ('error' in fixed) return reply.code(400).send(fixed);
      const [created] = await db
        .insert(actions)
        .values({ ...merged, ...fixed, hostId: req.hostId })
        .returning();
      await app.live.reload(req.hostId);
      return reply.code(201).send(created);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<Body> }>(
    '/:id',
    { schema: { params: idParam, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: fields } } },
    async (req, reply) => {
      const where = and(eq(actions.id, req.params.id), eq(actions.hostId, req.hostId));
      const [existing] = await db.select().from(actions).where(where);
      if (!existing) return reply.code(404).send({ error: 'Action not found' });
      const merged = { ...existing, ...req.body, ...(req.body.name !== undefined && { name: req.body.name.trim() }) };
      // Taking the key press away leaves the action in the profile it was in.
      const fixed = await check(req.hostId, merged);
      if ('error' in fixed) return reply.code(400).send(fixed);
      const [updated] = await db
        .update(actions)
        .set({ ...req.body, ...fixed, name: merged.name })
        .where(where)
        .returning();
      await app.live.reload(req.hostId);
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>('/:id', { schema: { params: idParam } }, async (req, reply) => {
    const [deleted] = await db
      .delete(actions)
      .where(and(eq(actions.id, req.params.id), eq(actions.hostId, req.hostId)))
      .returning({ id: actions.id });
    if (!deleted) return reply.code(404).send({ error: 'Action not found' });
    await app.live.reload(req.hostId);
    return reply.code(204).send();
  });

  // Shows an action's alert on the overlay with sample values, live or not, so hosts can check how it looks and
  // sounds. Key presses and points are left out: a test shouldn't move the game or anyone's balance. Returns the
  // alert, so the dashboard can play it too, and how many overlays on stream showed it.
  // A sent alert reaches every screen's sockets; only screens that show alerts (and are its target) display it.
  app.post<{ Params: { id: string } }>('/:id/test', { schema: { params: idParam } }, async (req, reply) => {
    const [row] = await db
      .select({ profileId: actions.profileId })
      .from(actions)
      .where(and(eq(actions.id, req.params.id), eq(actions.hostId, req.hostId)));
    if (!row) return reply.code(404).send({ error: 'Action not found' });
    const profileId = row.profileId ?? (await activeProfile(db, req.hostId)).id;
    const [action] = await loadActionRules(db, req.hostId, profileId, req.params.id);
    if (!action || !showsAlert(action)) return reply.code(400).send({ error: 'This action has nothing to show. Give it text, a sound, or a picture or video.' });
    const [host] = await db.select().from(hosts).where(eq(hosts.id, req.hostId));
    const text = action.text
      ? fillTemplate(action.text, {
          viewer: 'test_viewer',
          count: 5,
          gift: action.giftName ?? 'Rose',
          diamonds: Math.max(5, action.minDiamonds ?? 0),
          total: action.likeStep ?? 1000,
          months: 3,
          text: 'hello',
        })
      : '';
    const speech = action.speak && text ? await app.speech.speak(voiceConfig(host!, app.secrets), text) : null;
    const alert = alertMessage(
      { type: 'alert', text, sound: action.sound, soundFile: action.soundMediaId, media: action.media, speak: action.speak, durationMs: action.durationMs, screen: action.screenId },
      speech,
    );
    app.hub.sendToOverlays(req.hostId, alert);
    const screens = await db
      .select({ id: overlayScreens.id })
      .from(overlayScreens)
      .where(and(eq(overlayScreens.hostId, req.hostId), eq(overlayScreens.alerts, true), action.screenId ? eq(overlayScreens.id, action.screenId) : undefined));
    return { alert, overlays: app.hub.overlayCount(req.hostId, screens.map((s) => s.id)) };
  });
}
