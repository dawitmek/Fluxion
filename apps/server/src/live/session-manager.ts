import { and, eq, isNull, sql } from 'drizzle-orm';
import { POINTS_CHECK, QUEUE_JOIN, XP_PER_COMMAND, type Mode, type RoomStats, type ServerToOverlay, type Speech, type ViewerEvent } from '@fluxion/shared';
import type { Secrets } from '../crypto.js';
import type { Db } from '../db/client.js';
import { commands, goals, hosts, streamEvents, streams } from '../db/schema.js';
import { StreamStatsTracker } from './stream-stats.js';
import { StreamRecorder } from './recorder.js';
import { createActions, parseBlockedWords, type ActionContext, type ActionOutput } from '../actions/engine.js';
import { loadActionRules } from '../actions/load.js';
import { voiceConfig, type SpeechService, type VoiceConfig } from '../tts/speech.js';
import { activeProfile } from '../profiles/active.js';
import { createEngine, keyPresses, type Decision, type Engine, type EngineConfig, type EngineContext } from '../engine/index.js';
import type { Hub } from '../gateway/hub.js';
import { DebugLog } from '../debug-log.js';
import type { Stats } from '../leaderboard/stats.js';
import { SimulatedAdapter } from '../platforms/simulated.js';
import type { PlatformAdapter } from '../platforms/types.js';

export type Source = 'tiktok' | 'simulated';

const TICK_MS = 250;
const DEFAULT_ALERT_MS = 5000;
const STATS_FLUSH_MS = 5000;
const CHAT_POINTS_EVERY_MS = 60_000; // chatting earns points at most this often per viewer
const POINTS_CHECK_COOLDOWN_MS = 10_000; // per viewer, so !points can't flood the overlay

// How viewers earn points, and whether they can check them. Null when the host has points off.
interface PointsConfig {
  perChat: number;
  perDiamond: number;
  perFollow: number;
  perShare: number;
  check: boolean;
}

interface LiveSession {
  source: Source;
  startedAt: number;
  adapter: PlatformAdapter;
  mode: Mode;
  progression: boolean;
  points: PointsConfig | null;
  lastEarned: Map<string, number>; // viewerId -> when chat last earned them points
  lastChecked: Map<string, number>; // viewerId -> when they last typed !points
  ctx: EngineContext;
  engine: Engine;
  actionCtx: ActionContext;
  actions: ReturnType<typeof createActions>;
  voice: VoiceConfig;
  outbox: Promise<void>; // alerts and speech go out in order, each after its audio is ready
  waiting: number; // alerts and speech in the outbox, for the debug log
  ticker: NodeJS.Timeout;
  delayed: Set<NodeJS.Timeout>; // pending repeats of gift-triggered presses
  lastState: string;
  recorder: StreamRecorder;
  room: RoomStats; // latest from the platform; empty until it reports
  stats: StreamStatsTracker;
  lastStats: string; // what overlays last got, so unchanged stats aren't resent
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
    private onError: (err: unknown) => void = () => {},
    private debug = new DebugLog(undefined),
  ) {}

  // Streams left open by a server that stopped without stopping them end at their last event.
  async closeAbandonedStreams() {
    const closed = await this.db
      .update(streams)
      .set({ endedAt: sql`coalesce((select max(${streamEvents.at}) from ${streamEvents} where ${streamEvents.streamId} = ${streams.id}), ${streams.startedAt})` })
      .where(isNull(streams.endedAt))
      .returning({ hostId: streams.hostId });
    // A stream left open means the server stopped without ending it (a crash, or killed), so overlays never heard it end.
    for (const { hostId } of closed) this.debug.write('live', hostId, 'closed a stream the last server run left open');
  }

  // The stream being recorded for a host right now, if any.
  currentStreamId(hostId: string): string | null {
    return this.sessions.get(hostId)?.recorder.streamId ?? null;
  }

  async start(hostId: string, source: Source) {
    await this.stop(hostId);
    const loaded = await this.loadConfig(hostId);
    if (!loaded) throw new LiveError('Host not found', 404);
    const { host, mode, config, actionConfig, voice, profileName, points, goalRows } = loaded;

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
      pointsOf: (viewerId) => this.stats.pointsOf(hostId, viewerId),
    };
    const actionCtx: ActionContext = {
      config: actionConfig,
      topGifters: () => session.room.topGifters,
      now: Date.now,
      levelOf: ctx.levelOf,
      isCommand: (text) => {
        const keyword = text.trim().toLowerCase();
        return keyword === QUEUE_JOIN || keyword === POINTS_CHECK || ctx.config.commands.some((c) => c.enabled && c.keyword === keyword);
      },
    };
    // Real streams are kept for analytics; a test-mode session is only kept until the next session starts.
    await this.db.delete(streams).where(and(eq(streams.hostId, hostId), eq(streams.source, 'simulated')));
    const [stream] = await this.db
      .insert(streams)
      .values({ hostId, source, profileName, tiktokUsername: host.tiktokUsername })
      .returning({ id: streams.id });
    const recorder = new StreamRecorder(this.db, stream!.id, this.onError);
    ctx.note = (kind, viewer, data) => recorder.add(kind, viewer, data);

    const session: LiveSession = {
      source,
      startedAt: Date.now(),
      adapter,
      mode,
      progression: host.progression,
      points,
      lastEarned: new Map(),
      lastChecked: new Map(),
      ctx,
      engine: createEngine(mode, ctx),
      actionCtx,
      actions: createActions(actionCtx),
      voice,
      outbox: Promise.resolve(),
      waiting: 0,
      ticker: setInterval(() => (this.run(hostId, session, session.engine.tick()), this.pushStats(hostId, session)), TICK_MS),
      delayed: new Set(),
      lastState: '',
      recorder,
      room: { viewers: 0, topGifters: [] },
      stats: new StreamStatsTracker(goalRows),
      lastStats: '',
    };
    adapter.onEvent((event) => this.onEvent(hostId, session, event));
    adapter.onRoomStats((room) => {
      session.room = room;
      session.stats.room(room);
    });
    adapter.onEnd(() => {
      if (this.sessions.get(hostId) === session) void this.stop(hostId, 'the TikTok LIVE ended or disconnected');
    });

    try {
      await this.stats.load(hostId, host.tiktokUsername);
      await adapter.start();
    } catch (err) {
      clearInterval(session.ticker);
      this.stats.unload(hostId);
      await recorder.close();
      await this.db.delete(streams).where(eq(streams.id, recorder.streamId));
      throw new LiveError(`Could not connect to TikTok LIVE: ${(err as Error).message}`, 409);
    }
    this.sessions.set(hostId, session);
    this.debug.write('live', hostId, 'started', { source, tiktok: host.tiktokUsername, mode, tts: actionConfig.tts.mode, voice: voice.engine });
    this.hub.sendToOverlays(hostId, { type: 'live', state: 'started' });
    this.pushState(hostId, session);
  }

  async stop(hostId: string, reason = 'asked to stop') {
    const session = this.sessions.get(hostId);
    if (!session) return;
    this.debug.write('live', hostId, `stopped: ${reason}`, { unsent: session.waiting });
    this.sessions.delete(hostId);
    clearInterval(session.ticker);
    for (const timer of session.delayed) clearTimeout(timer);
    this.stats.unload(hostId);
    await session.adapter.stop();
    await session.recorder.close();
    await this.db.update(streams).set({ endedAt: new Date() }).where(eq(streams.id, session.recorder.streamId));
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
  simulate(hostId: string, event: ViewerEvent | RoomStats): boolean {
    const session = this.sessions.get(hostId);
    if (!(session?.adapter instanceof SimulatedAdapter)) return false;
    if ('kind' in event) session.adapter.inject(event);
    else session.adapter.injectStats(event);
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
    const ttsBefore = session.actionCtx.config.tts.mode;
    if (ttsBefore !== loaded.actionConfig.tts.mode) {
      this.debug.write('tts', hostId, `read chat aloud: ${ttsBefore} -> ${loaded.actionConfig.tts.mode}`, { unsent: session.waiting });
      // Turned off: chat stops being read now, not after the lines already waiting. Alerts still speak.
      if (loaded.actionConfig.tts.mode === 'off') this.hub.sendToOverlays(hostId, { type: 'clearSpeech', chatOnly: true });
    }
    // Lines the overlay already holds were made with the old voice; without this a switch waits for them all.
    if (JSON.stringify(loaded.voice) !== JSON.stringify(session.voice)) {
      this.debug.write('tts', hostId, `voice changed, overlays told to drop their speech: ${session.voice.engine} -> ${loaded.voice.engine}`);
      this.hub.sendToOverlays(hostId, { type: 'clearSpeech' });
    }
    // Actions turned off or deleted take back their alerts now: ones not sent yet are dropped in deliver(), and
    // overlays drop the ones they hold, the one showing too.
    const on = new Set(loaded.actionConfig.actions.filter((a) => a.enabled).map((a) => a.id));
    const off = session.actionCtx.config.actions.filter((a) => a.enabled && !on.has(a.id));
    if (off.length > 0) {
      this.debug.write('alert', hostId, 'actions turned off, overlays told to drop their alerts', { actions: off.map((a) => a.id), unsent: session.waiting });
      this.hub.sendToOverlays(hostId, { type: 'dropAlerts', actions: off.map((a) => a.id) });
    }
    session.actionCtx.config = loaded.actionConfig;
    session.voice = loaded.voice;
    session.points = loaded.points;
    session.stats.setGoals(loaded.goalRows);
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
      { type: 'stats', stats: session.stats.snapshot() },
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
    await Promise.all([...this.sessions.keys()].map((hostId) => this.stop(hostId, 'server shutting down')));
  }

  async close() {
    clearInterval(this.statsTimer);
    await this.stopAll();
    await this.flushStats();
  }

  private onEvent(hostId: string, session: LiveSession, event: ViewerEvent) {
    session.recorder.add(event.kind, event.viewerId, eventData(event), event.at);
    if (event.kind === 'gift') {
      const xp = Math.max(1, event.diamonds) * event.count;
      this.levelUp(hostId, session, event.viewerId, this.stats.record(hostId, event.viewerId, { gifts: event.count, xp }));
    }
    if (session.points) this.earn(hostId, session, session.points, event);
    // Widgets: chat lines, and gifts for the coin jar and fireworks.
    if (event.kind === 'comment') this.hub.sendToOverlays(hostId, { type: 'chat', viewer: event.viewerId, text: event.text });
    if (event.kind === 'gift') {
      this.hub.sendToOverlays(hostId, { type: 'gift', viewer: event.viewerId, gift: event.giftName, count: event.count, diamonds: event.diamonds * event.count });
    }
    this.run(hostId, session, session.engine.handle(event));
    this.perform(hostId, session, session.actions.handle(event));
    for (const goal of session.stats.add(event)) this.perform(hostId, session, session.actions.goalReached(goal, event));
  }

  private perform(hostId: string, session: LiveSession, outputs: ActionOutput[]) {
    for (const output of outputs) {
      if (output.type === 'key') this.run(hostId, session, keyPresses(session.ctx, output.keyword, output.viewer, output.repeats));
      else if (output.type === 'points') this.stats.record(hostId, output.viewer, { points: output.amount });
      // speak() never throws, but a broken chain would silence every later alert, so guard anyway.
      else {
        session.waiting++;
        if (output.type === 'tts') {
          this.debug.write('tts', hostId, 'chat line to read aloud', { viewer: output.viewer, text: output.text, mode: session.actionCtx.config.tts.mode, waiting: session.waiting });
        } else if (output.speak) this.debug.write('alert', hostId, 'alert to read aloud', { text: output.text, waiting: session.waiting });
        session.outbox = session.outbox
          .then(() => this.deliver(hostId, session, output))
          .catch(() => {})
          .finally(() => session.waiting--);
      }
    }
  }

  // Sends the stream's totals to overlays when they changed; checked a few times a second, so a burst of likes is one message.
  private pushStats(hostId: string, session: LiveSession) {
    const stats = session.stats.snapshot();
    const json = JSON.stringify(stats);
    if (json === session.lastStats) return;
    session.lastStats = json;
    this.hub.sendToOverlays(hostId, { type: 'stats', stats });
  }

  private async deliver(hostId: string, session: LiveSession, output: Extract<ActionOutput, { type: 'alert' | 'tts' }>) {
    const area = output.type === 'tts' ? 'tts' : 'alert';
    if (this.sessions.get(hostId) !== session) {
      if (output.type === 'tts' || output.speak) this.debug.write(area, hostId, 'dropped, the stream ended first', { text: output.text });
      return; // stopped while earlier speech was being made
    }
    if (output.type === 'tts' && session.actionCtx.config.tts.mode === 'off') {
      return this.debug.write(area, hostId, 'dropped, reading chat was turned off', { viewer: output.viewer, text: output.text });
    }
    if (output.type === 'alert' && !session.actionCtx.config.actions.some((a) => a.id === output.action && a.enabled)) {
      return this.debug.write(area, hostId, 'dropped, its action was turned off', { text: output.text });
    }
    const began = Date.now();
    if (output.type === 'alert') {
      const speech = output.speak ? await this.speech.speak(session.voice, output.text) : null;
      if (speech) this.debug.write(area, hostId, 'sent to overlays', { text: output.text, speech: speech.kind, madeInMs: Date.now() - began });
      this.hub.sendToOverlays(hostId, alertMessage(output, speech));
    } else {
      const speech = await this.speech.speak(session.voice, `${output.viewer} says ${output.text}`);
      this.debug.write(area, hostId, 'sent to overlays', { viewer: output.viewer, speech: speech.kind, madeInMs: Date.now() - began });
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
    // Actions credit nobody; a democracy vote names its tally ("3 votes") rather than a viewer.
    const via = decision.credit.length === 0 ? 'action' : decision.credit.includes(decision.viewer) ? 'chat' : 'vote';
    session.recorder.add('command', via === 'vote' ? null : decision.viewer, { keyword: decision.keyword, via });
    const levelUps = decision.credit.map((viewerId) => {
      const level = this.stats.record(hostId, viewerId, { commands: 1, xp: XP_PER_COMMAND, points: -decision.cost });
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

  // Points for what a viewer did, and the answer to !points.
  private earn(hostId: string, session: LiveSession, points: PointsConfig, event: ViewerEvent) {
    const viewer = event.viewerId;
    const t = Date.now();
    let earned = 0;
    if (event.kind === 'comment') {
      const last = session.lastEarned.get(viewer);
      if (last === undefined || t - last >= CHAT_POINTS_EVERY_MS) {
        session.lastEarned.set(viewer, t);
        earned = points.perChat;
      }
    } else if (event.kind === 'gift') earned = event.diamonds * event.count * points.perDiamond;
    else if (event.kind === 'follow') earned = points.perFollow;
    else if (event.kind === 'share') earned = points.perShare;
    if (earned > 0) this.stats.record(hostId, viewer, { points: earned });

    if (event.kind === 'comment' && points.check && event.text.trim().toLowerCase() === POINTS_CHECK) {
      const last = session.lastChecked.get(viewer);
      if (last !== undefined && t - last < POINTS_CHECK_COOLDOWN_MS) return;
      session.lastChecked.set(viewer, t);
      this.hub.sendToOverlays(hostId, { type: 'points', viewer, points: this.stats.pointsOf(hostId, viewer) });
    }
  }

  private levelUp(hostId: string, session: LiveSession, viewer: string, level: number | null) {
    if (level !== null) session.recorder.add('level', viewer, { level });
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
    const [commandRows, actionRows, goalRows] = await Promise.all([
      this.db.select().from(commands).where(eq(commands.profileId, profile.id)),
      loadActionRules(this.db, hostId, profile.id),
      this.db
        .select({ id: goals.id, name: goals.name, metric: goals.metric, target: goals.target, enabled: goals.enabled })
        .from(goals)
        .where(eq(goals.hostId, hostId))
        .orderBy(goals.position),
    ]);
    const profileName = profile.name;
    const config: EngineConfig = {
      commands: commandRows,
      actionsPerSecond: host.actionsPerSecond,
      voteWindowMs: profile.voteWindowMs,
      turnMs: profile.turnMs,
      giftBoosts: profile.giftBoosts,
      levelGating: host.progression && host.levelGating,
      points: host.points,
    };
    const actionConfig: ActionContext['config'] = {
      actions: actionRows,
      progression: host.progression,
      points: host.points,
      tts: {
        mode: host.ttsMode,
        prefix: host.ttsPrefix,
        maxLength: host.ttsMaxLength,
        cooldownMs: host.ttsCooldownMs,
        minLevel: host.ttsMinLevel,
        blockedWords: parseBlockedWords(host.ttsBlockedWords),
      },
    };
    const points: PointsConfig | null = host.points
      ? {
          perChat: host.pointsPerChat,
          perDiamond: host.pointsPerDiamond,
          perFollow: host.pointsPerFollow,
          perShare: host.pointsPerShare,
          check: host.pointsCheck,
        }
      : null;
    return { host, mode: profile.mode, config, actionConfig, voice: voiceConfig(host, this.secrets), profileName, points, goalRows };
  }
}

// The overlay message for an action's alert; optional parts are left out when unused.
export function alertMessage(output: Extract<ActionOutput, { type: 'alert' }>, speech: Speech | null): ServerToOverlay {
  return {
    type: 'alert',
    action: output.action,
    text: output.text,
    sound: output.sound,
    speech,
    ...(output.soundFile && { soundFile: output.soundFile }),
    ...(output.media && { media: output.media }),
    ...(output.durationMs !== DEFAULT_ALERT_MS && { durationMs: output.durationMs }),
    ...(output.screen && { screen: output.screen }),
    ...(output.pos && { pos: output.pos }),
    ...(output.scale !== 100 && { scale: output.scale }),
  };
}

// What's kept of each viewer event besides its kind, viewer and time.
function eventData(event: ViewerEvent): Record<string, unknown> {
  switch (event.kind) {
    case 'comment':
      return { text: event.text };
    case 'gift':
      return { gift: event.giftName, count: event.count, diamonds: event.diamonds };
    case 'like':
      return { count: event.count };
    case 'subscribe':
      return { months: event.months };
    case 'emote':
      return { emoteId: event.emoteId };
    default:
      return {};
  }
}
