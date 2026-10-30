import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertPlayer, type ShownAlert } from './alert-player';
import {
  levelForXp,
  QUEUE_JOIN,
  WIDGET_SPOTS,
  WIDGET_TYPES,
  type LeaderboardEntry,
  type ModeState,
  type OverlayScreen,
  type ScreenWidget,
  type ServerToOverlay,
  type StreamStats,
  type WidgetSpot,
} from '@fluxion/shared';
import { DEFAULT_FIREWORK_DIAMONDS, Fireworks, GiftBus, Title, usePreview, Widget, type ChatLine } from './overlay-widgets';
import { Icon } from './icons';

// A command, a level-up shout-out, or a viewer's points when they ask.
type FeedItem = { id: number; viewer: string } & ({ keyword: string; level?: number } | { levelUp: number } | { points: number });

const MAX_ITEMS = 6;
const ITEM_TTL_MS = 8000;
const LEADERBOARD_SIZE = 5;
const MAX_TALLY = 4;
const CHAT_LINES = 6;

// ?preview (the dashboard's Open preview link) fills the widgets with sample numbers while offline.
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview');
// ?widget=chat (with &goal=<id> for one goal): just that widget, as a browser source of its own. No alerts, feed or sound.
const SINGLE = (WIDGET_TYPES as readonly string[]).includes(params.get('widget') ?? '')
  ? { type: params.get('widget') as ScreenWidget['type'], goalId: params.get('goal') ?? undefined }
  : null;

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
  const [alert, setAlert] = useState<ShownAlert | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [player] = useState(() => new AlertPlayer(setAlert, setSoundBlocked));
  // What this screen shows. Until the server says, show nothing rather than everything.
  const [screen, setScreen] = useState<OverlayScreen | null>(null);
  const screenRef = useRef<OverlayScreen | null>(null);
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [bus] = useState(() => new GiftBus());
  const preview = usePreview(PREVIEW && !live, bus);

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
        if (message.type === 'screen') {
          screenRef.current = message.screen;
          player.audible = message.screen.audio && !SINGLE;
          setScreen(message.screen);
        }
        const shown = screenRef.current;
        if (message.type === 'live') {
          setLive(message.state === 'started');
          if (message.state === 'started') (setStats(null), setChat([]));
          if (message.state === 'stopped') player.clear();
        }
        if (message.type === 'stats') setStats(message.stats);
        if (message.type === 'chat') setChat((lines) => [...lines, { id: nextId++, viewer: message.viewer, text: message.text }].slice(-CHAT_LINES));
        if (message.type === 'gift') bus.emit(message);
        if (message.type === 'mode') setMode({ state: message.state, clockOffset: Date.now() - message.serverNow });
        if (message.type === 'leaderboard') setLeaderboard({ entries: message.entries, progression: message.progression });
        const add = (item: FeedItem) => {
          setLive(true);
          setItems((current) => [item, ...current].slice(0, MAX_ITEMS));
          setTimeout(() => setItems((current) => current.filter((i) => i.id !== item.id)), ITEM_TTL_MS);
        };
        if (SINGLE) return; // the rest is alerts, speech and the feed
        if (shown?.feed) {
          if (message.type === 'command') add({ id: nextId++, viewer: message.viewer, keyword: message.keyword, level: message.level });
          if (message.type === 'levelUp') add({ id: nextId++, viewer: message.viewer, levelUp: message.level });
          if (message.type === 'points') add({ id: nextId++, viewer: message.viewer, points: message.points });
        }
        // An alert for another screen isn't this one's to show.
        if (message.type === 'alert' && shown?.alerts && (!message.screen || message.screen === shown.id)) player.enqueue(message);
        if (message.type === 'tts') player.say(message.speech);
        if (message.type === 'clearSpeech') player.clearSpeech();
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
  }, [token, player, bus]);

  if (!screen) return null;
  if (SINGLE) {
    // The screen's own settings for this widget, if it has it (the coin jar's target, say); else the defaults.
    const widget: ScreenWidget = {
      ...screen.widgets.find((w) => w.type === SINGLE.type && w.goalId === SINGLE.goalId),
      ...SINGLE,
      spot: 'top-left',
    };
    const shownStats = live ? stats : preview.stats;
    return (
      <div className="overlay-screen" style={{ '--overlay-scale': screen.scale / 100 } as CSSProperties}>
        {PREVIEW && !live && <div className="overlay-preview-note">Preview with sample numbers. Your stream shows real ones.</div>}
        {(live || PREVIEW) &&
          (widget.type === 'firework' ? (
            <Fireworks min={widget.minDiamonds ?? DEFAULT_FIREWORK_DIAMONDS} bus={bus} />
          ) : (
            <div className="overlay-spot spot-top-left">
              <Widget widget={widget} stats={shownStats} chat={live ? chat : preview.chat} bus={bus} />
            </div>
          ))}
      </div>
    );
  }
  return (
    <div className={`overlay-screen alerts-${screen.alertPosition}`} style={{ '--overlay-scale': screen.scale / 100 } as CSSProperties}>
      {/* Alerts show even while offline, so the dashboard's Test button works before going live. */}
      {alert && (
        <div key={alert.id} className={`overlay-alert ${alert.text ? '' : 'media-only'}`}>
          {alert.media?.kind === 'image' && <img className="overlay-alert-media" src={alert.media.url} alt="" />}
          {alert.media?.kind === 'video' && <AlertVideo src={alert.media.url} audible={screen.audio} />}
          {alert.text && <span>{alert.text}</span>}
        </div>
      )}
      {soundBlocked && screen.audio && (
        <button className="overlay-unblock" onClick={() => player.unblock()}>
          Click to enable alert sounds and voice (not needed in OBS or LIVE Studio)
        </button>
      )}
      {PREVIEW && !live && <div className="overlay-preview-note">Preview with sample numbers. Your stream shows real ones.</div>}
      {(live || PREVIEW) && (
        <LiveWidgets
          screen={screen}
          mode={screen.mode ? mode : null}
          leaderboard={screen.leaderboard ? leaderboard : { entries: [], progression: false }}
          items={items}
          stats={live ? stats : preview.stats}
          chat={live ? chat : preview.chat}
          bus={bus}
        />
      )}
    </div>
  );
}

// Each spot stacks its widgets. The feed, leaderboard and mode panel keep the corners they've always had.
function LiveWidgets({
  screen,
  mode,
  leaderboard,
  items,
  stats,
  chat,
  bus,
}: {
  screen: OverlayScreen;
  mode: { state: ModeState; clockOffset: number } | null;
  leaderboard: { entries: LeaderboardEntry[]; progression: boolean };
  items: FeedItem[];
  stats: StreamStats | null;
  chat: ChatLine[];
  bus: GiftBus;
}) {
  const spots = Object.fromEntries(WIDGET_SPOTS.map((s) => [s, [] as ReactNode[]])) as Record<WidgetSpot, ReactNode[]>;
  if (mode) spots['top-left'].push(<ModePanel key="mode" state={mode.state} clockOffset={mode.clockOffset} />);
  if (leaderboard.entries.length > 0) spots['top-right'].push(<Leaderboard key="leaderboard" leaderboard={leaderboard} />);
  if (screen.feed) spots['bottom-left'].push(<Feed key="feed" items={items} hint={mode?.state.mode === 'anarchy'} />);
  // The grouped goals widget leaves out goals that have a widget of their own on this screen.
  const own = new Set(screen.widgets.map((w) => w.goalId).filter(Boolean));
  const grouped = stats && { ...stats, goals: stats.goals.filter((g) => !own.has(g.id)) };
  // Widgets placed by hand sit where they were put; the rest stack in their spots.
  const placed: ReactNode[] = [];
  screen.widgets.forEach((w, i) => {
    const widget = <Widget key={`w${i}`} widget={w} stats={w.type === 'goals' && !w.goalId ? grouped : stats} chat={chat} bus={bus} />;
    if (w.pos && w.type !== 'firework') {
      placed.push(
        <div key={`w${i}`} className="overlay-placed" style={{ left: `${w.pos.x}%`, top: `${w.pos.y}%` }}>
          {widget}
        </div>,
      );
    } else spots[w.spot].push(widget);
  });
  const firework = screen.widgets.find((w) => w.type === 'firework');
  return (
    <>
      {firework && <Fireworks min={firework.minDiamonds ?? DEFAULT_FIREWORK_DIAMONDS} bus={bus} />}
      {WIDGET_SPOTS.map((spot) => (
        <div key={spot} className={`overlay-spot spot-${spot}`}>
          {spots[spot]}
        </div>
      ))}
      {placed}
    </>
  );
}

function Leaderboard({ leaderboard }: { leaderboard: { entries: LeaderboardEntry[]; progression: boolean } }) {
  return (
    <div className="overlay-panel overlay-leaderboard tone-sky">
      <Title icon="trophy">Top players</Title>
      {leaderboard.entries.slice(0, LEADERBOARD_SIZE).map((entry, i) => (
        <div key={entry.viewer} className="overlay-row">
          {/* The top three get medals. */}
          <span className={`overlay-rank ${i < 3 ? `medal-${i + 1}` : ''}`}>{i + 1}</span>
          <span className="overlay-name">{entry.viewer}</span>
          <span className="overlay-score">{leaderboard.progression ? `Lv ${levelForXp(entry.xp)}` : entry.commands}</span>
        </div>
      ))}
    </div>
  );
}

// Who pressed what, level-ups and !points answers, newest at the bottom.
function Feed({ items, hint }: { items: FeedItem[]; hint: boolean }) {
  return (
    <div className="overlay">
      {hint && items.length === 0 && <div className="overlay-hint">Type a command in chat to play!</div>}
      {items.map((item) =>
        'levelUp' in item ? (
          <div key={item.id} className="overlay-item overlay-levelup">
            <Icon name="star" size={18} strokeWidth={2.5} />
            <span className="overlay-viewer">{item.viewer}</span> reached <span className="overlay-keyword">level {item.levelUp}</span>
          </div>
        ) : 'points' in item ? (
          <div key={item.id} className="overlay-item overlay-points">
            <Icon name="coin" size={18} strokeWidth={2.5} />
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
  );
}

// Plays with sound where it can. Browsers (not OBS) refuse unmuted autoplay until the page is clicked, so then it plays muted.
function AlertVideo({ src, audible }: { src: string; audible: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current!;
    element.muted = !audible;
    element.play().catch(() => {
      element.muted = true;
      void element.play();
    });
  }, [src, audible]);
  return <video ref={video} className="overlay-alert-media" src={src} playsInline />;
}

function ModePanel({ state, clockOffset }: { state: ModeState; clockOffset: number }) {
  const endsAt = 'endsAt' in state && state.endsAt !== null ? state.endsAt + clockOffset : null;
  const secondsLeft = useCountdown(endsAt);

  if (state.mode === 'democracy') {
    const total = state.tally.reduce((sum, t) => sum + t.votes, 0);
    return (
      <div className="overlay-panel overlay-mode tone-indigo">
        <Title icon="crowd" end={secondsLeft !== null && <span className="overlay-timer">{secondsLeft}s</span>}>
          Vote
        </Title>
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
      <div className="overlay-panel overlay-mode tone-indigo">
        <Title icon="crowd" end={secondsLeft !== null && <span className="overlay-timer">{secondsLeft}s</span>}>
          {state.viewer ? 'Now playing' : 'Nobody playing'}
        </Title>
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
      <div className="overlay-panel overlay-mode tone-amber">
        <Title icon="gift">Send a gift to play!</Title>
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
