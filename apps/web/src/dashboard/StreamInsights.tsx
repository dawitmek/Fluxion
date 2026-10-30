import { useEffect, useState } from 'react';
import type { StreamDetail } from '@fluxion/shared';
import { api } from '../api';
import { Icon } from '../icons';
import { BarList, ColumnChart, type Column } from './charts';

const MAX_COLUMNS = 60;
const LIVE_REFRESH_MS = 10_000;

// A stream's analytics; "latest" is the live stream, or else the most recent. Refreshes while it's live.
export function useStreamDetail(id: string, live: boolean) {
  const [detail, setDetail] = useState<StreamDetail | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<StreamDetail>('GET', `/analytics/streams/${id}`).then(
        (d) => !cancelled && setDetail(d),
        () => !cancelled && setDetail(null),
      );
    void load();
    const timer = live ? setInterval(load, LIVE_REFRESH_MS) : undefined;
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, live]);
  return detail;
}

// 75 -> "1:15"
export const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

export function duration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Chat per minute (or per few minutes on long streams), with gifts, follows and level-ups marked above.
export function ActivityChart({ detail }: { detail: StreamDetail }) {
  const size = Math.ceil(detail.perMinute.length / MAX_COLUMNS);
  const start = detail.summary.startedAt;
  const columns: Column[] = [];
  for (let i = 0; i < detail.perMinute.length; i += size) {
    const minutes = detail.perMinute.slice(i, i + size);
    const comments = minutes.reduce((n, m) => n + m.comments, 0);
    const commands = minutes.reduce((n, m) => n + m.commands, 0);
    const from = start + i * 60_000;
    const to = from + size * 60_000;
    const events = detail.markers.filter((m) => m.at >= from && m.at < to);
    const every = Math.max(1, Math.ceil(detail.perMinute.length / size / 6)); // about six x labels
    columns.push({
      label: size === 1 ? `Minute ${clock(i)}` : `${clock(i)} to ${clock(i + size)}`,
      tick: (i / size) % every === 0 ? clock(i) : undefined,
      values: [comments],
      extra: [`${commands} key press${commands === 1 ? '' : 'es'}`],
      marks: events.length
        ? {
            icon: <Icon name={events.some((e) => e.kind === 'gift') ? 'gift' : events.some((e) => e.kind === 'follow') ? 'profiles' : 'leaderboard'} size={12} />,
            lines: [...events.slice(0, 5).map((e) => e.label), ...(events.length > 5 ? [`and ${events.length - 5} more`] : [])],
          }
        : undefined,
    });
  }
  return <ColumnChart columns={columns} series={[{ name: 'Chat messages', slot: 1 }]} caption="Chat messages over the stream" />;
}

// How often each command fired, and how often chat asked for it but it didn't (and why).
export function CommandUsage({ detail }: { detail: StreamDetail }) {
  if (detail.commandUsage.length === 0) return <p className="empty">No commands used yet.</p>;
  return (
    <BarList
      caption="Command usage"
      series={[
        { name: 'Fired', slot: 1 },
        { name: 'Refused', slot: 2 },
      ]}
      rows={detail.commandUsage.map((u) => {
        const total = u.fired + u.refused;
        const reasons = Object.entries(u.reasons).map(([reason, n]) => `${reason} ${n}`);
        return {
          label: u.keyword,
          values: [u.fired, u.refused],
          value: u.refused ? `${u.fired} fired, ${u.refused} refused (${Math.round((u.refused / total) * 100)}%)` : `${u.fired} fired`,
          detail: reasons.length ? `Refused for: ${reasons.join(', ')}` : undefined,
        };
      })}
    />
  );
}
