import { describe, expect, it } from 'vitest';
import { formatKey, isAllowedKey, keyProblem, parseKey } from '../src/keys.js';
import { levelForXp, MAX_LEVEL, xpForLevel } from '../src/index.js';

describe('isAllowedKey', () => {
  it('allows game keys', () => {
    for (const key of ['KeyA', 'KeyZ', 'Digit0', 'ArrowLeft', 'Space', 'Enter', 'ShiftLeft']) {
      expect(isAllowedKey(key)).toBe(true);
    }
  });

  it('rejects system and modifier keys that could close or switch apps', () => {
    for (const key of ['MetaLeft', 'OSLeft', 'AltLeft', 'ControlLeft', 'Tab', 'Escape', 'F4', 'Delete', 'keya', '']) {
      expect(isAllowedKey(key)).toBe(false);
    }
  });
});

describe('keys and combinations', () => {
  it('allows plain keys and combinations with Ctrl, Alt and Shift', () => {
    for (const key of ['KeyE', 'Space', 'ShiftLeft', 'Control+KeyE', 'Control+Shift+KeyE', 'Alt+Digit1', 'Control+Alt+Shift+KeyZ']) {
      expect(isAllowedKey(key), key).toBe(true);
    }
  });

  it('refuses Win/Cmd, system keys and lone modifiers', () => {
    for (const key of ['Meta+KeyR', 'MetaLeft', 'Tab', 'Escape', 'F4', 'ControlLeft', 'AltLeft', 'Control+Tab', '']) {
      expect(isAllowedKey(key), key).toBe(false);
    }
  });

  it('refuses malformed combinations', () => {
    for (const key of ['Shift+Control+KeyE', 'Control+Control+KeyE', 'Ctrl+KeyE', 'Control+', 'Shift+ShiftLeft']) {
      expect(isAllowedKey(key), key).toBe(false);
    }
  });

  it('blocks combinations that act outside the game, including with extra modifiers', () => {
    expect(keyProblem('Control+Alt+Delete')).toBe('Ctrl+Alt+Del opens the security screen');
    expect(keyProblem('Control+KeyW')).toBe('Ctrl+W closes windows and tabs');
    expect(keyProblem('Control+Shift+KeyW')).toBe('Ctrl+W closes windows and tabs');
    expect(keyProblem('Alt+F4')).toBe('Alt+F4 closes the game');
    expect(keyProblem('Alt+Enter')).toContain('fullscreen');
    expect(keyProblem('Control+ArrowLeft')).toContain('switch desktops');
    expect(keyProblem('Alt+ShiftLeft')).toContain('keyboard layout');
    expect(keyProblem('Shift+KeyW')).toBeNull();
    expect(keyProblem('Enter')).toBeNull();
  });

  it('writes modifiers in a fixed order', () => {
    expect(formatKey({ modifiers: ['Shift', 'Control'], key: 'KeyE' })).toBe('Control+Shift+KeyE');
    expect(parseKey('Control+Shift+KeyE')).toEqual({ modifiers: ['Control', 'Shift'], key: 'KeyE' });
  });
});

describe('levels', () => {
  it('starts at level 1 and needs 10·(n-1)² XP for level n', () => {
    expect([0, 9, 10, 39, 40, 90, 160].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 4, 5]);
    for (let level = 1; level <= 20; level++) expect(levelForXp(xpForLevel(level))).toBe(level);
  });

  it('caps at the max level', () => {
    expect(levelForXp(10 ** 9)).toBe(MAX_LEVEL);
  });
});
