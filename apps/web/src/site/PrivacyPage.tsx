import type { ReactNode } from 'react';
import { Link } from '../router';
import { PageHero } from './pages';
import { GITHUB_URL, SiteLayout } from './SiteLayout';

// What Fluxion stores, where it goes and how long it stays, written from what the code does. Keep it in step with
// the server: the database schema, the TTS engines, the companion, and anything new that leaves the server.

const UPDATED = 'October 30, 2026';

const GLANCE: [string, string][] = [
  ['No ads, analytics or trackers', 'Fluxion doesn’t load anyone else’s scripts, and the site’s font is served by Fluxion itself.'],
  ['Secrets are locked up', 'Passwords are hashed. Cloud voice keys and TikTok sessions are encrypted and never sent back to a browser.'],
  ['Only what the stream needs', 'Fluxion keeps your settings and what happened on your streams. It never asks for your TikTok password.'],
  ['You can run it yourself', 'Self-host Fluxion and every piece of data on this page stays on your own server.'],
];

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'who',
    title: 'Who looks after your data',
    body: (
      <>
        <p>
          Fluxion is free, open-source software. Whoever runs the Fluxion server you sign in to stores your data and is
          responsible for it. If you <Link href="/self-hosting">host Fluxion yourself</Link>, that’s you, and nothing on this
          page reaches anyone else unless you turn on a service that sends it (listed under Where data goes).
        </p>
        <p>
          This page describes what the Fluxion software does. Because the code is public, you can check every statement here
          against it on <a href={GITHUB_URL}>GitHub</a>.
        </p>
      </>
    ),
  },
  {
    id: 'stored',
    title: 'What’s stored about you',
    body: (
      <>
        <p>When you create an account and use the dashboard, the server keeps:</p>
        <table className="s-table">
          <thead>
            <tr>
              <th>What</th>
              <th>Why</th>
              <th>How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Email address and password</td>
              <td>To sign you in. The password is stored only as an Argon2 hash, which can’t be turned back into it.</td>
              <td>Until your account is deleted</td>
            </tr>
            <tr>
              <td>Your TikTok username</td>
              <td>To read your LIVE chat. Fluxion only needs the username, never your TikTok password.</td>
              <td>Until you change or clear it</td>
            </tr>
            <tr>
              <td>Settings, commands, actions, profiles, goals and overlay layouts</td>
              <td>They’re what you set up on the dashboard.</td>
              <td>Until you delete them</td>
            </tr>
            <tr>
              <td>Sounds, pictures and videos you upload</td>
              <td>To play them in your alerts.</td>
              <td>Until you delete them</td>
            </tr>
            <tr>
              <td>Cloud voice API key (only if you add one)</td>
              <td>To make speech with your own Google, Azure or ElevenLabs account. Encrypted with the server’s secret key.</td>
              <td>Until you remove it</td>
            </tr>
            <tr>
              <td>TikTok session (only if you sign in to TikTok in the companion)</td>
              <td>To read chat aloud in TikTok’s voices. Encrypted with the server’s secret key.</td>
              <td>Until it’s removed, or TikTok ends it (see Your choices)</td>
            </tr>
            <tr>
              <td>Paired PCs: the name you gave each, its computer name, Windows or macOS, and when it was last online</td>
              <td>So you can see and remove your companions. Each PC’s access token is stored only as a hash.</td>
              <td>Until you remove the PC</td>
            </tr>
            <tr>
              <td>Login sessions</td>
              <td>To keep you signed in. Stored as a hash of the session token.</td>
              <td>30 days, or until you log out</td>
            </tr>
            <tr>
              <td>Pairing codes</td>
              <td>To pair a new PC. Stored as a hash.</td>
              <td>10 minutes</td>
            </tr>
            <tr>
              <td>Stream history (see Your viewers)</td>
              <td>For the activity feed and analytics.</td>
              <td>
                Kept for your past streams. A test-mode session is replaced by the next one.
              </td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'viewers',
    title: 'Your viewers',
    body: (
      <>
        <p>
          Viewers don’t sign up for Fluxion. While you’re live, it receives your public LIVE chat from TikTok, the same events
          anyone watching can see. From those it keeps:
        </p>
        <ul className="s-checks">
          <li>
            Stream history: each comment (with its text), gift, like, follow, share, join, subscription and emote, with the
            viewer’s TikTok username and the time, plus what Fluxion did in response (keys pressed, votes, turns, levels).
          </li>
          <li>Leaderboard totals per viewer: commands, gifts, XP and points. You can reset these from the dashboard.</li>
        </ul>
        <p>
          Viewer usernames and alert text appear on your overlay, so treat your overlay link like a password: anyone with it
          can watch your alerts. Chat read aloud goes to the voice service you choose (see below).
        </p>
      </>
    ),
  },
  {
    id: 'third-parties',
    title: 'Where data goes',
    body: (
      <>
        <p>Fluxion sends data off the server only to these services, and only when you use the feature that needs them:</p>
        <ul className="s-checks">
          <li>
            <strong>TikTok</strong>, to receive your LIVE chat. The connection goes through Euler Stream’s signing service,
            which the open-source TikTok LIVE library Fluxion uses relies on to connect. It sees the username you stream from.
          </li>
          <li>
            <strong>TikTok’s text-to-speech</strong>, when you use TikTok voices: the chat line being read aloud, sent with your
            TikTok session or, if you haven’t signed in, with an account set up by whoever runs the server.
          </li>
          <li>
            <strong>Google Cloud, Microsoft Azure or ElevenLabs</strong>, when you pick cloud voices: the chat line being read
            aloud, sent with your own API key. Their privacy policies apply to what they receive.
          </li>
          <li>
            <strong>GitHub</strong>: the Download page asks GitHub for the latest companion release, and the downloads come
            from GitHub, so GitHub sees those requests.
          </li>
        </ul>
        <p>
          The Piper and eSpeak voices run on the Fluxion server itself, so chat read with them goes nowhere else. Browser
          voices run on the PC showing your overlay; some browsers send text to their maker for online voices.
        </p>
      </>
    ),
  },
  {
    id: 'companion',
    title: 'The companion app',
    body: (
      <>
        <p>
          The companion runs on your PC and keeps its settings there: the server address, its access token, the keys you
          allowed, the key combinations you approved, and the game you picked. To show the game picker it lists the programs
          running with a window, with their names and icons; that list stays on your PC.
        </p>
        <p>
          When you pair it, it sends the server the device name you typed, your computer’s name and whether it’s Windows or
          macOS. While connected, it tells the server which keys it pressed or refused. It doesn’t read your screen, your
          files or what you type.
        </p>
        <p>
          If you sign in to TikTok in the companion, the sign-in happens on tiktok.com in a separate window. The companion
          takes only TikTok’s session cookie and sends it to your Fluxion server; the window keeps TikTok’s cookies on your
          PC, like a browser would.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and browser storage',
    body: (
      <ul className="s-checks">
        <li>
          <code>fluxion_session</code>: one cookie that keeps you signed in. It can’t be read by scripts and lasts 30 days or
          until you log out.
        </li>
        <li>The dashboard remembers in your browser whether you collapsed the activity feed.</li>
        <li>After an update, a tab notes when it last reloaded itself, so it doesn’t reload twice in a row.</li>
      </ul>
    ),
  },
  {
    id: 'logs',
    title: 'Server logs',
    body: (
      <p>
        Like most web servers, the Fluxion server logs each request it handles, with the time, the address (IP) it came from
        and the page or API it asked for. Sign-up and login attempts are counted per address for a minute to slow down
        password guessing. How long logs are kept is up to whoever runs the server.
      </p>
    ),
  },
  {
    id: 'security',
    title: 'How it’s protected',
    body: (
      <ul className="s-checks">
        <li>Passwords are hashed with Argon2; session, pairing and companion tokens are stored only as hashes.</li>
        <li>
          Cloud voice keys and TikTok sessions are encrypted with AES-256-GCM, so a copy of the database is useless without the
          server’s secret key. They’re never sent back to a browser.
        </li>
        <li>The login cookie is sent only over HTTPS (unless a self-hoster turns that off for a private network), and isn’t readable by scripts on the page.</li>
        <li>The companion presses only keys you allow, only in the game you pick, and asks before any key combination.</li>
      </ul>
    ),
  },
  {
    id: 'choices',
    title: 'Your choices',
    body: (
      <ul className="s-checks">
        <li>Change or clear your TikTok username, voice settings and API key in the dashboard at any time.</li>
        <li>
          There’s no TikTok sign-out button in Fluxion yet. To end the session the server holds, log that device out in
          TikTok’s own settings; the server’s copy then stops working. Whoever runs the server can also remove it.
        </li>
        <li>Remove a paired PC from the Companion page; it’s disconnected at once.</li>
        <li>Delete commands, actions, uploads, goals and profiles, and reset the leaderboard, from the dashboard.</li>
        <li>
          The dashboard can’t delete your whole account or your stream history yet. To have them removed, ask whoever runs
          your Fluxion server; deleting an account removes everything listed on this page with it.
        </li>
      </ul>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and questions',
    body: (
      <p>
        When Fluxion starts storing or sending something new, this page changes with it, and the date below moves. Questions
        about the software are welcome as an issue on <a href={`${GITHUB_URL}/issues`}>GitHub</a>; questions about your data on
        a particular server go to whoever runs it.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return (
    <SiteLayout>
      <PageHero title="Your privacy">
        What Fluxion stores, where it goes, and how to remove it. Written from what the code actually does.
      </PageHero>
      <div className="s-wrap">
        <div className="s-privacy-glance">
          {GLANCE.map(([title, text]) => (
            <div key={title} className="s-box">
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <div className="s-privacy">
          <nav className="s-privacy-toc" aria-label="On this page">
            <p>On this page</p>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`}>
                {s.title}
              </a>
            ))}
          </nav>
          <article className="s-privacy-body">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
                <h2 id={`${s.id}-title`}>{s.title}</h2>
                {s.body}
              </section>
            ))}
            <p className="s-privacy-updated">Last updated {UPDATED}.</p>
          </article>
        </div>
      </div>
    </SiteLayout>
  );
}
