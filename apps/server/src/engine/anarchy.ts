import { createRateLimit, decide, matchComment } from './common.js';
import type { Engine, EngineContext } from './types.js';

// Anarchy: every matching comment fires, limited by per-viewer cooldowns and a global rate.
export function createAnarchy(ctx: EngineContext): Engine {
  const lastFired = new Map<string, number>(); // `${viewerId}:${keyword}` -> time
  const rate = createRateLimit(ctx);

  return {
    handle(event) {
      if (event.kind !== 'comment') return [];
      const command = matchComment(ctx, event);
      if (!command) return [];

      const cooldownKey = `${event.viewerId}:${command.keyword}`;
      const last = lastFired.get(cooldownKey);
      if (last !== undefined && ctx.now() - last < command.cooldownMs) return [];
      if (!rate.take()) return [];

      lastFired.set(cooldownKey, ctx.now());
      return [decide(ctx, command, event.viewerId, [event.viewerId])];
    },
    tick: () => [],
    state: () => ({ mode: 'anarchy' }),
  };
}
