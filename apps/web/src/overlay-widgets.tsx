import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { GoalMetric, ScreenWidget, StreamStats } from '@fluxion/shared';
import { Icon, type IconName } from './icons';

// Overlay widgets. Each reads the stream's totals (StreamStats) or listens for chat and gifts.

export type GiftEvent = { viewer: string; gift: string; count: number; diamonds: number };
export type ChatLine = { id: number; viewer: string; text: string };

// Gifts reach the coin jar and fireworks as events rather than state, so a burst of gifts is a burst of animation.
export class GiftBus extends EventTarget {
  emit(gift: GiftEvent) {
    this.dispatchEvent(new CustomEvent<GiftEvent>('gift', { detail: gift }));
  }
}

function useGifts(bus: GiftBus, onGift: (gift: GiftEvent) => void) {
  const handler = useRef(onGift);
  handler.current = onGift;
  useEffect(() => {
    const listener = (e: Event) => handler.current((e as CustomEvent<GiftEvent>).detail);
    bus.addEventListener('gift', listener);
    return () => bus.removeEventListener('gift', listener);
  }, [bus]);
}

const number = (n: number) => n.toLocaleString();
const METRIC_UNITS = { likes: 'likes', follows: 'follows', shares: 'shares', diamonds: 'diamonds', subscriptions: 'subs' } as const;
// Each widget has one accent (a tone- class in overlay.css), the same as its icon on the dashboard.
type Tone = 'amber' | 'orange' | 'sky' | 'indigo' | 'teal' | 'violet' | 'pink' | 'green';
const METRIC_LOOK: Record<GoalMetric, { icon: IconName; tone: Tone }> = {
  likes: { icon: 'heart', tone: 'pink' },
  follows: { icon: 'follower', tone: 'sky' },
  shares: { icon: 'share', tone: 'green' },
  diamonds: { icon: 'diamond', tone: 'amber' },
  subscriptions: { icon: 'star', tone: 'violet' },
};

export const DEFAULT_FIREWORK_DIAMONDS = 100;
export const DEFAULT_JAR_DIAMONDS = 1000;

export function Widget({ widget, stats, chat, bus }: { widget: ScreenWidget; stats: StreamStats | null; chat: ChatLine[]; bus: GiftBus }) {
  switch (widget.type) {
    case 'goals': {
      if (!stats) return null;
      const goals = widget.goalId ? stats.goals.filter((g) => g.id === widget.goalId) : stats.goals;
      return goals.length > 0 ? <Goals goals={goals} /> : null;
    }
    case 'top_gift':
      return stats?.topGift ? (
        <Highlight title="Top gift" icon="trophy" tone="amber" viewer={stats.topGift.viewer} detail={`${stats.topGift.gift}, ${number(stats.topGift.diamonds)} diamonds`} />
      ) : null;
    case 'top_streak':
      return stats?.topStreak ? (
        <Highlight title="Longest streak" icon="flame" tone="orange" viewer={stats.topStreak.viewer} detail={stats.topStreak.gift} count={stats.topStreak.count} />
      ) : null;
    case 'last_follower':
      return stats?.lastFollower ? <Highlight title="Latest follower" icon="follower" tone="sky" viewer={stats.lastFollower} /> : null;
    case 'last_gifter':
      return stats?.lastGifter ? (
        <Highlight title="Latest gift" icon="gift" tone="amber" viewer={stats.lastGifter.viewer} detail={`${stats.lastGifter.gift} ×${number(stats.lastGifter.count)}`} />
      ) : null;
    case 'stats':
      return stats ? <Stats stats={stats} /> : null;
    case 'chat':
      return chat.length > 0 ? <Chat lines={chat} /> : null;
    case 'coin_jar':
      return <CoinJar diamonds={stats?.diamonds ?? 0} target={widget.minDiamonds ?? DEFAULT_JAR_DIAMONDS} bus={bus} />;
    case 'firework':
      return null; // drawn over the whole screen by <Fireworks>
  }
}

// A panel's title: an icon on a tinted badge, then the name, and anything else (a countdown) at the far end.
export function Title({ icon, children, end }: { icon: IconName; children: ReactNode; end?: ReactNode }) {
  return (
    <div className="overlay-title">
      <span className="overlay-badge">
        <Icon name={icon} size={14} strokeWidth={2.5} />
      </span>
      <span className="overlay-title-text">{children}</span>
      {end}
    </div>
  );
}

function Goals({ goals }: { goals: StreamStats['goals'] }) {
  // One goal takes its own color; several share the violet of the goals widget.
  const tone = goals.length === 1 ? METRIC_LOOK[goals[0]!.metric].tone : 'violet';
  return (
    <div className={`overlay-panel w-goals tone-${tone}`}>
      {goals.map((g) => {
        const done = g.current >= g.target;
        const look = METRIC_LOOK[g.metric];
        return (
          <div key={g.id} className={`w-goal tone-${look.tone} ${done ? 'done' : ''}`}>
            <div className="w-goal-head">
              <span className="overlay-badge">
                <Icon name={done ? 'star' : look.icon} size={14} strokeWidth={2.5} />
              </span>
              <span className="w-goal-name">{g.name}</span>
              <span className="overlay-score">{done ? 'Done!' : `${number(g.current)} / ${number(g.target)}`}</span>
            </div>
            <div className="w-goal-track" role="progressbar" aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={Math.min(g.current, g.target)} aria-label={`${g.name}, ${METRIC_UNITS[g.metric]}`}>
              <span style={{ width: `${Math.min(100, (g.current / g.target) * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A viewer's initial in a ring of the panel's color.
function Avatar({ name }: { name: string }) {
  return <span className="w-avatar">{[...name][0]?.toUpperCase()}</span>;
}

// One viewer worth showing: the top gifter, the latest follower and so on. Pops when the viewer changes.
// A streak shows its count beside a flame.
function Highlight({ title, icon, tone, viewer, detail, count }: { title: string; icon: IconName; tone: Tone; viewer: string; detail?: string; count?: number }) {
  return (
    <div className={`overlay-panel w-highlight tone-${tone}`}>
      <Title icon={icon}>{title}</Title>
      <div key={`${viewer}:${detail}:${count}`} className="w-highlight-body">
        <Avatar name={viewer} />
        <span className="w-highlight-text">
          <span className="w-highlight-name">{viewer}</span>
          {detail && <span className="overlay-muted">{detail}</span>}
        </span>
        {count !== undefined && (
          <span className="w-streak">
            <Flame />
            <span className="w-streak-count">×{number(count)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// A flickering flame, filled, for streaks.
function Flame() {
  return (
    <svg className="w-flame" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="w-flame-fill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff4d2e" />
          <stop offset="0.55" stopColor="#ff9a2e" />
          <stop offset="1" stopColor="#ffd84d" />
        </linearGradient>
      </defs>
      <path fill="url(#w-flame-fill)" d="M12 23a7 7 0 0 0 7-7c0-4.5-3.2-7-4.4-11.5-2.3 2.2-3.4 4.5-3.4 6.8-1.2-1-2.1-2.4-2.3-4.4C6.6 9.6 5 12.6 5 16a7 7 0 0 0 7 7z" />
      <path fill="#fff6c8" opacity="0.85" d="M12 22a3.5 3.5 0 0 0 3.5-3.5c0-2.3-1.6-3.4-2.2-5.6-1.7 1.4-2.6 3-2.6 4.6-.6-.4-1-1-1.2-1.8-.7 1-1 2-1 2.8A3.5 3.5 0 0 0 12 22z" />
    </svg>
  );
}

function Stats({ stats }: { stats: StreamStats }) {
  const tiles: [string, number, IconName, Tone][] = [
    ['Viewers', stats.viewers, 'eye', 'teal'],
    ['Likes', stats.likes, 'heart', 'pink'],
    ['Follows', stats.follows, 'follower', 'sky'],
    ['Diamonds', stats.diamonds, 'diamond', 'amber'],
  ];
  return (
    <div className="overlay-panel w-stats tone-teal">
      {tiles.map(([label, value, icon, tone]) => (
        <div key={label} className={`tone-${tone}`}>
          <span className="w-stat-icon">
            <Icon name={icon} size={18} strokeWidth={2.5} />
          </span>
          <strong>{number(value)}</strong>
          <span className="w-stat-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

// Each viewer keeps one name color, picked from their name, so a conversation is easy to follow.
const NAME_COLORS = ['#ff8fbf', '#7cc8ff', '#ffc35a', '#8fe3a8', '#b9a1ff', '#ff9a6b', '#5fe0d0'];
const nameColor = (name: string) => NAME_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % NAME_COLORS.length];

function Chat({ lines }: { lines: ChatLine[] }) {
  return (
    <div className="overlay-panel w-chat tone-indigo">
      <Title icon="chat">Chat</Title>
      {lines.map((l) => (
        <div key={l.id} className="w-chat-line">
          <span className="overlay-viewer" style={{ color: nameColor(l.viewer) }}>
            {l.viewer}
          </span>
          {l.text}
        </div>
      ))}
    </div>
  );
}

// Coins drop into a jar that fills toward a diamond target. More diamonds, more coins (up to a handful per gift).
type Coin = { id: number; x: number; delay: number };
let coinId = 0;
function CoinJar({ diamonds, target, bus }: { diamonds: number; target: number; bus: GiftBus }) {
  const [coins, setCoins] = useState<Coin[]>([]);
  useGifts(bus, (gift) => {
    const count = Math.min(12, Math.max(1, Math.ceil(Math.log2(gift.diamonds + 1))));
    const added = Array.from({ length: count }, (_, i) => ({ id: coinId++, x: 20 + Math.random() * 60, delay: i * 90 }));
    setCoins((current) => [...current, ...added].slice(-40));
    setTimeout(() => setCoins((current) => current.filter((c) => !added.includes(c))), 1400 + count * 90);
  });
  const level = Math.min(1, diamonds / target);
  return (
    <div className="overlay-panel w-jar tone-amber">
      <div className="w-jar-glass">
        <div className="w-jar-fill" style={{ height: `${level * 100}%` }} />
        {coins.map((c) => (
          <span key={c.id} className="w-coin" style={{ left: `${c.x}%`, animationDelay: `${c.delay}ms`, '--land': `${(1 - level) * 100}%` } as CSSProperties} />
        ))}
      </div>
      <div className="w-jar-label">
        <strong>{number(diamonds)}</strong> / {number(target)} diamonds
      </div>
    </div>
  );
}

// Fireworks over the whole screen for gifts worth at least `min` diamonds; bigger gifts launch more.
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
const COLORS = ['#ff4d8d', '#a855f7', '#ffd166', '#60a5fa', '#ffffff'];
const MAX_PARTICLES = 900;
const GLOW = 16; // the glow sprite's radius, in pixels

// A glowing dot per color, drawn once. Stamping it is far cheaper than shadowBlur, which blurs every spark on every frame.
const glows = new Map<string, HTMLCanvasElement>();
function glow(color: string) {
  let sprite = glows.get(color);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = GLOW * 2;
    const g = sprite.getContext('2d')!;
    const gradient = g.createRadialGradient(GLOW, GLOW, 0, GLOW, GLOW, GLOW);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(0.2, color);
    gradient.addColorStop(1, 'transparent');
    g.fillStyle = gradient;
    g.fillRect(0, 0, GLOW * 2, GLOW * 2);
    glows.set(color, sprite);
  }
  return sprite;
}
export function Fireworks({ min, bus }: { min: number; bus: GiftBus }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const frame = useRef<number | null>(null);

  const draw = () => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    if (c.width !== c.clientWidth || c.height !== c.clientHeight) (c.width = c.clientWidth), (c.height = c.clientHeight);
    // Fade what's there rather than clearing it, which leaves trails; the canvas stays transparent underneath.
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0, 0, 0, 0.22)';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'lighter';
    particles.current = particles.current.filter((p) => p.life > 0);
    for (const p of particles.current) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.life -= 0.011;
      g.globalAlpha = Math.max(0, p.life);
      const size = GLOW * (0.4 + 0.6 * p.life);
      g.drawImage(glow(p.color), p.x - size, p.y - size, size * 2, size * 2);
    }
    if (particles.current.length > 0) frame.current = requestAnimationFrame(draw);
    else {
      g.clearRect(0, 0, c.width, c.height);
      frame.current = null;
    }
  };

  const burst = (x: number, y: number) => {
    // A hidden tab doesn't draw, so sparks would pile up and all draw at once on return.
    if (document.hidden || particles.current.length >= MAX_PARTICLES) return;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
    for (let i = 0; i < 90; i++) {
      const angle = (i / 90) * Math.PI * 2 + Math.random() * 0.1;
      const speed = 2.5 + Math.random() * 4.5;
      particles.current.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color: Math.random() < 0.2 ? '#fff' : color });
    }
    frame.current ??= requestAnimationFrame(draw);
  };

  useGifts(bus, (gift) => {
    if (gift.diamonds < min) return;
    const bursts = Math.min(6, 1 + Math.floor(Math.log2(gift.diamonds / min)));
    for (let i = 0; i < bursts; i++) {
      // The canvas fills the screen on stream, or a small box in the dashboard's preview.
      setTimeout(() => {
        const c = canvas.current;
        if (c) burst(c.clientWidth * (0.2 + Math.random() * 0.6), c.clientHeight * (0.15 + Math.random() * 0.35));
      }, i * 350);
    }
  });
  useEffect(() => () => void (frame.current !== null && cancelAnimationFrame(frame.current)), []);
  return <canvas ref={canvas} className="w-fireworks" aria-hidden="true" />;
}

// Preview: sample numbers and gifts, so a host can see their widgets before going live. Goals are the host's own
// (the preview opens from the dashboard, so the session cookie is there), filling up and starting over.
const SAMPLE_VIEWERS = ['nightowl', 'pixelpanda', 'mapleleaf', 'riverstone', 'kitekid'];
const SAMPLE_GIFTS = [
  { gift: 'Rose', diamonds: 1 },
  { gift: 'Finger Heart', diamonds: 5 },
  { gift: 'Doughnut', diamonds: 30 },
  { gift: 'Hand Hearts', diamonds: 100 },
  { gift: 'Money Gun', diamonds: 500 },
];
const SAMPLE_CHAT = ['hi from Ohio!', 'jump!', 'this is so fun', 'left', 'lets gooo'];
const PREVIEW_TICK_MS = 2500;

export function usePreview(enabled: boolean, bus: GiftBus) {
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let goals: StreamStats['goals'] = [];
    fetch('/api/goals')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: { id: string; name: string; metric: StreamStats['goals'][number]['metric']; target: number; enabled: boolean }[]) => {
        goals = list.filter((g) => g.enabled).map((g) => ({ id: g.id, name: g.name, metric: g.metric, target: g.target, current: 0 }));
      })
      .catch(() => {});
    let tick = 0;
    let current: StreamStats = {
      likes: 0, follows: 0, shares: 0, diamonds: 0, gifts: 0, subscriptions: 0, viewers: 128,
      topGift: null, topStreak: null, lastFollower: null, lastGifter: null, goals: [],
    };
    const step = () => {
      const viewer = SAMPLE_VIEWERS[tick % SAMPLE_VIEWERS.length]!;
      const { gift, diamonds } = SAMPLE_GIFTS[tick % SAMPLE_GIFTS.length]!;
      const count = 1 + (tick % 3);
      // Goals fill over about 20 ticks, stay done for a few, then start over.
      const progress = Math.min(1, (tick % 24) / 20);
      current = {
        ...current,
        likes: current.likes + 40 + (tick % 7) * 9,
        follows: current.follows + (tick % 2),
        shares: current.shares + (tick % 4 === 0 ? 1 : 0),
        diamonds: current.diamonds + diamonds * count,
        gifts: current.gifts + count,
        viewers: 120 + ((tick * 7) % 40),
        topGift: !current.topGift || diamonds * count > current.topGift.diamonds ? { viewer, gift, diamonds: diamonds * count } : current.topGift,
        topStreak: !current.topStreak || count > current.topStreak.count ? { viewer, gift, count } : current.topStreak,
        lastFollower: tick % 2 ? SAMPLE_VIEWERS[(tick + 2) % SAMPLE_VIEWERS.length]! : current.lastFollower,
        lastGifter: { viewer, gift, count },
        goals: goals.map((g) => ({ ...g, current: Math.round(g.target * progress) })),
      };
      setStats(current);
      setChat((lines) => [...lines, { id: tick, viewer, text: SAMPLE_CHAT[tick % SAMPLE_CHAT.length]! }].slice(-6));
      bus.emit({ viewer, gift, count, diamonds: diamonds * count });
      tick++;
    };
    const first = setTimeout(step, 300); // after the goals have likely arrived
    const timer = setInterval(step, PREVIEW_TICK_MS);
    return () => (clearTimeout(first), clearInterval(timer));
  }, [enabled, bus]);
  return { stats, chat };
}
