import { useEffect, useState } from 'react';
import { AlertPlayer } from './alert-player';
import { levelForXp, QUEUE_JOIN, type LeaderboardEntry, type ModeState, type ServerToOverlay } from '@fluxion/shared';

// A command, a level-up shout-out, or a viewer's points when they ask.
type FeedItem = { id: number; viewer: string } & ({ keyword: string; level?: number } | { levelUp: number } | { points: number });

const MAX_ITEMS = 6;
const ITEM_TTL_MS = 8000;
const LEADERBOARD_SIZE = 5;
const MAX_TALLY = 4;

// Transparent page meant to sit on top of the stream as a browser source.
export function Overlay({ token }: { token: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [live, setLive] = useState(false);
  // clockOffset converts server times to this machine's clock.
  const [mode, setMode] = useState<{ state: ModeState; clockOffset: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ entries: LeaderboardEntry[]; progression: boolean }>({
    entries: [],
    progression: false,
  });
  const [alert, setAlert] = useState<{ id: number; text: string } | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [player] = useState(() => new AlertPlayer(setAlert, setSoundBlocked));

  useEffect(() => {
    let socket: WebSocket;
    let retry: number | undefined;
    let nextId = 0;
    let closed = false;
    player.start();

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/ws/overlay?token=${encodeURIComponent(token)}`);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerToOverlay;
        if (message.type === 'live') setLive(message.state === 'started');
        if (message.type === 'mode') setMode({ state: message.state, clockOffset: Date.now() - message.serverNow });
        if (message.type === 'leaderboard') setLeaderboard({ entries: message.entries, progression: message.progression });
        const add = (item: FeedItem) => {
          setLive(true);
          setItems((current) => [item, ...current].slice(0, MAX_ITEMS));
          setTimeout(() => setItems((current) => current.filter((i) => i.id !== item.id)), ITEM_TTL_MS);
        };
        if (message.type === 'command') {
          add({ id: nextId++, viewer: message.viewer, keyword: message.keyword, level: message.level });
        }
        if (message.type === 'levelUp') add({ id: nextId++, viewer: message.viewer, levelUp: message.level });
        if (message.type === 'points') add({ id: nextId++, viewer: message.viewer, points: message.points });
        if (message.type === 'alert') player.enqueue(message);
        if (message.type === 'tts') player.say(message.speech);
      };
      // A bad token is permanent (4001); anything else is worth retrying.
      socket.onclose = (event) => {
        if (!closed && event.code !== 4001) retry = window.setTimeout(connect, 3000);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      socket.close();
      player.stop();
    };
  }, [token, player]);

  return (
    <>
      {/* Alerts show even while offline, so the dashboard's Test button works before going live. */}
      {alert && (
        <div key={alert.id} className="overlay-alert">
          {alert.text}
        </div>
      )}
      {soundBlocked && (
        <button className="overlay-unblock" onClick={() => player.unblock()}>
          Click to enable alert sounds and voice (not needed in OBS or LIVE Studio)
        </button>
      )}
      {live && <LiveWidgets mode={mode} leaderboard={leaderboard} items={items} />}
    </>
  );
}

function LiveWidgets({
  mode,
  leaderboard,
  items,
}: {
  mode: { state: ModeState; clockOffset: number } | null;
  leaderboard: { entries: LeaderboardEntry[]; progression: boolean };
  items: FeedItem[];
}) {
  return (
    <>
      {mode && <ModePanel state={mode.state} clockOffset={mode.clockOffset} />}
      {leaderboard.entries.length > 0 && (
        <div className="overlay-panel overlay-leaderboard">
          <div className="overlay-title">Top players</div>
          {leaderboard.entries.slice(0, LEADERBOARD_SIZE).map((entry, i) => (
            <div key={entry.viewer} className="overlay-row">
              <span className="overlay-rank">{i + 1}</span>
              <span className="overlay-name">{entry.viewer}</span>
              <span className="overlay-score">
                {leaderboard.progression ? `Lv ${levelForXp(entry.xp)}` : entry.commands}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="overlay">
        {items.length === 0 && mode?.state.mode === 'anarchy' && <div className="overlay-hint">Type a command in chat to play!</div>}
        {items.map((item) =>
          'levelUp' in item ? (
            <div key={item.id} className="overlay-item overlay-levelup">
              <span className="overlay-viewer">{item.viewer}</span> reached <span className="overlay-keyword">level {item.levelUp}</span>
            </div>
          ) : 'points' in item ? (
            <div key={item.id} className="overlay-item">
              <span className="overlay-viewer">{item.viewer}</span> has{' '}
              <span className="overlay-keyword">
                {item.points.toLocaleString()} point{item.points === 1 ? '' : 's'}
              </span>
            </div>
          ) : (
            <div key={item.id} className="overlay-item">
              <span className="overlay-viewer">{item.viewer}</span>
              {item.level !== undefined && <span className="overlay-level">Lv {item.level}</span>}
              <span className="overlay-keyword">{item.keyword}</span>
            </div>
          ),
        )}
      </div>
    </>
  );
}

function ModePanel({ state, clockOffset }: { state: ModeState; clockOffset: number }) {
  const endsAt = 'endsAt' in state && state.endsAt !== null ? state.endsAt + clockOffset : null;
  const secondsLeft = useCountdown(endsAt);

  if (state.mode === 'democracy') {
    const total = state.tally.reduce((sum, t) => sum + t.votes, 0);
    return (
      <div className="overlay-panel overlay-mode">
        <div className="overlay-title">
          Vote{secondsLeft !== null && <span className="overlay-timer">{secondsLeft}s</span>}
        </div>
        {state.tally.length === 0 && <div className="overlay-muted">Type a command to vote</div>}
        {state.tally.slice(0, MAX_TALLY).map((t) => (
          <div key={t.keyword} className="overlay-bar">
            <div className="overlay-bar-fill" style={{ width: `${(t.votes / total) * 100}%` }} />
            <span className="overlay-keyword">{t.keyword}</span>
            <span className="overlay-score">{t.votes}</span>
          </div>
        ))}
      </div>
    );
  }

  if (state.mode === 'queue') {
    return (
      <div className="overlay-panel overlay-mode">
        <div className="overlay-title">
          {state.viewer ? 'Now playing' : 'Nobody playing'}
          {secondsLeft !== null && <span className="overlay-timer">{secondsLeft}s</span>}
        </div>
        {state.viewer && <div className="overlay-player">{state.viewer}</div>}
        {state.queue.length > 0 && <div className="overlay-muted">Next: {state.queue.join(', ')}</div>}
        <div className="overlay-muted">
          Type <span className="overlay-keyword">{QUEUE_JOIN}</span> to play
        </div>
      </div>
    );
  }

  if (state.mode === 'gift') {
    return (
      <div className="overlay-panel overlay-mode">
        <div className="overlay-title">Send a gift to play!</div>
      </div>
    );
  }

  return null;
}

// Whole seconds until `endsAt` (local clock), re-rendering as it counts down.
function useCountdown(endsAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [endsAt]);
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}
