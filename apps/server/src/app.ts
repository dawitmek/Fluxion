import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { PROTOCOL_VERSION } from '@fluxion/shared';
import type { Config } from './config.js';
import { createDb, type Db } from './db/client.js';
import { Hub } from './gateway/hub.js';
import { SessionManager } from './live/session-manager.js';
import { Stats } from './leaderboard/stats.js';
import { TikTokAdapter } from './platforms/tiktok.js';
import type { PlatformAdapter } from './platforms/types.js';
import { authRoutes } from './auth/routes.js';
import { settingsRoutes } from './settings/routes.js';
import { commandRoutes } from './commands/routes.js';
import { companionRoutes } from './companions/routes.js';
import { liveRoutes } from './live/routes.js';
import { giftTriggerRoutes } from './gift-triggers/routes.js';
import { leaderboardRoutes } from './leaderboard/routes.js';
import { profileRoutes } from './profiles/routes.js';
import { alertRoutes } from './alerts/routes.js';
import { ttsRoutes } from './tts/routes.js';
import { Piper } from './tts/piper.js';
import { SpeechService } from './tts/speech.js';
import { gatewayRoutes } from './gateway/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    hub: Hub;
    live: SessionManager;
    stats: Stats;
    speech: SpeechService;
    piper: Piper;
  }
}

interface Options {
  logger?: boolean;
  // Tests swap in a fake so they never contact TikTok.
  createTikTok?: (username: string) => PlatformAdapter;
  // Tests swap in a fake so they never contact a cloud TTS provider.
  fetch?: typeof fetch;
  // Tests swap in a fake Piper with known voices.
  piper?: Piper;
}

export async function buildApp(config: Config, options: Options = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  const { db, close } = createDb(config.databaseUrl);
  const hub = new Hub();
  const createTikTok = options.createTikTok ?? ((username) => new TikTokAdapter(username, config.eulerApiKey));

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('hub', hub);
  const stats = new Stats(db);
  const piper = options.piper ?? new Piper(config.piperBin, config.piperVoicesDir);
  const speech = new SpeechService(piper, (err) => app.log.warn({ err }, 'TTS failed; falling back to eSpeak'), options.fetch);
  app.decorate('stats', stats);
  app.decorate('piper', piper);
  app.decorate('speech', speech);
  app.decorate('live', new SessionManager(db, hub, stats, speech, createTikTok));
  app.addHook('onClose', async () => {
    await app.live.close();
    await close();
  });

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });
  await app.register(fastifyWebsocket);

  app.get('/api/health', async () => ({ ok: true, protocol: PROTOCOL_VERSION }));
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(commandRoutes, { prefix: '/api/commands' });
  await app.register(companionRoutes, { prefix: '/api/companions' });
  await app.register(liveRoutes, { prefix: '/api/live' });
  await app.register(giftTriggerRoutes, { prefix: '/api/gift-triggers' });
  await app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });
  await app.register(profileRoutes, { prefix: '/api/profiles' });
  await app.register(alertRoutes, { prefix: '/api/alerts' });
  await app.register(ttsRoutes, { prefix: '/api/tts' });
  await app.register(gatewayRoutes);

  // In production the server also serves the built web app, so everything lives on one address.
  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    // Client-side routes (/dashboard, /overlay/:token) fall back to index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      // A tab opened before an update asks for old bundle files; a 404 lets it notice, where index.html would not.
      if (req.url.startsWith('/assets/')) return reply.code(404).send('Not found');
      return reply.sendFile('index.html');
    });
  }

  return app;
}
