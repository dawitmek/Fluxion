import { describe, expect, it } from 'vitest';
import type { Mode, ViewerEvent } from '@fluxion/shared';
import { createEngine, MAX_GIFT_REPEATS, type EngineConfig } from '../src/engine/index.js';
import { IDLE_MS } from '../src/engine/queue.js';
import type { EngineCommand } from '../src/engine/types.js';

const left: EngineCommand = { keyword: 'left', key: 'KeyA', holdMs: 300, cooldownMs: 1000, enabled: true, minLevel: 1 };
const right: EngineCommand = { keyword: 'right', key: 'KeyD', holdMs: 300, cooldownMs: 1000, enabled: true, minLevel: 1 };
const jump: EngineCommand = { keyword: 'jump', key: 'Space', holdMs: 100, cooldownMs: 0, enabled: true, minLevel: 1 };

const comment = (viewerId: string, text: string): ViewerEvent => ({ kind: 'comment', viewerId, text, at: 0 });
const gift = (viewerId: string, giftName: string, count = 1): ViewerEvent => ({
  kind: 'gift',
  viewerId,
  giftId: 1,
  giftName,
  count,
  diamonds: 1,
  at: 0,
});

function setup(mode: Mode, config: Partial<EngineConfig> = {}, levels: Record<string, number> = {}) {
  let t = 0;
  let id = 0;
  const ctx = {
    config: {
      commands: [left, right, jump],
      giftTriggers: [],
      actionsPerSecond: 100,
      voteWindowMs: 3000,
      turnMs: 30000,
      giftBoosts: true,
      levelGating: false,
      ...config,
    },
    now: () => t,
    newId: () => `a${++id}`,
    levelOf: (viewerId: string) => levels[viewerId] ?? 1,
  };
  const engine = createEngine(mode, ctx);
  const keys = (decisions: { action: { key: string } }[]) => decisions.map((d) => d.action.key);
  return {
    engine,
    ctx,
    advance: (ms: number) => (t += ms),
    // Keys pressed by an event; for time-based modes, call tick() separately.
    press: (event: ViewerEvent) => keys(engine.handle(event)),
    tick: () => keys(engine.tick()),
  };
}

describe('anarchy mode', () => {
  it('turns a matching comment into a key action', () => {
    const { engine } = setup('anarchy');
    expect(engine.handle(comment('alice', 'left'))).toEqual([
      { action: { id: 'a1', key: 'KeyA', holdMs: 300 }, keyword: 'left', viewer: 'alice', credit: ['alice'] },
    ]);
  });

  it('matches the whole comment, ignoring case and surrounding spaces', () => {
    const { press } = setup('anarchy');
    expect(press(comment('alice', '  LeFt '))).toEqual(['KeyA']);
    expect(press(comment('bob', 'go left'))).toEqual([]);
    expect(press(comment('bob', 'lefty'))).toEqual([]);
  });

  it('ignores non-comment events and disabled commands', () => {
    const { press } = setup('anarchy', { commands: [{ ...left, enabled: false }] });
    expect(press(comment('alice', 'left'))).toEqual([]);
    expect(press({ kind: 'follow', viewerId: 'alice', at: 0 })).toEqual([]);
  });

  it('applies the cooldown per viewer and per command', () => {
    const { press, advance } = setup('anarchy');
    expect(press(comment('alice', 'left'))).toHaveLength(1);
    expect(press(comment('alice', 'left'))).toHaveLength(0); // same viewer, cooling down
    expect(press(comment('bob', 'left'))).toHaveLength(1); // other viewer unaffected
    expect(press(comment('alice', 'jump'))).toHaveLength(1); // other command unaffected
    advance(999);
    expect(press(comment('alice', 'left'))).toHaveLength(0);
    advance(1);
    expect(press(comment('alice', 'left'))).toHaveLength(1);
  });

  it('caps total actions per second across all viewers', () => {
    const { press, advance } = setup('anarchy', { actionsPerSecond: 2 });
    expect(press(comment('a', 'jump'))).toHaveLength(1);
    expect(press(comment('b', 'jump'))).toHaveLength(1);
    expect(press(comment('c', 'jump'))).toHaveLength(0);
    advance(1000);
    expect(press(comment('c', 'jump'))).toHaveLength(1);
  });

  it('does not start a cooldown for a comment dropped by the rate limit', () => {
    const { press, advance } = setup('anarchy', { actionsPerSecond: 1 });
    expect(press(comment('a', 'left'))).toHaveLength(1);
    expect(press(comment('b', 'left'))).toHaveLength(0); // rate-limited
    advance(1000);
    expect(press(comment('b', 'left'))).toHaveLength(1);
  });

  it('applies config changes without losing cooldowns', () => {
    const { press, ctx } = setup('anarchy');
    expect(press(comment('alice', 'left'))).toEqual(['KeyA']);
    ctx.config = { ...ctx.config, commands: [{ ...left, key: 'KeyQ' }] };
    expect(press(comment('alice', 'left'))).toEqual([]); // still cooling down
    expect(press(comment('bob', 'left'))).toEqual(['KeyQ']);
  });
});

describe('democracy mode', () => {
  it('fires the most-voted command once when the window closes', () => {
    const { engine, press, tick, advance } = setup('democracy');
    expect(press(comment('a', 'left'))).toEqual([]);
    press(comment('b', 'right'));
    press(comment('c', 'right'));
    expect(engine.state()).toEqual({
      mode: 'democracy',
      tally: [
        { keyword: 'right', votes: 2 },
        { keyword: 'left', votes: 1 },
      ],
      endsAt: 3000,
    });
    advance(2999);
    expect(tick()).toEqual([]);
    advance(1);
    const [decision, ...rest] = engine.tick();
    expect(rest).toEqual([]);
    expect(decision).toMatchObject({ action: { key: 'KeyD' }, viewer: '2 votes', credit: ['b', 'c'] });
    expect(engine.state()).toEqual({ mode: 'democracy', tally: [], endsAt: null });
    expect(tick()).toEqual([]);
  });

  it('counts one vote per viewer, keeping the latest', () => {
    const { press, tick, advance } = setup('democracy');
    press(comment('a', 'left'));
    press(comment('a', 'left'));
    press(comment('b', 'right'));
    press(comment('a', 'right')); // a changes their vote
    advance(3000);
    expect(tick()).toEqual(['KeyD']);
  });

  it('breaks ties in favour of the command voted first', () => {
    const { press, tick, advance } = setup('democracy');
    press(comment('a', 'right'));
    press(comment('b', 'left'));
    advance(3000);
    expect(tick()).toEqual(['KeyD']);
  });

  it('lets gifts add votes to the gifter’s current vote', () => {
    const { press, tick, advance, engine } = setup('democracy');
    press(comment('a', 'left'));
    press(comment('b', 'right'));
    press(comment('c', 'right'));
    press(gift('a', 'Rose', 5));
    expect(engine.state()).toMatchObject({ tally: [{ keyword: 'left', votes: 6 }, { keyword: 'right', votes: 2 }] });
    advance(3000);
    expect(tick()).toEqual(['KeyA']);
  });

  it('ignores gift boosts when the host turned them off', () => {
    const { press, tick, advance } = setup('democracy', { giftBoosts: false });
    press(comment('a', 'left'));
    press(comment('b', 'right'));
    press(comment('c', 'right'));
    press(gift('a', 'Rose', 5));
    advance(3000);
    expect(tick()).toEqual(['KeyD']);
  });
});

describe('queue mode', () => {
  it('gives control to one viewer at a time, in join order', () => {
    const { engine, press, tick, advance } = setup('queue', { turnMs: 5000 });
    press(comment('a', 'join'));
    press(comment('b', 'JOIN'));
    press(comment('a', 'join')); // already waiting
    tick();
    expect(engine.state()).toEqual({ mode: 'queue', viewer: 'a', endsAt: 5000, queue: ['b'] });

    expect(press(comment('b', 'left'))).toEqual([]); // not b's turn
    expect(press(comment('a', 'left'))).toEqual(['KeyA']);
    expect(press(comment('a', 'left'))).toEqual(['KeyA']); // no per-command cooldown on your turn

    advance(5000);
    tick();
    expect(engine.state()).toMatchObject({ viewer: 'b', queue: [] });
    expect(press(comment('a', 'left'))).toEqual([]);
    expect(press(comment('b', 'right'))).toEqual(['KeyD']);
  });

  it('ends a turn early when the viewer goes idle', () => {
    const { engine, press, tick, advance } = setup('queue');
    press(comment('a', 'join'));
    press(comment('b', 'join'));
    tick();
    advance(IDLE_MS - 1);
    tick();
    expect(engine.state()).toMatchObject({ viewer: 'a' });
    advance(1);
    tick();
    expect(engine.state()).toMatchObject({ viewer: 'b' });
  });

  it('moves a gifter to the front of the line', () => {
    const { engine, press, tick } = setup('queue');
    press(comment('a', 'join'));
    tick();
    press(comment('b', 'join'));
    press(comment('c', 'join'));
    press(gift('c', 'Rose'));
    press(gift('d', 'Rose')); // gifting also joins
    press(gift('a', 'Rose')); // the current player isn't re-queued
    expect(engine.state()).toMatchObject({ viewer: 'a', queue: ['d', 'c', 'b'] });
  });
});

describe('gift triggers', () => {
  const triggers = { giftTriggers: [{ giftName: 'rose', keyword: 'jump' }] };

  it('press their command in every mode, once per gift in a streak', () => {
    for (const mode of ['anarchy', 'democracy', 'queue', 'gift'] as const) {
      const { engine } = setup(mode, triggers);
      const decisions = engine.handle(gift('alice', 'Rose', 3));
      expect(decisions.map((d) => [d.action.key, d.delayMs])).toEqual([
        ['Space', undefined],
        ['Space', 200],
        ['Space', 400],
      ]);
    }
  });

  it(`cap a streak at ${MAX_GIFT_REPEATS} presses and ignore unmapped gifts`, () => {
    const { press } = setup('anarchy', triggers);
    expect(press(gift('alice', 'Rose', 99))).toHaveLength(MAX_GIFT_REPEATS);
    expect(press(gift('alice', 'Lion'))).toEqual([]);
  });

  it('are the only thing that fires in gift-only mode', () => {
    const { press, engine } = setup('gift', triggers);
    expect(press(comment('alice', 'left'))).toEqual([]);
    expect(press(gift('alice', 'rose'))).toEqual(['Space']);
    expect(engine.state()).toEqual({ mode: 'gift' });
  });
});

describe('level gating', () => {
  const shoot: EngineCommand = { keyword: 'shoot', key: 'KeyF', holdMs: 100, cooldownMs: 0, enabled: true, minLevel: 3 };
  const levels = { rookie: 1, veteran: 3 };

  it('ignores commands above the viewer’s level, in every comment-driven mode', () => {
    const { press } = setup('anarchy', { commands: [left, shoot], levelGating: true }, levels);
    expect(press(comment('rookie', 'shoot'))).toEqual([]);
    expect(press(comment('rookie', 'left'))).toEqual(['KeyA']);
    expect(press(comment('veteran', 'shoot'))).toEqual(['KeyF']);

    const democracy = setup('democracy', { commands: [shoot], levelGating: true }, levels);
    democracy.press(comment('rookie', 'shoot'));
    democracy.advance(3000);
    expect(democracy.tick()).toEqual([]); // the vote never counted
  });

  it('is off unless the host turns it on, and never applies to gift triggers', () => {
    expect(setup('anarchy', { commands: [shoot] }, levels).press(comment('rookie', 'shoot'))).toEqual(['KeyF']);
    const gifted = setup('anarchy', { commands: [shoot], levelGating: true, giftTriggers: [{ giftName: 'rose', keyword: 'shoot' }] }, levels);
    expect(gifted.press(gift('rookie', 'Rose'))).toEqual(['KeyF']);
  });
});
