import type { KeyAction, ViewerEvent } from '@fluxion/shared';

export interface EngineCommand {
  keyword: string; // lowercase
  key: string;
  holdMs: number;
  cooldownMs: number;
  enabled: boolean;
}

export interface Decision {
  action: KeyAction;
  viewerId: string;
  keyword: string;
}

interface Options {
  commands: EngineCommand[];
  actionsPerSecond: number;
  now?: () => number;
  newId?: () => string;
}

// Anarchy: every matching comment fires, limited by per-viewer cooldowns and a global rate.
export function createAnarchy({ commands, actionsPerSecond, now = Date.now, newId = () => crypto.randomUUID() }: Options) {
  const byKeyword = new Map(commands.filter((c) => c.enabled).map((c) => [c.keyword, c]));
  const lastFired = new Map<string, number>(); // `${viewerId}:${keyword}` -> time
  const recent: number[] = []; // fire times within the last second

  return {
    handle(event: ViewerEvent): Decision | null {
      if (event.kind !== 'comment') return null;
      const keyword = event.text.trim().toLowerCase();
      const command = byKeyword.get(keyword);
      if (!command) return null;

      const t = now();
      const cooldownKey = `${event.viewerId}:${keyword}`;
      const last = lastFired.get(cooldownKey);
      if (last !== undefined && t - last < command.cooldownMs) return null;

      while (recent.length > 0 && t - recent[0]! >= 1000) recent.shift();
      if (recent.length >= actionsPerSecond) return null;

      recent.push(t);
      lastFired.set(cooldownKey, t);
      return {
        action: { id: newId(), key: command.key, holdMs: command.holdMs },
        viewerId: event.viewerId,
        keyword,
      };
    },
  };
}
