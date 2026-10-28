import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { commands, hosts } from '../db/schema.js';
import { createAnarchy } from '../engine/anarchy.js';
import type { Hub } from '../gateway/hub.js';
import { SimulatedAdapter } from '../platforms/simulated.js';
import type { PlatformAdapter } from '../platforms/types.js';

export type Source = 'tiktok' | 'simulated';

interface LiveSession {
  source: Source;
  adapter: PlatformAdapter;
  engine: ReturnType<typeof createAnarchy>;
}

export class LiveError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

// Owns one live session per host: platform adapter in, engine decisions out to the hub.
export class SessionManager {
  private sessions = new Map<string, LiveSession>();

  constructor(
    private db: Db,
    private hub: Hub,
    private createTikTok: (username: string) => PlatformAdapter,
  ) {}

  async start(hostId: string, source: Source) {
    await this.stop(hostId);
    const [host] = await this.db.select().from(hosts).where(eq(hosts.id, hostId));
    if (!host) throw new LiveError('Host not found', 404);

    let adapter: PlatformAdapter;
    if (source === 'simulated') {
      adapter = new SimulatedAdapter();
    } else {
      if (!host.tiktokUsername) throw new LiveError('Set your TikTok username first', 400);
      adapter = this.createTikTok(host.tiktokUsername);
    }

    const session: LiveSession = { source, adapter, engine: await this.buildEngine(hostId, host.actionsPerSecond) };
    adapter.onEvent((event) => {
      const decision = session.engine.handle(event);
      if (!decision) return;
      this.hub.sendToCompanions(hostId, { type: 'action', action: decision.action });
      this.hub.sendToOverlays(hostId, { type: 'command', viewer: decision.viewerId, keyword: decision.keyword, at: event.at });
    });
    adapter.onEnd(() => {
      if (this.sessions.get(hostId) === session) void this.stop(hostId);
    });

    try {
      await adapter.start();
    } catch (err) {
      throw new LiveError(`Could not connect to TikTok LIVE: ${(err as Error).message}`, 409);
    }
    this.sessions.set(hostId, session);
    this.hub.sendToOverlays(hostId, { type: 'live', state: 'started' });
  }

  async stop(hostId: string) {
    const session = this.sessions.get(hostId);
    if (!session) return;
    this.sessions.delete(hostId);
    await session.adapter.stop();
    this.hub.sendToOverlays(hostId, { type: 'live', state: 'stopped' });
  }

  status(hostId: string) {
    const session = this.sessions.get(hostId);
    return session ? { live: true, source: session.source } : { live: false };
  }

  // Returns false when the host has no simulated session running.
  simulate(hostId: string, viewerId: string, text: string): boolean {
    const session = this.sessions.get(hostId);
    if (!(session?.adapter instanceof SimulatedAdapter)) return false;
    session.adapter.inject({ kind: 'comment', viewerId, text, at: Date.now() });
    return true;
  }

  // Picks up command or settings changes mid-stream. Cooldown state resets, which is acceptable.
  async reload(hostId: string) {
    const session = this.sessions.get(hostId);
    if (!session) return;
    const [host] = await this.db.select().from(hosts).where(eq(hosts.id, hostId));
    if (host) session.engine = await this.buildEngine(hostId, host.actionsPerSecond);
  }

  async stopAll() {
    await Promise.all([...this.sessions.keys()].map((hostId) => this.stop(hostId)));
  }

  private async buildEngine(hostId: string, actionsPerSecond: number) {
    const rows = await this.db.select().from(commands).where(eq(commands.hostId, hostId));
    return createAnarchy({ commands: rows, actionsPerSecond });
  }
}
