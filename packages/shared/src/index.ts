// The contract between server, web, and companion. Bump PROTOCOL_VERSION on breaking changes.
export const PROTOCOL_VERSION = 1;

export * from './keys.js';

// Platform-neutral events produced by a platform adapter (TikTok first).
export type ViewerEvent =
  | { kind: 'comment'; viewerId: string; text: string; at: number }
  | { kind: 'gift'; viewerId: string; giftId: number; giftName: string; count: number; at: number }
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

export type ServerToCompanion =
  | { type: 'ready'; hostId: string }
  | { type: 'error'; reason: string }
  | { type: 'action'; action: KeyAction };

// Server -> overlay, over /ws/overlay. Read-only.
export type ServerToOverlay =
  | { type: 'command'; viewer: string; keyword: string; at: number }
  | { type: 'live'; state: 'started' | 'stopped' };
