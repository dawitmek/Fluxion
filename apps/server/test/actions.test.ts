import { describe, expect, it } from 'vitest';
import { MAX_KEY_REPEATS, type ViewerEvent } from '@fluxion/shared';
import { createActions, fillTemplate, parseBlockedWords, type ActionContext, type ActionRule, type TtsConfig } from '../src/actions/engine.js';

let nextId = 0;
const rule = (r: Partial<ActionRule> & Pick<ActionRule, 'trigger'>): ActionRule => ({
  id: `a${nextId++}`,
  giftName: null,
  minDiamonds: null,
  likeStep: null,
  command: null,
  goalId: null,
  audience: 'everyone',
  audienceViewer: null,
  cooldownMs: 0,
  viewerCooldownMs: 0,
  random: false,
  text: null,
  sound: 'chime',
  soundMediaId: null,
  media: null,
  speak: false,
  durationMs: 5000,
  keyword: null,
  repeatWithCount: false,
  points: 0,
  screenId: null,
  enabled: true,
  ...r,
});

const baseTts: TtsConfig = { mode: 'prefix', prefix: '!tts', maxLength: 150, cooldownMs: 0, minLevel: 1, blockedWords: [] };

function setup(
  actions: ActionRule[],
  tts: Partial<TtsConfig> = {},
  levels: Record<string, number> = {},
  progression = false,
  extra: Partial<ActionContext> = {},
) {
  let t = 0;
  const ctx: ActionContext = {
    config: { actions, tts: { ...baseTts, ...tts }, progression, points: true },
    now: () => t,
    levelOf: (v) => levels[v] ?? 1,
    isCommand: (text) => ['left', 'join'].includes(text.trim().toLowerCase()),
    topGifters: () => [],
    ...extra,
  };
  const engine = createActions(ctx);
  const say = (viewerId: string, text: string, badges?: ViewerEvent['badges']) =>
    engine.handle({ kind: 'comment', viewerId, text, at: 0, ...(badges && { badges }) });
  // The text spoken for a comment, or null.
  const spoken = (viewerId: string, text: string) => {
    const m = say(viewerId, text).find((o) => o.type === 'tts');
    return m?.type === 'tts' ? m.text : null;
  };
  return { engine, ctx, say, spoken, advance: (ms: number) => (t += ms) };
}

const gift = (giftName: string, count = 1, diamonds = 1, viewerId = 'alice'): ViewerEvent => ({ kind: 'gift', viewerId, giftId: 1, giftName, count, diamonds, at: 0 });
const like = (count: number): ViewerEvent => ({ kind: 'like', viewerId: 'bob', count, at: 0 });
const follow = (viewerId = 'alice'): ViewerEvent => ({ kind: 'follow', viewerId, at: 0 });
const texts = (out: ReturnType<ReturnType<typeof createActions>['handle']>) => out.flatMap((m) => (m.type === 'alert' ? [m.text] : []));

describe('actions', () => {
  it('fills templates and leaves unknown placeholders alone', () => {
    expect(fillTemplate('{viewer} sent {count}× {gift} {nope}', { viewer: 'a', count: 3, gift: 'Rose' })).toBe('a sent 3× Rose {nope}');
  });

  it('shows alerts for follows and shares, skipping disabled actions', () => {
    const { engine } = setup([rule({ trigger: 'follow', text: '{viewer} followed', speak: true }), rule({ trigger: 'share', text: 'off', enabled: false })]);
    expect(engine.handle(follow())).toEqual([
      { type: 'alert', text: 'alice followed', sound: 'chime', soundFile: null, media: null, speak: true, durationMs: 5000, screen: null },
    ]);
    expect(engine.handle({ kind: 'share', viewerId: 'alice', at: 0 })).toEqual([]);
  });

  it("shows only the exact gift's alert, while any-gift key presses and points still happen", () => {
    const { engine } = setup([
      rule({ trigger: 'gift', text: 'any {gift}', keyword: 'jump', points: 5 }),
      rule({ trigger: 'gift', giftName: 'lion', text: 'LION x{count}', sound: 'fanfare' }),
    ]);
    const lion = engine.handle(gift('Lion', 2));
    expect(texts(lion)).toEqual(['LION x2']);
    expect(lion).toContainEqual({ type: 'key', keyword: 'jump', viewer: 'alice', repeats: 1 });
    expect(lion).toContainEqual({ type: 'points', viewer: 'alice', amount: 5 });
    expect(texts(engine.handle(gift('Rose')))).toEqual(['any Rose']);
  });

  it('matches gifts by total diamonds, and repeats key presses for a streak', () => {
    const { engine } = setup([rule({ trigger: 'gift', minDiamonds: 100, text: 'big {coins} {diamonds}', keyword: 'jump', repeatWithCount: true })]);
    expect(engine.handle(gift('Rose', 50))).toEqual([]);
    const big = engine.handle(gift('Rose', 99, 2));
    expect(texts(big)).toEqual(['big 198 198']);
    expect(big).toContainEqual({ type: 'key', keyword: 'jump', viewer: 'alice', repeats: MAX_KEY_REPEATS });
  });

  it('fires likes actions each time the stream total passes a multiple of the step', () => {
    const { engine } = setup([rule({ trigger: 'likes', likeStep: 100, text: '{total} likes, thanks {viewer}' })]);
    expect(engine.handle(like(60))).toEqual([]);
    expect(texts(engine.handle(like(60)))).toEqual(['100 likes, thanks bob']);
    expect(engine.handle(like(50))).toEqual([]); // 170
    expect(texts(engine.handle(like(250)))).toEqual(['400 likes, thanks bob']); // one per batch
  });

  it('runs chat commands with the rest of the message, and never reads them aloud', () => {
    const { say } = setup([rule({ trigger: 'command', command: '!shout', text: '{viewer}: {text}' })], { mode: 'all' });
    expect(texts(say('alice', '!SHOUT hello there'))).toEqual(['alice: hello there']);
    expect(say('alice', '!shout')).toMatchObject([{ type: 'alert', text: 'alice: ' }]);
    expect(say('alice', '!shouting')).toEqual([{ type: 'tts', viewer: 'alice', text: '!shouting' }]);
  });

  it("greets a viewer's first activity of the stream once, ignoring joins", () => {
    const { engine, say } = setup([rule({ trigger: 'first_activity', text: 'welcome {viewer}' })]);
    expect(engine.handle({ kind: 'join', viewerId: 'alice', at: 0 })).toEqual([]);
    expect(texts(say('alice', 'hi'))).toEqual(['welcome alice']);
    expect(texts(say('alice', 'hi again'))).toEqual([]);
    expect(texts(engine.handle(follow('bob')))).toEqual(['welcome bob']);
  });

  it('limits actions to followers, subscribers, moderators, top gifters or one viewer', () => {
    const only = (audience: ActionRule['audience'], audienceViewer: string | null = null) =>
      setup([rule({ trigger: 'command', command: '!hi', text: 'hi', audience, audienceViewer })], {}, {}, false, { topGifters: () => ['g1', 'g2', 'g3', 'g4'] });
    const followers = only('followers');
    expect(texts(followers.say('stranger', '!hi'))).toEqual([]); // the platform hasn't said
    expect(texts(followers.say('fan', '!hi', ['follower']))).toEqual(['hi']);
    followers.engine.handle(follow('newfan'));
    expect(texts(followers.say('newfan', '!hi'))).toEqual(['hi']); // following just now counts
    expect(texts(only('moderators').say('fan', '!hi', ['follower']))).toEqual([]);
    expect(texts(only('moderators').say('mod', '!hi', ['moderator']))).toEqual(['hi']);
    const subs = only('subscribers');
    subs.engine.handle({ kind: 'subscribe', viewerId: 'sub', months: 1, at: 0 });
    expect(texts(subs.say('sub', '!hi'))).toEqual(['hi']);
    expect(texts(only('top_gifters').say('g3', '!hi'))).toEqual(['hi']);
    expect(texts(only('top_gifters').say('g4', '!hi'))).toEqual([]); // top three only
    expect(texts(only('viewer', 'Alice').say('alice', '!hi'))).toEqual(['hi']);
    expect(texts(only('viewer', 'Alice').say('bob', '!hi'))).toEqual([]);
  });

  it('keeps to its cooldowns, for everyone and per viewer', () => {
    const { say, advance } = setup([
      rule({ trigger: 'command', command: '!a', text: 'a', cooldownMs: 10_000 }),
      rule({ trigger: 'command', command: '!b', text: 'b', viewerCooldownMs: 10_000 }),
    ]);
    expect(texts(say('alice', '!a'))).toEqual(['a']);
    expect(texts(say('bob', '!a'))).toEqual([]);
    expect(texts(say('alice', '!b'))).toEqual(['b']);
    expect(texts(say('alice', '!b'))).toEqual([]);
    expect(texts(say('bob', '!b'))).toEqual(['b']);
    advance(10_000);
    expect(texts(say('bob', '!a'))).toEqual(['a']);
  });

  it('runs one of the random actions an event matches, plus all the others', () => {
    const actions = [
      rule({ trigger: 'follow', text: 'always' }),
      rule({ trigger: 'follow', text: 'one', random: true }),
      rule({ trigger: 'follow', text: 'two', random: true }),
    ];
    expect(texts(setup(actions, {}, {}, false, { random: () => 0 }).engine.handle(follow()))).toEqual(['always', 'one']);
    expect(texts(setup(actions, {}, {}, false, { random: () => 0.99 }).engine.handle(follow()))).toEqual(['always', 'two']);
  });

  it('runs goal actions for the goal that was reached, crediting the viewer who reached it', () => {
    const { engine } = setup([rule({ trigger: 'goal', goalId: 'g1', text: '{goal} done at {target}, thanks {viewer}!', points: 3 })]);
    const by: ViewerEvent = { kind: 'like', viewerId: 'bob', count: 5, at: 0 };
    expect(engine.goalReached({ id: 'g2', name: 'Other', target: 1 }, by)).toEqual([]);
    const out = engine.goalReached({ id: 'g1', name: 'Like goal', target: 1000 }, by);
    expect(texts(out)).toEqual(['Like goal done at 1000, thanks bob!']);
    expect(out).toContainEqual({ type: 'points', viewer: 'bob', amount: 3 });
  });

  it("gives points only with points on, and doesn't show an alert with nothing in it", () => {
    const action = rule({ trigger: 'share', sound: null, points: 10 });
    expect(setup([action]).engine.handle({ kind: 'share', viewerId: 'alice', at: 0 })).toEqual([{ type: 'points', viewer: 'alice', amount: 10 }]);
    const off = setup([action]);
    off.ctx.config.points = false;
    expect(off.engine.handle({ kind: 'share', viewerId: 'alice', at: 0 })).toEqual([]);
  });
});

describe('text-to-speech', () => {
  it('reads only prefixed comments by default, without the prefix', () => {
    const { spoken, say } = setup([]);
    expect(spoken('alice', '!TTS hello there')).toBe('hello there');
    expect(spoken('alice', 'hello there')).toBeNull();
    expect(say('alice', '!tts hi')).toEqual([{ type: 'tts', viewer: 'alice', text: 'hi' }]);
  });

  it('reads all chat except game commands in "all" mode, and nothing when off', () => {
    const all = setup([], { mode: 'all' });
    expect(all.spoken('alice', 'nice play')).toBe('nice play');
    expect(all.spoken('bob', 'LEFT')).toBeNull();
    expect(all.spoken('carol', 'join')).toBeNull();
    expect(all.spoken('dave', '!tts left')).toBe('left'); // explicitly asked to be read
    expect(setup([], { mode: 'off' }).spoken('alice', '!tts hello')).toBeNull();
  });

  it('drops links, caps length and blocks listed words (whole words only)', () => {
    const { spoken } = setup([], { maxLength: 12, blockedWords: parseBlockedWords(' Ass , bad phrase') });
    expect(spoken('a', '!tts look https://x.example/y here')).toBe('look here');
    expect(spoken('b', '!tts this is a very long message')).toBe('this is a ve');
    expect(spoken('c', '!tts you ass')).toBeNull();
    expect(spoken('d', '!tts class')).toBe('class');
    expect(spoken('e', '!tts a BAD PHRASE')).toBeNull();
    expect(spoken('f', '!tts https://only.a/link')).toBeNull();
  });

  it('applies a per-viewer cooldown', () => {
    const { spoken, advance } = setup([], { cooldownMs: 10_000 });
    expect(spoken('alice', '!tts one')).toBe('one');
    expect(spoken('alice', '!tts two')).toBeNull();
    expect(spoken('bob', '!tts three')).toBe('three');
    advance(10_000);
    expect(spoken('alice', '!tts four')).toBe('four');
  });

  it('enforces a minimum level only when progression is on', () => {
    expect(setup([], { minLevel: 3 }, { alice: 1 }).spoken('alice', '!tts hi')).toBe('hi');
    const gated = setup([], { minLevel: 3 }, { alice: 1, vet: 3 }, true);
    expect(gated.spoken('alice', '!tts hi')).toBeNull();
    expect(gated.spoken('vet', '!tts hi')).toBe('hi');
  });
});
