import { describe, expect, it } from 'vitest';
import { WebcastEvent } from 'tiktok-live-connector';
import { toRoomStats, toViewerEvent } from '../src/platforms/tiktok.js';

describe('toViewerEvent', () => {
  it('maps chat in both documented and proto payload shapes', () => {
    expect(toViewerEvent(WebcastEvent.CHAT, { user: { uniqueId: 'alice' }, comment: 'left' }, 5)).toEqual({
      kind: 'comment',
      viewerId: 'alice',
      text: 'left',
      at: 5,
    });
    expect(toViewerEvent(WebcastEvent.CHAT, { user: { displayId: 'bob' }, content: 'jump' }, 5)).toEqual({
      kind: 'comment',
      viewerId: 'bob',
      text: 'jump',
      at: 5,
    });
  });

  it('drops events without a user or text', () => {
    expect(toViewerEvent(WebcastEvent.CHAT, { comment: 'left' })).toBeNull();
    expect(toViewerEvent(WebcastEvent.CHAT, { user: { uniqueId: 'alice' } })).toBeNull();
  });

  it('emits a streak gift only once, at the end of the streak', () => {
    const tick = { user: { uniqueId: 'alice' }, giftId: 5655, repeatCount: 3, giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 1 } };
    expect(toViewerEvent(WebcastEvent.GIFT, { ...tick, repeatEnd: false })).toBeNull();
    expect(toViewerEvent(WebcastEvent.GIFT, { ...tick, repeatEnd: true }, 9)).toEqual({
      kind: 'gift',
      viewerId: 'alice',
      giftId: 5655,
      giftName: 'Rose',
      count: 3,
      diamonds: 1,
      at: 9,
    });
  });

  it('emits non-streak gifts immediately, including proto-shaped ones', () => {
    expect(
      toViewerEvent(WebcastEvent.GIFT, { user: { uniqueId: 'a' }, giftId: '7', repeatCount: 1, gift: { name: 'Lion', type: 2, diamondCount: 29999 } }, 1),
    ).toEqual({ kind: 'gift', viewerId: 'a', giftId: 7, giftName: 'Lion', count: 1, diamonds: 29999, at: 1 });
  });

  it('maps likes, follows and shares', () => {
    expect(toViewerEvent(WebcastEvent.LIKE, { user: { uniqueId: 'a' }, likeCount: 15 }, 1)).toEqual({
      kind: 'like',
      viewerId: 'a',
      count: 15,
      at: 1,
    });
    expect(toViewerEvent(WebcastEvent.FOLLOW, { user: { uniqueId: 'a' } }, 1)).toEqual({ kind: 'follow', viewerId: 'a', at: 1 });
    expect(toViewerEvent(WebcastEvent.SHARE, { user: { uniqueId: 'a' } }, 1)).toEqual({ kind: 'share', viewerId: 'a', at: 1 });
  });

  it('maps subscriptions and stickers, and badges when TikTok sends them', () => {
    expect(toViewerEvent(WebcastEvent.SUB_NOTIFY, { user: { uniqueId: 'alice' }, subMonth: '4' }, 1)).toEqual({
      kind: 'subscribe',
      viewerId: 'alice',
      months: 4,
      at: 1,
    });
    expect(toViewerEvent(WebcastEvent.EMOTE, { user: { uniqueId: 'bob' }, emoteList: [{ emoteId: '77' }] }, 1)).toEqual({
      kind: 'emote',
      viewerId: 'bob',
      emoteId: '77',
      at: 1,
    });
    expect(
      toViewerEvent(WebcastEvent.CHAT, { user: { uniqueId: 'mod' }, content: 'hi', userIdentity: { isFollowerOfAnchor: true, isModeratorOfAnchor: true } }, 1),
    ).toEqual({ kind: 'comment', viewerId: 'mod', text: 'hi', at: 1, badges: ['follower', 'moderator'] });
    // No identity means TikTok didn't say, which is not the same as no badges.
    expect(toViewerEvent(WebcastEvent.FOLLOW, { user: { uniqueId: 'x' } }, 1)).not.toHaveProperty('badges');
  });

  it('reads viewer counts and top gifters', () => {
    expect(toRoomStats({ total: '1520', ranks: [{ user: { uniqueId: 'big' } }, { user: { displayId: 'next' } }, {}] })).toEqual({
      viewers: 1520,
      topGifters: ['big', 'next'],
    });
    expect(toRoomStats({ viewerCount: 9 })).toEqual({ viewers: 9, topGifters: [] });
  });
});
