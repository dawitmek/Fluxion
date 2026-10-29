import { useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons';
import { Glow } from './Glow';
import { Link } from '../router';
import { CompanionArt, GiftArt, LevelsArt, ModesArt, ProfilesArt, SafetyArt, Stage, VoiceArt } from './visuals';
import { SiteLayout } from './SiteLayout';

const CARDS: { art: ReactNode; title: string; text: string }[] = [
  { art: <ModesArt />, title: 'Four crowd modes', text: 'Anarchy, democracy votes, a queue of players, or gift-only. Switch mid-stream.' },
  { art: <GiftArt />, title: 'Gifts that press keys', text: 'Tie a gift to a command, and thank gifters with a big on-stream alert.' },
  { art: <VoiceArt />, title: 'Chat read aloud', text: 'Offline voices, your own cloud key, and effects from chipmunk to robot.' },
  { art: <LevelsArt />, title: 'Levels and a leaderboard', text: 'Viewers earn XP as they play. Lock some commands behind a level if you like.' },
  { art: <ProfilesArt />, title: 'A profile per game', text: 'Each game keeps its own commands and mode, and the companion follows along.' },
  { art: <SafetyArt />, title: 'Only the keys you allow', text: 'System keys are off-limits, and nothing is pressed unless your game has focus.' },
];

function Carousel() {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => track.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });
  return (
    <section className="s-section" aria-labelledby="features-title">
      <div className="s-wrap">
        <div className="s-carousel-head">
          <div>
            <h2 id="features-title">Built for streams where chat runs the show</h2>
            <p className="s-lead">Everything you set up in the dashboard applies the moment you save it, even while you're live.</p>
          </div>
          <div className="s-arrows">
            <button onClick={() => scroll(-1)} aria-label="Previous features">
              ‹
            </button>
            <button onClick={() => scroll(1)} aria-label="Next features">
              ›
            </button>
          </div>
        </div>
        <div className="s-track" ref={track}>
          {CARDS.map((c) => (
            <article key={c.title} className="s-card">
              <div className="s-card-art" aria-hidden="true">
                {c.art}
              </div>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const SAFETY: { icon: IconName; title: string; text: string }[] = [
  { icon: 'commands', title: 'Allowed keys', text: 'Each PC keeps its own list. The Windows key and Escape are never pressed, and combinations like Ctrl+W are blocked.' },
  { icon: 'overlay', title: 'Focus check', text: 'Keys go to your game only while its window is in front. Alt-tab and input stops.' },
  { icon: 'leaderboard', title: 'Rate limit', text: 'A cap on key presses per second, so a flood of chat never floods your game.' },
  { icon: 'shield', title: 'Panic hotkey', text: 'Ctrl+Shift+Backspace pauses the companion and lets go of every held key.' },
];

function Control() {
  return (
    <section className="s-section" aria-labelledby="control-title">
      <div className="s-wrap">
        <div className="s-center">
          <h2 id="control-title">Your audience in control, you still in charge</h2>
        </div>
        <div className="s-bento">
          <div className="s-box">
            <span className="s-box-icon">
              <Icon name="leaderboard" />
            </span>
            <h3>Democracy, in real time</h3>
            <p>Chat votes on the next move. The winner fires when the window closes, and everyone sees the tally on stream.</p>
            <div className="s-chart" aria-label="Example vote: left 9, jump 6, up 4, right 2" role="img">
              {[
                ['left', 9],
                ['jump', 6],
                ['up', 4],
                ['right', 2],
              ].map(([label, n]) => (
                <div key={label}>
                  <i style={{ height: `${((n as number) / 9) * 82}%` }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="s-box">
            <span className="s-box-icon">
              <Icon name="voice" />
            </span>
            <h3>Plenty to work with</h3>
            <p>Out of the box, with no extra downloads on a Docker install.</p>
            <div className="s-figures">
              <div className="s-figure">
                <b>4</b>
                <span>crowd modes</span>
              </div>
              <div className="s-figure">
                <b>1,016</b>
                <span>offline voices</span>
              </div>
              <div className="s-figure">
                <b>7</b>
                <span>voice effects</span>
              </div>
              <div className="s-figure">
                <b>2</b>
                <span>desktop platforms</span>
              </div>
            </div>
          </div>
        </div>
        <div className="s-safety">
          {SAFETY.map((s) => (
            <div key={s.title}>
              <h3>
                <Icon name={s.icon} />
                {s.title}
              </h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Flow() {
  return (
    <section className="s-section" aria-labelledby="flow-title">
      <div className="s-wrap s-flow">
        <div className="s-flow-copy">
          <span className="s-prompt">
            <span className="s-avatar" style={{ background: '#8d5ef5' }}>
              M
            </span>
            <span>
              <strong>mira</strong> jump
            </span>
          </span>
          <h2 id="flow-title">
            From a comment to a key press, <span className="s-gradient">in a blink</span>
          </h2>
          <p className="s-lead">
            Fluxion reads your LIVE chat, decides what happens based on your mode and cooldowns, and tells the companion on your
            PC which key to press. Your overlay shows who did it.
          </p>
          <Link href="/how-it-works" className="s-link" style={{ marginTop: 26 }}>
            See how it works <Icon name="play" size={12} />
          </Link>
        </div>
        <div className="s-flow-art" aria-hidden="true">
          <svg viewBox="0 0 560 420" preserveAspectRatio="none" fill="none">
            <defs>
              <linearGradient id="flow-line" x1="0" x2="1">
                <stop offset="0" stopColor="#818cf8" stopOpacity="0.2" />
                <stop offset="0.5" stopColor="#a855f7" stopOpacity="0.8" />
                <stop offset="1" stopColor="#f472b6" stopOpacity="0.5" />
              </linearGradient>
            </defs>
            <path d="M20 60 C 180 60, 160 160, 300 170" stroke="url(#flow-line)" strokeWidth="1.5" />
            <path d="M300 170 C 420 175, 380 280, 330 300" stroke="url(#flow-line)" strokeWidth="1.5" />
            <path d="M300 170 C 470 170, 500 90, 540 70" stroke="url(#flow-line)" strokeWidth="1.5" />
          </svg>
          <div className="s-step" style={{ left: 0, top: 30 }}>
            <b>
              <Icon name="live" size={14} /> Reads chat
            </b>
            <span>“jump” matches a command</span>
          </div>
          <div className="s-step glow" style={{ left: '34%', top: 150 }}>
            <b>
              <Icon name="commands" size={14} /> Checks the rules
            </b>
            <span>Democracy: jump wins the vote</span>
          </div>
          <div className="s-step" style={{ right: 0, top: 20 }}>
            <b>
              <Icon name="overlay" size={14} /> Overlay
            </b>
            <span>“mira: jump” on stream</span>
          </div>
          <div className="s-step" style={{ left: '30%', top: 300 }}>
            <b>
              <Icon name="companion" size={14} /> Companion presses Space
            </b>
            <span>Held 0.3 s in gta5.exe</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const TABS: { title: string; body: string; panel: ReactNode }[] = [
  {
    title: 'Commands',
    body: 'Pick what chat types and the key it presses, how long to hold it, and a cooldown per viewer.',
    panel: (
      <div className="s-panel-window">
        <h4>Commands</h4>
        {[
          ['left', 'A', '300 ms', true],
          ['right', 'D', '300 ms', true],
          ['jump', 'Space', '150 ms', true],
          ['shoot', 'F', '200 ms', false],
        ].map(([word, key, hold, on]) => (
          <div key={word as string} className="s-rowline">
            <span className={`s-switch ${on ? '' : 'off'}`} />
            <strong>{word}</strong>
            <kbd className="kbd">{key}</kbd>
            <span className="s-chip">{hold}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Actions and alerts',
    body: 'A gift, follow, subscription or chat command can show an alert, play your own sound or video, press a key, or give points.',
    panel: (
      <div className="s-panel-window">
        <h4>Alerts</h4>
        {[
          ['Follow', '{viewer} followed!', 'chime'],
          ['Gift', '{viewer} sent {count}× {gift}!', 'coin'],
          ['Likes', '{total} likes! Thanks {viewer}', 'pop'],
        ].map(([event, text, sound]) => (
          <div key={event} className="s-rowline">
            <span className="s-switch" />
            <span>
              <span className="tag pink" style={{ marginRight: 8 }}>
                {event}
              </span>
              {text}
            </span>
            <span className="s-chip">{sound}</span>
            <span />
          </div>
        ))}
        <div className="art-banner" style={{ marginTop: 6 }}>
          mira sent 5× Rose!
        </div>
      </div>
    ),
  },
  {
    title: 'Voice',
    body: 'Read prefixed chat, alerts, or all of chat with filters. Choose an engine, a voice and an effect, then preview it.',
    panel: (
      <div className="s-panel-window">
        <h4>Voice</h4>
        <div className="art-seg">
          <span className="on">Piper</span>
          <span>eSpeak</span>
          <span>Cloud key</span>
          <span>Browser</span>
        </div>
        <div className="s-rowline">
          <span />
          <span>Voice</span>
          <span className="s-chip">en_US-libritts_r, speaker 214</span>
          <span />
        </div>
        <div className="s-rowline">
          <span />
          <span>Effect</span>
          <span className="s-chip">Robot</span>
          <span />
        </div>
        <VoiceArt />
      </div>
    ),
  },
  {
    title: 'Companion',
    body: 'A small app on your gaming PC that presses the keys. You choose which keys it may press and which game gets them.',
    panel: (
      <div className="s-panel-window">
        <h4>Fluxion Companion</h4>
        <div className="art-line">
          <span>
            <span className="tag green">Connected</span> Gaming PC
          </span>
          <span className="s-chip">gta5.exe</span>
        </div>
        <CompanionArt />
        <div className="s-muted">Panic hotkey: Ctrl+Shift+Backspace</div>
      </div>
    ),
  },
];

function Tour() {
  const [active, setActive] = useState(0);
  return (
    <section className="s-section" aria-labelledby="tour-title">
      <div className="s-wrap s-split">
        <div>
          <h2 id="tour-title">One dashboard for the whole show</h2>
          <div className="s-tabs" role="tablist" aria-label="Dashboard sections">
            {TABS.map((t, i) => (
              <button key={t.title} className="s-tab" role="tab" aria-selected={active === i} aria-controls="tour-panel" onClick={() => setActive(i)}>
                {t.title}
                <span className="s-tab-body">{t.body}</span>
              </button>
            ))}
          </div>
        </div>
        <div id="tour-panel" className="s-panel" role="tabpanel" aria-label={TABS[active]!.title}>
          {TABS[active]!.panel}
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <SiteLayout>
      <section className="s-hero">
        <Glow />
        <div className="s-wrap">
          <Link href="/features" className="s-pill">
            <b>Free</b>
            <span>Open source under the GPL-3.0</span>
          </Link>
          <h1>
            Let your TikTok LIVE chat <span className="s-gradient">play your game</span>
          </h1>
          <div className="s-hero-row">
            <p>
              Viewers type commands or send gifts, and Fluxion presses the keys on your PC. It works with the games you already
              play, on Windows and macOS.
            </p>
            <div className="s-hero-ctas">
              <div>
                <Link href="/signup" className="s-btn s-btn-solid">
                  Get started
                </Link>
                <Link href="/download" className="s-btn s-btn-line">
                  <Icon name="download" size={18} />
                  Download the companion
                </Link>
              </div>
              <small>For Windows and macOS. No game mods or plugins needed.</small>
            </div>
          </div>
          <Stage />
        </div>
      </section>
      <Carousel />
      <Control />
      <Flow />
      <Tour />
    </SiteLayout>
  );
}
