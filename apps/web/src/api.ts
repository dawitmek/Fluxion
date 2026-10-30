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

import type {
  ActionTrigger,
  AlertPosition,
  AlertSound,
  AlertStyle,
  Audience,
  Goal,
  CloudProvider,
  LeaderboardEntry,
  MediaItem,
  Mode,
  OverlayScreen,
  Speech,
  TtsEngine,
  TtsMode,
  UiTheme,
  UiThemeStyle,
  VoiceEffect,
} from '@fluxion/shared';

export type { ActionTrigger, AlertPosition, AlertSound, Audience, Goal, CloudProvider, LeaderboardEntry, MediaItem, Mode, Speech, TtsEngine, TtsMode, VoiceEffect };

// Sends a file as the raw request body; the server works out what it is.
export async function uploadMedia(file: File): Promise<MediaItem> {
  const res = await fetch(`/api/media?name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, '') || file.name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = res.status === 413 && !data.error ? 'That file is over 10 MB' : (data.error ?? `Upload failed (${res.status})`);
    throw new ApiError(message, res.status);
  }
  return data as MediaItem;
}

export interface Host {
  id: string;
  email: string;
  tiktokUsername: string | null;
  overlayToken: string;
  actionsPerSecond: number;
  progression: boolean;
  levelGating: boolean;
  points: boolean;
  pointsPerChat: number;
  pointsPerDiamond: number;
  pointsPerFollow: number;
  pointsPerShare: number;
  pointsCheck: boolean;
  ttsMode: TtsMode;
  ttsPrefix: string;
  ttsMaxLength: number;
  ttsCooldownMs: number;
  ttsMinLevel: number;
  ttsBlockedWords: string;
  ttsVoice: string | null;
  ttsEngine: TtsEngine;
  ttsEspeakVoice: string;
  ttsPiperVoice: string | null;
  ttsPiperSpeaker: number | null;
  ttsEffect: VoiceEffect;
  ttsVolume: number; // percent
  ttsCloudProvider: CloudProvider | null;
  ttsCloudKeySet: boolean;
  ttsCloudRegion: string | null;
  ttsCloudVoice: string | null;
  ttsTiktokVoice: string | null;
  ttsTiktokConnected: boolean;
  uiTheme: UiTheme;
  uiThemeStyle: UiThemeStyle;
  alertStyle: AlertStyle | null; // the look of alerts whose action has none; null: DEFAULT_ALERT_STYLE
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
  cost: number;
}

export interface Action {
  id: string;
  profileId: string | null; // null: every profile
  name: string;
  enabled: boolean;
  trigger: ActionTrigger;
  giftName: string | null;
  minDiamonds: number | null;
  likeStep: number | null;
  command: string | null;
  goalId: string | null;
  audience: Audience;
  audienceViewer: string | null;
  cooldownMs: number;
  viewerCooldownMs: number;
  random: boolean;
  text: string | null;
  sound: AlertSound | null;
  soundMediaId: string | null;
  mediaId: string | null;
  speak: boolean;
  durationMs: number;
  alertX: number | null; // with alertY: where the alert's middle sits, in percent; null: the screen's alert position
  alertY: number | null;
  alertScale: number; // percent
  alertStyle: AlertStyle | null; // null: DEFAULT_ALERT_STYLE
  keyCommandId: string | null;
  repeatWithCount: boolean;
  points: number;
  screenId: string | null;
}

export type Screen = OverlayScreen & { token: string };

export interface Profile {
  id: string;
  name: string;
  gameProcess: string | null;
  active: boolean;
}

export interface Companion {
  id: string;
  name: string;
  lastSeenAt: string | null;
  hostname: string | null; // the PC's own name, as the companion reports it
  platform: string | null;
}

export interface LiveStatus {
  live: boolean;
  source?: 'tiktok' | 'simulated';
  mode?: Mode;
  startedAt?: number; // server clock, ms
  companionsOnline: number;
}
