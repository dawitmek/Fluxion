import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { hosts, profiles } from '../db/schema.js';
import {
  CLOUD_PROVIDERS,
  MODES,
  TTS_ENGINES,
  TTS_MODES,
  UI_THEMES,
  VOICE_EFFECTS,
  type CloudProvider,
  type Mode,
  type TtsEngine,
  type TtsMode,
  type AlertStyle,
  type UiTheme,
  type UiThemeStyle,
  type VoiceEffect,
} from '@fluxion/shared';
import { requireHost } from '../auth/session.js';
import { activeProfile } from '../profiles/active.js';
import { alertStyleSchema } from '../actions/routes.js';

type Body = {
  tiktokUsername?: string | null;
  actionsPerSecond?: number;
  mode?: Mode;
  voteWindowMs?: number;
  turnMs?: number;
  giftBoosts?: boolean;
  progression?: boolean;
  levelGating?: boolean;
  points?: boolean;
  pointsPerChat?: number;
  pointsPerDiamond?: number;
  pointsPerFollow?: number;
  pointsPerShare?: number;
  pointsCheck?: boolean;
  ttsMode?: TtsMode;
  ttsPrefix?: string;
  ttsMaxLength?: number;
  ttsCooldownMs?: number;
  ttsMinLevel?: number;
  ttsBlockedWords?: string;
  ttsVoice?: string | null;
  ttsEngine?: TtsEngine;
  ttsEspeakVoice?: string;
  ttsPiperVoice?: string | null;
  ttsPiperSpeaker?: number | null;
  ttsEffect?: VoiceEffect;
  ttsVolume?: number;
  ttsCloudProvider?: CloudProvider | null;
  ttsCloudKey?: string | null;
  ttsCloudRegion?: string | null;
  ttsCloudVoice?: string | null;
  ttsTiktokVoice?: string | null;
  ttsTiktokSession?: null;
  uiTheme?: UiTheme;
  uiThemeStyle?: UiThemeStyle;
  alertStyle?: AlertStyle | null;
};

// Tells the host's companions the dashboard's theme, which they follow.
export async function sendThemeToCompanions(app: FastifyInstance, hostId: string) {
  const [host] = await app.db.select({ theme: hosts.uiTheme, style: hosts.uiThemeStyle }).from(hosts).where(eq(hosts.id, hostId));
  if (host) app.hub.sendToCompanions(hostId, { type: 'theme', theme: host.theme, style: host.style });
}

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
            points: { type: 'boolean' },
            pointsPerChat: { type: 'integer', minimum: 0, maximum: 10000 },
            pointsPerDiamond: { type: 'integer', minimum: 0, maximum: 10000 },
            pointsPerFollow: { type: 'integer', minimum: 0, maximum: 10000 },
            pointsPerShare: { type: 'integer', minimum: 0, maximum: 10000 },
            pointsCheck: { type: 'boolean' },
            ttsMode: { enum: TTS_MODES },
            ttsPrefix: { type: 'string', pattern: '^\\S{1,16}$' },
            ttsMaxLength: { type: 'integer', minimum: 10, maximum: 300 },
            ttsCooldownMs: { type: 'integer', minimum: 0, maximum: 600000 },
            ttsMinLevel: { type: 'integer', minimum: 1, maximum: 99 },
            ttsBlockedWords: { type: 'string', maxLength: 5000 },
            ttsVoice: { type: ['string', 'null'], maxLength: 200 },
            ttsEngine: { enum: TTS_ENGINES },
            ttsEspeakVoice: { type: 'string', pattern: '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' },
            ttsPiperVoice: { type: ['string', 'null'], pattern: '^[A-Za-z0-9_.-]{1,100}$' },
            ttsPiperSpeaker: { type: ['integer', 'null'], minimum: 0, maximum: 100000 },
            ttsEffect: { enum: VOICE_EFFECTS },
            ttsVolume: { type: 'integer', minimum: 0, maximum: 100 },
            ttsCloudProvider: { enum: [...CLOUD_PROVIDERS, null] },
            ttsCloudKey: { type: ['string', 'null'], maxLength: 300 },
            ttsCloudRegion: { type: ['string', 'null'], pattern: '^[a-z0-9]{1,40}$' },
            ttsCloudVoice: { type: ['string', 'null'], maxLength: 100 },
            ttsTiktokVoice: { type: ['string', 'null'], pattern: '^[a-z0-9_]{1,60}$' },
            // Only clearing: the session itself comes from the companion (POST /api/companions/tiktok-session).
            ttsTiktokSession: { type: 'null' },
            uiTheme: { enum: UI_THEMES.map((t) => t.id) },
            uiThemeStyle: { enum: ['full', 'colors'] },
            alertStyle: { anyOf: [{ type: 'null' }, alertStyleSchema()] },
          },
        },
      },
    },
    async (req, reply) => {
      const { tiktokUsername, actionsPerSecond, progression, levelGating, uiTheme, uiThemeStyle, alertStyle } = req.body;
      const tts = Object.fromEntries(Object.entries(req.body).filter(([k]) => k.startsWith('tts')));
      const points = Object.fromEntries(Object.entries(req.body).filter(([k]) => k.startsWith('points')));
      if (typeof req.body.ttsCloudKey === 'string') tts.ttsCloudKey = app.secrets.seal(req.body.ttsCloudKey);
      // Speaker numbers belong to one Piper voice: a new voice starts at its first speaker,
      // and a speaker the voice doesn't have is refused rather than silently played as speaker 0.
      if (req.body.ttsPiperVoice !== undefined && req.body.ttsPiperSpeaker === undefined) tts.ttsPiperSpeaker = null;
      if (typeof req.body.ttsPiperSpeaker === 'number') {
        const [host] = await app.db.select({ voice: hosts.ttsPiperVoice }).from(hosts).where(eq(hosts.id, req.hostId));
        const voices = await app.piper.voices();
        const name = req.body.ttsPiperVoice !== undefined ? req.body.ttsPiperVoice : host?.voice;
        const voice = voices.find((v) => v.name === name) ?? voices[0];
        if (voice && req.body.ttsPiperSpeaker >= voice.speakers) {
          return reply.code(400).send({ error: `${voice.name} has speakers 0–${voice.speakers - 1}` });
        }
      }
      const hostPatch = {
        ...tts,
        ...points,
        ...(tiktokUsername !== undefined && { tiktokUsername: tiktokUsername?.replace(/^@/, '') ?? null }),
        ...(actionsPerSecond !== undefined && { actionsPerSecond }),
        ...(progression !== undefined && { progression }),
        ...(levelGating !== undefined && { levelGating }),
        ...(uiTheme !== undefined && { uiTheme }),
        ...(uiThemeStyle !== undefined && { uiThemeStyle }),
        ...(alertStyle !== undefined && { alertStyle }),
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
      // The companion follows the dashboard's theme.
      if (uiTheme !== undefined || uiThemeStyle !== undefined) await sendThemeToCompanions(app, req.hostId);
      // Volume isn't part of the voice: open overlays turn up or down now, even mid-line, and nothing is dropped.
      if (req.body.ttsVolume !== undefined) app.hub.sendToOverlays(req.hostId, { type: 'speechVolume', volume: req.body.ttsVolume });
      return { ok: true };
    },
  );
}
