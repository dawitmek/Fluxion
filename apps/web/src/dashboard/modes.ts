import { QUEUE_JOIN, type Mode } from '@fluxion/shared';

export const MODE_INFO: Record<Mode, { label: string; help: string }> = {
  anarchy: { label: 'Anarchy', help: 'Every command fires, subject to cooldowns and the rate limit.' },
  democracy: { label: 'Democracy', help: 'Chat votes; the most-voted command fires when each voting window closes.' },
  queue: {
    label: 'Queue',
    help: `Viewers type "${QUEUE_JOIN}" to line up. One viewer at a time controls the game for a turn.`,
  },
  gift: { label: 'Gift-only', help: 'Comments do nothing. Only actions press keys, like a gift that jumps.' },
};
