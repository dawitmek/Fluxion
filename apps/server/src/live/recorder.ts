import type { ActivityKind } from '@fluxion/shared';
import type { Db } from '../db/client.js';
import { streamEvents } from '../db/schema.js';

const FLUSH_MS = 2000;

// Records a stream's events in batches, so a busy chat isn't one database write per message.
export class StreamRecorder {
  private buffer: (typeof streamEvents.$inferInsert)[] = [];
  private timer = setInterval(() => void this.flush(), FLUSH_MS).unref();
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private db: Db,
    readonly streamId: string,
    private onError: (err: unknown) => void,
  ) {}

  add(kind: ActivityKind, viewer: string | null, data: Record<string, unknown> = {}, at = Date.now()) {
    this.buffer.push({ streamId: this.streamId, at: new Date(at), kind, viewer, data });
  }

  // Writes are chained so batches land in order; a failed batch is reported and dropped rather than retried forever.
  flush(): Promise<void> {
    if (this.buffer.length === 0) return this.writing;
    const rows = this.buffer.splice(0);
    this.writing = this.writing.then(() => this.db.insert(streamEvents).values(rows).then(() => {}, this.onError));
    return this.writing;
  }

  async close() {
    clearInterval(this.timer);
    await this.flush();
  }
}
