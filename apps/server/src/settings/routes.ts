import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { hosts, profiles } from '../db/schema.js';
import { MODES, TTS_MODES, type Mode, type TtsMode } from '@fluxion/shared';
import { requireHost } from '../auth/session.js';
import { activeProfile } from '../profiles/active.js';

type Body = {
  tiktokUsername?: string | null;
  actionsPerSecond?: number;
  mode?: Mode;
  voteWindowMs?: number;
  turnMs?: number;
  giftBoosts?: boolean;
  progression?: boolean;
  levelGating?: boolean;
  ttsMode?: TtsMode;
  ttsPrefix?: string;
  ttsMaxLength?: number;
  ttsCooldownMs?: number;
  ttsMinLevel?: number;
  ttsBlockedWords?: string;
  ttsVoice?: string | null;
};

// Mode settings belong to the active profile (they differ per game); the rest to the host.
const PROFILE_FIELDS = ['mode', 'voteWindowMs', 'turnMs', 'giftBoosts'] as const;

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireHost);

  app.patch<{ Body: Body }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tiktokUsername: { type: ['string', 'null'], pattern: '^@?[A-Za-z0-9_.]{1,24}$' },
            actionsPerSecond: { type: 'integer', minimum: 1, maximum: 50 },
            mode: { enum: MODES },
            voteWindowMs: { type: 'integer', minimum: 1000, maximum: 30000 },
            turnMs: { type: 'integer', minimum: 5000, maximum: 300000 },
            giftBoosts: { type: 'boolean' },
            progression: { type: 'boolean' },
            levelGating: { type: 'boolean' },
            ttsMode: { enum: TTS_MODES },
            ttsPrefix: { type: 'string', pattern: '^\\S{1,16}$' },
            ttsMaxLength: { type: 'integer', minimum: 10, maximum: 300 },
            ttsCooldownMs: { type: 'integer', minimum: 0, maximum: 600000 },
            ttsMinLevel: { type: 'integer', minimum: 1, maximum: 99 },
            ttsBlockedWords: { type: 'string', maxLength: 5000 },
            ttsVoice: { type: ['string', 'null'], maxLength: 200 },
          },
        },
      },
    },
    async (req) => {
      const { tiktokUsername, actionsPerSecond, progression, levelGating } = req.body;
      const tts = Object.fromEntries(Object.entries(req.body).filter(([k]) => k.startsWith('tts')));
      const hostPatch = {
        ...tts,
        ...(tiktokUsername !== undefined && { tiktokUsername: tiktokUsername?.replace(/^@/, '') ?? null }),
        ...(actionsPerSecond !== undefined && { actionsPerSecond }),
        ...(progression !== undefined && { progression }),
        ...(levelGating !== undefined && { levelGating }),
      };
      const profilePatch = Object.fromEntries(
        PROFILE_FIELDS.filter((f) => req.body[f] !== undefined).map((f) => [f, req.body[f]]),
      ) as Partial<typeof profiles.$inferInsert>;
      if (Object.keys(hostPatch).length > 0) await app.db.update(hosts).set(hostPatch).where(eq(hosts.id, req.hostId));
      if (Object.keys(profilePatch).length > 0) {
        const profile = await activeProfile(app.db, req.hostId);
        await app.db.update(profiles).set(profilePatch).where(eq(profiles.id, profile.id));
      }
      await app.live.reload(req.hostId);
      return { ok: true };
    },
  );
}
