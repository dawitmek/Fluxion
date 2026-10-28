import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { sql } from 'drizzle-orm';
import { PROTOCOL_VERSION } from '@fluxion/shared';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import type { PlatformAdapter } from '../src/platforms/types.js';
import { Piper } from '../src/tts/piper.js';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://fluxion:fluxion@127.0.0.1:5432/fluxion_test';

let app: Awaited<ReturnType<typeof buildApp>>;
let baseWs: string;
const sockets: WebSocket[] = [];

// Stands in for cloud TTS providers: records requests and answers with fake MP3 bytes.
const cloudRequests: { url: string; init: RequestInit }[] = [];
const fakeFetch = (async (url: string | URL, init: RequestInit = {}) => {
  cloudRequests.push({ url: String(url), init });
  if (String(url).includes('bad-key')) return new Response('{"error":"API key not valid"}', { status: 403 });
  const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
  if (String(url).includes('googleapis.com/v1/voices')) return Response.json({ voices: [{ name: 'en-GB-Neural2-A', ssmlGender: 'FEMALE' }] });
  // Google wraps audio in JSON; Azure and ElevenLabs return the bytes.
  if (String(url).includes('googleapis')) return Response.json({ audioContent: Buffer.from(mp3).toString('base64') });
  return new Response(mp3, { status: 200 });
}) as typeof fetch;

beforeAll(async () => {
  await runMigrations(databaseUrl);
  const fakeTikTok = (): PlatformAdapter => {
    throw new Error('TikTok must not be contacted in tests');
  };
  app = await buildApp(
    { databaseUrl, port: 0, host: '127.0.0.1', eulerApiKey: undefined, production: false, secureCookies: false, piperBin: undefined, piperVoicesDir: undefined },
    { logger: false, createTikTok: fakeTikTok, fetch: fakeFetch },
  );
  await app.listen({ port: 0, host: '127.0.0.1' });
  baseWs = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await app.live.stopAll();
  await app.db.execute(sql`TRUNCATE hosts, auth_sessions, profiles, commands, companions, pairing_codes, gift_triggers, viewer_stats, alert_rules CASCADE`);
});

// --- helpers ---------------------------------------------------------------

// Each signup and pairing comes from its own address so the rate limits (10/min per IP) don't trip.
let clientCount = 0;
const nextAddress = () => `10.0.${Math.floor(++clientCount / 250)}.${clientCount % 250}`;

async function signUp(email = 'host@example.com') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email, password: 'correct horse' },
    remoteAddress: nextAddress(),
  });
  expect(res.statusCode).toBe(201);
  const cookie = res.cookies.find((c) => c.name === 'fluxion_session')!;
  return { cookie: `${cookie.name}=${cookie.value}`, id: res.json().id as string };
}

const api = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { cookie } });

async function pairCompanion(cookie: string) {
  const { code } = (await api(cookie, 'POST', '/api/companions/pairing-code')).json();
  const res = await app.inject({ method: 'POST', url: '/api/companions/pair', payload: { code, name: 'Gaming PC' }, remoteAddress: nextAddress() });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; token: string };
}

// A WebSocket client that buffers messages so tests can await them in order.
function connect(path: string) {
  const socket = new WebSocket(baseWs + path);
  sockets.push(socket);
  const inbox: any[] = [];
  const waiters: ((m: any) => void)[] = [];
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    const waiter = waiters.shift();
    waiter ? waiter(message) : inbox.push(message);
  });
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  return {
    socket,
    closed,
    opened: new Promise<void>((resolve) => socket.on('open', () => resolve())),
    next: () =>
      inbox.length > 0
        ? Promise.resolve(inbox.shift())
        : new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('No message within 2s')), 2000);
            waiters.push((m) => (clearTimeout(timer), resolve(m)));
          }),
    // Resolves to the messages that arrived within `ms`; used to assert nothing was sent.
    drain: (ms = 200) => new Promise<any[]>((resolve) => setTimeout(() => resolve(inbox.splice(0)), ms)),
    send: (message: object) => socket.send(JSON.stringify(message)),
  };
}

async function connectCompanion(token: string) {
  const companion = connect('/ws/companion');
  await companion.opened;
  companion.send({ type: 'hello', token, protocol: PROTOCOL_VERSION });
  return companion;
}

// --- tests -----------------------------------------------------------------

describe('accounts', () => {
  it('seeds default commands on signup and rejects duplicate emails', async () => {
    const { cookie } = await signUp();
    const commands = (await api(cookie, 'GET', '/api/commands')).json();
    expect(commands.map((c: any) => [c.keyword, c.key]).sort()).toEqual([
      ['down', 'KeyS'],
      ['jump', 'Space'],
      ['left', 'KeyA'],
      ['right', 'KeyD'],
      ['up', 'KeyW'],
    ]);
    const dup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'HOST@example.com', password: 'whatever123' } });
    expect(dup.statusCode).toBe(409);
  });

  it('logs in, rejects a wrong password, and logs out', async () => {
    await signUp();
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'host@example.com', password: 'wrong password' } });
    expect(bad.statusCode).toBe(401);
    const good = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'host@example.com', password: 'correct horse' } });
    expect(good.statusCode).toBe(200);
    const cookie = `fluxion_session=${good.cookies.find((c) => c.name === 'fluxion_session')!.value}`;
    expect((await api(cookie, 'GET', '/api/auth/me')).json().email).toBe('host@example.com');
    await api(cookie, 'POST', '/api/auth/logout');
    expect((await api(cookie, 'GET', '/api/auth/me')).statusCode).toBe(401);
  });

  it('rate-limits repeated login attempts from one address', async () => {
    const remoteAddress = nextAddress();
    const attempt = () =>
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@example.com', password: 'wrong password' }, remoteAddress });
    for (let i = 0; i < 10; i++) expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
  });

  it('refuses commands that press disallowed keys or use the reserved queue keyword', async () => {
    const { cookie } = await signUp();
    const res = await api(cookie, 'POST', '/api/commands', { keyword: 'quit', key: 'AltLeft', holdMs: 100, cooldownMs: 0 });
    expect(res.statusCode).toBe(400);
    const join = await api(cookie, 'POST', '/api/commands', { keyword: 'Join', key: 'KeyJ', holdMs: 100, cooldownMs: 0 });
    expect(join.statusCode).toBe(400);
  });

  it('requires a TikTok username before going live on TikTok', async () => {
    const { cookie } = await signUp();
    expect((await api(cookie, 'POST', '/api/live/start', { source: 'tiktok' })).statusCode).toBe(400);
  });
});

describe('live pipeline (simulated source)', () => {
  it('turns viewer comments into companion key presses and overlay events', async () => {
    const { cookie } = await signUp();
    const { token } = await pairCompanion(cookie);
    const me = (await api(cookie, 'GET', '/api/auth/me')).json();

    const companion = await connectCompanion(token);
    expect(await companion.next()).toMatchObject({ type: 'ready', hostId: me.id });
    expect(await companion.next()).toEqual({ type: 'profile', name: 'Default', gameProcess: null });
    const overlay = connect(`/ws/overlay?token=${me.overlayToken}`);
    await overlay.opened;

    expect((await api(cookie, 'POST', '/api/live/start', { source: 'simulated' })).json()).toEqual({
      live: true,
      source: 'simulated',
      mode: 'anarchy',
      startedAt: expect.any(Number),
      companionsOnline: 1,
    });
    expect(await overlay.next()).toEqual({ type: 'live', state: 'started' });
    expect(await overlay.next()).toMatchObject({ type: 'mode', state: { mode: 'anarchy' } });

    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', text: 'LEFT' });
    expect(await companion.next()).toMatchObject({ type: 'action', action: { key: 'KeyA', holdMs: 300 } });
    expect(await overlay.next()).toMatchObject({ type: 'command', viewer: 'alice', keyword: 'left' });

    // Same viewer within the 1s cooldown: nothing. Another viewer: fires.
    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', text: 'left' });
    expect(await companion.drain()).toEqual([]);
    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'bob', text: 'left' });
    expect(await companion.next()).toMatchObject({ type: 'action', action: { key: 'KeyA' } });

    expect(await overlay.next()).toMatchObject({ type: 'command', viewer: 'bob', keyword: 'left' });

    await api(cookie, 'POST', '/api/live/stop');
    expect(await overlay.next()).toEqual({ type: 'live', state: 'stopped' });
  });

  it('picks up command changes mid-stream', async () => {
    const { cookie } = await signUp();
    const { token } = await pairCompanion(cookie);
    const companion = await connectCompanion(token);
    await companion.next(); // ready
    await companion.next(); // profile
    await api(cookie, 'POST', '/api/live/start', { source: 'simulated' });

    const created = await api(cookie, 'POST', '/api/commands', { keyword: 'Shoot', key: 'KeyF', holdMs: 50, cooldownMs: 0 });
    expect(created.statusCode).toBe(201);
    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', text: 'shoot' });
    expect(await companion.next()).toMatchObject({ type: 'action', action: { key: 'KeyF', holdMs: 50 } });
  });

  it("keeps hosts isolated from each other's sessions", async () => {
    const a = await signUp('a@example.com');
    const b = await signUp('b@example.com');
    const companionB = await connectCompanion((await pairCompanion(b.cookie)).token);
    await companionB.next(); // ready
    await companionB.next(); // profile

    await api(a.cookie, 'POST', '/api/live/start', { source: 'simulated' });
    await api(a.cookie, 'POST', '/api/live/simulate', { viewer: 'alice', text: 'left' });
    expect(await companionB.drain()).toEqual([]);
    // B has no session of its own to simulate into.
    expect((await api(b.cookie, 'POST', '/api/live/simulate', { viewer: 'x', text: 'left' })).statusCode).toBe(409);
  });
});

describe('modes, gifts and leaderboard (simulated source)', () => {
  async function liveHost() {
    const host = await signUp();
    const companion = await connectCompanion((await pairCompanion(host.cookie)).token);
    await companion.next(); // ready
    await companion.next(); // profile
    const me = (await api(host.cookie, 'GET', '/api/auth/me')).json();
    await api(host.cookie, 'POST', '/api/live/start', { source: 'simulated' });
    const say = (viewer: string, text: string) => api(host.cookie, 'POST', '/api/live/simulate', { viewer, text });
    return { ...host, companion, me, say };
  }

  it('switches to democracy mid-stream and fires the winning vote', async () => {
    const { cookie, companion, me, say } = await liveHost();
    const overlay = connect(`/ws/overlay?token=${me.overlayToken}`);
    // A late-joining overlay catches up on the session.
    expect(await overlay.next()).toEqual({ type: 'live', state: 'started' });
    expect(await overlay.next()).toMatchObject({ type: 'mode', state: { mode: 'anarchy' } });
    expect(await overlay.next()).toEqual({ type: 'leaderboard', entries: [], progression: false });

    expect((await api(cookie, 'PATCH', '/api/settings', { mode: 'democracy', voteWindowMs: 1000 })).statusCode).toBe(200);
    expect(await overlay.next()).toMatchObject({ type: 'mode', state: { mode: 'democracy', tally: [], endsAt: null } });
    expect((await api(cookie, 'GET', '/api/live/status')).json().mode).toBe('democracy');

    await say('alice', 'left');
    await say('bob', 'right');
    await say('carol', 'right');
    expect(await companion.drain(300)).toEqual([]); // nothing until the window closes
    expect(await companion.next()).toMatchObject({ type: 'action', action: { key: 'KeyD' } });
    expect(await companion.drain(1200)).toEqual([]); // exactly one press
    const messages = await overlay.drain(0);
    expect(messages).toContainEqual(expect.objectContaining({ type: 'command', viewer: '2 votes', keyword: 'right' }));
  });

  it('presses a gift trigger once per gift and counts gifts on the leaderboard', async () => {
    const { cookie, companion, say } = await liveHost();
    const commands = (await api(cookie, 'GET', '/api/commands')).json();
    const jump = commands.find((c: any) => c.keyword === 'jump');
    const created = await api(cookie, 'POST', '/api/gift-triggers', { giftName: 'Rose', commandId: jump.id });
    expect(created.statusCode).toBe(201);
    expect((await api(cookie, 'POST', '/api/gift-triggers', { giftName: 'rose', commandId: jump.id })).statusCode).toBe(409);
    expect((await api(cookie, 'GET', '/api/gift-triggers')).json()).toMatchObject([{ giftName: 'rose', keyword: 'jump' }]);

    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', gift: 'Rose', count: 2 });
    expect(await companion.next()).toMatchObject({ action: { key: 'Space' } });
    expect(await companion.next()).toMatchObject({ action: { key: 'Space' } }); // repeat, 400 ms later
    await say('bob', 'left');
    await companion.next();

    await app.live.flushStats();
    expect((await api(cookie, 'GET', '/api/leaderboard')).json()).toEqual([
      { viewer: 'alice', commands: 0, gifts: 2, xp: 2 }, // 1 diamond per simulated gift
      { viewer: 'bob', commands: 1, gifts: 0, xp: 1 },
    ]);
    const me = (await api(cookie, 'GET', '/api/auth/me')).json();
    const overlay = connect(`/ws/overlay?token=${me.overlayToken}`);
    await overlay.next(); // live
    await overlay.next(); // mode
    expect((await overlay.next()).entries).toHaveLength(2);
    expect((await api(cookie, 'DELETE', '/api/leaderboard')).statusCode).toBe(204);
    expect((await api(cookie, 'GET', '/api/leaderboard')).json()).toEqual([]);
    expect(await overlay.next()).toEqual({ type: 'leaderboard', entries: [], progression: false });
  });

  it('rejects a simulate request with both or neither of text and gift', async () => {
    const { cookie } = await liveHost();
    const bad = (payload: object) => api(cookie, 'POST', '/api/live/simulate', payload);
    expect((await bad({ viewer: 'a' })).statusCode).toBe(400);
    expect((await bad({ viewer: 'a', text: 'left', gift: 'Rose' })).statusCode).toBe(400);
  });
});

describe('game profiles', () => {
  it('switches commands and tells the companion which game to target', async () => {
    const { cookie } = await signUp();
    const companion = await connectCompanion((await pairCompanion(cookie)).token);
    await companion.next(); // ready
    expect(await companion.next()).toEqual({ type: 'profile', name: 'Default', gameProcess: null });
    await api(cookie, 'POST', '/api/live/start', { source: 'simulated' });

    // A new profile copies the active one; editing it doesn't touch the original.
    const created = await api(cookie, 'POST', '/api/profiles', { name: 'GTA V', gameProcess: 'GTA5.exe' });
    expect(created.statusCode).toBe(201);
    const gta = created.json();
    expect(gta.gameProcess).toBe('gta5.exe');
    expect((await api(cookie, 'POST', '/api/profiles', { name: 'GTA V' })).statusCode).toBe(409);
    expect((await api(cookie, 'POST', '/api/profiles', { name: 'Bad', gameProcess: 'C:\\Games\\gta5.exe' })).statusCode).toBe(400);
    // macOS process names have no extension.
    expect((await api(cookie, 'POST', '/api/profiles', { name: 'Mac game', gameProcess: 'TextEdit' })).json().gameProcess).toBe('textedit');

    expect((await api(cookie, 'POST', `/api/profiles/${gta.id}/activate`)).statusCode).toBe(200);
    expect(await companion.next()).toEqual({ type: 'profile', name: 'GTA V', gameProcess: 'gta5.exe' });
    const gtaCommands = (await api(cookie, 'GET', '/api/commands')).json();
    expect(gtaCommands.map((c: any) => c.keyword).sort()).toEqual(['down', 'jump', 'left', 'right', 'up']);
    const left = gtaCommands.find((c: any) => c.keyword === 'left');
    await api(cookie, 'PATCH', `/api/commands/${left.id}`, { key: 'KeyQ' });

    // The live session uses the active profile's commands immediately.
    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', text: 'left' });
    expect(await companion.next()).toMatchObject({ type: 'action', action: { key: 'KeyQ' } });

    const list = (await api(cookie, 'GET', '/api/profiles')).json();
    expect(list.map((p: any) => [p.name, p.active])).toEqual([
      ['Default', false],
      ['GTA V', true],
      ['Mac game', false],
    ]);
    const original = list.find((p: any) => p.name === 'Default');
    expect((await api(cookie, 'DELETE', `/api/profiles/${gta.id}`)).statusCode).toBe(409); // active
    await api(cookie, 'POST', `/api/profiles/${original.id}/activate`);
    expect(await companion.next()).toMatchObject({ type: 'profile', name: 'Default' });
    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'bob', text: 'left' });
    expect(await companion.next()).toMatchObject({ type: 'action', action: { key: 'KeyA' } });
    expect((await api(cookie, 'DELETE', `/api/profiles/${gta.id}`)).statusCode).toBe(204);
  });

  it("can't reach another host's profiles", async () => {
    const a = await signUp('a@example.com');
    const b = await signUp('b@example.com');
    const [profileA] = (await api(a.cookie, 'GET', '/api/profiles')).json();
    expect((await api(b.cookie, 'POST', `/api/profiles/${profileA.id}/activate`)).statusCode).toBe(404);
    expect((await api(b.cookie, 'PATCH', `/api/profiles/${profileA.id}`, { name: 'x' })).statusCode).toBe(404);
  });
});

describe('viewer progression', () => {
  it('gates commands by level, levels viewers up and shows levels on the overlay', async () => {
    const { cookie } = await signUp();
    const companion = await connectCompanion((await pairCompanion(cookie)).token);
    await companion.next(); // ready
    await companion.next(); // profile
    const me = (await api(cookie, 'GET', '/api/auth/me')).json();
    expect([me.progression, me.levelGating]).toEqual([false, false]);
    const left = (await api(cookie, 'GET', '/api/commands')).json().find((c: any) => c.keyword === 'left');
    await api(cookie, 'PATCH', `/api/commands/${left.id}`, { minLevel: 2 });
    await api(cookie, 'PATCH', '/api/settings', { progression: true, levelGating: true });

    await api(cookie, 'POST', '/api/live/start', { source: 'simulated' });
    const overlay = connect(`/ws/overlay?token=${me.overlayToken}`);
    await overlay.next(); // live
    await overlay.next(); // mode
    expect(await overlay.next()).toEqual({ type: 'leaderboard', entries: [], progression: true });

    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', text: 'left' });
    expect(await companion.drain()).toEqual([]); // level 1 < 2

    // A 10-diamond gift is 10 XP: level 2.
    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', gift: 'Lion', diamonds: 10 });
    expect(await overlay.next()).toEqual({ type: 'levelUp', viewer: 'alice', level: 2 });
    expect(await overlay.next()).toMatchObject({ type: 'alert', text: 'alice sent 1× Lion!', sound: 'coin' }); // starter alert
    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', text: 'left' });
    expect(await companion.next()).toMatchObject({ type: 'action', action: { key: 'KeyA' } });
    expect(await overlay.next()).toMatchObject({ type: 'command', viewer: 'alice', keyword: 'left', level: 2 });

    // XP survives going offline and back.
    await api(cookie, 'POST', '/api/live/stop');
    await app.live.flushStats();
    await api(cookie, 'POST', '/api/live/start', { source: 'simulated' });
    await api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', text: 'left' });
    expect(await companion.next()).toMatchObject({ type: 'action', action: { key: 'KeyA' } });
    await app.live.flushStats();
    expect((await api(cookie, 'GET', '/api/leaderboard')).json()).toEqual([{ viewer: 'alice', commands: 2, gifts: 1, xp: 12 }]);
  });
});

describe('alerts and text-to-speech', () => {
  // The 5 s stats flush can push a leaderboard at any moment; these tests don't care about it.
  const withoutLeaderboard = (messages: any[]) => messages.filter((m) => m.type !== 'leaderboard');

  it('seeds starter alerts, tests them offline, and speaks prefixed chat while live', async () => {
    const { cookie } = await signUp();
    const me = (await api(cookie, 'GET', '/api/auth/me')).json();
    expect(me).toMatchObject({ ttsMode: 'prefix', ttsPrefix: '!tts', ttsVoice: null });
    const alerts = (await api(cookie, 'GET', '/api/alerts')).json();
    expect(alerts.map((a: any) => a.event).sort()).toEqual(['follow', 'gift', 'likes', 'share']);

    // The Test button works without being live.
    const overlay = connect(`/ws/overlay?token=${me.overlayToken}`);
    await overlay.opened;
    const follow = alerts.find((a: any) => a.event === 'follow');
    await api(cookie, 'POST', `/api/alerts/${follow.id}/test`);
    expect(await overlay.next()).toEqual({ type: 'alert', text: 'test_viewer followed!', sound: 'chime', speech: null });

    // Validation: likes need a step; event-specific fields are cleared for other events.
    expect((await api(cookie, 'POST', '/api/alerts', { event: 'likes', template: 'x' })).statusCode).toBe(400);
    expect((await api(cookie, 'POST', '/api/alerts', { event: 'follow', template: 'x', sound: 'airhorn' })).statusCode).toBe(400);
    const lion = await api(cookie, 'POST', '/api/alerts', {
      event: 'gift',
      giftName: ' Lion ',
      likeStep: 5,
      template: 'ROAR {viewer}',
      sound: 'fanfare',
      speak: true,
    });
    expect(lion.statusCode).toBe(201);
    expect(lion.json()).toMatchObject({ giftName: 'lion', likeStep: null });

    // The default engine is Piper; this test server has none, so speech falls back to in-overlay eSpeak.
    await api(cookie, 'PATCH', '/api/settings', { ttsEspeakVoice: 'en-gb', ttsCooldownMs: 0 });
    await api(cookie, 'POST', '/api/live/start', { source: 'simulated' });
    await overlay.drain(100); // live + mode + leaderboard
    const sim = (payload: object) => api(cookie, 'POST', '/api/live/simulate', { viewer: 'alice', ...payload });

    await sim({ event: 'follow' });
    const nextAlert = async () => {
      for (;;) {
        const m = await overlay.next();
        if (m.type !== 'leaderboard') return m;
      }
    };
    expect(await nextAlert()).toMatchObject({ type: 'alert', text: 'alice followed!' });
    await sim({ gift: 'Lion' });
    expect(await nextAlert()).toEqual({ type: 'alert', text: 'ROAR alice', sound: 'fanfare', speech: { kind: 'espeak', text: 'ROAR alice', voice: 'en-gb', effect: 'none' } });
    await sim({ event: 'like', count: 1000 });
    expect(await nextAlert()).toMatchObject({ type: 'alert', text: '1000 likes! Thanks alice' });

    await sim({ text: '!tts hello chat' });
    expect(await nextAlert()).toEqual({
      type: 'tts',
      viewer: 'alice',
      text: 'hello chat',
      speech: { kind: 'espeak', text: 'alice says hello chat', voice: 'en-gb', effect: 'none' },
    });
    await sim({ text: 'hello chat' });
    expect(withoutLeaderboard(await overlay.drain())).toEqual([]);

    // Switching to "all" applies mid-stream; commands still aren't read.
    expect((await api(cookie, 'PATCH', '/api/settings', { ttsMode: 'all' })).statusCode).toBe(200);
    await sim({ text: 'hello chat' });
    expect(await nextAlert()).toMatchObject({ type: 'tts', text: 'hello chat' });
    await sim({ text: 'jump' });
    expect((await overlay.drain()).filter((m) => m.type === 'tts')).toEqual([]);

    expect((await api(cookie, 'DELETE', `/api/alerts/${follow.id}`)).statusCode).toBe(204);
    await sim({ event: 'follow' });
    expect(withoutLeaderboard(await overlay.drain())).toEqual([]);
  });

  it('speaks through the chosen engine, keeps cloud keys secret, and reports cloud errors on preview', async () => {
    const { cookie } = await signUp();
    expect((await api(cookie, 'GET', '/api/tts/options')).json()).toMatchObject({ piperVoices: [], espeakVoices: expect.arrayContaining(['en-us']) });

    await api(cookie, 'PATCH', '/api/settings', { ttsEngine: 'browser', ttsVoice: 'Microsoft Zira', ttsEffect: 'chipmunk' });
    expect((await api(cookie, 'POST', '/api/tts/preview', { text: 'hi' })).json()).toEqual({
      kind: 'browser',
      text: 'hi',
      voice: 'Microsoft Zira',
      effect: 'chipmunk',
    });
    expect((await api(cookie, 'PATCH', '/api/settings', { ttsEffect: 'kazoo' })).statusCode).toBe(400);

    // Cloud without a key is an error on preview (live speech would fall back to eSpeak instead).
    await api(cookie, 'PATCH', '/api/settings', { ttsEngine: 'cloud' });
    expect((await api(cookie, 'POST', '/api/tts/preview')).statusCode).toBe(502);
    expect((await api(cookie, 'GET', '/api/tts/cloud-voices')).statusCode).toBe(400);

    const res = await api(cookie, 'PATCH', '/api/settings', { ttsCloudProvider: 'google', ttsCloudKey: 'secret-123', ttsCloudVoice: 'en-GB-Neural2-A' });
    expect(res.statusCode).toBe(200);
    const me = (await api(cookie, 'GET', '/api/auth/me')).json();
    expect(me).toMatchObject({ ttsCloudProvider: 'google', ttsCloudKeySet: true });
    expect(JSON.stringify(me)).not.toContain('secret-123');

    cloudRequests.length = 0;
    expect((await api(cookie, 'POST', '/api/tts/preview', { text: 'hi' })).json()).toEqual({ kind: 'audio', data: '//uQAA==', mime: 'audio/mpeg', effect: 'chipmunk' });
    expect((await api(cookie, 'GET', '/api/tts/cloud-voices')).json()).toEqual([{ id: 'en-GB-Neural2-A', label: 'en-GB-Neural2-A (female)' }]);
    expect(cloudRequests[0]!.url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize?key=secret-123');
    expect(JSON.parse(String(cloudRequests[0]!.init.body))).toMatchObject({ input: { text: 'hi' }, voice: { languageCode: 'en-GB', name: 'en-GB-Neural2-A' } });

    await api(cookie, 'PATCH', '/api/settings', { ttsCloudKey: 'bad-key' });
    const bad = await api(cookie, 'POST', '/api/tts/preview');
    expect(bad.statusCode).toBe(502);
    expect(bad.json().error).toContain('Google TTS failed (403)');

    // Clearing the key works too.
    await api(cookie, 'PATCH', '/api/settings', { ttsCloudKey: null });
    expect((await api(cookie, 'GET', '/api/auth/me')).json().ttsCloudKeySet).toBe(false);
  });

  it('keeps the Piper speaker within the chosen voice', async () => {
    // A second app with a fake Piper offering a 3-speaker and a 1-speaker voice.
    const fixture = (p: string) => fileURLToPath(new URL(`./fixtures/${p}`, import.meta.url));
    const withPiper = await buildApp(
      { databaseUrl, port: 0, host: '127.0.0.1', eulerApiKey: undefined, production: false, secureCookies: false, piperBin: undefined, piperVoicesDir: undefined },
      { logger: false, piper: new Piper(process.execPath, fixture('piper-voices'), [fixture('fake-piper.mjs')]) },
    );
    try {
      const signup = await withPiper.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { email: 'piper@example.com', password: 'correct horse' },
        remoteAddress: nextAddress(),
      });
      const cookie = `fluxion_session=${signup.cookies.find((c) => c.name === 'fluxion_session')!.value}`;
      const patch = (payload: object) => withPiper.inject({ method: 'PATCH', url: '/api/settings', payload, headers: { cookie } });
      const me = async () => (await withPiper.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json();

      expect((await patch({ ttsPiperVoice: 'many_voices', ttsPiperSpeaker: 2 })).statusCode).toBe(200);
      expect((await patch({ ttsPiperSpeaker: 3 })).json().error).toBe('many_voices has speakers 0–2');
      // Switching voice resets the speaker; a single-speaker voice only has speaker 0.
      await patch({ ttsPiperVoice: 'test_voice' });
      expect((await me()).ttsPiperSpeaker).toBeNull();
      expect((await patch({ ttsPiperSpeaker: 1 })).statusCode).toBe(400);
      expect((await patch({ ttsPiperVoice: 'many_voices', ttsPiperSpeaker: 1 })).statusCode).toBe(200);
      expect((await me()).ttsPiperSpeaker).toBe(1);
    } finally {
      await withPiper.close();
    }
  });

  it("can't touch another host's alerts", async () => {
    const a = await signUp('a@example.com');
    const b = await signUp('b@example.com');
    const [alertA] = (await api(a.cookie, 'GET', '/api/alerts')).json();
    expect((await api(b.cookie, 'POST', `/api/alerts/${alertA.id}/test`)).statusCode).toBe(404);
    expect((await api(b.cookie, 'PATCH', `/api/alerts/${alertA.id}`, { template: 'x' })).statusCode).toBe(404);
    expect((await api(b.cookie, 'DELETE', `/api/alerts/${alertA.id}`)).statusCode).toBe(404);
  });
});

describe('gateway auth', () => {
  it('rejects a companion with a bad token or wrong protocol', async () => {
    const bad = connect('/ws/companion');
    await bad.opened;
    bad.send({ type: 'hello', token: 'nope', protocol: PROTOCOL_VERSION });
    expect(await bad.next()).toMatchObject({ type: 'error' });
    expect(await bad.closed).toBe(4001);

    const { cookie } = await signUp();
    const { token } = await pairCompanion(cookie);
    const old = connect('/ws/companion');
    await old.opened;
    old.send({ type: 'hello', token, protocol: PROTOCOL_VERSION + 1 });
    expect(await old.next()).toMatchObject({ type: 'error' });
    expect(await old.closed).toBe(4001);
  });

  it('pairing codes work once', async () => {
    const { cookie } = await signUp();
    const { code } = (await api(cookie, 'POST', '/api/companions/pairing-code')).json();
    const remoteAddress = nextAddress();
    const first = await app.inject({ method: 'POST', url: '/api/companions/pair', payload: { code, name: 'PC' }, remoteAddress });
    const second = await app.inject({ method: 'POST', url: '/api/companions/pair', payload: { code, name: 'PC' }, remoteAddress });
    expect([first.statusCode, second.statusCode]).toEqual([201, 400]);
  });

  it('disconnects a companion when the host revokes it', async () => {
    const { cookie } = await signUp();
    const { id, token } = await pairCompanion(cookie);
    const companion = await connectCompanion(token);
    await companion.next(); // ready
    await companion.next(); // profile
    expect((await api(cookie, 'DELETE', `/api/companions/${id}`)).statusCode).toBe(204);
    expect(await companion.closed).toBe(4003);
  });

  it('rejects an overlay with an unknown token', async () => {
    const overlay = connect('/ws/overlay?token=nope');
    expect(await overlay.closed).toBe(4001);
  });
});
