import { eq } from 'drizzle-orm';
import { QUEUE_JOIN, XP_PER_COMMAND, type Mode, type ServerToOverlay, type ViewerEvent } from '@fluxion/shared';
import type { Secrets } from '../crypto.js';
import type { Db } from '../db/client.js';
import { alertRules, commands, giftTriggers, hosts } from '../db/schema.js';
import { createAlerts, parseBlockedWords, type AlertContext, type AlertOutput } from '../alerts/engine.js';
import { voiceConfig, type SpeechService, type VoiceConfig } from '../tts/speech.js';
import { activeProfile } from '../profiles/active.js';
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
  startedAt: number;
  adapter: PlatformAdapter;
  mode: Mode;
  progression: boolean;
  ctx: EngineContext;
  engine: Engine;
  alertCtx: AlertContext;
  alerts: ReturnType<typeof createAlerts>;
  voice: VoiceConfig;
  outbox: Promise<void>; // alerts and speech go out in order, each after its audio is ready
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
    private speech: SpeechService,
    private secrets: Secrets,
    private createTikTok: (username: string) => PlatformAdapter,
  ) {}

  async start(hostId: string, source: Source) {
    await this.stop(hostId);
    const loaded = await this.loadConfig(hostId);
    if (!loaded) throw new LiveError('Host not found', 404);
    const { host, mode, config, alertConfig, voice } = loaded;

    let adapter: PlatformAdapter;
    if (source === 'simulated') {
      adapter = new SimulatedAdapter();
    } else {
      if (!host.tiktokUsername) throw new LiveError('Set your TikTok username first', 400);
      adapter = this.createTikTok(host.tiktokUsername);
    }

    const ctx: EngineContext = {
      config,
      now: Date.now,
      newId: () => crypto.randomUUID(),
      levelOf: (viewerId) => this.stats.levelOf(hostId, viewerId),
    };
    const alertCtx: AlertContext = {
      config: alertConfig,
      now: Date.now,
      levelOf: ctx.levelOf,
      isCommand: (text) => {
        const keyword = text.trim().toLowerCase();
        return keyword === QUEUE_JOIN || ctx.config.commands.some((c) => c.enabled && c.keyword === keyword);
      },
    };
    const session: LiveSession = {
      source,
      startedAt: Date.now(),
      adapter,
      mode,
      progression: host.progression,
      ctx,
      engine: createEngine(mode, ctx),
      alertCtx,
      alerts: createAlerts(alertCtx),
      voice,
      outbox: Promise.resolve(),
      ticker: setInterval(() => this.run(hostId, session, session.engine.tick()), TICK_MS),
      delayed: new Set(),
      lastState: '',
    };
    adapter.onEvent((event) => this.onEvent(hostId, session, event));
    adapter.onEnd(() => {
      if (this.sessions.get(hostId) === session) void this.stop(hostId);
    });

    try {
      await this.stats.load(hostId);
      await adapter.start();
    } catch (err) {
      clearInterval(session.ticker);
      this.stats.unload(hostId);
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
    this.stats.unload(hostId);
    await session.adapter.stop();
    this.hub.sendToOverlays(hostId, { type: 'live', state: 'stopped' });
  }

  status(hostId: string) {
    const session = this.sessions.get(hostId);
    const companionsOnline = this.hub.companionCount(hostId);
    return session
      ? { live: true, source: session.source, mode: session.mode, startedAt: session.startedAt, companionsOnline }
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
    session.alertCtx.config = loaded.alertConfig;
    session.voice = loaded.voice;
    if (loaded.mode !== session.mode) {
      session.mode = loaded.mode;
      session.engine = createEngine(session.mode, session.ctx);
    }
    const progressionChanged = loaded.host.progression !== session.progression;
    session.progression = loaded.host.progression;
    this.pushState(hostId, session);
    if (progressionChanged) await this.pushLeaderboard(hostId);
  }

  // What a newly connected overlay needs to catch up.
  async overlaySnapshot(hostId: string): Promise<ServerToOverlay[]> {
    const session = this.sessions.get(hostId);
    if (!session) return [];
    return [
      { type: 'live', state: 'started' },
      { type: 'mode', state: session.engine.state(), serverNow: Date.now() },
      { type: 'leaderboard', entries: await this.stats.top(hostId), progression: session.progression },
    ];
  }

  async flushStats() {
    for (const hostId of await this.stats.flush()) await this.pushLeaderboard(hostId);
  }

  // Sends the current leaderboard to a live host's overlays.
  async pushLeaderboard(hostId: string) {
    const session = this.sessions.get(hostId);
    if (!session) return;
    const entries = await this.stats.top(hostId);
    this.hub.sendToOverlays(hostId, { type: 'leaderboard', entries, progression: session.progression });
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
    if (event.kind === 'gift') {
      const xp = Math.max(1, event.diamonds) * event.count;
      this.levelUp(hostId, session, event.viewerId, this.stats.record(hostId, event.viewerId, { gifts: event.count, xp }));
    }
    this.run(hostId, session, session.engine.handle(event));
    for (const output of session.alerts.handle(event)) {
      // speak() never throws, but a broken chain would silence every later alert, so guard anyway.
      session.outbox = session.outbox.then(() => this.deliver(hostId, session, output)).catch(() => {});
    }
  }

  private async deliver(hostId: string, session: LiveSession, output: AlertOutput) {
    if (this.sessions.get(hostId) !== session) return; // stopped while earlier speech was being made
    if (output.type === 'alert') {
      const speech = output.speak ? await this.speech.speak(session.voice, output.text) : null;
      this.hub.sendToOverlays(hostId, { type: 'alert', text: output.text, sound: output.sound, speech });
    } else {
      const speech = await this.speech.speak(session.voice, `${output.viewer} says ${output.text}`);
      this.hub.sendToOverlays(hostId, { type: 'tts', viewer: output.viewer, text: output.text, speech });
    }
  }

  private run(hostId: string, session: LiveSession, decisions: Decision[]) {
    for (const decision of decisions) {
      if (decision.delayMs) {
        const timer = setTimeout(() => {
          session.delayed.delete(timer);
          this.fire(hostId, session, decision);
        }, decision.delayMs);
        session.delayed.add(timer);
      } else {
        this.fire(hostId, session, decision);
      }
    }
    this.pushState(hostId, session);
  }

  private fire(hostId: string, session: LiveSession, decision: Decision) {
    this.hub.sendToCompanions(hostId, { type: 'action', action: decision.action });
    const levelUps = decision.credit.map((viewerId) => {
      const level = this.stats.record(hostId, viewerId, { commands: 1, xp: XP_PER_COMMAND });
      return [viewerId, level] as const;
    });
    // A level badge only makes sense when the overlay names one viewer (not "3 votes").
    const level = session.progression && decision.credit[0] === decision.viewer ? this.stats.levelOf(hostId, decision.viewer) : undefined;
    this.hub.sendToOverlays(hostId, {
      type: 'command',
      viewer: decision.viewer,
      keyword: decision.keyword,
      at: Date.now(),
      ...(level !== undefined && { level }),
    });
    for (const [viewerId, newLevel] of levelUps) this.levelUp(hostId, session, viewerId, newLevel);
  }

  private levelUp(hostId: string, session: LiveSession, viewer: string, level: number | null) {
    if (level !== null && session.progression) this.hub.sendToOverlays(hostId, { type: 'levelUp', viewer, level });
  }

  // Sends the mode state to overlays only when it changed.
  private pushState(hostId: string, session: LiveSession) {
    const state = session.engine.state();
    const json = JSON.stringify(state);
    if (json === session.lastState) return;
    session.lastState = json;
    this.hub.sendToOverlays(hostId, { type: 'mode', state, serverNow: Date.now() });
  }

  // The host's settings plus their active profile's commands, triggers and mode settings.
  private async loadConfig(hostId: string) {
    const [host] = await this.db.select().from(hosts).where(eq(hosts.id, hostId));
    if (!host) return null;
    const profile = await activeProfile(this.db, hostId);
    const [commandRows, triggerRows, alertRows] = await Promise.all([
      this.db.select().from(commands).where(eq(commands.profileId, profile.id)),
      this.db
        .select({ giftName: giftTriggers.giftName, keyword: commands.keyword })
        .from(giftTriggers)
        .innerJoin(commands, eq(giftTriggers.commandId, commands.id))
        .where(eq(giftTriggers.profileId, profile.id)),
      this.db.select().from(alertRules).where(eq(alertRules.hostId, hostId)),
    ]);
    const config: EngineConfig = {
      commands: commandRows,
      giftTriggers: triggerRows,
      actionsPerSecond: host.actionsPerSecond,
      voteWindowMs: profile.voteWindowMs,
      turnMs: profile.turnMs,
      giftBoosts: profile.giftBoosts,
      levelGating: host.progression && host.levelGating,
    };
    const alertConfig: AlertContext['config'] = {
      rules: alertRows,
      progression: host.progression,
      tts: {
        mode: host.ttsMode,
        prefix: host.ttsPrefix,
        maxLength: host.ttsMaxLength,
        cooldownMs: host.ttsCooldownMs,
        minLevel: host.ttsMinLevel,
        blockedWords: parseBlockedWords(host.ttsBlockedWords),
      },
    };
    return { host, mode: profile.mode, config, alertConfig, voice: voiceConfig(host, this.secrets) };
  }
}
