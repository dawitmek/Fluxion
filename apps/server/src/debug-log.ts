import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';

// A plain-text log for tracking down odd behavior while developing, separate from the server's request log.
// Off unless DEBUG_LOG names a file, and never on in production. One line per entry:
//   2026-10-29T22:03:28.123Z [tts] host=1a2b3c4d queued for the overlay {"viewer":"nightowl","pending":2}
// Never pass it secrets: cloud keys, TikTok sessions, overlay or companion tokens.
export type DebugArea = 'live' | 'tts' | 'alert' | 'overlay' | 'server';

export class DebugLog {
  private stream: WriteStream | null = null;

  constructor(path: string | undefined) {
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    this.stream = createWriteStream(path, { flags: 'a' });
  }

  get on() {
    return this.stream !== null;
  }

  write(area: DebugArea, hostId: string | null, message: string, data?: Record<string, unknown>) {
    if (!this.stream) return;
    const host = hostId ? ` host=${hostId.slice(0, 8)}` : '';
    this.stream.write(`${new Date().toISOString()} [${area}]${host} ${message}${data ? ` ${JSON.stringify(data)}` : ''}\n`);
  }

  close() {
    this.stream?.end();
  }
}
