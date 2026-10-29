import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Secrets } from '../src/crypto.js';

describe('secrets', () => {
  const secrets = new Secrets(randomBytes(32));

  it('round-trips, with a fresh nonce every time', () => {
    const sealed = secrets.seal('sessionid-123');
    expect(sealed).toMatch(/^enc:v1:/);
    expect(sealed).not.toContain('sessionid-123');
    expect(secrets.seal('sessionid-123')).not.toBe(sealed);
    expect(secrets.open(sealed)).toBe('sessionid-123');
  });

  it("can't be read with another key or after tampering", () => {
    const sealed = secrets.seal('key');
    expect(new Secrets(randomBytes(32)).open(sealed)).toBeNull();
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(secrets.open(flipped)).toBeNull();
    expect(secrets.open('enc:v1:garbage')).toBeNull();
  });

  it('passes through empty and pre-encryption values', () => {
    expect(secrets.open(null)).toBeNull();
    expect(secrets.open('plain-old-key')).toBe('plain-old-key');
  });

  it('needs a 32-byte key', () => {
    expect(() => new Secrets(randomBytes(16))).toThrow('32 bytes');
  });
});
