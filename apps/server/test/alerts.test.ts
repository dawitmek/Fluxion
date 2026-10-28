import { describe, expect, it } from 'vitest';
import type { ViewerEvent } from '@fluxion/shared';
import { createAlerts, fillTemplate, parseBlockedWords, type AlertContext, type AlertRule, type TtsConfig } from '../src/alerts/engine.js';

const rule = (r: Partial<AlertRule> & Pick<AlertRule, 'event' | 'template'>): AlertRule => ({
  giftName: null,
  likeStep: null,
  sound: 'chime',
  speak: false,
  enabled: true,
  ...r,
});

const baseTts: TtsConfig = { mode: 'prefix', prefix: '!tts', maxLength: 150, cooldownMs: 0, minLevel: 1, blockedWords: [], voice: null };

function setup(rules: AlertRule[], tts: Partial<TtsConfig> = {}, levels: Record<string, number> = {}, progression = false) {
  let t = 0;
  const ctx: AlertContext = {
    config: { rules, tts: { ...baseTts, ...tts }, progression },
    now: () => t,
    levelOf: (v) => levels[v] ?? 1,
    isCommand: (text) => ['left', 'join'].includes(text.trim().toLowerCase()),
  };
  const alerts = createAlerts(ctx);
  const say = (viewerId: string, text: string) => alerts.handle({ kind: 'comment', viewerId, text, at: 0 });
  // The text spoken for a comment, or null.
  const spoken = (viewerId: string, text: string) => {
    const [m] = say(viewerId, text);
    return m?.type === 'tts' ? m.text : null;
  };
  return { alerts, ctx, say, spoken, advance: (ms: number) => (t += ms) };
}

const gift = (giftName: string, count = 1): ViewerEvent => ({ kind: 'gift', viewerId: 'alice', giftId: 1, giftName, count, diamonds: 1, at: 0 });
const like = (count: number): ViewerEvent => ({ kind: 'like', viewerId: 'bob', count, at: 0 });

describe('alerts', () => {
  it('fills templates and leaves unknown placeholders alone', () => {
    expect(fillTemplate('{viewer} sent {count}× {gift} {nope}', { viewer: 'a', count: 3, gift: 'Rose' })).toBe('a sent 3× Rose {nope}');
  });

  it('fires follow and share alerts, skipping disabled rules', () => {
    const { alerts } = setup([
      rule({ event: 'follow', template: '{viewer} followed', speak: true }),
      rule({ event: 'share', template: 'off', enabled: false }),
    ]);
    expect(alerts.handle({ kind: 'follow', viewerId: 'alice', at: 0 })).toEqual([
      { type: 'alert', text: 'alice followed', sound: 'chime', speak: true, voice: null },
    ]);
    expect(alerts.handle({ kind: 'share', viewerId: 'alice', at: 0 })).toEqual([]);
  });

  it('prefers a rule for the exact gift over the catch-all', () => {
    const { alerts } = setup([
      rule({ event: 'gift', template: 'any {gift}' }),
      rule({ event: 'gift', giftName: 'lion', template: 'LION x{count}', sound: 'fanfare' }),
    ]);
    expect(alerts.handle(gift('Lion', 2)).map((m) => m.type === 'alert' && m.text)).toEqual(['LION x2']);
    expect(alerts.handle(gift('Rose')).map((m) => m.type === 'alert' && m.text)).toEqual(['any Rose']);
  });

  it('fires like alerts each time the stream total passes a multiple of the step', () => {
    const { alerts } = setup([rule({ event: 'likes', likeStep: 100, template: '{total} likes, thanks {viewer}' })]);
    expect(alerts.handle(like(60))).toEqual([]);
    expect(alerts.handle(like(60)).map((m) => m.type === 'alert' && m.text)).toEqual(['100 likes, thanks bob']);
    expect(alerts.handle(like(50))).toEqual([]); // 170
    expect(alerts.handle(like(250)).map((m) => m.type === 'alert' && m.text)).toEqual(['400 likes, thanks bob']); // one alert per batch
  });
});

describe('text-to-speech', () => {
  it('reads only prefixed comments by default, without the prefix', () => {
    const { spoken, say } = setup([]);
    expect(spoken('alice', '!TTS hello there')).toBe('hello there');
    expect(spoken('alice', 'hello there')).toBeNull();
    expect(say('alice', '!tts hi')).toEqual([{ type: 'tts', viewer: 'alice', text: 'hi', voice: null }]);
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
