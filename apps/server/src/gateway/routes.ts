import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { PROTOCOL_VERSION, type CompanionToServer, type OverlayToServer, type ServerToCompanion } from '@fluxion/shared';
import { companions, overlayScreens } from '../db/schema.js';
import { toScreen } from '../screens/routes.js';
import { sha256 } from '../crypto.js';
import { sendProfileToCompanions } from '../profiles/active.js';

const HELLO_TIMEOUT_MS = 5000;

const reply = (socket: WebSocket, message: ServerToCompanion) => socket.send(JSON.stringify(message));

export async function gatewayRoutes(app: FastifyInstance) {
  const { db, hub } = app;

  // The token travels in the first message rather than the URL, so it never lands in access logs.
  app.get('/ws/companion', { websocket: true }, (socket) => {
    const timer = setTimeout(() => socket.close(4001, 'No hello'), HELLO_TIMEOUT_MS);

    socket.once('message', async (raw) => {
      clearTimeout(timer);
      let hello: CompanionToServer;
      try {
        hello = JSON.parse(raw.toString());
      } catch {
        return socket.close(4001, 'Bad message');
      }
      if (hello.type !== 'hello' || typeof hello.token !== 'string') return socket.close(4001, 'Expected hello');
      if (hello.protocol !== PROTOCOL_VERSION) {
        reply(socket, { type: 'error', reason: `Protocol ${hello.protocol} unsupported; server speaks ${PROTOCOL_VERSION}` });
        return socket.close(4001, 'Protocol mismatch');
      }

      // The PC's name and OS come along with every connect, so a renamed PC shows its new name.
      const device = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : undefined);
      const [companion] = await db
        .update(companions)
        .set({ lastSeenAt: new Date(), hostname: device(hello.hostname), platform: device(hello.platform) })
        .where(eq(companions.tokenHash, sha256(hello.token)))
        .returning({ id: companions.id, hostId: companions.hostId });
      if (!companion) {
        reply(socket, { type: 'error', reason: 'Unknown companion token' });
        return socket.close(4001, 'Unauthorized');
      }

      hub.addCompanion(companion.hostId, companion.id, socket);
      reply(socket, { type: 'ready', hostId: companion.hostId });
      await sendProfileToCompanions(app, companion.hostId).catch((err) => app.log.error(err, 'could not send profile'));

      socket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as CompanionToServer;
          if (message.type === 'ack' && message.status === 'rejected') {
            app.log.warn({ companionId: companion.id, ...message }, 'companion rejected action');
          }
        } catch {
          // Ignore malformed messages from an authenticated companion.
        }
      });
    });
  });

  // Overlays are read-only browser sources; the secret token in the URL is the norm for those.
  // `dashboard=1` marks the dashboard's own listener, so it isn't counted as an overlay on stream.
  app.get<{ Querystring: { token?: string; dashboard?: string } }>('/ws/overlay', { websocket: true }, async (socket, req) => {
    const token = req.query.token;
    const [row] = token ? await db.select().from(overlayScreens).where(eq(overlayScreens.token, token)) : [];
    if (!row) return socket.close(4001, 'Unauthorized');
    const dashboard = req.query.dashboard === '1';
    hub.addOverlay(row.hostId, row.id, socket, dashboard);
    socket.send(JSON.stringify({ type: 'screen', screen: toScreen(row) }));
    for (const message of await app.live.overlaySnapshot(row.hostId)) socket.send(JSON.stringify(message));
    // With the debug log on, overlays report what they do with alerts and speech; otherwise they send nothing.
    if (!app.debug.on) return;
    const who = `${dashboard ? 'dashboard' : 'overlay'} "${row.name}"`;
    app.debug.write('overlay', row.hostId, `${who} connected`);
    socket.on('close', (code) => app.debug.write('overlay', row.hostId, `${who} disconnected`, { code }));
    socket.on('message', (raw) => {
      if (raw.toString().length > 2000) return;
      try {
        const report = JSON.parse(raw.toString()) as OverlayToServer;
        if (report.type !== 'log' || typeof report.message !== 'string') return;
        // Reports made while the server was away arrive late; `at` is when it happened.
        const late = Date.now() - report.at > 2000 ? { happenedAt: new Date(report.at).toISOString() } : {};
        app.debug.write('overlay', row.hostId, `${who}: ${report.message.slice(0, 200)}`, { ...report.data, ...late });
      } catch {
        // Not a report; ignore it.
      }
    });
    socket.send(JSON.stringify({ type: 'debug' }));
  });
}
