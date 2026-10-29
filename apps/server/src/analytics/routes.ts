import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { streams } from '../db/schema.js';
import { requireHost } from '../auth/session.js';
import { streamActivity, streamDetail, streamSummaries } from './queries.js';

const VIEWER_KINDS = ['comment', 'gift', 'like', 'follow', 'share', 'join'];
const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireHost);
  const { db } = app;

  // "latest" is the stream being recorded now, or else the most recent one (test mode included).
  const resolve = async (hostId: string, id: string) => {
    if (id !== 'latest') {
      const [own] = await db.select({ id: streams.id }).from(streams).where(and(eq(streams.id, id), eq(streams.hostId, hostId)));
      return own?.id ?? null;
    }
    const live = app.live.currentStreamId(hostId);
    if (live) return live;
    const [last] = await db.select({ id: streams.id }).from(streams).where(eq(streams.hostId, hostId)).orderBy(desc(streams.startedAt)).limit(1);
    return last?.id ?? null;
  };
  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'Stream not found' });
  const streamParam = { type: 'string', pattern: `^(latest|${UUID.slice(1, -1)})$` };

  // Real streams, newest first, with their totals.
  app.get('/streams', async (req) => streamSummaries(db, req.hostId));

  app.get<{ Params: { id: string } }>(
    '/streams/:id',
    { schema: { params: { type: 'object', properties: { id: streamParam } } } },
    async (req, reply) => {
      const id = await resolve(req.hostId, req.params.id);
      const detail = id && (await streamDetail(db, req.hostId, id));
      return detail || notFound(reply);
    },
  );

  // What viewers did during a stream: a page of it, newest first, or what's new since `after`.
  app.get<{ Querystring: { stream?: string; before?: number; after?: number; kinds?: string; viewer?: string; limit?: number } }>(
    '/activity',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            stream: streamParam,
            before: { type: 'integer', minimum: 0 },
            after: { type: 'integer', minimum: 0 },
            kinds: { type: 'string', pattern: `^(${VIEWER_KINDS.join('|')})(,(${VIEWER_KINDS.join('|')}))*$` },
            viewer: { type: 'string', maxLength: 64 },
            limit: { type: 'integer', minimum: 1, maximum: 200 },
          },
        },
      },
    },
    async (req) => {
      const id = await resolve(req.hostId, req.query.stream ?? 'latest');
      if (!id) return { stream: null, events: [] };
      const [stream] = await db.select().from(streams).where(eq(streams.id, id));
      const events = await streamActivity(db, id, {
        before: req.query.before,
        after: req.query.after,
        kinds: req.query.kinds?.split(',') ?? VIEWER_KINDS,
        viewer: req.query.viewer?.trim() || undefined,
        limit: req.query.limit ?? 100,
      });
      return {
        stream: { id, source: stream!.source, startedAt: stream!.startedAt.getTime(), live: id === app.live.currentStreamId(req.hostId) },
        events,
      };
    },
  );
}
