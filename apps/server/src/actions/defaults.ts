import type { ActionTrigger, AlertSound } from '@fluxion/shared';

// Starter actions for new hosts: an alert for each common event. Migration 0015 turned existing hosts' alerts into the same.
export const DEFAULT_ACTIONS: { name: string; trigger: ActionTrigger; likeStep?: number; text: string; sound: AlertSound }[] = [
  { name: 'Follow alert', trigger: 'follow', text: '{viewer} followed!', sound: 'chime' },
  { name: 'Share alert', trigger: 'share', text: '{viewer} shared the stream!', sound: 'whoosh' },
  { name: 'Gift alert', trigger: 'gift', text: '{viewer} sent {count}× {gift}!', sound: 'coin' },
  { name: 'Likes alert', trigger: 'likes', likeStep: 1000, text: '{total} likes! Thanks {viewer}', sound: 'pop' },
];
