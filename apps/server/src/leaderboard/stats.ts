import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { levelForXp, type LeaderboardEntry } from '@fluxion/shared';
import type { Db } from '../db/client.js';
import { hosts, viewerStats } from '../db/schema.js';

type Counts = { commands: number; gifts: number; xp: number; points: number };
type Totals = { xp: number; points: number };
type Pending = { hostId: string; streamer: string; viewers: Map<string, Counts> };

// Stats are kept per TikTok account a host streams as, so switching accounts starts a fresh leaderboard and
// fresh balances; the old account's rows stay for when they switch back. '' is "no account set".
export const streamerKey = (username: string | null | undefined) => (username ?? '').replace(/^@/, '').toLowerCase();

// Buffers per-viewer counts in memory and writes them in one upsert per flush, so a busy chat
// doesn't turn into a database write per comment. While a host is live, it also keeps every viewer's
// XP and points in memory so levels and balances can be checked synchronously on each comment.
export class Stats {
  private pending = new Map<string, Pending>(); // "hostId/streamer" -> unflushed counts per viewer
  private totals = new Map<string, Map<string, Totals>>(); // hostId -> viewerId -> XP and points (live hosts only)
  private streamers = new Map<string, string>(); // hostId -> the account a live host is streaming as

  constructor(private db: Db) {}

  // Returns the viewer's new level if this pushed them up one, else null. Negative points spend them;
  // a balance never goes below 0. Points only change for loaded hosts, the only ones that can earn or spend.
  record(hostId: string, viewerId: string, add: Partial<Counts>): number | null {
    const totals = this.totals.get(hostId);
    const streamer = this.streamers.get(hostId);
    if (streamer === undefined) return null; // not live
    const before = totals?.get(viewerId) ?? { xp: 0, points: 0 };
    const points = totals ? Math.max(add.points ?? 0, -before.points) : 0;
    this.addPending(hostId, streamer, viewerId, { commands: 0, gifts: 0, xp: 0, ...add, points });
    if (!totals) return null;
    const after = { xp: before.xp + (add.xp ?? 0), points: before.points + points };
    totals.set(viewerId, after);
    const level = levelForXp(after.xp);
    return level > levelForXp(before.xp) ? level : null;
  }

  // Levels and points are only known for hosts loaded with load(); others count as level 1 with no points.
  levelOf(hostId: string, viewerId: string): number {
    return levelForXp(this.totals.get(hostId)?.get(viewerId)?.xp ?? 0);
  }

  pointsOf(hostId: string, viewerId: string): number {
    return this.totals.get(hostId)?.get(viewerId)?.points ?? 0;
  }

  // The account a host's stats are read and written under: the one they're live as, else the one in their settings.
  async streamerOf(hostId: string): Promise<string> {
    const live = this.streamers.get(hostId);
    if (live !== undefined) return live;
    const [host] = await this.db.select({ tiktokUsername: hosts.tiktokUsername }).from(hosts).where(eq(hosts.id, hostId));
    return streamerKey(host?.tiktokUsername);
  }

  // Loads a host's XP and points for the account they're streaming as into memory; call when they go live.
  async load(hostId: string, username: string | null) {
    const streamer = streamerKey(username);
    const rows = await this.db
      .select({ viewerId: viewerStats.viewerId, xp: viewerStats.xp, points: viewerStats.points })
      .from(viewerStats)
      .where(and(eq(viewerStats.hostId, hostId), eq(viewerStats.streamer, streamer)));
    const totals = new Map(rows.map((r) => [r.viewerId, { xp: r.xp, points: r.points }]));
    for (const [viewerId, counts] of this.pending.get(`${hostId}/${streamer}`)?.viewers ?? []) {
      const t = totals.get(viewerId) ?? { xp: 0, points: 0 };
      totals.set(viewerId, { xp: t.xp + counts.xp, points: Math.max(0, t.points + counts.points) }); // not flushed yet
    }
    this.totals.set(hostId, totals);
    this.streamers.set(hostId, streamer);
  }

  unload(hostId: string) {
    this.totals.delete(hostId);
    this.streamers.delete(hostId);
  }

  // Returns the hosts whose stats changed.
  async flush(): Promise<string[]> {
    const batch = this.pending;
    if (batch.size === 0) return [];
    this.pending = new Map();
    const rows = [...batch.values()].flatMap(({ hostId, streamer, viewers }) =>
      [...viewers].map(([viewerId, counts]) => ({ hostId, streamer, viewerId, ...counts })),
    );
    try {
      // A host deleted since its counts were recorded would fail the whole insert on the foreign key.
      const existing = await this.db.select({ id: hosts.id }).from(hosts).where(inArray(hosts.id, [...new Set(rows.map((r) => r.hostId))]));
      const live = new Set(existing.map((h) => h.id));
      const valid = rows.filter((r) => live.has(r.hostId));
      if (valid.length === 0) return [];
      await this.db
        .insert(viewerStats)
        .values(valid)
        .onConflictDoUpdate({
          target: [viewerStats.hostId, viewerStats.streamer, viewerStats.viewerId],
          set: {
            commands: sql`${viewerStats.commands} + excluded.commands`,
            gifts: sql`${viewerStats.gifts} + excluded.gifts`,
            xp: sql`${viewerStats.xp} + excluded.xp`,
            points: sql`greatest(0, ${viewerStats.points} + excluded.points)`,
            updatedAt: sql`now()`,
          },
        });
      return [...live];
    } catch (err) {
      // Put the counts back so the next flush retries them. The in-memory totals already include them.
      for (const { hostId, streamer, viewerId, ...counts } of rows) this.addPending(hostId, streamer, viewerId, counts);
      throw err;
    }
  }

  async top(hostId: string, limit = 10): Promise<LeaderboardEntry[]> {
    const streamer = await this.streamerOf(hostId);
    return this.db
      .select({ viewer: viewerStats.viewerId, commands: viewerStats.commands, gifts: viewerStats.gifts, xp: viewerStats.xp, points: viewerStats.points })
      .from(viewerStats)
      // Viewers who have only earned points from chat haven't played yet.
      .where(and(eq(viewerStats.hostId, hostId), eq(viewerStats.streamer, streamer), sql`(${viewerStats.commands} > 0 or ${viewerStats.gifts} > 0)`))
      .orderBy(desc(viewerStats.xp), desc(viewerStats.commands))
      .limit(limit);
  }

  // Clears the current account's leaderboard (commands, gifts, XP). Points are kept: viewers may be saving them up.
  async reset(hostId: string) {
    const streamer = await this.streamerOf(hostId);
    const mine = and(eq(viewerStats.hostId, hostId), eq(viewerStats.streamer, streamer));
    for (const counts of this.pending.get(`${hostId}/${streamer}`)?.viewers.values() ?? []) Object.assign(counts, { commands: 0, gifts: 0, xp: 0 });
    if (this.streamers.get(hostId) === streamer) for (const t of this.totals.get(hostId)?.values() ?? []) t.xp = 0;
    await this.db.delete(viewerStats).where(and(mine, eq(viewerStats.points, 0)));
    await this.db.update(viewerStats).set({ commands: 0, gifts: 0, xp: 0 }).where(mine);
  }

  // Sets every viewer's points on the current account back to 0.
  async resetPoints(hostId: string) {
    const streamer = await this.streamerOf(hostId);
    for (const counts of this.pending.get(`${hostId}/${streamer}`)?.viewers.values() ?? []) counts.points = 0;
    if (this.streamers.get(hostId) === streamer) for (const t of this.totals.get(hostId)?.values() ?? []) t.points = 0;
    await this.db.update(viewerStats).set({ points: 0 }).where(and(eq(viewerStats.hostId, hostId), eq(viewerStats.streamer, streamer)));
  }

  private addPending(hostId: string, streamer: string, viewerId: string, add: Counts) {
    const key = `${hostId}/${streamer}`;
    let entry = this.pending.get(key);
    if (!entry) this.pending.set(key, (entry = { hostId, streamer, viewers: new Map() }));
    const viewers = entry.viewers;
    const counts = viewers.get(viewerId) ?? { commands: 0, gifts: 0, xp: 0, points: 0 };
    viewers.set(viewerId, {
      commands: counts.commands + add.commands,
      gifts: counts.gifts + add.gifts,
      xp: counts.xp + add.xp,
      points: counts.points + add.points,
    });
  }
}
