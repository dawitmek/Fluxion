import { describe, expect, it } from 'vitest';
import type { Goal, ViewerEvent } from '@fluxion/shared';
import { StreamStatsTracker } from '../src/live/stream-stats.js';

const goal = (g: Partial<Goal> & Pick<Goal, 'metric' | 'target'>): Goal => ({ id: g.metric, name: `${g.metric} goal`, enabled: true, ...g });
const gift = (viewerId: string, giftName: string, count: number, diamonds: number): ViewerEvent => ({ kind: 'gift', viewerId, giftId: 1, giftName, count, diamonds, at: 0 });

describe('stream stats', () => {
  it('totals the stream and keeps its highlights', () => {
    const stats = new StreamStatsTracker([]);
    stats.add({ kind: 'like', viewerId: 'a', count: 40, at: 0 });
    stats.add({ kind: 'follow', viewerId: 'fan', at: 0 });
    stats.add(gift('big', 'Lion', 1, 500));
    stats.add(gift('streaky', 'Rose', 30, 1));
    stats.add({ kind: 'subscribe', viewerId: 's', months: 1, at: 0 });
    stats.room({ viewers: 77, topGifters: [] });
    expect(stats.snapshot()).toEqual({
      likes: 40,
      follows: 1,
      shares: 0,
      diamonds: 530,
      gifts: 31,
      subscriptions: 1,
      viewers: 77,
      topGift: { viewer: 'big', gift: 'Lion', diamonds: 500 },
      topStreak: { viewer: 'streaky', gift: 'Rose', count: 30 },
      lastFollower: 'fan',
      lastGifter: { viewer: 'streaky', gift: 'Rose', count: 30 },
      goals: [],
    });
  });

  it('reports a goal once, when the event that crosses it arrives', () => {
    const stats = new StreamStatsTracker([goal({ metric: 'likes', target: 100 }), goal({ metric: 'diamonds', target: 10, enabled: false })]);
    expect(stats.add({ kind: 'like', viewerId: 'a', count: 60, at: 0 })).toEqual([]);
    expect(stats.add({ kind: 'like', viewerId: 'b', count: 60, at: 0 }).map((g) => g.id)).toEqual(['likes']);
    expect(stats.add({ kind: 'like', viewerId: 'c', count: 60, at: 0 })).toEqual([]);
    expect(stats.add(gift('x', 'Lion', 1, 50))).toEqual([]); // disabled
    expect(stats.snapshot().goals).toEqual([{ id: 'likes', name: 'likes goal', metric: 'likes', target: 100, current: 180 }]);
  });

  it('lets a reached goal be reached again once its target changes', () => {
    const stats = new StreamStatsTracker([goal({ metric: 'follows', target: 1 })]);
    expect(stats.add({ kind: 'follow', viewerId: 'a', at: 0 })).toHaveLength(1);
    stats.setGoals([goal({ metric: 'follows', target: 2 })]);
    expect(stats.add({ kind: 'follow', viewerId: 'b', at: 0 })).toHaveLength(1);
  });
});
