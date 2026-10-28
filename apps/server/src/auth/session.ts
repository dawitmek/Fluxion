import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt } from 'drizzle-orm';
import { authSessions } from '../db/schema.js';
import { newToken, sha256 } from '../crypto.js';
import type { Db } from '../db/client.js';

export const SESSION_COOKIE = 'fluxion_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

declare module 'fastify' {
  interface FastifyRequest {
    hostId: string;
  }
}

export async function startSession(db: Db, reply: FastifyReply, hostId: string, secure: boolean) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(authSessions).values({ tokenHash: sha256(token), hostId, expiresAt });
  reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure, expires: expiresAt });
}

export async function endSession(db: Db, req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await db.delete(authSessions).where(eq(authSessions.tokenHash, sha256(token)));
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

// preHandler for routes that need a signed-in host. Sets req.hostId.
export async function requireHost(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    const [row] = await req.server.db
      .select({ hostId: authSessions.hostId })
      .from(authSessions)
      .where(and(eq(authSessions.tokenHash, sha256(token)), gt(authSessions.expiresAt, new Date())));
    if (row) {
      req.hostId = row.hostId;
      return;
    }
  }
  return reply.code(401).send({ error: 'Not signed in' });
}
