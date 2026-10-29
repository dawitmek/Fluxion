import { useEffect, useState, type FormEvent } from 'react';
import { levelForXp, MODES, type LeaderboardEntry, type ModeState } from '@fluxion/shared';
import { api, type Command, type LiveStatus } from '../api';
import { Link } from '../router';
import { ErrorNotice, keyLabel, Seg, useError } from '../ui';
import type { PageProps } from './Dashboard';
import type { ActivityKind } from './live-feed';
import { MODE_INFO } from './modes';

export function LivePage(props: PageProps) {
  return (
    <>
      <StatusTiles {...props} />
      <div className="live-columns">
        <div className="stack live-main">
          <CommandsOverview {...props} />
          {props.status.live && props.status.source === 'simulated' && <TestConsole />}
        </div>
        <aside className="stack live-side" aria-label="Happening now">
          <ModeCard {...props} />
          <ActivityCard {...props} />
          <TopPlayers {...props} />
        </aside>
      </div>
    </>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function StatusTiles({ host, status, setStatus, feed }: PageProps) {
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const { error, guard } = useError();
  const modeLabel = MODE_INFO[status.mode ?? host.mode].label.toLowerCase();
  const rateSegments = Array.from({ length: Math.min(host.actionsPerSecond, 10) }, (_, i) => i);
  const filled = Math.round((Math.min(feed.perSecond, host.actionsPerSecond) / host.actionsPerSecond) * rateSegments.length);

  const start = (source: 'tiktok' | 'simulated') =>
    guard(async () => {
      setBusy(true);
      try {
        setStatus(await api<LiveStatus>('POST', '/live/start', { source }));
      } finally {
        setBusy(false);
      }
    });
  const stop = guard(async () => setStatus(await api<LiveStatus>('POST', '/live/stop')));

  return (
    <section className="status-tiles" aria-label="Stream status">
      {status.live ? (
        <div className={`tile ${status.source === 'simulated' ? 'amber' : 'red'}`}>
          <div className="tile-title" style={{ color: status.source === 'simulated' ? 'var(--amber)' : 'var(--red)' }}>
            <span className="dot live" aria-hidden="true" />
            {status.source === 'simulated' ? 'Test mode' : 'Live on TikTok'}
          </div>
          <div className="row" style={{ alignItems: 'baseline', marginTop: 6 }}>
            <span className="tile-value" style={{ marginTop: 0 }}>
              {status.startedAt ? elapsed(now - status.startedAt) : '0:00'}
            </span>
            <span className="muted">{modeLabel} mode</span>
          </div>
        </div>
      ) : (
        <div className="tile">
          <div className="tile-title muted">
            <span className="dot" aria-hidden="true" />
            Offline
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            {host.tiktokUsername
              ? `Go live on TikTok first, then connect ${host.tiktokUsername}.`
              : 'Add your TikTok username in Settings to go live.'}
          </p>
        </div>
      )}

      <div className={`tile ${status.companionsOnline > 0 ? 'green' : 'amber'}`}>
        <div className="tile-title" style={{ color: status.companionsOnline > 0 ? 'var(--green)' : 'var(--amber)' }}>
          <span className="dot" aria-hidden="true" />
          {status.companionsOnline > 0 ? 'Companion ready' : 'No companion connected'}
        </div>
        {status.companionsOnline > 0 ? (
          <div className="tile-big-text">
            {status.companionsOnline} {status.companionsOnline === 1 ? 'device' : 'devices'} online
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>
            Keys go nowhere until one is. <Link href="/dashboard/companion">Pair a companion</Link>
          </p>
        )}
      </div>

      <div className="tile">
        <div className="tile-title" style={{ color: 'var(--indigo)' }}>
          Input rate
        </div>
        <div className="row" style={{ alignItems: 'baseline', marginTop: 6 }}>
          <span className="tile-value" style={{ marginTop: 0 }}>
            {feed.perSecond}
          </span>
          <span className="muted">of {host.actionsPerSecond} keys per second</span>
        </div>
        <div className="rate-bar" aria-hidden="true">
          {rateSegments.map((i) => (
            <div key={i} className={i < filled ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className="tile-actions">
        {status.live ? (
          <button className="btn btn-danger btn-lg" onClick={stop}>
            {status.source === 'simulated' ? 'Stop test' : 'Stop'}
          </button>
        ) : (
          <>
            <button className="btn btn-primary btn-lg" disabled={busy || !host.tiktokUsername} onClick={start('tiktok')}>
              {busy ? 'Connecting…' : 'Go live'}
            </button>
            <button className="btn btn-lg" disabled={busy} onClick={start('simulated')}>
              Start test mode
            </button>
          </>
        )}
        <ErrorNotice error={error} />
      </div>
    </section>
  );
}

function CommandsOverview({ host, refreshHost, feed }: PageProps) {
  const [commands, setCommands] = useState<Command[] | null>(null);
  const { error, guard } = useError();
  useEffect(() => void api<Command[]>('GET', '/commands').then(setCommands), []);
  const setMode = (mode: (typeof MODES)[number]) => guard(() => api('PATCH', '/settings', { mode }).then(refreshHost))();
  const enabled = commands?.filter((c) => c.enabled) ?? [];
  const most = Math.max(1, ...enabled.map((c) => feed.pressed[c.keyword] ?? 0));

  return (
    <section className="card" aria-labelledby="live-commands">
      <div className="card-head">
        <div>
          <h2 id="live-commands">Commands</h2>
          <p>What chat types, and the key it presses. Counts start when this page opens.</p>
        </div>
        <Link href="/dashboard/commands" className="btn btn-primary">
          Edit commands
        </Link>
      </div>
      {commands && enabled.length === 0 && (
        <p className="empty">
          No commands are on, so chat can't press anything. <Link href="/dashboard/commands">Add a command</Link>
        </p>
      )}
      <div className="command-grid">
        {enabled.map((c) => {
          const pressed = feed.pressed[c.keyword] ?? 0;
          return (
            <div key={c.id} className={`command-card ${feed.lastPress === c.keyword ? 'fired' : ''}`}>
              <div className="command-top">
                <span className="command-keyword">{c.keyword}</span>
                <kbd className="kbd">{keyLabel(c.key)}</kbd>
              </div>
              <div className="muted small">
                {c.minLevel > 1 && host.progression && host.levelGating
                  ? `level ${c.minLevel} and up`
                  : `${c.holdMs / 1000} s hold, ${c.cooldownMs / 1000} s cooldown`}
              </div>
              <div className="command-used">
                <span className="muted">Pressed</span>
                <span className="num">{pressed}</span>
              </div>
              <div className="meter">
                <div style={{ width: `${(pressed / most) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <h3 style={{ margin: '24px 0 10px' }}>Crowd mode</h3>
      <Seg label="Crowd mode" value={host.mode} options={MODES.map((m) => [m, MODE_INFO[m].label] as const)} onChange={setMode} />
      <p className="muted" style={{ marginTop: 8 }}>
        {MODE_INFO[host.mode].help}
      </p>
      <ErrorNotice error={error} />
    </section>
  );
}

function Countdown({ endsAt, windowMs, clockOffset }: { endsAt: number; windowMs: number; clockOffset: number }) {
  const now = useNow(200);
  const left = Math.max(0, endsAt + clockOffset - now);
  const circumference = 2 * Math.PI * 20;
  const fraction = Math.min(1, left / windowMs);
  const seconds = Math.ceil(left / 1000);
  return (
    <div className="countdown" role="img" aria-label={`${seconds} seconds left`}>
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" fill="none" stroke="var(--meter)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="var(--amber-fill)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <span>{seconds}s</span>
    </div>
  );
}

function ModeCard({ host, feed }: PageProps) {
  const state: ModeState | undefined = feed.mode?.state;
  const clockOffset = feed.mode?.clockOffset ?? 0;

  if (state?.mode === 'democracy') {
    const total = state.tally.reduce((sum, t) => sum + t.votes, 0);
    return (
      <div className="card mode-card">
        <div className="mode-card-head">
          <div>
            <h2>{state.endsAt ? 'Vote in progress' : 'Waiting for votes'}</h2>
            <p className="muted small">
              {total} {total === 1 ? 'vote' : 'votes'} this round
            </p>
          </div>
          {state.endsAt && <Countdown endsAt={state.endsAt} windowMs={host.voteWindowMs} clockOffset={clockOffset} />}
        </div>
        {state.tally.slice(0, 4).map((t, i) => (
          <div key={t.keyword} className="vote-row">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{t.keyword}</strong>
              <span className="muted num">
                {t.votes} {t.votes === 1 ? 'vote' : 'votes'}
              </span>
            </div>
            <div className={`vote-bar ${i === 0 ? 'leading' : ''}`}>
              <div style={{ width: `${(t.votes / Math.max(1, total)) * 100}%` }} />
            </div>
          </div>
        ))}
        {state.tally.length === 0 && <p className="muted">Chat types a command to vote for it.</p>}
      </div>
    );
  }

  if (state?.mode === 'queue') {
    return (
      <div className="card mode-card">
        <div className="mode-card-head">
          <div>
            <h2>{state.viewer ? `${state.viewer} is playing` : 'Queue is empty'}</h2>
            <p className="muted small">
              {state.queue.length} waiting{state.queue.length > 0 && `: ${state.queue.slice(0, 3).join(', ')}`}
              {state.queue.length > 3 && '…'}
            </p>
          </div>
          {state.endsAt && <Countdown endsAt={state.endsAt} windowMs={host.turnMs} clockOffset={clockOffset} />}
        </div>
      </div>
    );
  }

  return null;
}

const ACTIVITY_HUES: Record<ActivityKind, string> = { Key: 'indigo', Alert: 'pink', Level: 'violet', Voice: 'sky' };

function ActivityCard({ feed }: PageProps) {
  const items = feed.activity.slice(0, 8);
  return (
    <section className="card" aria-labelledby="live-activity">
      <h2 id="live-activity" style={{ marginBottom: 6 }}>
        Activity
      </h2>
      {items.length === 0 ? (
        <p className="muted">Key presses, alerts and level-ups show up here as they happen.</p>
      ) : (
        <ol className="activity">
          {items.map((a) => (
            <li key={a.id}>
              <span className={`tag ${ACTIVITY_HUES[a.kind]}`}>{a.kind}</span>
              <span className="activity-text">{a.text}</span>
              <span className="muted small num">
                {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const PLAYER_RINGS = ['violet', 'pink', 'sky'];

function TopPlayers({ host, feed }: PageProps) {
  const [loaded, setLoaded] = useState<LeaderboardEntry[]>([]);
  useEffect(() => void api<LeaderboardEntry[]>('GET', '/leaderboard').then(setLoaded), []);
  const entries = (feed.leaderboard ?? loaded).slice(0, 3);
  const score = (e: LeaderboardEntry) => (host.progression ? e.xp : e.commands);
  const best = Math.max(1, ...entries.map(score));

  return (
    <section className="card" aria-labelledby="live-players">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 id="live-players">Top players</h2>
        <Link href="/dashboard/leaderboard" className="small">
          Full leaderboard
        </Link>
      </div>
      {entries.length === 0 && <p className="muted">Nobody has played yet.</p>}
      {entries.map((e, i) => (
        <div key={e.viewer} className="player">
          <span className={`player-ring ${PLAYER_RINGS[i]}`} aria-hidden="true">
            <span>{e.viewer[0]?.toUpperCase()}</span>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <span className="player-name">
                <strong>{e.viewer}</strong>
                {host.progression && <span className="muted"> level {levelForXp(e.xp)}</span>}
              </span>
              <span className="muted num">{host.progression ? `${e.xp} XP` : `${e.commands} commands`}</span>
            </div>
            <div className={`meter player-meter ${PLAYER_RINGS[i]}`}>
              <div style={{ width: `${(score(e) / best) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function TestConsole() {
  const [viewer, setViewer] = useState('tester');
  const [text, setText] = useState('left');
  const [gift, setGift] = useState('Rose');
  const [count, setCount] = useState(1);
  const { error, guard } = useError();
  const send = (body: object) => guard(() => api('POST', '/live/simulate', { viewer, ...body }));
  const comment = (e: FormEvent) => {
    e.preventDefault();
    send({ text })();
  };

  return (
    <section className="card stack" aria-labelledby="live-test">
      <div>
        <h2 id="live-test">Test as a viewer</h2>
        <p className="muted">Pretend to be chat. Commands go to your companion like the real thing.</p>
      </div>
      <ErrorNotice error={error} />
      <form className="row" onSubmit={comment}>
        <input className="input" value={viewer} onChange={(e) => setViewer(e.target.value)} aria-label="Viewer name" placeholder="Viewer" />
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} aria-label="Comment" placeholder="Comment" />
        <button className="btn btn-primary">Send comment</button>
      </form>
      <div className="row">
        <input className="input" value={gift} onChange={(e) => setGift(e.target.value)} aria-label="Gift name" placeholder="Gift name" />
        <input
          className="input short"
          style={{ flex: 'none', minWidth: 0 }}
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="Gift count"
        />
        <button className="btn" onClick={send({ gift, count })}>
          Send gift
        </button>
      </div>
      <div className="row">
        <button className="btn btn-sm" onClick={send({ event: 'follow' })}>
          Send follow
        </button>
        <button className="btn btn-sm" onClick={send({ event: 'share' })}>
          Send share
        </button>
        <button className="btn btn-sm" onClick={send({ event: 'like', count: 100 })}>
          Send 100 likes
        </button>
      </div>
    </section>
  );
}
