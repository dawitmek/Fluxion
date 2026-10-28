import type { ViewerEvent } from '@fluxion/shared';
import type { Decision, EngineCommand, EngineContext } from './types.js';

// The enabled command a comment names, if any, and if the viewer's level allows it.
// The whole comment must be the keyword.
export function matchComment(ctx: EngineContext, event: Extract<ViewerEvent, { kind: 'comment' }>): EngineCommand | undefined {
  const keyword = event.text.trim().toLowerCase();
  const command = ctx.config.commands.find((c) => c.enabled && c.keyword === keyword);
  if (command && ctx.config.levelGating && ctx.levelOf(event.viewerId) < command.minLevel) return undefined;
  return command;
}

export function decide(ctx: EngineContext, command: EngineCommand, viewer: string, credit: string[], delayMs?: number): Decision {
  return {
    action: { id: ctx.newId(), key: command.key, holdMs: command.holdMs },
    keyword: command.keyword,
    viewer,
    credit,
    ...(delayMs !== undefined && { delayMs }),
  };
}

// Sliding one-second window of actionsPerSecond across all viewers.
export function createRateLimit(ctx: EngineContext) {
  const recent: number[] = [];
  return {
    take(): boolean {
      const t = ctx.now();
      while (recent.length > 0 && t - recent[0]! >= 1000) recent.shift();
      if (recent.length >= ctx.config.actionsPerSecond) return false;
      recent.push(t);
      return true;
    },
  };
}
