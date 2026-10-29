import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { commands, hosts, profiles } from '../db/schema.js';

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

// Tells the host's companions which game the active profile targets, and what its commands press.
export async function sendProfileToCompanions(app: FastifyInstance, hostId: string) {
  const profile = await activeProfile(app.db, hostId);
  app.hub.sendToCompanions(hostId, { type: 'profile', name: profile.name, gameProcess: profile.gameProcess });
  await sendCommandsToCompanions(app, hostId, profile.id);
}

export async function sendCommandsToCompanions(app: FastifyInstance, hostId: string, profileId?: string) {
  const id = profileId ?? (await activeProfile(app.db, hostId)).id;
  const rows = await app.db
    .select({ keyword: commands.keyword, key: commands.key, enabled: commands.enabled })
    .from(commands)
    .where(eq(commands.profileId, id))
    .orderBy(commands.position);
  app.hub.sendToCompanions(hostId, { type: 'commands', commands: rows });
}
