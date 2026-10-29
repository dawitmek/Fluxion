import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type Host, type LiveStatus, type Profile } from '../api';
import { Icon, Logo, type IconName } from '../icons';
import { Link, navigate, usePath } from '../router';
import { Glow } from '../site/Glow';
import { ErrorNotice, useError } from '../ui';
import { useLiveFeed, type LiveFeed } from './live-feed';
import { LivePage } from './LivePage';
import { CommandsPage } from './CommandsPage';
import { GiftsPage } from './GiftsPage';
import { VoicePage } from './VoicePage';
import { LeaderboardPage } from './LeaderboardPage';
import { ProfilesPage } from './ProfilesPage';
import { CompanionPage } from './CompanionPage';
import { OverlayPage } from './OverlayPage';
import { SettingsPage } from './SettingsPage';

export interface PageProps {
  host: Host;
  refreshHost: () => Promise<unknown>;
  status: LiveStatus;
  setStatus: (status: LiveStatus) => void;
  feed: LiveFeed;
}

type Section = { path: string; label: string; blurb: string; icon: IconName; hue: string; page: (props: PageProps) => ReactNode };

// Each section keeps its colour wherever it appears.
const SECTIONS: Section[][] = [
  [
    { path: '/dashboard', label: 'Live', blurb: 'What chat is doing right now, and the controls to go live.', icon: 'live', hue: 'red', page: LivePage },
    { path: '/dashboard/commands', label: 'Commands', blurb: 'What chat types, the key it presses, and how the crowd shares control.', icon: 'commands', hue: 'indigo', page: CommandsPage },
    { path: '/dashboard/gifts', label: 'Gifts and alerts', blurb: 'Gifts that press keys, and alerts that thank people on stream.', icon: 'gift', hue: 'pink', page: GiftsPage },
    { path: '/dashboard/voice', label: 'Voice', blurb: 'What gets read aloud on your stream, and how it sounds.', icon: 'voice', hue: 'violet', page: VoicePage },
    { path: '/dashboard/leaderboard', label: 'Leaderboard', blurb: 'Who plays the most, and the levels viewers earn.', icon: 'leaderboard', hue: 'sky', page: LeaderboardPage },
    { path: '/dashboard/profiles', label: 'Game profiles', blurb: 'A set of commands, gifts and crowd mode for each game.', icon: 'profiles', hue: 'teal', page: ProfilesPage },
  ],
  [
    { path: '/dashboard/companion', label: 'Companion', blurb: 'The app on your gaming PC that presses the keys.', icon: 'companion', hue: 'orange', page: CompanionPage },
    { path: '/dashboard/overlay', label: 'Stream overlay', blurb: 'The browser source that puts Fluxion on your stream.', icon: 'overlay', hue: 'sky', page: OverlayPage },
    { path: '/dashboard/settings', label: 'Settings', blurb: 'Your TikTok account, limits and login.', icon: 'settings', hue: 'muted', page: SettingsPage },
  ],
];

export function Dashboard() {
  const [host, setHost] = useState<Host | null | undefined>(undefined);
  const refresh = useCallback(
    () =>
      api<Host>('GET', '/auth/me')
        .then(setHost)
        .catch(() => setHost(null)),
    [],
  );
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    if (host === null) navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
  }, [host]);

  if (!host) return null;
  return <Shell host={host} refreshHost={refresh} />;
}

function Shell({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const path = usePath();
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<LiveStatus>({ live: false, companionsOnline: 0 });
  const feed = useLiveFeed(host.overlayToken);

  useEffect(() => {
    const load = () => api<LiveStatus>('GET', '/live/status').then(setStatus).catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setMenuOpen(false), [path]);

  const section = SECTIONS.flat().find((s) => s.path === path.replace(/\/$/, '')) ?? SECTIONS[0]![0]!;
  const Page = section.page;

  return (
    <div className="app">
      <div className="mobile-bar">
        <Link href="/dashboard" className="brand">
          <Logo size={28} />
          Fluxion
        </Link>
        {status.live && <span className="on-air">On air</span>}
        <button className="btn btn-ghost" aria-expanded={menuOpen} aria-controls="sidebar" onClick={() => setMenuOpen(!menuOpen)}>
          <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
          <span className="sr-only">Menu</span>
        </button>
      </div>
      <nav id="sidebar" className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Dashboard">
        {/* The logo keeps you in the app; the public site is reached by its own address. */}
        <Link href="/dashboard" className="brand">
          <Logo />
          Fluxion
        </Link>
        {SECTIONS.map((group, i) => (
          <div key={i} className="nav-group">
            {group.map((s) => (
              <Link key={s.path} href={s.path} className="nav-item" aria-current={s === section ? 'page' : undefined}>
                <span className={`nav-icon ${s.hue}`}>
                  <Icon name={s.icon} />
                </span>
                {s.label}
                {s.path === '/dashboard' && status.live && <span className="on-air">On air</span>}
              </Link>
            ))}
          </div>
        ))}
        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">
            {(host.tiktokUsername ?? host.email)[0]!.toUpperCase()}
          </span>
          <span>
            <strong>{host.tiktokUsername ? host.tiktokUsername.replace(/^@/, '') : host.email}</strong>
            <span>{host.tiktokUsername ? 'TikTok account' : 'No TikTok account yet'}</span>
          </span>
        </div>
      </nav>

      <main className="content">
        <div className="content-glow" aria-hidden="true">
          <Glow />
        </div>
        <div className="topbar">
          <span className="crumbs">
            <span>Fluxion</span>
            <span>{host.profileName} profile</span>
            <span>{section.label}</span>
          </span>
          {status.live && <span className="on-air">{status.source === 'simulated' ? 'Test mode' : 'On air'}</span>}
          <div className="spacer" />
          <ProfilePicker host={host} refreshHost={refreshHost} />
        </div>
        <header className="page-header">
          <h1>{section.label}</h1>
          <p>{section.blurb}</p>
        </header>
        {/* Keyed by profile so switching profiles reloads everything that belongs to one. */}
        <Page key={host.profileId} host={host} refreshHost={refreshHost} status={status} setStatus={setStatus} feed={feed} />
      </main>
    </div>
  );
}

function ProfilePicker({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const { error, guard } = useError();
  useEffect(() => void api<Profile[]>('GET', '/profiles').then(setProfiles), [host]);
  const activate = (id: string) => guard(() => api('POST', `/profiles/${id}/activate`).then(refreshHost))();

  return (
    <div className="profile-picker">
      <label className="row muted">
        Game profile
        <select className="input" value={host.profileId} onChange={(e) => activate(e.target.value)}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <ErrorNotice error={error} />
    </div>
  );
}
