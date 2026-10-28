import { useEffect, useState } from 'react';
import { Icon, Logo, type IconName } from './icons';
import { Link } from './router';

// The demo loop: a comment arrives, then its key lights up.
const DEMO: { viewer: string; text: string; key: string }[] = [
  { viewer: 'mira', text: 'left', key: 'A' },
  { viewer: 'jules', text: 'jump', key: 'Space' },
  { viewer: 'kai_x', text: 'up', key: 'W' },
  { viewer: 'nova', text: 'right', key: 'D' },
  { viewer: 'sam.r', text: 'up', key: 'W' },
  { viewer: 'mira', text: 'jump', key: 'Space' },
];
const KEYS = ['W', 'A', 'S', 'D', 'Space'];

function useDemoStep() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setStep((s) => s + 1), 1400);
    return () => clearInterval(timer);
  }, []);
  return step;
}

function Demo() {
  const step = useDemoStep();
  const current = DEMO[step % DEMO.length]!;
  const comments = Array.from({ length: 4 }, (_, i) => ({ n: step - i, ...DEMO[(((step - i) % DEMO.length) + DEMO.length) % DEMO.length]! }));

  return (
    <div className="demo" aria-label="Example: chat comments pressing keys in a game" role="img">
      <div className="demo-chat">
        <div className="demo-label">
          <span className="dot live" />
          LIVE chat
        </div>
        <ol>
          {comments.map((c, i) => (
            <li key={c.n} className={i === 0 ? 'new' : ''} style={{ opacity: 1 - i * 0.22 }}>
              <strong>{c.viewer}</strong> {c.text}
            </li>
          ))}
        </ol>
      </div>
      <div className="demo-arrow" aria-hidden="true">
        <Icon name="logo" size={22} strokeWidth={2.4} />
      </div>
      <div className="demo-pc">
        <div className="demo-label muted">Your PC</div>
        <div className="demo-keys">
          {KEYS.map((k) => (
            <kbd key={k} className={`demo-key ${k === 'Space' ? 'wide' : ''} ${k === current.key ? 'down' : ''}`}>
              {k}
            </kbd>
          ))}
        </div>
        <p className="muted small">
          <strong style={{ color: 'var(--ink)' }}>{current.viewer}</strong> typed “{current.text}”, so Fluxion pressed {current.key}.
        </p>
      </div>
    </div>
  );
}

const FEATURES: { icon: IconName; hue: string; title: string; text: string }[] = [
  {
    icon: 'commands',
    hue: 'indigo',
    title: 'Four ways to share control',
    text: 'Anarchy lets every command through. Democracy runs quick votes. Queue gives one viewer the controls at a time. Gift-only saves the keys for gifters.',
  },
  {
    icon: 'gift',
    hue: 'pink',
    title: 'Gifts that do something',
    text: 'Tie a gift to a command, so a Rose can make your character jump. Big alerts with built-in sounds thank people on stream.',
  },
  {
    icon: 'voice',
    hue: 'violet',
    title: 'Chat read aloud',
    text: 'Read prefixed comments, alerts or all of chat, with filters. Choose offline voices, your own cloud voice key, and effects like robot or echo.',
  },
  {
    icon: 'leaderboard',
    hue: 'sky',
    title: 'Leaderboard and levels',
    text: 'Viewers earn XP as they play and gift. Show the top players on your overlay, and optionally save some commands for higher levels.',
  },
  {
    icon: 'profiles',
    hue: 'teal',
    title: 'A profile per game',
    text: 'Each game keeps its own commands, gifts and mode. Switch mid-stream, and the companion follows the game you name.',
  },
  {
    icon: 'shield',
    hue: 'green',
    title: 'Safe by design',
    text: 'Only the keys you allow, only while your game is in focus, with a rate limit and a panic hotkey that lets go of everything.',
  },
];

const STEPS: { title: string; text: string }[] = [
  { title: 'Install the companion', text: 'A small app for Windows or macOS that presses keys on your gaming PC. Pair it with a six-character code.' },
  { title: 'Choose your commands', text: 'Pick what chat types and the key it presses: left is A, jump is Space. Add gift triggers and alerts if you like.' },
  { title: 'Go live', text: 'Start your TikTok LIVE, add the overlay to LIVE Studio or OBS, and connect. Chat is now playing.' },
];

export function Home() {
  return (
    <div className="home">
      <header className="home-nav">
        <Link href="/" className="brand">
          <Logo />
          Fluxion
        </Link>
        <nav aria-label="Home">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#open-source">Open source</a>
        </nav>
        <div className="spacer" />
        <Link href="/login" className="btn btn-ghost">
          Log in
        </Link>
        <Link href="/signup" className="btn btn-primary">
          Get started
        </Link>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="tag indigo">Free and open source</span>
          <h1>Let your TikTok LIVE chat play your game.</h1>
          <p>
            Viewers type commands or send gifts, and Fluxion presses the keys on your PC. It works with the games you already
            play; nothing to install in them.
          </p>
          <div className="row">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Create your account
            </Link>
            <a href="#how" className="btn btn-lg">
              See how it works
            </a>
          </div>
        </div>
        <Demo />
      </section>

      <section id="features" className="home-section" aria-labelledby="features-title">
        <h2 id="features-title">Everything a crowd-play stream needs</h2>
        <p className="home-lead">Set it up once in the dashboard, then change anything while you're live.</p>
        <div className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature">
              <span className={`nav-icon ${f.hue}`}>
                <Icon name={f.icon} size={18} />
              </span>
              <div>
                <h3>{f.title}</h3>
                <p className="muted">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="home-section" aria-labelledby="how-title">
        <h2 id="how-title">Live in three steps</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card">
              <span className="step-number">{i + 1}</span>
              <h3>{s.title}</h3>
              <p className="muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="open-source" className="home-section">
        <div className="open-band">
          <div>
            <h2>Yours to run</h2>
            <p>
              Fluxion is licensed under the GPL-3.0. Run your own server with Docker, so your settings and API keys stay on
              your machine. Fluxion never hosts games; it only presses keys on yours.
            </p>
          </div>
          <Link href="/signup" className="btn btn-lg open-band-cta">
            Get started
          </Link>
        </div>
      </section>

      <footer className="home-footer">
        <span className="brand small">
          <Logo size={22} />
          Fluxion
        </span>
        <span className="muted small">Not affiliated with TikTok.</span>
      </footer>
    </div>
  );
}
