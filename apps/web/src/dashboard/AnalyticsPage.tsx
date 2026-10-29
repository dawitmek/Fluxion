import { useEffect, useState } from 'react';
import type { StreamDetail, StreamSummary } from '@fluxion/shared';
import { api, type LiveStatus } from '../api';
import { Card } from '../ui';
import { BarList, ColumnChart } from './charts';
import type { PageProps } from './Dashboard';
import { ActivityChart, clock, CommandUsage, duration, useStreamDetail } from './StreamInsights';
import { ActivityFeed } from './ActivityFeed';
import { ViewerLink } from './ViewerPanel';

const TREND_STREAMS = 20;

const shortDate = (at: number) => new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
const longDate = (at: number) => new Date(at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const number = (n: number) => n.toLocaleString();

export function AnalyticsPage({ status }: PageProps) {
  const [streams, setStreams] = useState<StreamSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [account, setAccount] = useState<string>(''); // '' is every TikTok account
  useEffect(() => {
    const load = () => api<StreamSummary[]>('GET', '/analytics/streams').then(setStreams);
    void load();
    // A stream that starts or ends changes the list.
  }, [status.live]);

  if (!streams) return null;
  if (streams.length === 0) {
    return (
      <Card title="No streams yet" description="Your TikTok streams show up here once you go live. Test mode isn't counted.">
        <p className="empty">Go live from the Live page and come back afterwards, or during the stream.</p>
      </Card>
    );
  }
  // Streams on different TikTok accounts reach different audiences, so they can be looked at separately.
  const accounts = [...new Set(streams.map((s) => s.tiktokUsername).filter((a): a is string => a !== null))];
  const shown = account ? streams.filter((s) => s.tiktokUsername === account) : streams;
  const current = shown.find((s) => s.id === selected) ?? shown[0];
  return (
    <div className="stack">
      {accounts.length > 1 && (
        <label className="row account-picker">
          <span className="muted">TikTok account</span>
          <select className="input" value={account} onChange={(e) => (setAccount(e.target.value), setSelected(null))}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                @{a}
              </option>
            ))}
          </select>
        </label>
      )}
      {current && (
        <>
          <Trends streams={shown} />
          <StreamList streams={shown} showAccount={accounts.length > 1 && !account} selected={current.id} onSelect={setSelected} />
          <StreamReport key={current.id} summary={current} status={status} />
        </>
      )}
    </div>
  );
}

// Across streams: who took part (new and returning), and diamonds received. Oldest on the left.
function Trends({ streams }: { streams: StreamSummary[] }) {
  const recent = streams.slice(0, TREND_STREAMS).reverse();
  const every = Math.max(1, Math.ceil(recent.length / 6));
  const tick = (i: number, s: StreamSummary) => (i % every === 0 || i === recent.length - 1 ? shortDate(s.startedAt) : undefined);
  const latest = streams[0]!;
  const before = streams[1];
  const change = before && before.participants > 0 ? Math.round(((latest.participants - before.participants) / before.participants) * 100) : null;

  return (
    <Card
      title="Across your streams"
      description={
        change === null
          ? `${number(latest.participants)} viewers took part in your latest stream.`
          : `${number(latest.participants)} viewers took part in your latest stream, ${change >= 0 ? `${change}% more` : `${-change}% fewer`} than the one before.`
      }
    >
      <div className="analytics-grid">
        <div>
          <h3>Viewers who took part</h3>
          <p className="muted small">Chatted or sent a gift. New means their first time on that TikTok account's streams.</p>
          <ColumnChart
            caption="Viewers who took part, per stream"
            series={[
              { name: 'New', slot: 1 },
              { name: 'Returning', slot: 2 },
            ]}
            columns={recent.map((s, i) => ({
              label: longDate(s.startedAt),
              tick: tick(i, s),
              values: [s.newParticipants, s.participants - s.newParticipants],
            }))}
          />
        </div>
        <div>
          <h3>Diamonds received</h3>
          <p className="muted small">Gifts' total diamond value, per stream.</p>
          <ColumnChart
            caption="Diamonds per stream"
            series={[{ name: 'Diamonds', slot: 1 }]}
            columns={recent.map((s, i) => ({ label: longDate(s.startedAt), tick: tick(i, s), values: [s.diamonds], extra: [`${number(s.gifts)} gifts`] }))}
          />
        </div>
      </div>
    </Card>
  );
}

function StreamList({
  streams,
  showAccount,
  selected,
  onSelect,
}: {
  streams: StreamSummary[];
  showAccount: boolean;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Card title="Streams" description="Pick one for its details below.">
      <div className="table-wrap">
        <table className="table stream-table">
          <thead>
            <tr>
              <th>Started</th>
              {showAccount && <th>Account</th>}
              <th>Length</th>
              <th>Took part</th>
              <th>New</th>
              <th>Chat</th>
              <th>Key presses</th>
              <th>Diamonds</th>
              <th>Top command</th>
            </tr>
          </thead>
          <tbody>
            {streams.map((s) => (
              <tr key={s.id} className={s.id === selected ? 'selected' : ''} onClick={() => onSelect(s.id)}>
                <td>
                  <button className="link-button" onClick={() => onSelect(s.id)} aria-pressed={s.id === selected}>
                    {longDate(s.startedAt)}
                  </button>
                  {s.endedAt === null && <span className="tag red">Live</span>}
                </td>
                {showAccount && <td>{s.tiktokUsername ? `@${s.tiktokUsername}` : '—'}</td>}
                <td>{duration((s.endedAt ?? Date.now()) - s.startedAt)}</td>
                <td>{number(s.participants)}</td>
                <td>{number(s.newParticipants)}</td>
                <td>{number(s.comments)}</td>
                <td>{number(s.commands)}</td>
                <td>{number(s.diamonds)}</td>
                <td>{s.topCommand ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StreamReport({ summary, status }: { summary: StreamSummary; status: LiveStatus }) {
  const detail = useStreamDetail(summary.id, summary.endedAt === null);
  if (!detail) return null;
  const s = detail.summary;
  return (
    <>
      <Card
        title={`Stream on ${longDate(s.startedAt)}`}
        description={`${s.tiktokUsername ? `@${s.tiktokUsername}, ` : ''}${s.profileName} profile, ${duration((s.endedAt ?? Date.now()) - s.startedAt)}.`}
      >
        <div className="stat-tiles">
          <Stat label="Took part" value={number(s.participants)} note={`${number(s.newParticipants)} new`} />
          <Stat label="Joined" value={number(s.joins)} note="viewers" />
          <Stat label="Key presses" value={number(s.commands)} note={s.topCommand ? `mostly ${s.topCommand}` : undefined} />
          <Stat label="Diamonds" value={number(s.diamonds)} note={`${number(s.gifts)} gifts`} />
          <Stat label="New followers" value={number(s.follows)} />
          <div className="stat-tile">
            <span className="muted small">Top player</span>
            <strong>{s.topPlayer ? <ViewerLink name={s.topPlayer} /> : '—'}</strong>
          </div>
        </div>
        <h3>Chat over the stream</h3>
        <ActivityChart detail={detail} />
      </Card>
      <div className="analytics-grid">
        <Card title="Commands" description="How often each fired, and how often chat asked but it didn't.">
          <CommandUsage detail={detail} />
        </Card>
        <Card title="Peak moments" description="The busiest two minutes, worth checking for clips.">
          <Peaks detail={detail} />
        </Card>
      </div>
      <div className="analytics-grid">
        <Card title="Gifts" description="What viewers sent, by total diamonds.">
          <Gifts detail={detail} />
        </Card>
        <Card title="Crowd modes" description="Votes in democracy, and the line in queue mode.">
          <Modes detail={detail} />
        </Card>
      </div>
      <ActivityFeed status={status} stream={s.id} storageKey="fluxion-report-activity-open" />
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-tile">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
      {note && <span className="muted small">{note}</span>}
    </div>
  );
}

function Peaks({ detail }: { detail: StreamDetail }) {
  if (detail.peaks.length === 0) return <p className="empty">Nothing happened yet.</p>;
  const start = detail.summary.startedAt;
  const offset = (at: number) => clock(Math.round((at - start) / 60_000));
  return (
    <ol className="peak-list">
      {detail.peaks.map((p) => (
        <li key={p.start}>
          <strong>
            {offset(p.start)} to {offset(p.end)}
          </strong>
          <span className="muted">
            into the stream, {new Date(p.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
          <span>{number(p.events)} events</span>
        </li>
      ))}
    </ol>
  );
}

function Gifts({ detail }: { detail: StreamDetail }) {
  const { byGift, perHour } = detail.gifts;
  if (byGift.length === 0) return <p className="empty">No gifts this stream.</p>;
  return (
    <div className="stack">
      <BarList
        caption="Diamonds by gift"
        series={[{ name: 'Diamonds', slot: 1 }]}
        rows={byGift.slice(0, 8).map((g) => ({ label: g.gift, values: [g.diamonds], value: `${number(g.diamonds)} (${number(g.count)} sent)` }))}
      />
      {perHour.length > 1 && (
        <>
          <h3>Diamonds per hour</h3>
          <ColumnChart
            caption="Diamonds per hour of the stream"
            height={110}
            series={[{ name: 'Diamonds', slot: 1 }]}
            columns={perHour.map((h) => ({ label: `Hour ${h.hour + 1}`, tick: `Hour ${h.hour + 1}`, values: [h.diamonds] }))}
          />
        </>
      )}
    </div>
  );
}

function Modes({ detail }: { detail: StreamDetail }) {
  const { votes, queue } = detail.modes;
  if (votes.rounds === 0 && queue.joins === 0) return <p className="empty">Democracy and queue weren't used this stream.</p>;
  return (
    <div className="stat-tiles">
      {votes.rounds > 0 && (
        <>
          <Stat label="Vote rounds" value={number(votes.rounds)} />
          <Stat label="Voters per round" value={votes.avgVoters.toFixed(1)} note="on average" />
          <Stat label="Close votes" value={`${Math.round((votes.closeRounds / votes.rounds) * 100)}%`} note="won by one vote or tied" />
        </>
      )}
      {queue.joins > 0 && (
        <>
          <Stat label="Joined the queue" value={number(queue.joins)} />
          <Stat label="Turns played" value={number(queue.turns)} />
          <Stat label="Average wait" value={duration(queue.avgWaitMs).replace(/^0 min$/, 'under a minute')} />
        </>
      )}
    </div>
  );
}
