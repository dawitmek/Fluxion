import { QUEUE_JOIN } from '@fluxion/shared';
import { createRateLimit, decide, matchComment } from './common.js';
import type { Engine, EngineContext } from './types.js';

// A turn also ends early if its viewer sends no command for this long, so idle viewers don't stall the line.
export const IDLE_MS = 10_000;
const QUEUE_PREVIEW = 5;

// Queue: viewers type "join" to line up; the viewer at the front controls the game for one turn.
// The turn holder isn't subject to per-command cooldowns, only the global rate.
export function createQueue(ctx: EngineContext): Engine {
  const queue: string[] = [];
  let turn: { viewer: string; endsAt: number; lastActionAt: number } | null = null;
  const rate = createRateLimit(ctx);

  return {
    handle(event) {
      if (event.kind === 'comment') {
        if (event.text.trim().toLowerCase() === QUEUE_JOIN) {
          if (turn?.viewer !== event.viewerId && !queue.includes(event.viewerId)) queue.push(event.viewerId);
          return [];
        }
        const command = matchComment(ctx, event);
        if (!command || turn?.viewer !== event.viewerId || !rate.take()) return [];
        turn.lastActionAt = ctx.now();
        return [decide(ctx, command, event.viewerId, [event.viewerId])];
      }
      if (event.kind === 'gift' && ctx.config.giftBoosts && turn?.viewer !== event.viewerId) {
        // A gift skips the line.
        const at = queue.indexOf(event.viewerId);
        if (at !== -1) queue.splice(at, 1);
        queue.unshift(event.viewerId);
      }
      return [];
    },

    tick() {
      const t = ctx.now();
      if (turn && (t >= turn.endsAt || t - turn.lastActionAt >= IDLE_MS)) turn = null;
      const next = turn ? undefined : queue.shift();
      if (next !== undefined) turn = { viewer: next, endsAt: t + ctx.config.turnMs, lastActionAt: t };
      return [];
    },

    state: () => ({
      mode: 'queue',
      viewer: turn?.viewer ?? null,
      endsAt: turn?.endsAt ?? null,
      queue: queue.slice(0, QUEUE_PREVIEW),
    }),
  };
}
