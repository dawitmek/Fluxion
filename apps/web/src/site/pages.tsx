import type { ReactNode } from 'react';
import { Glow } from './Glow';
import { Link } from '../router';
import { CompanionArt, GiftArt, LevelsArt, ModesArt, ProfilesArt, SafetyArt, VoiceArt } from './visuals';
import { detectPlatform, RELEASES_URL, useCompanionRelease, type Platform } from '../release';
import { GITHUB_URL, SiteLayout } from './SiteLayout';

function PageHero({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="s-page-hero">
      <Glow />
      <div className="s-wrap">
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </section>
  );
}

const FEATURES: { title: string; text: string; points: string[]; art: ReactNode }[] = [
  {
    title: 'Four ways to share control',
    text: 'Pick how much say chat gets. Change modes mid-stream; votes and the queue carry on.',
    points: [
      'Anarchy: every command fires, within cooldowns and the rate limit.',
      'Democracy: chat votes and the winner fires when each window closes.',
      'Queue: viewers type “join” and take turns at the controls.',
      'Gift-only: comments do nothing; gifts press the keys.',
    ],
    art: <ModesArt />,
  },
  {
    title: 'Actions for everything viewers do',
    text: 'Make gifting part of the game, and thank people where everyone can see it.',
    points: [
      'Follows, shares, gifts, like milestones, subscriptions, stickers, chat commands and first-time chatters can each trigger an action.',
      'An action shows an alert, plays a built-in sound or your own, shows your picture or video, reads its text aloud, presses a key, or gives points.',
      'Limit an action to followers, subscribers, moderators, top gifters or one viewer, with cooldowns and random picks.',
      'A gift streak can press a key once per gift, up to 10 times. Gift boosts add votes or move the gifter up the queue.',
      'Several overlay screens, so alerts and widgets can sit in different places. Test any alert before you go live.',
    ],
    art: <GiftArt />,
  },
  {
    title: 'Chat read aloud',
    text: 'Speech plays through your overlay, so OBS and LIVE Studio capture it with the rest of your stream.',
    points: [
      'Read prefixed comments (like !tts hello), alerts, or all of chat.',
      'Filters for length, blocked words, per-viewer cooldowns and minimum level.',
      'Engines: Piper voices on your server, eSpeak in the overlay, TikTok’s own voices through your TikTok account, your own Google, Azure or ElevenLabs key, or the PC’s own voices.',
      'Effects: chipmunk, deep, monster, robot, radio and echo.',
    ],
    art: <VoiceArt />,
  },
  {
    title: 'Levels and a leaderboard',
    text: 'Give regulars something to work towards.',
    points: [
      'Viewers earn 1 XP per command that presses a key, plus each gift’s value in coins.',
      'Level-ups get a shout-out on the overlay.',
      'Optional level requirements per command, off unless you turn them on.',
      'Show the top players on stream, and reset the board whenever you like.',
    ],
    art: <LevelsArt />,
  },
  {
    title: 'A profile per game',
    text: 'Set a game up once and switch to it in one click.',
    points: [
      'Each profile has its own commands, key-press actions and crowd mode.',
      'Switching applies straight away, even while live.',
      'Name the game’s process and the companion targets it automatically.',
    ],
    art: <ProfilesArt />,
  },
  {
    title: 'The companion app',
    text: 'A small app for Windows and macOS that presses keys on your gaming PC. It only does what you allow.',
    points: [
      'Pairs with your account using a short code.',
      'Its own list of allowed keys; system keys are never pressed.',
      'Presses keys only while your game’s window is in front.',
      'Ctrl+Shift+Backspace pauses instantly and lets go of every held key.',
    ],
    art: <CompanionArt />,
  },
  {
    title: 'Safe by default',
    text: 'Chat is unpredictable. Fluxion is built so it can’t take over your PC.',
    points: [
      'A cap on key presses per second, set by you.',
      'A cooldown per viewer on each command.',
      'No Windows key, Escape, Tab or F-keys, and combinations like Ctrl+Alt+Del, Ctrl+W and Alt+F4 are blocked.',
    ],
    art: <SafetyArt />,
  },
];

export function FeaturesPage() {
  return (
    <SiteLayout>
      <PageHero title="Everything a crowd-play stream needs">
        Commands, crowd modes, gifts, alerts, voices and levels, all run from one dashboard and changeable while you’re live.
      </PageHero>
      <div className="s-wrap">
        {FEATURES.map((f) => (
          <section key={f.title} className="s-feature-row">
            <div>
              <h2>{f.title}</h2>
              <p>{f.text}</p>
              <ul className="s-checks">
                {f.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div className="s-feature-art" aria-hidden="true">
              {f.art}
            </div>
          </section>
        ))}
      </div>
    </SiteLayout>
  );
}

export function HowItWorksPage() {
  return (
    <SiteLayout>
      <PageHero title="Live in five steps">
        You need a TikTok account that can go LIVE and a Windows or Mac PC running your game. Everything else is set up
        from the dashboard.
      </PageHero>
      <div className="s-wrap">
        <ol className="s-timeline">
          <li>
            <div>
              <h2>Create your account</h2>
              <p>
                Sign up with an email and password, then add your TikTok username in Settings. Fluxion reads your public LIVE
                chat by username; it never asks for your TikTok password.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h2>Set up the companion on your gaming PC</h2>
              <p>
                <Link href="/download">Download the companion app</Link> and install it on the PC that runs your game. In the dashboard, open Companion and create a pairing
                code, then enter it in the app with your server address. On macOS, allow it under Accessibility when asked.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h2>Choose your commands</h2>
              <p>
                New accounts start with left, right, up, down and jump on A, D, W, S and Space. Change them, add your own, and
                pick a crowd mode. Make a game profile if you play more than one game.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h2>Add the overlay to your stream</h2>
              <p>
                Copy your overlay address from Stream overlay and add it as a browser source in TikTok LIVE Studio or OBS. It
                shows commands, votes, alerts and the leaderboard, and plays alert sounds and voices.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h2>Go live</h2>
              <p>
                Start your TikTok LIVE, focus your game, and press Go live in the dashboard. Want a dry run first? Test mode lets
                you type as a pretend viewer and watch the keys press.
              </p>
            </div>
          </li>
        </ol>
        <Link href="/signup" className="s-btn s-btn-solid">
          Create your account
        </Link>
      </div>
    </SiteLayout>
  );
}

export function SelfHostingPage() {
  return (
    <SiteLayout>
      <PageHero title="Run Fluxion on your own server">
        One container runs the server, dashboard and overlay; a second runs Postgres. Your settings, API keys and leaderboard
        stay on your machine.
      </PageHero>
      <div className="s-wrap">
        <ol className="s-timeline">
          <li>
            <div>
              <h2>Start it with Docker</h2>
              <p>You need Docker and Git. Migrations run on startup.</p>
              <pre className="s-code">
                <code>
                  git clone {GITHUB_URL} && cd Fluxion{'\n'}cp .env.example .env{'\n'}
                  <span className="c"># edit .env: set POSTGRES_PASSWORD, and SECRETS_KEY to: openssl rand -base64 32</span>
                  {'\n'}docker compose -f docker/compose.yml --env-file .env up -d --build
                </code>
              </pre>
              <p>
                Fluxion is now on <code>http://127.0.0.1:3000</code>. Update with <code>git pull</code> and the same command.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h2>Put HTTPS in front</h2>
              <p>
                Login cookies are secure by default, so browsers only send them over HTTPS or on localhost. A reverse proxy
                like Caddy gets certificates for you; WebSockets pass through with no extra setup.
              </p>
              <pre className="s-code">
                <code>
                  fluxion.example.com {'{'}
                  {'\n'}
                  {'  '}reverse_proxy 127.0.0.1:3000{'\n'}
                  {'}'}
                </code>
              </pre>
            </div>
          </li>
          <li>
            <div>
              <h2>Adjust settings</h2>
              <table className="s-table">
                <thead>
                  <tr>
                    <th>Setting</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>POSTGRES_PASSWORD</code>
                    </td>
                    <td>Database password (required)</td>
                  </tr>
                  <tr>
                    <td>
                      <code>SECRETS_KEY</code>
                    </td>
                    <td>Encrypts saved API keys and TikTok sessions (required). Back it up with your database</td>
                  </tr>
                  <tr>
                    <td>
                      <code>FLUXION_BIND</code>
                    </td>
                    <td>Interface to publish on; 127.0.0.1 by default, 0.0.0.0 for your network</td>
                  </tr>
                  <tr>
                    <td>
                      <code>FLUXION_PORT</code>
                    </td>
                    <td>Published port, 3000 by default</td>
                  </tr>
                  <tr>
                    <td>
                      <code>COOKIE_SECURE</code>
                    </td>
                    <td>Set to false only to use plain HTTP on a private network</td>
                  </tr>
                </tbody>
              </table>
              <p>
                The image includes Piper and five English voice models with 1,016 voices between them. Smaller builds, more
                voices and backups are covered in the{' '}
                <a href={`${GITHUB_URL}/blob/main/docs/SELF_HOSTING.md`}>full self-hosting guide</a>.
              </p>
            </div>
          </li>
        </ol>
      </div>
    </SiteLayout>
  );
}

const QUESTIONS: [string, ReactNode][] = [
  ['Is Fluxion free?', 'Yes. Fluxion is free and open source under the GPL-3.0. The only optional cost is a cloud voice provider, if you choose to use your own Google, Azure or ElevenLabs key.'],
  ['Is this made by TikTok?', 'No. Fluxion is an independent project and is not affiliated with TikTok. It reads your public LIVE chat by username, the same way other LIVE tools do.'],
  ['Do I need my TikTok password?', 'No. You only enter your TikTok username. You must already be live on TikTok when you connect.'],
  [
    'Which games work?',
    'Games on Windows or macOS that you control with the keyboard. The companion presses real keys in the game window you choose. Some games with anti-cheat may ignore simulated key presses.',
  ],
  ['Can viewers mess up my PC?', 'The companion only presses keys you have allowed, only while your game is in front, never the Windows key or Escape, and never combinations like Ctrl+W or Alt+F4. Ctrl+Shift+Backspace pauses everything instantly.'],
  ['Do I need OBS?', 'No. The overlay works as a browser source in TikTok LIVE Studio or in OBS. Its background is transparent.'],
  ['Does it work on Mac?', 'Yes. The companion runs on Windows and macOS. On a Mac it needs Accessibility permission to press keys, and it walks you through granting it.'],
  [
    'Can I run it myself?',
    <>
      Yes. One Docker command starts the server and database. See <Link href="/self-hosting">Self-hosting</Link>.
    </>,
  ],
];

export function FaqPage() {
  return (
    <SiteLayout>
      <PageHero title="Questions, answered">Can’t find what you need? Open an issue on GitHub and ask.</PageHero>
      <div className="s-wrap">
        <div className="s-faq">
          {QUESTIONS.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </SiteLayout>
  );
}

const PLATFORMS: { id: Platform; name: string; needs: string; file: string }[] = [
  { id: 'windows', name: 'Windows', needs: 'Windows 10 or 11, 64-bit', file: 'Installer (.exe)' },
  { id: 'mac', name: 'macOS', needs: 'macOS 11 or later, Apple silicon or Intel', file: 'Disk image (.dmg)' },
];

export function DownloadPage() {
  const release = useCompanionRelease();
  const yours = detectPlatform();

  return (
    <SiteLayout>
      <PageHero title="Download the companion">
        The companion runs on the PC that plays your game and presses the keys chat asks for. Install it there, then pair it
        from your dashboard.
      </PageHero>
      <div className="s-wrap">
        <div className="s-downloads">
          {PLATFORMS.map((p) => {
            const url = release?.downloads[p.id];
            return (
              <div key={p.id} className="s-box s-download">
                <h2>{p.name}</h2>
                <p className="s-muted">{p.needs}</p>
                {url ? (
                  <a href={url} className={`s-btn ${p.id === yours ? 's-btn-solid' : 's-btn-line'}`}>
                    Download for {p.name}
                  </a>
                ) : (
                  <span className="s-btn s-btn-line" aria-disabled="true">
                    {release === undefined ? 'Checking for the latest version…' : 'Not available yet'}
                  </span>
                )}
                <p className="s-download-meta">
                  {url ? `Version ${release!.version} · ${p.file}` : release === null ? 'No release has been published yet.' : '\u00a0'}
                </p>
              </div>
            );
          })}
        </div>
        <p className="s-download-more">
          Older versions and release notes are on <a href={RELEASES_URL}>GitHub releases</a>.
        </p>

        <ol className="s-timeline">
          <li>
            <div>
              <h2>Open it the first time</h2>
              <p>
                The companion isn’t code-signed yet, so your PC asks before opening it. On Windows, choose More info, then Run
                anyway. On a Mac, open the app once, then go to System Settings, Privacy &amp; Security and choose Open Anyway.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h2>Pair it with your account</h2>
              <p>
                In the dashboard, open Companion and create a pairing code. Enter the code and the server address shown there
                into the app.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h2>Mac only: allow key presses</h2>
              <p>
                macOS asks for Accessibility permission so the companion can press keys. Turn it on for Fluxion Companion in
                System Settings, Privacy &amp; Security, Accessibility.
              </p>
            </div>
          </li>
        </ol>

        <div className="s-box s-download-source">
          <h2>Build it yourself</h2>
          <p className="s-muted">
            You need Node 22 or later and Rust, plus the{' '}
            <a href="https://tauri.app/start/prerequisites/">Tauri prerequisites</a> for your system. The installer ends up in{' '}
            <code>apps/companion/src-tauri/target/release/bundle</code>.
          </p>
          <pre className="s-code">
            <code>
              git clone {GITHUB_URL} && cd Fluxion{'\n'}npm ci{'\n'}npm run tauri build -w apps/companion
            </code>
          </pre>
        </div>
      </div>
    </SiteLayout>
  );
}
