import { describe, expect, it } from 'vitest';
import type { ViewerEvent } from '@fluxion/shared';
import { createAnarchy, type EngineCommand } from '../src/engine/anarchy.js';

const left: EngineCommand = { keyword: 'left', key: 'KeyA', holdMs: 300, cooldownMs: 1000, enabled: true };
const jump: EngineCommand = { keyword: 'jump', key: 'Space', holdMs: 100, cooldownMs: 0, enabled: true };

const comment = (viewerId: string, text: string): ViewerEvent => ({ kind: 'comment', viewerId, text, at: 0 });

function setup(commands: EngineCommand[], actionsPerSecond = 100) {
  let t = 0;
  let id = 0;
  const engine = createAnarchy({ commands, actionsPerSecond, now: () => t, newId: () => `a${++id}` });
  return { engine, advance: (ms: number) => (t += ms) };
}

describe('anarchy mode', () => {
  it('turns a matching comment into a key action', () => {
    const { engine } = setup([left]);
    expect(engine.handle(comment('alice', 'left'))).toEqual({
      action: { id: 'a1', key: 'KeyA', holdMs: 300 },
      viewerId: 'alice',
      keyword: 'left',
    });
  });

  it('matches the whole comment, ignoring case and surrounding spaces', () => {
    const { engine } = setup([left]);
    expect(engine.handle(comment('alice', '  LeFt '))).not.toBeNull();
    expect(engine.handle(comment('bob', 'go left'))).toBeNull();
    expect(engine.handle(comment('bob', 'lefty'))).toBeNull();
  });

  it('ignores non-comment events and disabled commands', () => {
    const { engine } = setup([{ ...left, enabled: false }]);
    expect(engine.handle(comment('alice', 'left'))).toBeNull();
    expect(engine.handle({ kind: 'follow', viewerId: 'alice', at: 0 })).toBeNull();
  });

  it('applies the cooldown per viewer and per command', () => {
    const { engine, advance } = setup([left, jump]);
    expect(engine.handle(comment('alice', 'left'))).not.toBeNull();
    expect(engine.handle(comment('alice', 'left'))).toBeNull(); // same viewer, cooling down
    expect(engine.handle(comment('bob', 'left'))).not.toBeNull(); // other viewer unaffected
    expect(engine.handle(comment('alice', 'jump'))).not.toBeNull(); // other command unaffected
    advance(999);
    expect(engine.handle(comment('alice', 'left'))).toBeNull();
    advance(1);
    expect(engine.handle(comment('alice', 'left'))).not.toBeNull();
  });

  it('caps total actions per second across all viewers', () => {
    const { engine, advance } = setup([jump], 2);
    expect(engine.handle(comment('a', 'jump'))).not.toBeNull();
    expect(engine.handle(comment('b', 'jump'))).not.toBeNull();
    expect(engine.handle(comment('c', 'jump'))).toBeNull();
    advance(1000);
    expect(engine.handle(comment('c', 'jump'))).not.toBeNull();
  });

  it('does not start a cooldown for a comment dropped by the rate limit', () => {
    const { engine, advance } = setup([left], 1);
    expect(engine.handle(comment('a', 'left'))).not.toBeNull();
    expect(engine.handle(comment('b', 'left'))).toBeNull(); // rate-limited
    advance(1000);
    expect(engine.handle(comment('b', 'left'))).not.toBeNull();
  });
});
