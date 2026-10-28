import { boolean, integer, pgTable, primaryKey, text, timestamp, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { AlertEvent, AlertSound, CloudProvider, Mode, TtsEngine, TtsMode, VoiceEffect } from '@fluxion/shared';

export const hosts = pgTable('hosts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  tiktokUsername: text('tiktok_username'),
  overlayToken: text('overlay_token').notNull().unique(),
  actionsPerSecond: integer('actions_per_second').notNull().default(5),
  // Set right after signup creates the first profile; only null inside that transaction.
  activeProfileId: uuid('active_profile_id').references((): AnyPgColumn => profiles.id),
  progression: boolean('progression').notNull().default(false), // XP and levels on the overlay
  levelGating: boolean('level_gating').notNull().default(false), // commands may require a level
  // Text-to-speech of chat, spoken by the overlay.
  ttsMode: text('tts_mode').$type<TtsMode>().notNull().default('prefix'),
  ttsPrefix: text('tts_prefix').notNull().default('!tts'),
  ttsMaxLength: integer('tts_max_length').notNull().default(150),
  ttsCooldownMs: integer('tts_cooldown_ms').notNull().default(15000), // per viewer
  ttsMinLevel: integer('tts_min_level').notNull().default(1), // only enforced with progression on
  ttsBlockedWords: text('tts_blocked_words').notNull().default(''), // comma-separated
  ttsEngine: text('tts_engine').$type<TtsEngine>().notNull().default('piper'),
  ttsVoice: text('tts_voice'), // browser engine: a browser voice name; null means the overlay's default
  ttsEspeakVoice: text('tts_espeak_voice').notNull().default('en-us'),
  ttsPiperVoice: text('tts_piper_voice'), // a model name; null means the server's first voice
  ttsPiperSpeaker: integer('tts_piper_speaker'), // multi-speaker models only; null means speaker 0
  ttsEffect: text('tts_effect').$type<VoiceEffect>().notNull().default('none'),
  ttsCloudProvider: text('tts_cloud_provider').$type<CloudProvider>(),
  ttsCloudKey: text('tts_cloud_key'), // the host's own API key; never sent back to the browser
  ttsCloudRegion: text('tts_cloud_region'), // Azure only
  ttsCloudVoice: text('tts_cloud_voice'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Only the SHA-256 of a session token is stored, so a database leak doesn't leak live sessions.
export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// A per-game setup: its own commands, gift triggers and mode settings, plus the game the companion targets.
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gameProcess: text('game_process'), // executable name, lowercase, e.g. "gta5.exe"
    mode: text('mode').$type<Mode>().notNull().default('anarchy'),
    voteWindowMs: integer('vote_window_ms').notNull().default(3000),
    turnMs: integer('turn_ms').notNull().default(30000),
    giftBoosts: boolean('gift_boosts').notNull().default(true),
  },
  (t) => [unique().on(t.hostId, t.name)],
);

export const commands = pgTable(
  'commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    keyword: text('keyword').notNull(), // stored lowercase
    key: text('key').notNull(),
    holdMs: integer('hold_ms').notNull(),
    cooldownMs: integer('cooldown_ms').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    minLevel: integer('min_level').notNull().default(1), // only enforced when the host turns on level gating
  },
  (t) => [unique().on(t.profileId, t.keyword)],
);

export const giftTriggers = pgTable(
  'gift_triggers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    giftName: text('gift_name').notNull(), // stored lowercase, matched against TikTok's gift name
    commandId: uuid('command_id').notNull().references(() => commands.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.profileId, t.giftName)],
);

// An alert shown (and optionally spoken) on the overlay when an event happens.
export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  event: text('event').$type<AlertEvent>().notNull(),
  giftName: text('gift_name'), // gift alerts: only this gift (lowercase); null matches any gift
  likeStep: integer('like_step'), // likes alerts: fire every time the stream's total passes a multiple of this
  template: text('template').notNull(),
  sound: text('sound').$type<AlertSound>(),
  speak: boolean('speak').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
});

// Leaderboard aggregates. Raw chat is never stored.
export const viewerStats = pgTable(
  'viewer_stats',
  {
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    viewerId: text('viewer_id').notNull(),
    commands: integer('commands').notNull().default(0),
    gifts: integer('gifts').notNull().default(0),
    xp: integer('xp').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.hostId, t.viewerId] })],
);

export const companions = pgTable('companions', {
  id: uuid('id').primaryKey().defaultRandom(),
  hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const pairingCodes = pgTable('pairing_codes', {
  codeHash: text('code_hash').primaryKey(),
  hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type Command = typeof commands.$inferSelect;
