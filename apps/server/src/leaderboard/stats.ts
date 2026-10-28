import { desc, eq, inArray, sql } from 'drizzle-orm';
import { levelForXp, type LeaderboardEntry } from '@fluxion/shared';
import type { Db } from '../db/client.js';
import { hosts, viewerStats } from '../db/schema.js';

type Counts = { commands: number; gifts: number; xp: number };

// Buffers per-viewer counts in memory and writes them in one upsert per flush, so a busy chat
// doesn't turn into a database write per comment. While a host is live, it also keeps every viewer's
// XP in memory so levels can be checked synchronously on each comment.
export class Stats {
  private pending = new Map<string, Map<string, Counts>>(); // hostId -> viewerId -> unflushed counts
  private xp = new Map<string, Map<string, number>>(); // hostId -> viewerId -> total XP (live hosts only)

  constructor(private db: Db) {}

  // Returns the viewer's new level if this pushed them up one, else null.
  record(hostId: string, viewerId: string, add: Partial<Counts>): number | null {
    this.addPending(hostId, viewerId, { commands: 0, gifts: 0, xp: 0, ...add });
    const totals = this.xp.get(hostId);
    if (!totals || !add.xp) return null;
    const before = totals.get(viewerId) ?? 0;
    totals.set(viewerId, before + add.xp);
    const level = levelForXp(before + add.xp);
    return level > levelForXp(before) ? level : null;
  }

  // Levels are only known for hosts loaded with load(); others count as level 1.
  levelOf(hostId: string, viewerId: string): number {
    return levelForXp(this.xp.get(hostId)?.get(viewerId) ?? 0);
  }

  // Loads a host's XP totals into memory; call when they go live.
  async load(hostId: string) {
    const rows = await this.db
      .select({ viewerId: viewerStats.viewerId, xp: viewerStats.xp })
      .from(viewerStats)
      .where(eq(viewerStats.hostId, hostId));
    const totals = new Map(rows.map((r) => [r.viewerId, r.xp]));
    for (const [viewerId, counts] of this.pending.get(hostId) ?? []) {
      totals.set(viewerId, (totals.get(viewerId) ?? 0) + counts.xp); // not flushed yet
    }
    this.xp.set(hostId, totals);
  }

  unload(hostId: string) {
    this.xp.delete(hostId);
  }

  // Returns the hosts whose stats changed.
  async flush(): Promise<string[]> {
    const batch = this.pending;
    if (batch.size === 0) return [];
    this.pending = new Map();
    const rows = [...batch].flatMap(([hostId, viewers]) =>
      [...viewers].map(([viewerId, counts]) => ({ hostId, viewerId, ...counts })),
    );
    try {
      // A host deleted since its counts were recorded would fail the whole insert on the foreign key.
      const existing = await this.db.select({ id: hosts.id }).from(hosts).where(inArray(hosts.id, [...batch.keys()]));
      const live = new Set(existing.map((h) => h.id));
      const valid = rows.filter((r) => live.has(r.hostId));
      if (valid.length === 0) return [];
      await this.db
        .insert(viewerStats)
        .values(valid)
        .onConflictDoUpdate({
          target: [viewerStats.hostId, viewerStats.viewerId],
          set: {
            commands: sql`${viewerStats.commands} + excluded.commands`,
            gifts: sql`${viewerStats.gifts} + excluded.gifts`,
            xp: sql`${viewerStats.xp} + excluded.xp`,
            updatedAt: sql`now()`,
          },
        });
      return [...live];
    } catch (err) {
      // Put the counts back so the next flush retries them. The XP cache already includes them.
      for (const { hostId, viewerId, ...counts } of rows) this.addPending(hostId, viewerId, counts);
      throw err;
    }
  }

  async top(hostId: string, limit = 10): Promise<LeaderboardEntry[]> {
    return this.db
      .select({ viewer: viewerStats.viewerId, commands: viewerStats.commands, gifts: viewerStats.gifts, xp: viewerStats.xp })
      .from(viewerStats)
      .where(eq(viewerStats.hostId, hostId))
      .orderBy(desc(viewerStats.xp), desc(viewerStats.commands))
      .limit(limit);
  }

  async reset(hostId: string) {
    this.pending.delete(hostId);
    if (this.xp.has(hostId)) this.xp.set(hostId, new Map());
    await this.db.delete(viewerStats).where(eq(viewerStats.hostId, hostId));
  }

  private addPending(hostId: string, viewerId: string, add: Counts) {
    let viewers = this.pending.get(hostId);
    if (!viewers) this.pending.set(hostId, (viewers = new Map()));
    const counts = viewers.get(viewerId) ?? { commands: 0, gifts: 0, xp: 0 };
    viewers.set(viewerId, { commands: counts.commands + add.commands, gifts: counts.gifts + add.gifts, xp: counts.xp + add.xp });
  }
}
