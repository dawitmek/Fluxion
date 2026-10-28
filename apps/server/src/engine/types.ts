import type { KeyAction, ModeState, ViewerEvent } from '@fluxion/shared';

export interface EngineCommand {
  keyword: string; // lowercase
  key: string;
  holdMs: number;
  cooldownMs: number;
  enabled: boolean;
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
}

export interface EngineContext {
  config: EngineConfig;
  now: () => number;
  newId: () => string;
}

export interface Decision {
  action: KeyAction;
  keyword: string;
  viewer: string; // shown on the overlay
  credit: string[]; // viewer ids whose command count goes up
  delayMs?: number;
}

export interface Engine {
  handle(event: ViewerEvent): Decision[];
  // Called a few times a second for time-based modes (vote windows, turns).
  tick(): Decision[];
  state(): ModeState;
}
