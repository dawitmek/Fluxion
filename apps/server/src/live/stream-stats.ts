import type { Goal, GoalMetric, RoomStats, StreamStats, ViewerEvent } from '@fluxion/shared';

type Totals = Pick<StreamStats, GoalMetric | 'gifts'>;

// The current stream's totals and highlights, for overlay widgets and goals. One per live session.
export class StreamStatsTracker {
  private totals: Totals = { likes: 0, follows: 0, shares: 0, diamonds: 0, gifts: 0, subscriptions: 0 };
  private viewers = 0;
  private topGift: StreamStats['topGift'] = null;
  private topStreak: StreamStats['topStreak'] = null;
  private lastFollower: string | null = null;
  private lastGifter: StreamStats['lastGifter'] = null;
  private reached = new Set<string>(); // goal ids already reached this stream

  constructor(public goals: Goal[]) {}

  // Counts an event; returns the goals it pushed over their target.
  add(event: ViewerEvent): Goal[] {
    const before = { ...this.totals };
    switch (event.kind) {
      case 'like':
        this.totals.likes += event.count;
        break;
      case 'follow':
        this.totals.follows += 1;
        this.lastFollower = event.viewerId;
        break;
      case 'share':
        this.totals.shares += 1;
        break;
      case 'subscribe':
        this.totals.subscriptions += 1;
        break;
      case 'gift': {
        const diamonds = event.diamonds * event.count;
        this.totals.diamonds += diamonds;
        this.totals.gifts += event.count;
        this.lastGifter = { viewer: event.viewerId, gift: event.giftName, count: event.count };
        if (!this.topGift || diamonds > this.topGift.diamonds) this.topGift = { viewer: event.viewerId, gift: event.giftName, diamonds };
        if (!this.topStreak || event.count > this.topStreak.count) this.topStreak = { viewer: event.viewerId, gift: event.giftName, count: event.count };
        break;
      }
      default:
        return [];
    }
    return this.goals.filter((g) => g.enabled && !this.reached.has(g.id) && before[g.metric] < g.target && this.totals[g.metric] >= g.target).map((g) => {
      this.reached.add(g.id);
      return g;
    });
  }

  room(stats: RoomStats) {
    this.viewers = stats.viewers;
  }

  // A changed goal starts over: raising the target of a reached goal makes it reachable again.
  setGoals(goals: Goal[]) {
    for (const goal of goals) {
      const old = this.goals.find((g) => g.id === goal.id);
      if (old && (old.target !== goal.target || old.metric !== goal.metric)) this.reached.delete(goal.id);
    }
    this.goals = goals;
  }

  snapshot(): StreamStats {
    return {
      ...this.totals,
      viewers: this.viewers,
      topGift: this.topGift,
      topStreak: this.topStreak,
      lastFollower: this.lastFollower,
      lastGifter: this.lastGifter,
      goals: this.goals
        .filter((g) => g.enabled)
        .map((g) => ({ id: g.id, name: g.name, metric: g.metric, target: g.target, current: this.totals[g.metric] })),
    };
  }
}
