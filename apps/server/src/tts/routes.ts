import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { hosts } from '../db/schema.js';
import { requireHost } from '../auth/session.js';
import { voiceConfig } from './speech.js';
import { listCloudVoices } from './cloud.js';

// eSpeak NG voices offered on the dashboard (it has more; these cover the common languages).
export const ESPEAK_VOICES = [
  'en-us', 'en', 'es', 'es-419', 'fr', 'de', 'it', 'pt-br', 'pt', 'nl', 'pl', 'ru', 'uk', 'tr', 'sv', 'cmn', 'ja', 'ko', 'hi', 'ar', 'id', 'vi',
];

export async function ttsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireHost);

  // What this server can do, for the dashboard's engine and voice pickers.
  app.get('/options', async () => ({
    piperVoices: await app.piper.voices(),
    espeakVoices: ESPEAK_VOICES,
    tiktokServerAccount: await app.speech.serverTiktokWorking(), // TikTok voices work without the host signing in
  }));

  // The voices the host's cloud account offers. Uses the saved key, which never comes back to the browser.
  app.get('/cloud-voices', async (req, reply) => {
    const [host] = await app.db.select().from(hosts).where(eq(hosts.id, req.hostId));
    const cloud = voiceConfig(host!, app.secrets).cloud;
    if (!cloud) return reply.code(400).send({ error: 'Choose a cloud provider and enter your API key first' });
    try {
      return await listCloudVoices(cloud, app.speech.fetchImpl);
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  // Speaks a sample with the host's saved settings and reports errors instead of falling back,
  // so a wrong cloud key shows up on the dashboard.
  // The body is optional ({ text }), so no JSON schema: an empty POST is fine.
  app.post<{ Body: { text?: unknown } | undefined }>('/preview', async (req, reply) => {
    const text = typeof req.body?.text === 'string' && req.body.text.trim() ? req.body.text.slice(0, 200) : 'viewer says hello from Fluxion';
    const [host] = await app.db.select().from(hosts).where(eq(hosts.id, req.hostId));
    try {
      return await app.speech.speakStrict(voiceConfig(host!, app.secrets), text);
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
