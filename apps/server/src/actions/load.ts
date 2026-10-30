import { and, eq, isNull, or } from 'drizzle-orm';
import { aliasedTable } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { actions, commands, media } from '../db/schema.js';
import type { ActionRule } from './engine.js';

const mediaFile = aliasedTable(media, 'media_file');

// The host's actions that apply with this profile, as the engine needs them.
export async function loadActionRules(db: Db, hostId: string, profileId: string, actionId?: string): Promise<ActionRule[]> {
  const rows = await db
    .select({ action: actions, keyword: commands.keyword, mediaKind: mediaFile.kind })
    .from(actions)
    .leftJoin(commands, and(eq(commands.id, actions.keyCommandId), eq(commands.profileId, profileId)))
    .leftJoin(mediaFile, eq(mediaFile.id, actions.mediaId))
    .where(
      and(
        eq(actions.hostId, hostId),
        or(isNull(actions.profileId), eq(actions.profileId, profileId)),
        actionId ? eq(actions.id, actionId) : undefined,
      ),
    )
    .orderBy(actions.position);
  return rows.map(({ action: a, keyword, mediaKind }) => ({
    id: a.id,
    trigger: a.trigger,
    giftName: a.giftName,
    minDiamonds: a.minDiamonds,
    likeStep: a.likeStep,
    command: a.command,
    goalId: a.goalId,
    audience: a.audience,
    audienceViewer: a.audienceViewer,
    cooldownMs: a.cooldownMs,
    viewerCooldownMs: a.viewerCooldownMs,
    random: a.random,
    text: a.text,
    sound: a.sound,
    soundMediaId: a.soundMediaId,
    media: a.mediaId && mediaKind ? { id: a.mediaId, kind: mediaKind } : null,
    speak: a.speak,
    durationMs: a.durationMs,
    alertPos: a.alertX !== null && a.alertY !== null ? { x: a.alertX, y: a.alertY } : null,
    alertScale: a.alertScale,
    keyword: keyword ?? null,
    repeatWithCount: a.repeatWithCount,
    points: a.points,
    screenId: a.screenId,
    enabled: a.enabled,
  }));
}
