import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { levelForXp, MODES, type LeaderboardEntry, type ModeState } from '@fluxion/shared';
import { api, type Command, type LiveStatus } from '../api';
import { Link } from '../router';
import { Card, ErrorNotice, keyLabel, Seg, useError } from '../ui';
import { Icon } from '../icons';
import type { PageProps } from './Dashboard';
import type { Activity, ActivityKind } from './live-feed';
import { MODE_INFO } from './modes';
import { ActivityFeed } from './ActivityFeed';
import { VoiceControls } from './VoiceControls';
import { ViewerLink } from './ViewerPanel';
import { ActivityChart, CommandUsage, useStreamDetail } from './StreamInsights';

export function LivePage(props: PageProps) {
  return (
    <>
      <StatusTiles {...props} />
      <div className="live-columns">
        <div className="stack live-main">
          <CommandsOverview {...props} />
          {props.status.live && props.status.source === 'simulated' && <TestConsole />}
          <ActivityFeed status={props.status} />
          {props.status.live && <ThisStream />}
        </div>
        <aside className="stack live-side" aria-label="Happening now">
          <ModeCard {...props} />
          <VoiceControls {...props} />
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

// How the busiest commands rise to the top: each press adds 1 to a command's score, and scores halve every
// HALF_LIFE_MS. So a command pressed a lot lately leads, one pressed once a while ago sinks, and steady use
// beats a single stray press. Every score fades at the same rate, so only a press can change the order: it's
// redone on each one, and nothing runs in between.
const HALF_LIFE_MS = 30_000;
const COMMAND_ROWS = 3;
const SLIDE_MS = 250;

function useBusiestFirst(keywords: string[], pressed: Record<string, number>) {
  const heat = useRef(new Map<string, { score: number; at: number }>());
  const counted = useRef<Record<string, number>>({});
  const scoreAt = (keyword: string, now: number) => {
    const h = heat.current.get(keyword);
    return h ? h.score * 0.5 ** ((now - h.at) / HALF_LIFE_MS) : 0;
  };
  // New presses since last time, from the page's running counts.
  useEffect(() => {
    const now = Date.now();
    for (const [keyword, count] of Object.entries(pressed)) {
      const added = count - (counted.current[keyword] ?? 0);
      if (added > 0) heat.current.set(keyword, { score: scoreAt(keyword, now) + added, at: now });
    }
    counted.current = pressed;
    setOrder(rank());
  }, [pressed]);
  // Never-pressed commands keep their usual order, after the pressed ones (sort is stable).
  const rank = () => {
    const now = Date.now();
    return [...keywords].sort((a, b) => scoreAt(b, now) - scoreAt(a, now));
  };
  const [order, setOrder] = useState(rank);
  const key = keywords.join('\n');
  useEffect(() => setOrder(rank()), [key]);
  return order;
}

// Cards with `data-slide` glide from where they were to where they are now, rather than jumping, whenever they move
// in the grid (a new order, or the window resized). Offsets ignore both a slide in progress and page scrolling.
function useSlide(grid: RefObject<HTMLDivElement | null>) {
  const last = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const cards = [...(grid.current?.querySelectorAll<HTMLElement>('[data-slide]') ?? [])];
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const now = new Map(cards.map((card) => [card.dataset.slide!, { x: card.offsetLeft, y: card.offsetTop }]));
    for (const card of cards) {
      const from = last.current.get(card.dataset.slide!);
      const to = now.get(card.dataset.slide!)!;
      if (still || !from || (from.x === to.x && from.y === to.y)) continue;
      for (const a of card.getAnimations()) a.cancel(); // moved again mid-slide: start over from its last place
      card.animate([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` }, { transform: 'none' }], {
        duration: SLIDE_MS,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      });
    }
    last.current = now;
  });
}

// How many cards fit in a row of the grid right now; it changes with the window.
function useColumns() {
  const grid = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => setColumns(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').length));
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  return { grid, columns };
}

function CommandsOverview({ host, refreshHost, feed }: PageProps) {
  const [commands, setCommands] = useState<Command[] | null>(null);
  const { error, guard } = useError();
  useEffect(() => void api<Command[]>('GET', '/commands').then(setCommands), []);
  const setMode = (mode: (typeof MODES)[number]) => guard(() => api('PATCH', '/settings', { mode }).then(refreshHost))();
  const enabled = commands?.filter((c) => c.enabled) ?? [];
  const pressed = feed.pressed;
  const most = Math.max(1, ...enabled.map((c) => pressed[c.keyword] ?? 0));
  // The stream's count so far arrives as one big jump, so after a refresh the busiest this stream lead.
  const order = useBusiestFirst(
    enabled.map((c) => c.keyword),
    pressed,
  );
  const sorted = [...enabled].sort((a, b) => order.indexOf(a.keyword) - order.indexOf(b.keyword));
  const { grid, columns } = useColumns();
  useSlide(grid);
  const [expanded, setExpanded] = useState(false);
  const fits = columns * COMMAND_ROWS;
  const shown = expanded ? sorted : sorted.slice(0, fits);

  return (
    <section className="card" aria-labelledby="live-commands">
      <div className="card-head">
        <div>
          <h2 id="live-commands">Commands</h2>
          <p>What chat types, and the key it presses. Counts are for this stream.</p>
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
      <div className="command-grid" ref={grid}>
        {shown.map((c) => {
          const count = pressed[c.keyword] ?? 0;
          return (
            <div key={c.id} data-slide={c.keyword} className={`command-card ${feed.lastPress === c.keyword ? 'fired' : ''}`}>
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
                <span className="num">{count}</span>
              </div>
              <div className="meter">
                <div style={{ width: `${(count / most) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {sorted.length > fits && (
        <button className="line-expand command-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer' : `Show ${sorted.length - fits} more command${sorted.length - fits === 1 ? '' : 's'}`}
          <Icon name="chevron" />
        </button>
      )}
      <h3 style={{ margin: '24px 0 10px' }}>Crowd mode</h3>
      <div className="crowd-mode">
        <Seg label="Crowd mode" value={host.mode} options={MODES.map((m) => [m, MODE_INFO[m].label] as const)} onChange={setMode} />
      </div>
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
  const [expanded, setExpanded] = useState(false);
  // A click anywhere on the card expands it; the button is there for the keyboard. The dialog sits outside the card,
  // so clicks inside it (closing it, say) don't reach the card and open it again.
  return (
    <>
      <section className="card card-clickable" aria-labelledby="live-activity" onClick={() => setExpanded(true)}>
        <div className="mode-card-head" style={{ marginBottom: 6 }}>
          <h2 id="live-activity">Activity</h2>
          <button className="btn btn-ghost btn-sm btn-icon" title="Expand" aria-label="Expand activity">
            <Icon name="expand" />
          </button>
        </div>
        <ActivityList items={feed.activity.slice(0, 8)} />
      </section>
      {expanded && <ActivityDialog feed={feed} onClose={() => setExpanded(false)} />}
    </>
  );
}

function ActivityList({ items, seconds }: { items: Activity[]; seconds?: boolean }) {
  if (items.length === 0) return <p className="muted">Key presses, alerts and level-ups show up here as they happen.</p>;
  return (
    <ol className="activity">
      {items.map((a) => (
        <li key={a.id}>
          <span className={`tag ${ACTIVITY_HUES[a.kind]}`}>{a.kind}</span>
          <span className="activity-text">{a.text}</span>
          <span className="muted small num">
            {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(seconds && { second: '2-digit' }) })}
          </span>
        </li>
      ))}
    </ol>
  );
}

// The Activity card, bigger and over the page: everything since this page opened (the newest 100), updating live.
function ActivityDialog({ feed, onClose }: { feed: PageProps['feed']; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog ref={dialog} className="activity-dialog" onClose={onClose} aria-labelledby="activity-dialog-title">
      <div className="pos-head">
        <div>
          <h2 id="activity-dialog-title">Activity</h2>
          <p className="muted small">Key presses, alerts, level-ups and read-aloud chat since this page opened, newest first.</p>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => dialog.current?.close()} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="activity-dialog-body">
        <ActivityList items={feed.activity} seconds />
      </div>
    </dialog>
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
                <ViewerLink name={e.viewer} />
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
  const [text, setText] = useState('w');
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
        <button className="btn btn-sm" onClick={send({ event: 'subscribe' })}>
          Send subscription
        </button>
        <button className="btn btn-sm" onClick={send({ event: 'emote' })}>
          Send sticker
        </button>
        <button className="btn btn-sm" onClick={guard(() => api('POST', '/live/simulate', { viewers: 50 + Math.floor(Math.random() * 450), topGifters: [viewer] }))}>
          Set viewer count
        </button>
      </div>
    </section>
  );
}

// Charts for the stream that's on now; past streams are on the Analytics page.
function ThisStream() {
  const detail = useStreamDetail('latest', true);
  if (!detail) return null;
  return (
    <Card title="This stream" description="Updates every few seconds. Past streams are on the Analytics page.">
      <h3>Chat over the stream</h3>
      <ActivityChart detail={detail} />
      <h3>Commands</h3>
      <CommandUsage detail={detail} />
    </Card>
  );
}
