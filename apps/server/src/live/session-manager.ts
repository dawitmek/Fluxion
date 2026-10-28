import { eq } from 'drizzle-orm';
import type { Mode, ServerToOverlay, ViewerEvent } from '@fluxion/shared';
import type { Db } from '../db/client.js';
import { commands, giftTriggers, hosts } from '../db/schema.js';
import { createEngine, type Decision, type Engine, type EngineConfig, type EngineContext } from '../engine/index.js';
import type { Hub } from '../gateway/hub.js';
import type { Stats } from '../leaderboard/stats.js';
import { SimulatedAdapter } from '../platforms/simulated.js';
import type { PlatformAdapter } from '../platforms/types.js';

export type Source = 'tiktok' | 'simulated';

const TICK_MS = 250;
const STATS_FLUSH_MS = 5000;

interface LiveSession {
  source: Source;
  adapter: PlatformAdapter;
  mode: Mode;
  ctx: EngineContext;
  engine: Engine;
  ticker: NodeJS.Timeout;
  delayed: Set<NodeJS.Timeout>; // pending repeats of gift-triggered presses
  lastState: string;
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
  private statsTimer = setInterval(() => this.flushStats().catch(() => {}), STATS_FLUSH_MS).unref(); // failed counts retry next flush

  constructor(
    private db: Db,
    private hub: Hub,
    private stats: Stats,
    private createTikTok: (username: string) => PlatformAdapter,
  ) {}

  async start(hostId: string, source: Source) {
    await this.stop(hostId);
    const loaded = await this.loadConfig(hostId);
    if (!loaded) throw new LiveError('Host not found', 404);
    const { host, config } = loaded;

    let adapter: PlatformAdapter;
    if (source === 'simulated') {
      adapter = new SimulatedAdapter();
    } else {
      if (!host.tiktokUsername) throw new LiveError('Set your TikTok username first', 400);
      adapter = this.createTikTok(host.tiktokUsername);
    }

    const ctx: EngineContext = { config, now: Date.now, newId: () => crypto.randomUUID() };
    const session: LiveSession = {
      source,
      adapter,
      mode: host.mode,
      ctx,
      engine: createEngine(host.mode, ctx),
      ticker: setInterval(() => this.run(hostId, session, session.engine.tick()), TICK_MS),
      delayed: new Set(),
      lastState: '',
    };
    adapter.onEvent((event) => this.onEvent(hostId, session, event));
    adapter.onEnd(() => {
      if (this.sessions.get(hostId) === session) void this.stop(hostId);
    });

    try {
      await adapter.start();
    } catch (err) {
      clearInterval(session.ticker);
      throw new LiveError(`Could not connect to TikTok LIVE: ${(err as Error).message}`, 409);
    }
    this.sessions.set(hostId, session);
    this.hub.sendToOverlays(hostId, { type: 'live', state: 'started' });
    this.pushState(hostId, session);
  }

  async stop(hostId: string) {
    const session = this.sessions.get(hostId);
    if (!session) return;
    this.sessions.delete(hostId);
    clearInterval(session.ticker);
    for (const timer of session.delayed) clearTimeout(timer);
    await session.adapter.stop();
    this.hub.sendToOverlays(hostId, { type: 'live', state: 'stopped' });
  }

  status(hostId: string) {
    const session = this.sessions.get(hostId);
    const companionsOnline = this.hub.companionCount(hostId);
    return session
      ? { live: true, source: session.source, mode: session.mode, companionsOnline }
      : { live: false, companionsOnline };
  }

  // Returns false when the host has no simulated session running.
  simulate(hostId: string, event: ViewerEvent): boolean {
    const session = this.sessions.get(hostId);
    if (!(session?.adapter instanceof SimulatedAdapter)) return false;
    session.adapter.inject(event);
    return true;
  }

  // Picks up command or settings changes mid-stream. Votes, the queue and cooldowns survive
  // unless the mode itself changed.
  async reload(hostId: string) {
    const session = this.sessions.get(hostId);
    if (!session) return;
    const loaded = await this.loadConfig(hostId);
    if (!loaded || this.sessions.get(hostId) !== session) return;
    session.ctx.config = loaded.config;
    if (loaded.host.mode !== session.mode) {
      session.mode = loaded.host.mode;
      session.engine = createEngine(session.mode, session.ctx);
    }
    this.pushState(hostId, session);
  }

  // What a newly connected overlay needs to catch up.
  async overlaySnapshot(hostId: string): Promise<ServerToOverlay[]> {
    const session = this.sessions.get(hostId);
    if (!session) return [];
    return [
      { type: 'live', state: 'started' },
      { type: 'mode', state: session.engine.state(), serverNow: Date.now() },
      { type: 'leaderboard', entries: await this.stats.top(hostId) },
    ];
  }

  async flushStats() {
    const changed = await this.stats.flush();
    for (const hostId of changed) {
      if (this.sessions.has(hostId)) {
        this.hub.sendToOverlays(hostId, { type: 'leaderboard', entries: await this.stats.top(hostId) });
      }
    }
  }

  async stopAll() {
    await Promise.all([...this.sessions.keys()].map((hostId) => this.stop(hostId)));
  }

  async close() {
    clearInterval(this.statsTimer);
    await this.stopAll();
    await this.flushStats();
  }

  private onEvent(hostId: string, session: LiveSession, event: ViewerEvent) {
    if (event.kind === 'gift') this.stats.record(hostId, event.viewerId, 'gifts', event.count);
    this.run(hostId, session, session.engine.handle(event));
  }

  private run(hostId: string, session: LiveSession, decisions: Decision[]) {
    for (const decision of decisions) {
      if (decision.delayMs) {
        const timer = setTimeout(() => {
          session.delayed.delete(timer);
          this.fire(hostId, decision);
        }, decision.delayMs);
        session.delayed.add(timer);
      } else {
        this.fire(hostId, decision);
      }
    }
    this.pushState(hostId, session);
  }

  private fire(hostId: string, decision: Decision) {
    this.hub.sendToCompanions(hostId, { type: 'action', action: decision.action });
    this.hub.sendToOverlays(hostId, { type: 'command', viewer: decision.viewer, keyword: decision.keyword, at: Date.now() });
    for (const viewerId of decision.credit) this.stats.record(hostId, viewerId, 'commands');
  }

  // Sends the mode state to overlays only when it changed.
  private pushState(hostId: string, session: LiveSession) {
    const state = session.engine.state();
    const json = JSON.stringify(state);
    if (json === session.lastState) return;
    session.lastState = json;
    this.hub.sendToOverlays(hostId, { type: 'mode', state, serverNow: Date.now() });
  }

  private async loadConfig(hostId: string): Promise<{ host: typeof hosts.$inferSelect; config: EngineConfig } | null> {
    const [host] = await this.db.select().from(hosts).where(eq(hosts.id, hostId));
    if (!host) return null;
    const [commandRows, triggerRows] = await Promise.all([
      this.db.select().from(commands).where(eq(commands.hostId, hostId)),
      this.db
        .select({ giftName: giftTriggers.giftName, keyword: commands.keyword })
        .from(giftTriggers)
        .innerJoin(commands, eq(giftTriggers.commandId, commands.id))
        .where(eq(giftTriggers.hostId, hostId)),
    ]);
    return {
      host,
      config: {
        commands: commandRows,
        giftTriggers: triggerRows,
        actionsPerSecond: host.actionsPerSecond,
        voteWindowMs: host.voteWindowMs,
        turnMs: host.turnMs,
        giftBoosts: host.giftBoosts,
      },
    };
  }
}
