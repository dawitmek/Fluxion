import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { hosts, profiles } from '../db/schema.js';

// The host's active profile. Every host has one from signup on.
export async function activeProfile(db: Db, hostId: string) {
  const [row] = await db
    .select({ profile: profiles })
    .from(hosts)
    .innerJoin(profiles, eq(profiles.id, hosts.activeProfileId))
    .where(eq(hosts.id, hostId));
  if (!row) throw new Error(`Host ${hostId} has no active profile`);
  return row.profile;
}

// Tells the host's companions which game the active profile targets.
export async function sendProfileToCompanions(app: FastifyInstance, hostId: string) {
  const profile = await activeProfile(app.db, hostId);
  app.hub.sendToCompanions(hostId, { type: 'profile', name: profile.name, gameProcess: profile.gameProcess });
}
