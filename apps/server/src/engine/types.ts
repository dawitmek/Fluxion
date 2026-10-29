import type { KeyAction, ModeState, ViewerEvent } from '@fluxion/shared';

export interface EngineCommand {
  keyword: string; // lowercase
  key: string;
  holdMs: number;
  cooldownMs: number;
  enabled: boolean;
  minLevel: number;
  cost: number; // points
}

export interface GiftTrigger {
  giftName: string; // lowercase
  keyword: string;
}

// Read on every call, so settings and command edits apply mid-stream without losing votes or the queue.
export interface EngineConfig {
  commands: EngineCommand[];
  giftTriggers: GiftTrigger[];
  actionsPerSecond: number;
  voteWindowMs: number;
  turnMs: number;
  giftBoosts: boolean;
  levelGating: boolean; // commands with minLevel above a viewer's level ignore them
  points: boolean; // commands that cost more points than a viewer has ignore them
}

export interface EngineContext {
  config: EngineConfig;
  now: () => number;
  newId: () => string;
  levelOf: (viewerId: string) => number;
  pointsOf: (viewerId: string) => number;
  // Reports what the engine decided not to do, and mode moments, for stream analytics:
  // refused {keyword, reason}, vote {winner, votes, total, voters, margin}, queue_join, turn {waitedMs}.
  note?: (kind: 'refused' | 'vote' | 'queue_join' | 'turn', viewer: string | null, data?: Record<string, unknown>) => void;
}

export interface Decision {
  action: KeyAction;
  keyword: string;
  viewer: string; // shown on the overlay
  credit: string[]; // viewer ids whose command count goes up, and who pay its cost
  cost: number; // points each credited viewer pays
  delayMs?: number;
}

export interface Engine {
  handle(event: ViewerEvent): Decision[];
  // Called a few times a second for time-based modes (vote windows, turns).
  tick(): Decision[];
  state(): ModeState;
}
