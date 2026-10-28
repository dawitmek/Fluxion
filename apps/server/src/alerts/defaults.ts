import type { AlertEvent, AlertSound } from '@fluxion/shared';

// Starter alerts for new hosts. Migration 0004 gives existing hosts the same set.
export const DEFAULT_ALERTS: { event: AlertEvent; likeStep?: number; template: string; sound: AlertSound }[] = [
  { event: 'follow', template: '{viewer} followed!', sound: 'chime' },
  { event: 'share', template: '{viewer} shared the stream!', sound: 'whoosh' },
  { event: 'gift', template: '{viewer} sent {count}× {gift}!', sound: 'coin' },
  { event: 'likes', likeStep: 1000, template: '{total} likes! Thanks {viewer}', sound: 'pop' },
];
