import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { sql } from 'drizzle-orm';
import { PROTOCOL_VERSION } from '@fluxion/shared';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import type { PlatformAdapter } from '../src/platforms/types.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://fluxion:fluxion@127.0.0.1:5432/fluxion_test';

let app: Awaited<ReturnType<typeof buildApp>>;
let baseWs: string;
const sockets: WebSocket[] = [];

beforeAll(async () => {
  await runMigrations(databaseUrl);
  const fakeTikTok = (): PlatformAdapter => {
    throw new Error('TikTok must not be contacted in tests');
  };
  app = await buildApp(
    { databaseUrl, port: 0, host: '127.0.0.1', eulerApiKey: undefined, production: false, secureCookies: false },
    { logger: false, createTikTok: fakeTikTok },
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
  await app.db.execute(sql`TRUNCATE hosts, auth_sessions, commands, companions, pairing_codes, gift_triggers, viewer_stats CASCADE`);
});

// --- helpers ---------------------------------------------------------------

// Each signup comes from its own address so the auth rate limit (10/min per IP) doesn't trip.
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
  const res = await app.inject({ method: 'POST', url: '/api/companions/pair', payload: { code, name: 'Gaming PC' } });
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
    const overlay = connect(`/ws/overlay?token=${me.overlayToken}`);
    await overlay.opened;

    expect((await api(cookie, 'POST', '/api/live/start', { source: 'simulated' })).json()).toEqual({
      live: true,
      source: 'simulated',
      mode: 'anarchy',
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
    expect(await overlay.next()).toEqual({ type: 'leaderboard', entries: [] });

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
      { viewer: 'bob', commands: 1, gifts: 0 },
      { viewer: 'alice', commands: 0, gifts: 2 },
    ]);
    const me = (await api(cookie, 'GET', '/api/auth/me')).json();
    const overlay = connect(`/ws/overlay?token=${me.overlayToken}`);
    await overlay.next(); // live
    await overlay.next(); // mode
    expect((await overlay.next()).entries).toHaveLength(2);
    expect((await api(cookie, 'DELETE', '/api/leaderboard')).statusCode).toBe(204);
    expect((await api(cookie, 'GET', '/api/leaderboard')).json()).toEqual([]);
    expect(await overlay.next()).toEqual({ type: 'leaderboard', entries: [] });
  });

  it('rejects a simulate request with both or neither of text and gift', async () => {
    const { cookie } = await liveHost();
    const bad = (payload: object) => api(cookie, 'POST', '/api/live/simulate', payload);
    expect((await bad({ viewer: 'a' })).statusCode).toBe(400);
    expect((await bad({ viewer: 'a', text: 'left', gift: 'Rose' })).statusCode).toBe(400);
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
    const first = await app.inject({ method: 'POST', url: '/api/companions/pair', payload: { code, name: 'PC' } });
    const second = await app.inject({ method: 'POST', url: '/api/companions/pair', payload: { code, name: 'PC' } });
    expect([first.statusCode, second.statusCode]).toEqual([201, 400]);
  });

  it('disconnects a companion when the host revokes it', async () => {
    const { cookie } = await signUp();
    const { id, token } = await pairCompanion(cookie);
    const companion = await connectCompanion(token);
    await companion.next(); // ready
    expect((await api(cookie, 'DELETE', `/api/companions/${id}`)).statusCode).toBe(204);
    expect(await companion.closed).toBe(4003);
  });

  it('rejects an overlay with an unknown token', async () => {
    const overlay = connect('/ws/overlay?token=nope');
    expect(await overlay.closed).toBe(4001);
  });
});
