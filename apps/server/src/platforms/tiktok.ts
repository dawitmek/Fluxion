import { ControlEvent, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import type { ViewerEvent } from '@fluxion/shared';
import type { PlatformAdapter } from './types.js';

// Live payloads (connector 2.5, verified Oct 2026) use `content` and `user.displayId`; the README still
// shows `comment` and `user.uniqueId`. Read both so a docs-driven change can't break real streams.
type RawUser = { uniqueId?: string; displayId?: string; userId?: string; id?: string };
type RawPayload = {
  user?: RawUser;
  comment?: string;
  content?: string;
  giftId?: number | string;
  repeatCount?: number;
  repeatEnd?: boolean | number;
  giftDetails?: { giftName?: string; giftType?: number; diamondCount?: number };
  gift?: { name?: string; type?: number };
  likeCount?: number;
  count?: number;
};

// The connector's emitter typings come from a CommonJS package that NodeNext can't resolve, so `.on` goes untyped.
type Emitter = { on(event: string, listener: (data: unknown) => void): unknown };

const MAPPED = [WebcastEvent.CHAT, WebcastEvent.GIFT, WebcastEvent.LIKE, WebcastEvent.FOLLOW, WebcastEvent.SHARE, WebcastEvent.MEMBER] as const;
type MappedEvent = (typeof MAPPED)[number];

export function toViewerEvent(type: MappedEvent, data: RawPayload, at = Date.now()): ViewerEvent | null {
  const user = data.user;
  const viewerId = user?.uniqueId || user?.displayId || user?.userId || user?.id;
  if (!viewerId) return null;

  switch (type) {
    case WebcastEvent.CHAT: {
      const text = data.comment ?? data.content;
      return text ? { kind: 'comment', viewerId, text, at } : null;
    }
    case WebcastEvent.GIFT: {
      const giftType = data.giftDetails?.giftType ?? data.gift?.type;
      // Streakable gifts (type 1) arrive once per tick; only the final event carries the total.
      if (giftType === 1 && !data.repeatEnd) return null;
      return {
        kind: 'gift',
        viewerId,
        giftId: Number(data.giftId),
        giftName: data.giftDetails?.giftName ?? data.gift?.name ?? '',
        count: data.repeatCount || 1,
        diamonds: data.giftDetails?.diamondCount ?? 0,
        at,
      };
    }
    case WebcastEvent.LIKE:
      return { kind: 'like', viewerId, count: data.likeCount ?? data.count ?? 1, at };
    case WebcastEvent.FOLLOW:
      return { kind: 'follow', viewerId, at };
    case WebcastEvent.SHARE:
      return { kind: 'share', viewerId, at };
    case WebcastEvent.MEMBER:
      return { kind: 'join', viewerId, at };
  }
}

export class TikTokAdapter implements PlatformAdapter {
  private connection: TikTokLiveConnection;
  private eventListener: (event: ViewerEvent) => void = () => {};
  private endListener: (reason: string) => void = () => {};
  private stopping = false;
  private retried = false;

  constructor(username: string, signApiKey?: string) {
    this.connection = new TikTokLiveConnection(username, { signApiKey, processInitialData: false });
    const events = this.connection as unknown as Emitter;

    for (const type of MAPPED) {
      events.on(type, (data) => {
        const event = toViewerEvent(type, data as RawPayload);
        if (event) this.eventListener(event);
      });
    }
    events.on(WebcastEvent.STREAM_END, () => this.end('stream ended'));
    events.on(ControlEvent.DISCONNECTED, () => {
      if (this.stopping) return;
      // One reconnect attempt covers network blips; anything else ends the session.
      if (this.retried) return this.end('disconnected');
      this.retried = true;
      this.connection.connect().catch(() => this.end('disconnected'));
    });
  }

  async start() {
    await this.connection.connect();
  }

  async stop() {
    this.stopping = true;
    await this.connection.disconnect();
  }

  onEvent(listener: (event: ViewerEvent) => void) {
    this.eventListener = listener;
  }

  onEnd(listener: (reason: string) => void) {
    this.endListener = listener;
  }

  private end(reason: string) {
    if (this.stopping) return;
    this.stopping = true;
    this.endListener(reason);
  }
}
