import type { Mode, ViewerEvent } from '@fluxion/shared';
import { createAnarchy } from './anarchy.js';
import { decide } from './common.js';
import { createDemocracy } from './democracy.js';
import { createQueue } from './queue.js';
import type { Decision, Engine, EngineContext } from './types.js';

export type { EngineConfig, EngineContext, Decision, Engine } from './types.js';

// A gift streak of N presses its command N times, up to this many.
export const MAX_GIFT_REPEATS = 10;
const REPEAT_GAP_MS = 100;

// Gift-only: comments do nothing; only gift triggers (applied to every mode below) fire.
const createGiftOnly = (): Engine => ({ handle: () => [], tick: () => [], state: () => ({ mode: 'gift' }) });

const modes: Record<Mode, (ctx: EngineContext) => Engine> = {
  anarchy: createAnarchy,
  democracy: createDemocracy,
  queue: createQueue,
  gift: createGiftOnly,
};

// Gift triggers bypass cooldowns and the rate limit: they're paid for and already rate-limited by price.
function giftTriggers(ctx: EngineContext, event: Extract<ViewerEvent, { kind: 'gift' }>): Decision[] {
  const trigger = ctx.config.giftTriggers.find((t) => t.giftName === event.giftName.trim().toLowerCase());
  const command = ctx.config.commands.find((c) => c.enabled && c.keyword === trigger?.keyword);
  if (!command) return [];
  const repeats = Math.min(Math.max(event.count, 1), MAX_GIFT_REPEATS);
  // Spaced out so repeats are separate presses rather than one long hold.
  return Array.from({ length: repeats }, (_, i) =>
    decide(ctx, command, event.viewerId, [], i === 0 ? undefined : i * (command.holdMs + REPEAT_GAP_MS)),
  );
}

export function createEngine(mode: Mode, ctx: EngineContext): Engine {
  const inner = modes[mode](ctx);
  return {
    handle: (event) => [...(event.kind === 'gift' ? giftTriggers(ctx, event) : []), ...inner.handle(event)],
    tick: inner.tick,
    state: inner.state,
  };
}
