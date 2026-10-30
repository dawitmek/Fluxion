import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { streams } from '../db/schema.js';
import { requireHost } from '../auth/session.js';
import { streamerKey } from '../leaderboard/stats.js';
import { streamActivity, streamDetail, streamSummaries, viewerActivity, viewerProfile } from './queries.js';

const VIEWER_KINDS = ['comment', 'gift', 'like', 'follow', 'share', 'join', 'subscribe', 'emote'];
const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
// A live stream's report reads every event it has, and each open Live page asks for it every 10 s. It's built at
// most once in this long and shared, so three tabs cost what one does.
const LIVE_REPORT_MS = 5000;

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireHost);
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
  // Live streams' reports, by stream id; requests while one is being built wait for it rather than build another.
  const liveReports = new Map<string, { at: number; report: ReturnType<typeof streamDetail> }>();
  const liveReport = (hostId: string, id: string) => {
    const now = Date.now();
    for (const [key, cached] of liveReports) if (now - cached.at >= LIVE_REPORT_MS) liveReports.delete(key);
    const cached = liveReports.get(id);
    if (cached) return cached.report;
    // The stream being recorded writes its events every couple of seconds; write them now, so the totals are exact.
    const report = app.live.flushRecording(hostId).then(() => streamDetail(db, hostId, id));
    liveReports.set(id, { at: now, report });
    report.catch(() => liveReports.delete(id)); // a failed build isn't kept
    return report;
  };
  const streamParam = { type: 'string', pattern: `^(latest|${UUID.slice(1, -1)})$` };

  // Real streams, newest first, with their totals.
  app.get('/streams', async (req) => streamSummaries(db, req.hostId));

  const viewerParams = { type: 'object', properties: { viewer: { type: 'string', minLength: 1, maxLength: 64 } } };
  const account = { type: 'string', minLength: 1, maxLength: 64 };

  // One viewer across the host's streams; `account` keeps to one TikTok account.
  app.get<{ Params: { viewer: string }; Querystring: { account?: string } }>(
    '/viewers/:viewer',
    { schema: { params: viewerParams, querystring: { type: 'object', additionalProperties: false, properties: { account } } } },
    async (req) =>
      viewerProfile(db, req.hostId, req.params.viewer, req.query.account ? streamerKey(req.query.account) : await app.stats.streamerOf(req.hostId), req.query.account),
  );

  app.get<{ Params: { viewer: string }; Querystring: { account?: string; before?: number; limit?: number } }>(
    '/viewers/:viewer/activity',
    {
      schema: {
        params: viewerParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { account, before: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200 } },
        },
      },
    },
    async (req) =>
      viewerActivity(db, req.hostId, req.params.viewer, {
        account: req.query.account,
        before: req.query.before,
        kinds: [...VIEWER_KINDS, 'command'],
        limit: req.query.limit ?? 50,
      }),
  );

  app.get<{ Params: { id: string } }>(
    '/streams/:id',
    { schema: { params: { type: 'object', properties: { id: streamParam } } } },
    async (req, reply) => {
      const id = await resolve(req.hostId, req.params.id);
      const live = id !== null && id === app.live.currentStreamId(req.hostId);
      const detail = id && (await (live ? liveReport(req.hostId, id) : streamDetail(db, req.hostId, id)));
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
