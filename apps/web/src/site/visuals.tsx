import { useEffect, useState } from 'react';
import { Icon } from '../icons';

// Small, static pictures of real Fluxion screens, drawn in HTML so they stay sharp and match the app.

const AVATAR_COLOURS = ['#8d5ef5', '#e5469a', '#2b95ea', '#14a3a0', '#f07f2e', '#6366f1'];
const VIEWERS = ['mira', 'jules', 'kai_x', 'nova', 'sam.r', 'ivy'];
const COMMANDS = [
  { word: 'left', key: 'A' },
  { word: 'right', key: 'D' },
  { word: 'jump', key: 'Space' },
];

function useTick(ms: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return tick;
}

// The hero picture: chat on the left, the Live page reacting to it.
export function Stage() {
  const tick = useTick(1300);
  // A fixed script that loops: who typed what.
  const script = [0, 2, 0, 1, 2, 0, 0, 1, 2, 2, 0, 1];
  const at = (n: number) => ({ viewer: VIEWERS[((n % 6) + 6) % 6]!, cmd: COMMANDS[script[((n % 12) + 12) % 12]!]! });
  const chat = Array.from({ length: 6 }, (_, i) => ({ n: tick - i, ...at(tick - i) }));
  const current = at(tick).cmd;
  // Votes in the current 4-comment round.
  const round = tick % 4;
  const votes = COMMANDS.map((c) => ({ ...c, n: chat.slice(0, round + 1).filter((m) => m.cmd === c).length }))
    .sort((a, b) => b.n - a.n);
  const total = Math.max(1, round + 1);
  const pressed = (word: string) => 40 + script.slice(0, (tick % 12) + 1).filter((s) => COMMANDS[s]!.word === word).length * 3;

  return (
    <div className="s-frame" aria-label="The Fluxion dashboard reacting to chat during a stream" role="img">
      <div className="s-frame-inner">
        <div className="s-frame-bar">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="crumbs">
            <span>Fluxion</span>
            <span>GTA V profile</span>
            <span>Live</span>
          </span>
          <span className="on-air">On air</span>
        </div>
        <div className="s-stage">
          <div className="s-stage-chat">
            <div className="s-stage-label">
              <span className="dot live" style={{ color: 'var(--red)' }} />
              TikTok LIVE chat
            </div>
            <ol>
              {chat.map((m, i) => (
                <li key={m.n} className={i === 0 ? 'new' : ''} style={{ opacity: 1 - i * 0.14 }}>
                  <span className="s-avatar" style={{ background: AVATAR_COLOURS[((m.n % 6) + 6) % 6] }}>
                    {m.viewer[0]!.toUpperCase()}
                  </span>
                  <span>
                    <strong>{m.viewer}</strong> {m.cmd.word}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="s-stage-main">
            <div className="s-tiles">
              <div className="s-tile">
                <div className="t" style={{ color: 'var(--red)' }}>
                  <span className="s-dot" />
                  Live on TikTok
                </div>
                <div className="v">
                  1:42:10<small>democracy</small>
                </div>
              </div>
              <div className="s-tile">
                <div className="t" style={{ color: 'var(--green)' }}>
                  <span className="s-dot" />
                  Companion ready
                </div>
                <div className="v">
                  1<small>device online</small>
                </div>
              </div>
              <div className="s-tile">
                <div className="t" style={{ color: 'var(--indigo)' }}>
                  Input rate
                </div>
                <div className="v">
                  {2 + (tick % 3)}
                  <small>of 5 per second</small>
                </div>
              </div>
            </div>
            <div className="s-keys">
              {COMMANDS.map((c) => (
                <div key={c.word} className={`s-cmd ${c === current ? 'fired' : ''}`}>
                  <div className="row">
                    <strong>{c.word}</strong>
                    <kbd className="kbd">{c.key}</kbd>
                  </div>
                  <div className="s-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    0.3 s hold, 1 s cooldown
                  </div>
                  <div className="meter">
                    <div style={{ width: `${(pressed(c.word) / 80) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="s-tile" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="tag indigo">Key</span>
              <span>
                <strong>{at(tick).viewer}</strong> <span className="s-muted">pressed</span> {current.word}
              </span>
              <span className="s-muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
                sent to Gaming PC
              </span>
            </div>
          </div>
          <div className="s-stage-side">
            <div className="s-vote">
              <h3>
                Vote in progress <span>{3 - round > 0 ? `${3 - round}s` : 'now'}</span>
              </h3>
              {votes.map((v, i) => (
                <div key={v.word} className="s-vote-row">
                  <div className="row">
                    <strong>{v.word}</strong>
                    <span className="s-muted">
                      {v.n} {v.n === 1 ? 'vote' : 'votes'}
                    </span>
                  </div>
                  <div className={`s-bar ${i === 0 && v.n > 0 ? 'lead' : ''}`}>
                    <div style={{ width: `${(v.n / total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="s-feed">
              <div>
                <span className="tag pink">Alert</span> mira sent 5 Roses
              </div>
              <div>
                <span className="tag violet">Level</span> jules reached level 4
              </div>
              <div>
                <span className="tag sky">Voice</span> kai_x: let's go
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModesArt() {
  return (
    <div className="art">
      <div className="art-seg">
        <span>Anarchy</span>
        <span className="on">Democracy</span>
        <span>Queue</span>
      </div>
      <div className="art-panel">
        <div className="art-line">
          <strong>left</strong>
          <span className="s-muted">9 votes</span>
        </div>
        <div className="s-bar lead">
          <div style={{ width: '64%' }} />
        </div>
        <div className="art-line" style={{ marginTop: 8 }}>
          <strong>jump</strong>
          <span className="s-muted">5 votes</span>
        </div>
        <div className="s-bar">
          <div style={{ width: '36%' }} />
        </div>
      </div>
    </div>
  );
}

export function GiftArt() {
  return (
    <div className="art">
      <div className="art-panel art-line">
        <span className="tag pink">Rose</span>
        <span className="s-muted">presses</span>
        <kbd className="kbd">Space</kbd>
      </div>
      <div className="art-arrow" aria-hidden="true">
        ↓
      </div>
      <div className="art-banner">mira sent 5× Rose!</div>
    </div>
  );
}

export function VoiceArt() {
  const bars = [10, 22, 34, 18, 40, 28, 14, 36, 24, 44, 20, 30, 12, 26, 38, 16];
  return (
    <div className="art">
      <div className="art-panel">
        <span className="s-muted">!tts</span> hello from chat
      </div>
      <div className="art-wave" aria-hidden="true">
        {bars.map((h, i) => (
          <i key={i} style={{ height: h }} />
        ))}
      </div>
      <div className="art-seg">
        <span>Piper</span>
        <span className="on">Robot</span>
        <span>Echo</span>
      </div>
    </div>
  );
}

export function LevelsArt() {
  return (
    <div className="art">
      {[
        ['M', 'mira', 6, 100],
        ['J', 'jules', 4, 62],
      ].map(([initial, name, level, width]) => (
        <div key={name as string} className="art-panel art-level">
          <span className="art-ring">
            <span>{initial}</span>
          </span>
          <div style={{ flex: 1 }}>
            <div className="art-line">
              <strong>{name}</strong>
              <span className="s-muted">level {level}</span>
            </div>
            <div className="meter" style={{ marginTop: 6 }}>
              <div style={{ width: `${width}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfilesArt() {
  return (
    <div className="art">
      <div className="art-stack">
        {[
          ['GTA V', 'gta5.exe', 1],
          ['Rocket League', 'rocketleague.exe', 0.6],
          ['Minecraft', 'minecraft', 0.4],
        ].map(([name, process, opacity]) => (
          <div key={name as string} className="art-panel art-line" style={{ opacity: opacity as number }}>
            <strong>{name}</strong>
            {opacity === 1 ? <span className="tag teal">Active</span> : <code>{process}</code>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SafetyArt() {
  return (
    <div className="art">
      <div className="art-shield">
        <kbd className="kbd">W</kbd>
        <kbd className="kbd">A</kbd>
        <kbd className="kbd off">Win</kbd>
        <kbd className="kbd off">Esc</kbd>
      </div>
      <div className="art-panel art-line">
        <span>
          <Icon name="shield" size={14} /> gta5.exe in focus
        </span>
        <span className="tag green">ready</span>
      </div>
    </div>
  );
}

export function CompanionArt() {
  const keys = ['W', 'A', 'S', 'D', 'Q', 'E', 'R', 'F', '1', '2', '3', '4', '↑', '↓', '←', '→'];
  const on = new Set(['W', 'A', 'S', 'D', 'F', '↑']);
  return (
    <div className="art">
      <div className="s-keygrid">
        {keys.map((k) => (
          <span key={k} className={on.has(k) ? 'on' : ''}>
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
