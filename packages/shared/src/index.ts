// The contract between server, web, and companion. Bump PROTOCOL_VERSION on breaking changes.
export const PROTOCOL_VERSION = 1;

export * from './keys.js';

// Platform-neutral events produced by a platform adapter (TikTok first).
export type ViewerEvent =
  | { kind: 'comment'; viewerId: string; text: string; at: number }
  | { kind: 'gift'; viewerId: string; giftId: number; giftName: string; count: number; diamonds: number; at: number } // diamonds per gift
  | { kind: 'like'; viewerId: string; count: number; at: number }
  | { kind: 'follow'; viewerId: string; at: number }
  | { kind: 'share'; viewerId: string; at: number };

// A key press the server asks the companion to perform. The companion enforces its own whitelist.
export interface KeyAction {
  id: string;
  key: string; // e.g. "KeyA", "Space" (KeyboardEvent.code names)
  holdMs: number;
}

// Companion <-> server, over /ws/companion.
export type CompanionToServer =
  | { type: 'hello'; token: string; protocol: number }
  | { type: 'ack'; id: string; status: 'done' | 'rejected'; reason?: string };

// `profile` tells the companion which game to target (null: keep the host's own choice).
// Older companions ignore message types they don't know, so this needs no protocol bump.
export type ServerToCompanion =
  | { type: 'ready'; hostId: string }
  | { type: 'error'; reason: string }
  | { type: 'action'; action: KeyAction }
  | { type: 'profile'; name: string; gameProcess: string | null };

// Crowd-control modes. The host picks one and can switch while live.
export const MODES = ['anarchy', 'democracy', 'queue', 'gift'] as const;
export type Mode = (typeof MODES)[number];

// In queue mode, a viewer types this to join the line.
export const QUEUE_JOIN = 'join';

// What the overlay shows for the current mode. Times are server-clock milliseconds.
export type ModeState =
  | { mode: 'anarchy' }
  | { mode: 'gift' }
  | { mode: 'democracy'; tally: { keyword: string; votes: number }[]; endsAt: number | null }
  | { mode: 'queue'; viewer: string | null; endsAt: number | null; queue: string[] };

export interface LeaderboardEntry {
  viewer: string;
  commands: number;
  gifts: number;
  xp: number;
}

// Viewer progression. XP: 1 per command that fires, plus each gift's diamond value (at least 1).
export const XP_PER_COMMAND = 1;
export const MAX_LEVEL = 99;

// Level n needs 10·(n-1)² XP: level 2 at 10, 3 at 40, 4 at 90, 5 at 160...
export function levelForXp(xp: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 10)) + 1);
}

export function xpForLevel(level: number): number {
  return 10 * (level - 1) ** 2;
}

// Server -> overlay, over /ws/overlay. Read-only.
export type ServerToOverlay =
  | { type: 'command'; viewer: string; keyword: string; at: number; level?: number } // level: progression on
  | { type: 'live'; state: 'started' | 'stopped' }
  | { type: 'mode'; state: ModeState; serverNow: number } // serverNow lets the overlay correct for clock skew
  | { type: 'leaderboard'; entries: LeaderboardEntry[]; progression: boolean }
  | { type: 'levelUp'; viewer: string; level: number };
