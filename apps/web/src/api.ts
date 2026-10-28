// Thin JSON client for the Fluxion API. Same origin, so the session cookie rides along.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? data.message ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

import type { LeaderboardEntry, Mode } from '@fluxion/shared';

export type { LeaderboardEntry, Mode };

export interface Host {
  id: string;
  email: string;
  tiktokUsername: string | null;
  overlayToken: string;
  actionsPerSecond: number;
  progression: boolean;
  levelGating: boolean;
  // Active profile
  profileId: string;
  profileName: string;
  mode: Mode;
  voteWindowMs: number;
  turnMs: number;
  giftBoosts: boolean;
}

export interface Command {
  id: string;
  keyword: string;
  key: string;
  holdMs: number;
  cooldownMs: number;
  enabled: boolean;
  minLevel: number;
}

export interface Profile {
  id: string;
  name: string;
  gameProcess: string | null;
  active: boolean;
}

export interface GiftTrigger {
  id: string;
  giftName: string;
  commandId: string;
  keyword: string;
}

export interface Companion {
  id: string;
  name: string;
  lastSeenAt: string | null;
}

export interface LiveStatus {
  live: boolean;
  source?: 'tiktok' | 'simulated';
  mode?: Mode;
  companionsOnline: number;
}
