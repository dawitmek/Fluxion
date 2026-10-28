import { boolean, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { Mode } from '@fluxion/shared';

export const hosts = pgTable('hosts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  tiktokUsername: text('tiktok_username'),
  overlayToken: text('overlay_token').notNull().unique(),
  actionsPerSecond: integer('actions_per_second').notNull().default(5),
  mode: text('mode').$type<Mode>().notNull().default('anarchy'),
  voteWindowMs: integer('vote_window_ms').notNull().default(3000),
  turnMs: integer('turn_ms').notNull().default(30000),
  giftBoosts: boolean('gift_boosts').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Only the SHA-256 of a session token is stored, so a database leak doesn't leak live sessions.
export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const commands = pgTable(
  'commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    keyword: text('keyword').notNull(), // stored lowercase
    key: text('key').notNull(),
    holdMs: integer('hold_ms').notNull(),
    cooldownMs: integer('cooldown_ms').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [unique().on(t.hostId, t.keyword)],
);

export const giftTriggers = pgTable(
  'gift_triggers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    giftName: text('gift_name').notNull(), // stored lowercase, matched against TikTok's gift name
    commandId: uuid('command_id').notNull().references(() => commands.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.hostId, t.giftName)],
);

// Leaderboard aggregates. Raw chat is never stored.
export const viewerStats = pgTable(
  'viewer_stats',
  {
    hostId: uuid('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
    viewerId: text('viewer_id').notNull(),
    commands: integer('commands').notNull().default(0),
    gifts: integer('gifts').notNull().default(0),
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
