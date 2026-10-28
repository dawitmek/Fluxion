import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { LeaderboardEntry } from '@fluxion/shared';
import type { Db } from '../db/client.js';
import { hosts, viewerStats } from '../db/schema.js';

type Counts = { commands: number; gifts: number };

// Buffers per-viewer counts in memory and writes them in one upsert per flush, so a busy chat
// doesn't turn into a database write per comment.
export class Stats {
  private pending = new Map<string, Map<string, Counts>>(); // hostId -> viewerId -> counts

  constructor(private db: Db) {}

  record(hostId: string, viewerId: string, field: keyof Counts, n = 1) {
    let viewers = this.pending.get(hostId);
    if (!viewers) this.pending.set(hostId, (viewers = new Map()));
    const counts = viewers.get(viewerId) ?? { commands: 0, gifts: 0 };
    counts[field] += n;
    viewers.set(viewerId, counts);
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
            updatedAt: sql`now()`,
          },
        });
      return [...live];
    } catch (err) {
      // Put the counts back so the next flush retries them.
      for (const row of rows) {
        this.record(row.hostId, row.viewerId, 'commands', row.commands);
        this.record(row.hostId, row.viewerId, 'gifts', row.gifts);
      }
      throw err;
    }
  }

  async top(hostId: string, limit = 10): Promise<LeaderboardEntry[]> {
    return this.db
      .select({ viewer: viewerStats.viewerId, commands: viewerStats.commands, gifts: viewerStats.gifts })
      .from(viewerStats)
      .where(eq(viewerStats.hostId, hostId))
      .orderBy(desc(viewerStats.commands), desc(viewerStats.gifts))
      .limit(limit);
  }

  async reset(hostId: string) {
    this.pending.delete(hostId);
    await this.db.delete(viewerStats).where(eq(viewerStats.hostId, hostId));
  }
}
