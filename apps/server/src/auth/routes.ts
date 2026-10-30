import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { hash, verify } from '@node-rs/argon2';
import { actions, commands, hosts, overlayScreens, profiles } from '../db/schema.js';
import { DEFAULT_ACTIONS } from '../actions/defaults.js';
import { newToken } from '../crypto.js';
import { endSession, requireHost, startSession } from './session.js';

const DEFAULT_COMMANDS = [
  { keyword: 'w', key: 'KeyW', holdMs: 300 },
  { keyword: 'a', key: 'KeyA', holdMs: 300 },
  { keyword: 's', key: 'KeyS', holdMs: 300 },
  { keyword: 'd', key: 'KeyD', holdMs: 300 },
  { keyword: 'jump', key: 'Space', holdMs: 300 },
  { keyword: 'run', key: 'Shift+KeyW', holdMs: 1000 }, // running needs a longer hold than a step to get anywhere
].map((c) => ({ ...c, cooldownMs: 1000 }));

const credentials = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 8, maxLength: 128 },
  },
} as const;

type Credentials = { email: string; password: string };

export async function authRoutes(app: FastifyInstance) {
  const { db, config } = app;
  const rateLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post<{ Body: Credentials }>('/signup', { ...rateLimit, schema: { body: credentials } }, async (req, reply) => {
    const email = req.body.email.toLowerCase();
    const passwordHash = await hash(req.body.password);
    const host = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(hosts)
        .values({ email, passwordHash, overlayToken: newToken() })
        .onConflictDoNothing()
        .returning({ id: hosts.id, overlayToken: hosts.overlayToken });
      if (!created) return undefined;
      await tx.insert(overlayScreens).values({ hostId: created.id, name: 'Main', token: created.overlayToken, main: true });
      const [profile] = await tx.insert(profiles).values({ hostId: created.id, name: 'Default' }).returning({ id: profiles.id });
      await tx.update(hosts).set({ activeProfileId: profile!.id }).where(eq(hosts.id, created.id));
      await tx.insert(commands).values(DEFAULT_COMMANDS.map((c) => ({ ...c, hostId: created.id, profileId: profile!.id })));
      await tx.insert(actions).values(DEFAULT_ACTIONS.map((a) => ({ ...a, hostId: created.id })));
      return created;
    });
    if (!host) return reply.code(409).send({ error: 'Email already registered' });
    await startSession(db, reply, host.id, config.secureCookies);
    return reply.code(201).send({ id: host.id });
  });

  app.post<{ Body: Credentials }>('/login', { ...rateLimit, schema: { body: credentials } }, async (req, reply) => {
    const [host] = await db.select().from(hosts).where(eq(hosts.email, req.body.email.toLowerCase()));
    if (!host || !(await verify(host.passwordHash, req.body.password))) {
      return reply.code(401).send({ error: 'Wrong email or password' });
    }
    await startSession(db, reply, host.id, config.secureCookies);
    return { id: host.id };
  });

  app.post('/logout', async (req, reply) => {
    await endSession(db, req, reply);
    return { ok: true };
  });

  app.get('/me', { onRequest: requireHost }, async (req) => {
    const [host] = await db
      .select({
        id: hosts.id,
        email: hosts.email,
        tiktokUsername: hosts.tiktokUsername,
        overlayToken: hosts.overlayToken,
        actionsPerSecond: hosts.actionsPerSecond,
        progression: hosts.progression,
        levelGating: hosts.levelGating,
        points: hosts.points,
        pointsPerChat: hosts.pointsPerChat,
        pointsPerDiamond: hosts.pointsPerDiamond,
        pointsPerFollow: hosts.pointsPerFollow,
        pointsPerShare: hosts.pointsPerShare,
        pointsCheck: hosts.pointsCheck,
        ttsMode: hosts.ttsMode,
        ttsPrefix: hosts.ttsPrefix,
        ttsMaxLength: hosts.ttsMaxLength,
        ttsCooldownMs: hosts.ttsCooldownMs,
        ttsMinLevel: hosts.ttsMinLevel,
        ttsBlockedWords: hosts.ttsBlockedWords,
        ttsVoice: hosts.ttsVoice,
        ttsEngine: hosts.ttsEngine,
        ttsEspeakVoice: hosts.ttsEspeakVoice,
        ttsPiperVoice: hosts.ttsPiperVoice,
        ttsPiperSpeaker: hosts.ttsPiperSpeaker,
        ttsEffect: hosts.ttsEffect,
        ttsVolume: hosts.ttsVolume,
        ttsCloudProvider: hosts.ttsCloudProvider,
        ttsCloudRegion: hosts.ttsCloudRegion,
        ttsCloudVoice: hosts.ttsCloudVoice,
        // The key itself never leaves the server.
        ttsCloudKeySet: sql<boolean>`${hosts.ttsCloudKey} is not null`,
        ttsTiktokVoice: hosts.ttsTiktokVoice,
        // Same for the TikTok session.
        ttsTiktokConnected: sql<boolean>`${hosts.ttsTiktokSession} is not null`,
        uiTheme: hosts.uiTheme,
        uiThemeStyle: hosts.uiThemeStyle,
        uiMode: hosts.uiMode,
        alertStyle: hosts.alertStyle,
        // Mode settings of the active profile.
        profileId: profiles.id,
        profileName: profiles.name,
        mode: profiles.mode,
        voteWindowMs: profiles.voteWindowMs,
        turnMs: profiles.turnMs,
        giftBoosts: profiles.giftBoosts,
      })
      .from(hosts)
      .innerJoin(profiles, eq(profiles.id, hosts.activeProfileId))
      .where(eq(hosts.id, req.hostId));
    return host;
  });
}
