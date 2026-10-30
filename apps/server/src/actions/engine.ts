import { MAX_KEY_REPEATS, type ActionTrigger, type AlertSound, type Audience, type Badge, type MediaKind, type TtsMode, type ViewerEvent } from '@fluxion/shared';

// An action as the engine needs it, loaded for the active profile.
export interface ActionRule {
  id: string;
  trigger: ActionTrigger;
  giftName: string | null; // lowercase; null matches any gift
  minDiamonds: number | null;
  likeStep: number | null;
  command: string | null; // lowercase
  goalId: string | null;
  audience: Audience;
  audienceViewer: string | null;
  cooldownMs: number;
  viewerCooldownMs: number;
  random: boolean;
  text: string | null;
  sound: AlertSound | null;
  soundMediaId: string | null;
  media: { id: string; kind: MediaKind } | null;
  speak: boolean;
  durationMs: number;
  alertPos: { x: number; y: number } | null; // placed by hand; null: the screen's alert position
  alertScale: number;
  keyword: string | null; // the key press's command, when it's in the active profile and on
  repeatWithCount: boolean;
  points: number;
  screenId: string | null;
  enabled: boolean;
}

export interface TtsConfig {
  mode: TtsMode;
  prefix: string;
  maxLength: number;
  cooldownMs: number;
  minLevel: number;
  blockedWords: string[]; // lowercase
}

// What to do. The session manager turns `speak` and `tts` into audio with the host's TTS engine, key presses
// into companion actions, and points into the viewer's balance.
export type ActionOutput =
  | {
      type: 'alert';
      action: string; // its id
      text: string;
      sound: AlertSound | null;
      soundFile: string | null;
      media: { id: string; kind: MediaKind } | null;
      speak: boolean;
      durationMs: number;
      screen: string | null;
      pos: { x: number; y: number } | null;
      scale: number;
    }
  | { type: 'tts'; viewer: string; text: string }
  | { type: 'key'; keyword: string; viewer: string; repeats: number }
  | { type: 'points'; viewer: string; amount: number };

// Read on every call, so dashboard edits apply mid-stream.
export interface ActionContext {
  config: { actions: ActionRule[]; tts: TtsConfig; progression: boolean; points: boolean };
  now: () => number;
  levelOf: (viewerId: string) => number;
  isCommand: (text: string) => boolean; // game commands are never read aloud
  topGifters: () => string[]; // highest first
  random?: () => number; // tests pin it
}

const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;
const TOP_GIFTERS = 3;

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

export const showsAlert = (a: Pick<ActionRule, 'text' | 'sound' | 'soundMediaId' | 'media'>) =>
  !!(a.text || a.sound || a.soundMediaId || a.media);

// A chat message's command and the rest of it, if it is one of the command actions'.
function commandIn(text: string, command: string): string | null {
  const lower = text.trim().toLowerCase();
  if (lower === command) return '';
  return lower.startsWith(`${command} `) ? text.trim().slice(command.length + 1).trim() : null;
}

// Turns viewer events into actions and chat text-to-speech. One instance per live session.
export function createActions(ctx: ActionContext) {
  let totalLikes = 0;
  const lastSpoke = new Map<string, number>(); // viewerId -> time
  const lastRun = new Map<string, number>(); // actionId -> time
  const lastRunFor = new Map<string, number>(); // `${actionId}:${viewerId}` -> time
  const seen = new Set<string>(); // viewers who did something this stream, for first_activity
  const badges = new Map<string, Set<Badge>>(); // the latest the platform told us, per viewer

  function tts(event: Extract<ViewerEvent, { kind: 'comment' }>): ActionOutput | null {
    const cfg = ctx.config.tts;
    let text = event.text.trim();
    const prefixed = cfg.prefix !== '' && text.toLowerCase().startsWith(cfg.prefix.toLowerCase());
    if (cfg.mode === 'off' || (cfg.mode === 'prefix' && !prefixed)) return null;
    if (prefixed) text = text.slice(cfg.prefix.length);
    else if (ctx.isCommand(text) || ctx.config.actions.some((a) => a.enabled && a.command && commandIn(text, a.command) !== null)) return null;

    text = text.replace(LINK, ' ').replace(/\s+/g, ' ').trim().slice(0, cfg.maxLength).trim();
    if (!text || containsBlocked(text, cfg.blockedWords)) return null;
    if (ctx.config.progression && ctx.levelOf(event.viewerId) < cfg.minLevel) return null;
    const last = lastSpoke.get(event.viewerId);
    if (last !== undefined && ctx.now() - last < cfg.cooldownMs) return null;
    lastSpoke.set(event.viewerId, ctx.now());
    return { type: 'tts', viewer: event.viewerId, text };
  }

  function remember(event: ViewerEvent) {
    const known = badges.get(event.viewerId) ?? new Set<Badge>();
    if (event.badges) {
      known.clear();
      for (const b of event.badges) known.add(b);
    }
    if (event.kind === 'follow') known.add('follower');
    if (event.kind === 'subscribe') known.add('subscriber');
    badges.set(event.viewerId, known);
  }

  // Viewers the platform hasn't described yet only count as "everyone".
  function inAudience(action: ActionRule, viewer: string) {
    switch (action.audience) {
      case 'everyone':
        return true;
      case 'followers':
        return badges.get(viewer)?.has('follower') ?? false;
      case 'subscribers':
        return badges.get(viewer)?.has('subscriber') ?? false;
      case 'moderators':
        return badges.get(viewer)?.has('moderator') ?? false;
      case 'top_gifters':
        return ctx.topGifters().slice(0, TOP_GIFTERS).includes(viewer);
      case 'viewer':
        return action.audienceViewer?.toLowerCase() === viewer.toLowerCase();
    }
  }

  const coolingDown = (action: ActionRule, viewer: string) => {
    const t = ctx.now();
    const last = lastRun.get(action.id);
    const lastFor = lastRunFor.get(`${action.id}:${viewer}`);
    return (last !== undefined && t - last < action.cooldownMs) || (lastFor !== undefined && t - lastFor < action.viewerCooldownMs);
  };

  // The actions this event triggers, with their template values.
  function matching(event: ViewerEvent, firstActivity: boolean): { action: ActionRule; values: Record<string, string | number>; alert: boolean }[] {
    const values: Record<string, string | number> = { viewer: event.viewerId };
    const on = (trigger: ActionTrigger) => ctx.config.actions.filter((a) => a.enabled && a.trigger === trigger);
    const all = (list: ActionRule[]) => list.map((action) => ({ action, values, alert: true }));
    const found = firstActivity ? all(on('first_activity')) : [];

    switch (event.kind) {
      case 'follow':
      case 'share':
      case 'join':
        return [...found, ...all(on(event.kind))];
      case 'emote':
        return [...found, ...all(on('emote'))];
      case 'subscribe':
        values.months = event.months;
        return [...found, ...all(on('subscribe'))];
      case 'gift': {
        const gift = event.giftName.trim().toLowerCase();
        // {coins} is the placeholder the dashboard shows; {diamonds} still works in text written before the rename.
        const coins = event.count * event.diamonds;
        Object.assign(values, { count: event.count, gift: event.giftName, coins, diamonds: coins });
        const candidates = on('gift').filter(
          (a) => (a.giftName === null || a.giftName === gift) && (a.minDiamonds === null || event.count * event.diamonds >= a.minDiamonds),
        );
        // An alert for this exact gift replaces the any-gift ones; their key presses and points still happen.
        const specificAlert = candidates.some((a) => a.giftName === gift && showsAlert(a));
        return [...found, ...candidates.map((action) => ({ action, values, alert: !(specificAlert && action.giftName === null) }))];
      }
      case 'like': {
        const before = totalLikes;
        totalLikes += event.count;
        values.count = event.count;
        return [
          ...found,
          ...on('likes').flatMap((action) => {
            const step = action.likeStep ?? 0;
            if (step <= 0 || Math.floor(before / step) === Math.floor(totalLikes / step)) return [];
            return [{ action, values: { ...values, total: Math.floor(totalLikes / step) * step }, alert: true }];
          }),
        ];
      }
      case 'comment':
        return [
          ...found,
          ...on('command').flatMap((action) => {
            const rest = action.command ? commandIn(event.text, action.command) : null;
            return rest === null ? [] : [{ action, values: { ...values, text: rest }, alert: true }];
          }),
        ];
    }
  }

  function run(action: ActionRule, event: ViewerEvent, values: Record<string, string | number>, alert: boolean): ActionOutput[] {
    const viewer = event.viewerId;
    lastRun.set(action.id, ctx.now());
    lastRunFor.set(`${action.id}:${viewer}`, ctx.now());
    const out: ActionOutput[] = [];
    if (alert && showsAlert(action)) {
      out.push({
        type: 'alert',
        action: action.id,
        text: action.text ? fillTemplate(action.text, values) : '',
        sound: action.sound,
        soundFile: action.soundMediaId,
        media: action.media,
        speak: action.speak && !!action.text,
        durationMs: action.durationMs,
        screen: action.screenId,
        pos: action.alertPos,
        scale: action.alertScale,
      });
    }
    if (action.keyword) {
      const repeats = action.repeatWithCount && event.kind === 'gift' ? Math.min(Math.max(event.count, 1), MAX_KEY_REPEATS) : 1;
      out.push({ type: 'key', keyword: action.keyword, viewer, repeats });
    }
    if (ctx.config.points && action.points > 0) out.push({ type: 'points', viewer, amount: action.points });
    return out;
  }

  return {
    handle(event: ViewerEvent): ActionOutput[] {
      remember(event);
      const firstActivity = event.kind !== 'join' && !seen.has(event.viewerId);
      if (event.kind !== 'join') seen.add(event.viewerId);

      const out = select(event, matching(event, firstActivity));
      if (event.kind === 'comment') {
        const message = tts(event);
        if (message) out.push(message);
      }
      return out;
    },

    // A goal was reached by `event` (whoever pushed it over).
    goalReached(goal: { id: string; name: string; target: number }, event: ViewerEvent): ActionOutput[] {
      const values = { viewer: event.viewerId, goal: goal.name, target: goal.target };
      const actions = ctx.config.actions.filter((a) => a.enabled && a.trigger === 'goal' && a.goalId === goal.id);
      return select(event, actions.map((action) => ({ action, values, alert: true })));
    },
  };

  function select(event: ViewerEvent, matched: ReturnType<typeof matching>): ActionOutput[] {
    const eligible = matched.filter(({ action }) => inAudience(action, event.viewerId) && !coolingDown(action, event.viewerId));
    // Of the random ones, one runs.
    const randoms = eligible.filter((m) => m.action.random);
    const picked = randoms[Math.floor((ctx.random ?? Math.random)() * randoms.length)];
    const chosen = eligible.filter((m) => !m.action.random || m === picked);
    return chosen.flatMap(({ action, values, alert }) => run(action, event, values, alert));
  }
}


