import { useEffect, useRef, useState } from 'react';
import type { StreamEvent, StreamSummary } from '@fluxion/shared';
import { api, type LiveStatus } from '../api';
import { Icon } from '../icons';
import { ViewerLink } from './ViewerPanel';

type Kind = 'comment' | 'gift' | 'join' | 'follow' | 'share' | 'like' | 'subscribe' | 'emote';
const FILTERS: { kind: Kind; label: string; tag: string }[] = [
  { kind: 'comment', label: 'Chat', tag: 'sky' },
  { kind: 'gift', label: 'Gifts', tag: 'pink' },
  { kind: 'join', label: 'Joins', tag: 'teal' },
  { kind: 'follow', label: 'Follows', tag: 'violet' },
  { kind: 'share', label: 'Shares', tag: 'green' },
  { kind: 'like', label: 'Likes', tag: 'amber' },
  { kind: 'subscribe', label: 'Subs', tag: 'orange' },
  { kind: 'emote', label: 'Stickers', tag: 'indigo' },
];
// Tag text and colour for each kind of event, also used by viewer profiles.
export const KIND_TAGS: Partial<Record<StreamEvent['kind'], { label: string; hue: string }>> = Object.fromEntries(
  FILTERS.map((f) => [f.kind, { label: f.label.replace(/s$/, ''), hue: f.tag }]),
);
const PAGE = 100;
const POLL_MS = 2000;

interface Page {
  stream: { id: string; source: 'tiktok' | 'simulated'; startedAt: number; live: boolean } | null;
  events: StreamEvent[];
}

export function describeEvent(e: StreamEvent): string {
  switch (e.kind) {
    case 'comment':
      return String(e.data.text);
    case 'gift': {
      const count = Number(e.data.count);
      const coins = count * Number(e.data.diamonds);
      return `sent ${count > 1 ? `${count}× ` : ''}${String(e.data.gift)} (${coins} coin${coins === 1 ? '' : 's'})`;
    }
    case 'like':
      return `liked the stream${Number(e.data.count) > 1 ? ` ×${e.data.count}` : ''}`;
    case 'follow':
      return 'followed you';
    case 'share':
      return 'shared the stream';
    case 'join':
      return 'joined';
    case 'subscribe': {
      const months = Number(e.data.months);
      return months > 1 ? `subscribed for ${months} months` : 'subscribed';
    }
    case 'emote':
      return 'sent a sticker';
    default:
      return '';
  }
}

const readOpen = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const streamLabel = (s: StreamSummary) =>
  `${new Date(s.startedAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${s.tiktokUsername ? ` (@${s.tiktokUsername})` : ''}`;

// Everything viewers did during a stream: chat, gifts, joins, follows, shares, likes. Shows the current (or last)
// stream with a picker for earlier ones, or always `stream` when given.
// `window`: it fills a window of its own (see ActivityWindow), always open, with no pop-out button.
export function ActivityFeed({
  status,
  stream: fixed,
  storageKey = 'fluxion-activity-open',
  window: own,
}: {
  status: LiveStatus;
  stream?: string;
  storageKey?: string;
  window?: boolean;
}) {
  const [stored, setOpen] = useState(() => readOpen(storageKey));
  const open = own || stored;
  const [selected, setSelected] = useState(fixed ?? 'latest');
  const [pastStreams, setPastStreams] = useState<StreamSummary[]>([]);
  const [kinds, setKinds] = useState<Kind[]>(FILTERS.map((f) => f.kind));
  const [search, setSearch] = useState('');
  const [viewer, setViewer] = useState(''); // search, applied after typing pauses
  const [page, setPage] = useState<Page | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const newest = useRef<number | undefined>(undefined);
  // Paused: the list holds still while new activity waits here, newest first, until it resumes.
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState<Page['events']>([]);

  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(storageKey, open ? '0' : '1');
    } catch {
      // not remembered, that's all
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setViewer(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = (extra: string) =>
    `/analytics/activity?kinds=${kinds.join(',')}${viewer ? `&viewer=${encodeURIComponent(viewer)}` : ''}${extra}`;

  useEffect(() => setSelected(fixed ?? 'latest'), [fixed]);
  // Earlier streams for the picker.
  useEffect(() => {
    if (open && !fixed) void api<StreamSummary[]>('GET', '/analytics/streams').then(setPastStreams);
  }, [open, fixed, status.live]);

  // A fresh first page whenever the stream or filters change, or a stream starts or stops.
  useEffect(() => {
    if (!open || kinds.length === 0) return;
    let cancelled = false;
    api<Page>('GET', query(`&stream=${selected}&limit=${PAGE}`)).then((p) => {
      if (cancelled) return;
      setPage(p);
      setHeld([]);
      setHasOlder(p.events.length === PAGE);
      newest.current = p.events[0]?.id;
    });
    return () => {
      cancelled = true;
    };
  }, [open, selected, kinds, viewer, status.live, status.startedAt]);

  // While live, what's new every couple of seconds.
  useEffect(() => {
    if (!open || !page?.stream?.live || kinds.length === 0) return;
    const timer = setInterval(() => {
      api<Page>('GET', query(`&stream=${page.stream!.id}&after=${newest.current ?? 0}&limit=200`)).then((p) => {
        if (p.events.length === 0) return;
        newest.current = p.events[p.events.length - 1]!.id;
        const fresh = [...p.events].reverse();
        if (pausedRef.current) setHeld((h) => [...fresh, ...h]);
        else setPage((current) => current && { ...current, events: [...fresh, ...current.events] });
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, page?.stream?.id, page?.stream?.live, kinds, viewer]);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const togglePaused = () => {
    if (paused) {
      setPage((current) => current && { ...current, events: [...held, ...current.events] });
      setHeld([]);
    }
    setPaused(!paused);
  };

  const loadOlder = () => {
    if (!page?.stream || page.events.length === 0) return;
    setLoadingOlder(true);
    api<Page>('GET', query(`&stream=${page.stream.id}&before=${page.events[page.events.length - 1]!.id}&limit=${PAGE}`))
      .then((p) => {
        setPage((current) => current && { ...current, events: [...current.events, ...p.events] });
        setHasOlder(p.events.length === PAGE);
      })
      .finally(() => setLoadingOlder(false));
  };

  const flip = (list: Kind[], kind: Kind) => (list.includes(kind) ? list.filter((k) => k !== kind) : [...list, kind]);
  const toggleKind = (kind: Kind) => setKinds((current) => flip(current, kind));
  // A double-click's first click already flipped the filter; undo that, then show only this one.
  // Double-clicking the only one shown brings the rest back.
  const onlyKind = (kind: Kind) =>
    setKinds((current) => {
      const before = flip(current, kind);
      return before.length === 1 && before[0] === kind ? FILTERS.map((f) => f.kind) : [kind];
    });
  const stream = page?.stream;

  return (
    <section className={`card activity-feed ${own ? 'in-window' : ''}`} aria-labelledby="full-activity">
      {own ? (
        <h2 id="full-activity">Full activity</h2>
      ) : (
        <div className="activity-head">
          <button className="collapse-head" aria-expanded={open} aria-controls="full-activity-body" onClick={toggle}>
            <span>
              <h2 id="full-activity">Full activity</h2>
              <span className="muted">Every chat message, gift, join, follow, share, like, subscription and sticker from your stream.</span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
          {!fixed && (
            <button
              className="btn btn-ghost btn-sm btn-icon"
              title="Open in a new window"
              aria-label="Open full activity in a new window"
              onClick={() => window.open('/dashboard/activity-window', 'fluxion-activity', 'popup,width=560,height=820')}
            >
              <Icon name="popOut" />
            </button>
          )}
        </div>
      )}
      {open && (
        <div id="full-activity-body" className="stack activity-body">
          <div className="activity-filters">
            <div className="chips" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button
                  key={f.kind}
                  className={`chip ${kinds.includes(f.kind) ? 'on' : ''}`}
                  aria-pressed={kinds.includes(f.kind)}
                  title="Double-click to show only this"
                  onClick={(e) => (e.detail === 2 ? onlyKind(f.kind) : toggleKind(f.kind))}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input className="input activity-search" type="search" placeholder="Search viewers" aria-label="Search viewers" value={search} onChange={(e) => setSearch(e.target.value)} />
            {!fixed && pastStreams.length > 0 && (
              <select className="input activity-stream" aria-label="Stream" value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="latest">{status.live ? 'This stream' : 'Latest session'}</option>
                {pastStreams
                  .filter((s) => s.id !== page?.stream?.id || selected !== 'latest')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {streamLabel(s)}
                    </option>
                  ))}
              </select>
            )}
          </div>
          {stream && (!fixed || stream.live) && (
            <div className="activity-status">
              <p className="muted small">
                {stream.live
                  ? paused
                    ? 'Paused. New activity waits until you resume.'
                    : stream.source === 'simulated'
                      ? 'Test mode, updating live.'
                      : 'This stream, updating live.'
                  : `Your last ${stream.source === 'simulated' ? 'test session' : 'stream'}, ${new Date(stream.startedAt).toLocaleString()}.`}
              </p>
              {stream.live && (
                <button className="btn btn-sm" aria-pressed={paused} onClick={togglePaused}>
                  <Icon name={paused ? 'play' : 'pause'} size={14} />
                  {paused ? `Resume${held.length ? ` (${held.length} new)` : ''}` : 'Pause'}
                </button>
              )}
            </div>
          )}
          {kinds.length === 0 ? (
            <p className="empty">Pick at least one kind of activity to show.</p>
          ) : !page ? null : !stream ? (
            <p className="empty">Activity shows up here once you go live or start test mode.</p>
          ) : page.events.length === 0 ? (
            <p className="empty">{viewer ? `Nothing from viewers matching “${viewer}”.` : 'Nothing yet.'}</p>
          ) : (
            <ol className="activity-list">
              {page.events.map((e) => {
                const filter = FILTERS.find((f) => f.kind === e.kind);
                return (
                  <li key={e.id}>
                    <time className="muted" dateTime={new Date(e.at).toISOString()}>
                      {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </time>
                    <span className={`tag ${filter?.tag ?? ''}`}>{filter?.label.replace(/s$/, '') ?? e.kind}</span>
                    <span className="activity-text">
                      {e.viewer && <ViewerLink name={e.viewer} />} <span className={e.kind === 'comment' ? '' : 'muted'}>{describeEvent(e)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {hasOlder && (
            <button className="btn btn-ghost" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? 'Loading…' : 'Load older'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
