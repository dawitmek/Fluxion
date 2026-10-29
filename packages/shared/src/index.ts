// The contract between server, web, and companion. Bump PROTOCOL_VERSION on breaking changes.
export const PROTOCOL_VERSION = 1;

export * from './keys.js';

// Platform-neutral events produced by a platform adapter (TikTok first).
export type ViewerEvent =
  | { kind: 'comment'; viewerId: string; text: string; at: number }
  | { kind: 'gift'; viewerId: string; giftId: number; giftName: string; count: number; diamonds: number; at: number } // diamonds per gift
  | { kind: 'like'; viewerId: string; count: number; at: number }
  | { kind: 'follow'; viewerId: string; at: number }
  | { kind: 'share'; viewerId: string; at: number }
  | { kind: 'join'; viewerId: string; at: number };

// A key press the server asks the companion to perform. The companion enforces its own whitelist.
export interface KeyAction {
  id: string;
  key: string; // e.g. "KeyA", "Space" (KeyboardEvent.code names)
  holdMs: number;
}

// Companion <-> server, over /ws/companion.
export type CompanionToServer =
  // hostname and platform describe the PC (older companions leave them out).
  | { type: 'hello'; token: string; protocol: number; hostname?: string; platform?: string }
  | { type: 'ack'; id: string; status: 'done' | 'rejected'; reason?: string };

// `profile` tells the companion which game to target (null: keep the host's own choice).
// Older companions ignore message types they don't know, so this needs no protocol bump.
export type ServerToCompanion =
  | { type: 'ready'; hostId: string }
  | { type: 'error'; reason: string }
  | { type: 'action'; action: KeyAction }
  | { type: 'profile'; name: string; gameProcess: string | null }
  // The active profile's commands, so the companion can show them and ask for its own OK on key combinations.
  // Sent on connect and whenever commands or the active profile change.
  | { type: 'commands'; commands: { keyword: string; key: string; enabled: boolean }[] };

// Crowd-control modes. The host picks one and can switch while live.
export const MODES = ['anarchy', 'democracy', 'queue', 'gift'] as const;
export type Mode = (typeof MODES)[number];

// In queue mode, a viewer types this to join the line.
export const QUEUE_JOIN = 'join';
// Typed in chat to see your points on the overlay, when the host allows it.
export const POINTS_CHECK = '!points';

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
  points: number; // spendable balance
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

// Alerts: on-stream banners with a built-in sound, optionally read aloud.
export const ALERT_EVENTS = ['follow', 'share', 'gift', 'likes'] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];
// Synthesized in the overlay, so there are no audio files to host.
export const ALERT_SOUNDS = ['chime', 'coin', 'pop', 'fanfare', 'whoosh'] as const;
export type AlertSound = (typeof ALERT_SOUNDS)[number];
// Template placeholders: {viewer}, {count}, {gift}, {total}.

export const TTS_MODES = ['off', 'prefix', 'all'] as const;
export type TtsMode = (typeof TTS_MODES)[number];

// Where speech is made. Only browser voices bypass OBS's audio capture; the others play through Web Audio.
//   piper:   natural voices generated on the server (falls back to espeak if the server has no Piper)
//   espeak:  robotic voice synthesized inside the overlay (WebAssembly), many languages
//   tiktok:  TikTok's own voices, called by the server with the host's TikTok session (signed in via the companion)
//   cloud:   the host's own Google / Azure / ElevenLabs key, called by the server
//   browser: the browser's built-in voices (plays outside OBS's mixer)
export const TTS_ENGINES = ['piper', 'espeak', 'tiktok', 'cloud', 'browser'] as const;
export type TtsEngine = (typeof TTS_ENGINES)[number];
export const CLOUD_PROVIDERS = ['google', 'azure', 'elevenlabs'] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

// TikTok's text-to-speech voices, by the speaker id TikTok's API takes. The first is the default.
export const TIKTOK_VOICES = [
  { id: 'en_us_001', label: 'Female (US)' },
  { id: 'en_us_002', label: 'Jessie (US)' },
  { id: 'en_us_006', label: 'Joey (US)' },
  { id: 'en_us_007', label: 'Professor (US)' },
  { id: 'en_us_009', label: 'Scientist (US)' },
  { id: 'en_us_010', label: 'Confidence (US)' },
  { id: 'en_uk_001', label: 'Narrator (UK)' },
  { id: 'en_uk_003', label: 'Male (UK)' },
  { id: 'en_au_001', label: 'Metro (Australia)' },
  { id: 'en_au_002', label: 'Smooth (Australia)' },
  { id: 'en_male_narration', label: 'Story teller' },
  { id: 'en_male_funny', label: 'Wacky' },
  { id: 'en_female_emotional', label: 'Peaceful' },
  { id: 'en_us_ghostface', label: 'Ghost face' },
  { id: 'en_us_chewbacca', label: 'Chewbacca' },
  { id: 'en_us_c3po', label: 'C-3PO' },
  { id: 'en_us_stitch', label: 'Stitch' },
  { id: 'en_us_stormtrooper', label: 'Stormtrooper' },
  { id: 'en_us_rocket', label: 'Rocket' },
  { id: 'fr_001', label: 'French, male 1' },
  { id: 'fr_002', label: 'French, male 2' },
  { id: 'de_001', label: 'German, female' },
  { id: 'de_002', label: 'German, male' },
  { id: 'es_002', label: 'Spanish, male' },
  { id: 'es_mx_002', label: 'Spanish (Mexico), male' },
  { id: 'br_003', label: 'Portuguese (Brazil), female' },
  { id: 'br_005', label: 'Portuguese (Brazil), male' },
  { id: 'id_001', label: 'Indonesian, female' },
  { id: 'jp_001', label: 'Japanese, female' },
  { id: 'jp_006', label: 'Japanese, male' },
  { id: 'kr_002', label: 'Korean, male' },
  { id: 'kr_003', label: 'Korean, female' },
] as const;

// Applied by the overlay to any voice. Browser voices only get the pitch/speed part.
export const VOICE_EFFECTS = ['none', 'chipmunk', 'deep', 'monster', 'robot', 'radio', 'echo'] as const;
export type VoiceEffect = (typeof VOICE_EFFECTS)[number];

// How the overlay should say something.
export type Speech = (
  | { kind: 'audio'; data: string; mime: string } // base64, from Piper, TikTok or a cloud provider
  | { kind: 'espeak'; text: string; voice: string }
  | { kind: 'browser'; text: string; voice: string | null }
) & { effect?: VoiceEffect };

// Server -> overlay, over /ws/overlay. Read-only.
export type ServerToOverlay =
  | { type: 'command'; viewer: string; keyword: string; at: number; level?: number } // level: progression on
  | { type: 'live'; state: 'started' | 'stopped' }
  | { type: 'mode'; state: ModeState; serverNow: number } // serverNow lets the overlay correct for clock skew
  | { type: 'leaderboard'; entries: LeaderboardEntry[]; progression: boolean }
  | { type: 'levelUp'; viewer: string; level: number }
  | { type: 'points'; viewer: string; points: number } // answers a viewer's !points
  | { type: 'alert'; text: string; sound: AlertSound | null; speech: Speech | null }
  | { type: 'tts'; viewer: string; text: string; speech: Speech };

// What's recorded during a stream: what viewers did, and what Fluxion did in response.
//   comment {text}, gift {gift, count, diamonds}, like {count}, follow, share, join: viewer interactions
//   command {keyword, via: 'chat' | 'vote' | 'gift'}: a key press fired (viewer is null for a vote's winner)
//   refused {keyword, reason}: a command that matched but didn't fire (cooldown, rate limit, level, points, not their turn)
//   level {level}, vote {winner, votes, total, voters, margin}, queue_join, turn {waitedMs}
export type ActivityKind =
  | 'comment' | 'gift' | 'like' | 'follow' | 'share' | 'join'
  | 'command' | 'refused' | 'level' | 'vote' | 'queue_join' | 'turn';

export interface StreamEvent {
  id: number;
  at: number;
  kind: ActivityKind;
  viewer: string | null;
  data: Record<string, unknown>;
}

export interface StreamSummary {
  id: string;
  source: 'tiktok' | 'simulated';
  profileName: string;
  tiktokUsername: string | null; // the TikTok account streamed from
  startedAt: number;
  endedAt: number | null; // null while live
  participants: number; // viewers who chatted or gifted
  newParticipants: number; // ... for the first time on any of the host's streams
  comments: number;
  commands: number;
  gifts: number;
  diamonds: number;
  follows: number;
  joins: number;
  topCommand: string | null;
  topPlayer: string | null;
}

export interface StreamDetail {
  summary: StreamSummary;
  perMinute: { minute: number; commands: number; comments: number }[]; // minute 0 is the stream's first
  markers: { at: number; kind: 'gift' | 'follow' | 'level'; viewer: string | null; label: string }[];
  commandUsage: { keyword: string; fired: number; refused: number; reasons: Record<string, number> }[];
  peaks: { start: number; end: number; events: number }[]; // busiest two-minute windows, busiest first
  gifts: { byGift: { gift: string; count: number; diamonds: number }[]; perHour: { hour: number; diamonds: number }[] };
  modes: {
    votes: { rounds: number; avgVoters: number; closeRounds: number }; // close: won by one vote or a tie
    queue: { joins: number; turns: number; avgWaitMs: number };
  };
}

// One viewer across the host's streams (optionally one TikTok account's).
export interface ViewerProfile {
  viewer: string;
  firstSeen: number | null;
  lastSeen: number | null;
  streams: number; // streams they showed up in
  comments: number;
  commands: number;
  gifts: number;
  diamonds: number;
  xp: number; // leaderboard XP, across all of the host's streams
  points: number; // spendable balance
  level: number;
  topCommands: { keyword: string; count: number }[];
  perStream: {
    streamId: string;
    startedAt: number;
    source: 'tiktok' | 'simulated';
    tiktokUsername: string | null;
    comments: number;
    commands: number;
    diamonds: number;
  }[];
}

// An event with the stream it happened in, for a viewer's history across streams.
export type ViewerHistoryEvent = StreamEvent & { streamId: string; streamStartedAt: number };
