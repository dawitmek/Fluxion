import type { AlertEvent, AlertSound, ServerToOverlay, TtsMode, ViewerEvent } from '@fluxion/shared';

export interface AlertRule {
  event: AlertEvent;
  giftName: string | null; // lowercase; null matches any gift
  likeStep: number | null;
  template: string;
  sound: AlertSound | null;
  speak: boolean;
  enabled: boolean;
}

export interface TtsConfig {
  mode: TtsMode;
  prefix: string;
  maxLength: number;
  cooldownMs: number;
  minLevel: number;
  blockedWords: string[]; // lowercase
  voice: string | null;
}

// Read on every call, so dashboard edits apply mid-stream.
export interface AlertContext {
  config: { rules: AlertRule[]; tts: TtsConfig; progression: boolean };
  now: () => number;
  levelOf: (viewerId: string) => number;
  isCommand: (text: string) => boolean; // game commands are never read aloud
}

const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;

export function fillTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

// Parses the dashboard's comma-separated blocked words.
export function parseBlockedWords(list: string): string[] {
  return list
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

function containsBlocked(text: string, blocked: string[]) {
  const lower = text.toLowerCase();
  const words = new Set(lower.split(/[^\p{L}\p{N}']+/u));
  // Single words match whole words only (so "ass" doesn't block "class"); phrases match anywhere.
  return blocked.some((b) => (b.includes(' ') ? lower.includes(b) : words.has(b)));
}

// Turns viewer events into overlay alerts and text-to-speech. One instance per live session.
export function createAlerts(ctx: AlertContext) {
  let totalLikes = 0;
  const lastSpoke = new Map<string, number>(); // viewerId -> time

  const alert = (rule: AlertRule, values: Record<string, string | number>): ServerToOverlay => ({
    type: 'alert',
    text: fillTemplate(rule.template, values),
    sound: rule.sound,
    speak: rule.speak,
    voice: ctx.config.tts.voice,
  });
  const rulesFor = (event: AlertEvent) => ctx.config.rules.filter((r) => r.enabled && r.event === event);

  function tts(event: Extract<ViewerEvent, { kind: 'comment' }>): ServerToOverlay | null {
    const cfg = ctx.config.tts;
    let text = event.text.trim();
    const prefixed = cfg.prefix !== '' && text.toLowerCase().startsWith(cfg.prefix.toLowerCase());
    if (cfg.mode === 'off' || (cfg.mode === 'prefix' && !prefixed)) return null;
    if (prefixed) text = text.slice(cfg.prefix.length);
    else if (ctx.isCommand(text)) return null;

    text = text.replace(LINK, ' ').replace(/\s+/g, ' ').trim().slice(0, cfg.maxLength).trim();
    if (!text || containsBlocked(text, cfg.blockedWords)) return null;
    if (ctx.config.progression && ctx.levelOf(event.viewerId) < cfg.minLevel) return null;
    const last = lastSpoke.get(event.viewerId);
    if (last !== undefined && ctx.now() - last < cfg.cooldownMs) return null;
    lastSpoke.set(event.viewerId, ctx.now());
    return { type: 'tts', viewer: event.viewerId, text, voice: cfg.voice };
  }

  return {
    handle(event: ViewerEvent): ServerToOverlay[] {
      switch (event.kind) {
        case 'comment': {
          const message = tts(event);
          return message ? [message] : [];
        }
        case 'follow':
        case 'share':
          return rulesFor(event.kind).map((r) => alert(r, { viewer: event.viewerId }));
        case 'gift': {
          const gift = event.giftName.trim().toLowerCase();
          const rules = rulesFor('gift');
          // A rule for this exact gift replaces the catch-all ones.
          const specific = rules.filter((r) => r.giftName === gift);
          const matched = specific.length > 0 ? specific : rules.filter((r) => r.giftName === null);
          return matched.map((r) => alert(r, { viewer: event.viewerId, count: event.count, gift: event.giftName }));
        }
        case 'like': {
          const before = totalLikes;
          totalLikes += event.count;
          return rulesFor('likes').flatMap((r) => {
            const step = r.likeStep ?? 0;
            if (step <= 0 || Math.floor(before / step) === Math.floor(totalLikes / step)) return [];
            return [alert(r, { viewer: event.viewerId, total: Math.floor(totalLikes / step) * step, count: event.count })];
          });
        }
      }
    },
  };
}
