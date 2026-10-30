import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ViewerHistoryEvent, ViewerProfile } from '@fluxion/shared';
import { api } from '../api';
import { Icon } from '../icons';
import { describeEvent, KIND_TAGS } from './ActivityFeed';
import { BarList } from './charts';

const PAGE = 50;

// Any viewer's name can open their profile; the dashboard shell provides the opener.
export const ViewerContext = createContext<(viewer: string) => void>(() => {});

export function ViewerLink({ name }: { name: string }) {
  const open = useContext(ViewerContext);
  return (
    <button type="button" className="viewer-link" onClick={() => open(name)} title={`${name}'s profile`}>
      {name}
    </button>
  );
}

const date = (at: number) => new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const dateTime = (at: number) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// A side panel with one viewer's history across all of the host's streams.
export function ViewerPanel({ viewer, onClose }: { viewer: string; onClose: () => void }) {
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [events, setEvents] = useState<ViewerHistoryEvent[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setProfile(null);
    setEvents([]);
    const path = `/analytics/viewers/${encodeURIComponent(viewer)}`;
    api<ViewerProfile>('GET', path).then(setProfile);
    api<ViewerHistoryEvent[]>('GET', `${path}/activity?limit=${PAGE}`).then((e) => (setEvents(e), setHasOlder(e.length === PAGE)));
  }, [viewer]);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const loadOlder = () =>
    api<ViewerHistoryEvent[]>('GET', `/analytics/viewers/${encodeURIComponent(viewer)}/activity?limit=${PAGE}&before=${events[events.length - 1]!.id}`).then(
      (older) => (setEvents([...events, ...older]), setHasOlder(older.length === PAGE)),
    );
  const accounts = new Set(profile?.perStream.map((s) => s.tiktokUsername ?? '—'));

  return (
    <div className="viewer-backdrop" onClick={onClose}>
      <aside className="viewer-panel" role="dialog" aria-modal="true" aria-labelledby="viewer-name" onClick={(e) => e.stopPropagation()}>
        <header className="viewer-head">
          <span className="viewer-avatar" aria-hidden="true">
            {viewer[0]?.toUpperCase()}
          </span>
          <div>
            <h2 id="viewer-name">{viewer}</h2>
            {profile && (
              <p className="muted small">
                {profile.firstSeen === null
                  ? 'No activity recorded yet'
                  : `First seen ${date(profile.firstSeen)}, last seen ${date(profile.lastSeen!)}`}
              </p>
            )}
          </div>
          <button ref={close} className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>

        {profile && profile.firstSeen !== null && (
          <div className="stack viewer-body">
            <div className="stat-tiles">
              <Tile label="Streams" value={profile.streams} />
              <Tile label="Level" value={profile.level} note={`${profile.xp.toLocaleString()} XP`} />
              {profile.points > 0 && <Tile label="Points" value={profile.points} note="to spend" />}
              <Tile label="Chat messages" value={profile.comments} />
              <Tile label="Key presses" value={profile.commands} />
              <Tile label="Gifts" value={profile.gifts} note={`${profile.diamonds.toLocaleString()} coins`} />
            </div>

            {profile.topCommands.length > 0 && (
              <section>
                <h3>Favourite commands</h3>
                <BarList
                  caption={`${viewer}'s favourite commands`}
                  series={[{ name: 'Times used', slot: 1 }]}
                  rows={profile.topCommands.map((c) => ({ label: c.keyword, values: [c.count], value: `${c.count}×` }))}
                />
              </section>
            )}

            <section>
              <h3>Stream by stream</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Stream</th>
                      {accounts.size > 1 && <th>Account</th>}
                      <th>Chat</th>
                      <th>Presses</th>
                      <th>Coins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.perStream.map((s) => (
                      <tr key={s.streamId}>
                        <td>
                          {dateTime(s.startedAt)}
                          {s.source === 'simulated' && <span className="tag amber">Test</span>}
                        </td>
                        {accounts.size > 1 && <td>{s.tiktokUsername ?? '—'}</td>}
                        <td>{s.comments}</td>
                        <td>{s.commands}</td>
                        <td>{s.diamonds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3>Everything they did</h3>
              <ol className="activity-list viewer-history">
                {events.map((e, i) => {
                  const newStream = i === 0 || events[i - 1]!.streamId !== e.streamId;
                  const tag = KIND_TAGS[e.kind];
                  return (
                    <li key={e.id} className={newStream ? 'stream-start' : ''} data-stream={newStream ? `Stream on ${dateTime(e.streamStartedAt)}` : undefined}>
                      <time className="muted">{new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
                      <span className={`tag ${tag?.hue ?? 'indigo'}`}>{tag?.label ?? 'Key'}</span>
                      <span className="activity-text">{e.kind === 'command' ? `pressed ${String(e.data.keyword)}` : describeEvent(e)}</span>
                    </li>
                  );
                })}
              </ol>
              {hasOlder && (
                <button className="btn btn-ghost" onClick={() => void loadOlder()}>
                  Load older
                </button>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="stat-tile">
      <span className="muted small">{label}</span>
      <strong>{value.toLocaleString()}</strong>
      {note && <span className="muted small">{note}</span>}
    </div>
  );
}
