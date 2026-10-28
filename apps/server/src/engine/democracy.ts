import { decide, matchComment } from './common.js';
import type { Engine, EngineContext } from './types.js';

// Democracy: the first vote opens a window; when it closes, the most-voted command fires once.
// One vote per viewer per window (a new vote replaces the old). Ties go to the command voted first.
export function createDemocracy(ctx: EngineContext): Engine {
  let window: { endsAt: number; votes: Map<string, string>; boosts: Map<string, number> } | null = null;

  const tally = () => {
    const counts = new Map<string, number>();
    if (window) {
      for (const [viewer, keyword] of window.votes) {
        counts.set(keyword, (counts.get(keyword) ?? 0) + 1 + (window.boosts.get(viewer) ?? 0));
      }
    }
    return [...counts].map(([keyword, votes]) => ({ keyword, votes }));
  };

  return {
    handle(event) {
      if (event.kind === 'comment') {
        const command = matchComment(ctx, event);
        if (!command) return [];
        window ??= { endsAt: ctx.now() + ctx.config.voteWindowMs, votes: new Map(), boosts: new Map() };
        window.votes.delete(event.viewerId); // re-insert so tie order follows the latest vote
        window.votes.set(event.viewerId, command.keyword);
      } else if (event.kind === 'gift' && ctx.config.giftBoosts && window) {
        // Each gift adds extra votes to the gifter's vote in the current window.
        window.boosts.set(event.viewerId, (window.boosts.get(event.viewerId) ?? 0) + event.count);
      }
      return [];
    },

    tick() {
      if (!window || ctx.now() < window.endsAt) return [];
      let winner: { keyword: string; votes: number } | undefined;
      for (const entry of tally()) if (!winner || entry.votes > winner.votes) winner = entry;
      const voters = [...window.votes].filter(([, k]) => k === winner?.keyword).map(([v]) => v);
      window = null;
      const command = ctx.config.commands.find((c) => c.enabled && c.keyword === winner?.keyword);
      if (!winner || !command) return [];
      return [decide(ctx, command, `${winner.votes} vote${winner.votes === 1 ? '' : 's'}`, voters)];
    },

    state: () => ({
      mode: 'democracy',
      tally: tally().sort((a, b) => b.votes - a.votes),
      endsAt: window?.endsAt ?? null,
    }),
  };
}
