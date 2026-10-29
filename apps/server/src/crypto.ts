import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// Encrypts secrets kept in the database (hosts' cloud API keys and TikTok sessions) with AES-256-GCM, so a leaked
// database or backup is useless without SECRETS_KEY. Stored as enc:v1:<iv>:<tag>:<ciphertext>, base64url.
const PREFIX = 'enc:v1:';

export class Secrets {
  constructor(private key: Buffer) {
    if (key.length !== 32) throw new Error('The secrets key must be 32 bytes');
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join(':');
  }

  // null when there is nothing stored, or it can't be decrypted (a different key, or tampered with): the host
  // then enters it again. Values saved before encryption existed are returned as they are.
  open(stored: string | null): string | null {
    if (stored === null || !Secrets.isSealed(stored)) return stored;
    try {
      const [iv, tag, data] = stored.slice(PREFIX.length).split(':').map((part) => Buffer.from(part, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv!);
      decipher.setAuthTag(tag!);
      return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  static isSealed(stored: string) {
    return stored.startsWith(PREFIX);
  }
}
