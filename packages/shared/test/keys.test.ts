import { describe, expect, it } from 'vitest';
import { isAllowedKey } from '../src/keys.js';

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
