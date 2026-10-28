import { describe, expect, it } from 'vitest';
import { isAllowedKey } from '../src/keys.js';
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

describe('levels', () => {
  it('starts at level 1 and needs 10·(n-1)² XP for level n', () => {
    expect([0, 9, 10, 39, 40, 90, 160].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 4, 5]);
    for (let level = 1; level <= 20; level++) expect(levelForXp(xpForLevel(level))).toBe(level);
  });

  it('caps at the max level', () => {
    expect(levelForXp(10 ** 9)).toBe(MAX_LEVEL);
  });
});
