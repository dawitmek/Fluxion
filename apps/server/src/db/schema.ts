import { bigserial, boolean, customType, index, integer, jsonb, pgTable, primaryKey, real, serial, text, timestamp, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { ActionTrigger, ActivityKind, AlertPosition, AlertSound, Audience, CloudProvider, GoalMetric, MediaKind, Mode, ScreenWidget, TtsEngine, TtsMode, VoiceEffect } from '@fluxion/shared';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

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
  // Points: a balance viewers earn on the host's streams and spend on commands that cost points.
  points: boolean('points').notNull().default(false),
  pointsPerChat: integer('points_per_chat').notNull().default(1), // for chatting, at most once a minute per viewer
  pointsPerDiamond: integer('points_per_diamond').notNull().default(10),
  pointsPerFollow: integer('points_per_follow').notNull().default(20),
  pointsPerShare: integer('points_per_share').notNull().default(5),
  pointsCheck: boolean('points_check').notNull().default(false), // viewers may type !points
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
  // The host's TikTok sessionid cookie, sent by the companion after the host signs in; never sent to the browser.
  ttsTiktokSession: text('tts_tiktok_session'),
  ttsTiktokVoice: text('tts_tiktok_voice'), // a TIKTOK_VOICES id; null means the first
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
    cost: integer('cost').notNull().default(0), // points spent each time it fires; only with points on
    position: serial('position').notNull(), // creation order, so the list doesn't reshuffle when one is edited
  },
  (t) => [unique().on(t.profileId, t.keyword)],
);

// What happens when viewers do something; see ACTION_TRIGGERS in the shared package.
export const actions = pgTable(
  'actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    // Null applies with every game profile. An action that presses a key belongs to that command's profile.
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    position: serial('position').notNull(),
    trigger: text('trigger').$type<ActionTrigger>().notNull(),
    giftName: text('gift_name'), // gift: only this gift (lowercase); null is any gift
    minDiamonds: integer('min_diamonds'), // gift: only when the gift (times its streak) is worth at least this
    likeStep: integer('like_step'), // likes
    command: text('command'), // command: lowercase, e.g. "!dance"
    audience: text('audience').$type<Audience>().notNull().default('everyone'),
    audienceViewer: text('audience_viewer'), // audience 'viewer' only
    cooldownMs: integer('cooldown_ms').notNull().default(0), // for everyone
    viewerCooldownMs: integer('viewer_cooldown_ms').notNull().default(0),
    random: boolean('random').notNull().default(false), // of the random actions an event matches, only one runs
    // The alert. Nothing is shown when text, sound, sound file and media are all empty.
    text: text('text'),
    sound: text('sound').$type<AlertSound>(),
    soundMediaId: uuid('sound_media_id').references(() => media.id, { onDelete: 'set null' }),
    mediaId: uuid('media_id').references(() => media.id, { onDelete: 'set null' }),
    speak: boolean('speak').notNull().default(false), // read the text aloud
    durationMs: integer('duration_ms').notNull().default(5000),
    // Where the alert shows, placed by hand: its middle, in percent of the screen. Both null: the screen's alert position.
    alertX: real('alert_x'),
    alertY: real('alert_y'),
    alertScale: integer('alert_scale').notNull().default(100), // percent, on top of the screen's size
    keyCommandId: uuid('key_command_id').references(() => commands.id, { onDelete: 'set null' }),
    repeatWithCount: boolean('repeat_with_count').notNull().default(false), // gift streaks press the key once per gift
    points: integer('points').notNull().default(0), // given to the viewer; only with points on
    screenId: uuid('screen_id').references(() => overlayScreens.id, { onDelete: 'set null' }), // null: every screen with alerts
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }), // goal trigger only
  },
  (t) => [index('actions_host_idx').on(t.hostId)],
);

// Leaderboard aggregates. Raw chat is never stored.
export const viewerStats = pgTable(
  'viewer_stats',
  {
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    // The TikTok account (lowercase, no @) these were earned on; '' when none was set. See streamerKey.
    streamer: text('streamer').notNull().default(''),
    viewerId: text('viewer_id').notNull(),
    commands: integer('commands').notNull().default(0),
    gifts: integer('gifts').notNull().default(0),
    xp: integer('xp').notNull().default(0),
    points: integer('points').notNull().default(0), // balance: earned minus spent, never below 0
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.hostId, t.streamer, t.viewerId] })],
);

export const companions = pgTable('companions', {
  id: uuid('id').primaryKey().defaultRandom(),
  hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  // What the companion reports about its PC, refreshed on every connect: its own name for itself and OS.
  hostname: text('hostname'),
  platform: text('platform'), // "windows", "macos", "linux"
});

export const pairingCodes = pgTable('pairing_codes', {
  codeHash: text('code_hash').primaryKey(),
  hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// One row per live session (TikTok or test mode). Test-mode sessions are kept only until the next one starts.
export const streams = pgTable(
  'streams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    source: text('source').$type<'tiktok' | 'simulated'>().notNull(),
    profileName: text('profile_name').notNull(),
    // The TikTok account streamed from, so a host who switches accounts keeps their audiences apart.
    tiktokUsername: text('tiktok_username'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }), // null while live
  },
  (t) => [index('streams_host_idx').on(t.hostId, t.startedAt)],
);

// Everything that happened during a stream, for the activity feed and analytics. See ActivityKind for what's in data.
export const streamEvents = pgTable(
  'stream_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    streamId: uuid('stream_id').notNull().references(() => streams.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull(),
    kind: text('kind').$type<ActivityKind>().notNull(),
    viewer: text('viewer'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('stream_events_stream_idx').on(t.streamId, t.id), index('stream_events_viewer_idx').on(t.viewer, t.kind)],
);

// Health of server-wide services, shared by every server process on the database. One row per service:
// 'tiktok-account' is the TIKTOK_SESSION_ID account that TikTok voices fall back to.
export const serviceStatus = pgTable('service_status', {
  name: text('name').primaryKey(),
  ok: boolean('ok').notNull(),
  detail: text('detail'), // why it isn't ok
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

// Sounds, pictures and videos a host uploaded for their alerts. Kept in the database so backups include them.
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').$type<MediaKind>().notNull(),
    mime: text('mime').notNull(), // from the file's contents, not what the browser claimed
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('media_host_idx').on(t.hostId)],
);

// See OverlayScreen in the shared package. The main screen's token is the host's overlay_token.
export const overlayScreens = pgTable(
  'overlay_screens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    token: text('token').notNull().unique(),
    main: boolean('main').notNull().default(false),
    position: serial('position').notNull(),
    alerts: boolean('alerts').notNull().default(true),
    feed: boolean('feed').notNull().default(true),
    leaderboard: boolean('leaderboard').notNull().default(true),
    mode: boolean('mode').notNull().default(true),
    audio: boolean('audio').notNull().default(true),
    alertPosition: text('alert_position').$type<AlertPosition>().notNull().default('top'),
    scale: integer('scale').notNull().default(100),
    widgets: jsonb('widgets').$type<ScreenWidget[]>().notNull().default([]),
  },
  (t) => [index('overlay_screens_host_idx').on(t.hostId)],
);

// A target for this stream, shown by the goals widget; reaching it can trigger actions.
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    metric: text('metric').$type<GoalMetric>().notNull(),
    target: integer('target').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    position: serial('position').notNull(),
  },
  (t) => [index('goals_host_idx').on(t.hostId)],
);

export type Command = typeof commands.$inferSelect;
