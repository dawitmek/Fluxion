import type { Mode } from '@fluxion/shared';
import { createAnarchy } from './anarchy.js';
import { decide } from './common.js';
import { createDemocracy } from './democracy.js';
import { createQueue } from './queue.js';
import type { Decision, Engine, EngineContext } from './types.js';

export type { EngineConfig, EngineContext, Decision, Engine } from './types.js';

const REPEAT_GAP_MS = 100;

// Gift-only: comments do nothing; only actions' key presses (outside the modes) fire.
const createGiftOnly = (): Engine => ({ handle: () => [], tick: () => [], state: () => ({ mode: 'gift' }) });

const modes: Record<Mode, (ctx: EngineContext) => Engine> = {
  anarchy: createAnarchy,
  democracy: createDemocracy,
  queue: createQueue,
  gift: createGiftOnly,
};

// An action's key press. It skips crowd-mode cooldowns, the rate limit, level requirements and point costs:
// the action's own trigger, audience and cooldowns decide, and a gift has already paid for it.
export function keyPresses(ctx: EngineContext, keyword: string, viewer: string, repeats: number): Decision[] {
  const command = ctx.config.commands.find((c) => c.enabled && c.keyword === keyword);
  if (!command) return [];
  // Spaced out so repeats are separate presses rather than one long hold.
  return Array.from({ length: repeats }, (_, i) =>
    ({ ...decide(ctx, command, viewer, [], i === 0 ? undefined : i * (command.holdMs + REPEAT_GAP_MS)), cost: 0 }),
  );
}

export function createEngine(mode: Mode, ctx: EngineContext): Engine {
  return modes[mode](ctx);
}
