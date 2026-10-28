import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ALERT_EVENTS, ALERT_SOUNDS, ALLOWED_KEYS, CLOUD_PROVIDERS, VOICE_EFFECTS, levelForXp, MAX_LEVEL, MODES, QUEUE_JOIN, xpForLevel } from '@fluxion/shared';
import { playSound } from './sounds';
import { SpeechPlayer } from './speech-player';
import {
  api,
  ApiError,
  type AlertEvent,
  type AlertRule,
  type AlertSound,
  type CloudProvider,
  type Speech,
  type TtsEngine,
  type VoiceEffect,
  type Command,
  type Companion,
  type GiftTrigger,
  type Host,
  type LeaderboardEntry,
  type LiveStatus,
  type Mode,
  type Profile,
} from './api';

const MODE_INFO: Record<Mode, { label: string; help: string }> = {
  anarchy: { label: 'Anarchy', help: 'Every command fires, subject to cooldowns and the rate limit.' },
  democracy: { label: 'Democracy', help: 'Chat votes; the most-voted command fires when each voting window closes.' },
  queue: {
    label: 'Queue',
    help: `Viewers type "${QUEUE_JOIN}" to line up. One viewer at a time controls the game for a turn.`,
  },
  gift: { label: 'Gift-only', help: 'Comments do nothing. Only gift triggers press keys.' },
};

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

  if (host === undefined) return null;
  if (host === null) return <AuthForm onDone={refresh} />;
  return <Main host={host} refreshHost={refresh} onLogout={() => setHost(null)} />;
}

function useError() {
  const [error, setError] = useState<string | null>(null);
  // Wraps an async action so its failure shows up in the section that triggered it.
  const guard = (action: () => Promise<unknown>) => () => {
    setError(null);
    return action().catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };
  return { error, guard, setError };
}

function AuthForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, guard } = useError();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    guard(() => api('POST', `/auth/${mode}`, { email, password }).then(onDone))();
  };

  return (
    <main className="narrow">
      <h1>Fluxion</h1>
      <p className="muted">Let your TikTok LIVE audience play your game.</p>
      <form className="card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Log in' : 'Create an account'}</h2>
        {error && <p className="error">{error}</p>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        <button className="primary">{mode === 'login' ? 'Log in' : 'Sign up'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
        </button>
      </form>
    </main>
  );
}

function Main({ host, refreshHost, onLogout }: { host: Host; refreshHost: () => Promise<unknown>; onLogout: () => void }) {
  return (
    <main>
      <header className="topbar">
        <h1>Fluxion</h1>
        <span className="muted">{host.email}</span>
        <button className="link" onClick={() => api('POST', '/auth/logout').then(onLogout)}>
          Log out
        </button>
      </header>
      <LiveSection host={host} refreshHost={refreshHost} />
      <ProfilesSection host={host} refreshHost={refreshHost} />
      {/* Keyed by profile so switching profiles reloads everything that belongs to one. */}
      <ModeSection key={`mode-${host.profileId}`} host={host} refreshHost={refreshHost} />
      <CommandsSection key={`commands-${host.profileId}`} host={host} />
      <GiftTriggersSection key={`gifts-${host.profileId}`} />
      <ProgressionSection host={host} refreshHost={refreshHost} />
      <AlertsSection />
      <TtsSection host={host} refreshHost={refreshHost} />
      <LeaderboardSection host={host} />
      <CompanionsSection />
      <OverlaySection host={host} />
    </main>
  );
}

function LiveSection({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const [status, setStatus] = useState<LiveStatus>({ live: false, companionsOnline: 0 });
  const [username, setUsername] = useState(host.tiktokUsername ?? '');
  const [rate, setRate] = useState(host.actionsPerSecond);
  const [testViewer, setTestViewer] = useState('tester');
  const [testText, setTestText] = useState('left');
  const [testGift, setTestGift] = useState('Rose');
  const [testCount, setTestCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const { error, guard } = useError();

  useEffect(() => {
    const load = () => api<LiveStatus>('GET', '/live/status').then(setStatus).catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  const saveSettings = guard(() =>
    api('PATCH', '/settings', { tiktokUsername: username.trim() || null, actionsPerSecond: rate }).then(refreshHost),
  );
  const start = (source: 'tiktok' | 'simulated') =>
    guard(async () => {
      setBusy(true);
      try {
        setStatus(await api<LiveStatus>('POST', '/live/start', { source }));
      } finally {
        setBusy(false);
      }
    });
  const stop = guard(async () => setStatus(await api<LiveStatus>('POST', '/live/stop')));
  const simulate = (e: FormEvent) => {
    e.preventDefault();
    guard(() => api('POST', '/live/simulate', { viewer: testViewer, text: testText }))();
  };
  const simulateGift = guard(() => api('POST', '/live/simulate', { viewer: testViewer, gift: testGift, count: testCount }));

  return (
    <section className="card">
      <h2>Go live</h2>
      {error && <p className="error">{error}</p>}
      <div className="status-row">
        <span className={`pill ${status.live ? 'ok' : ''}`}>
          {status.live ? (status.source === 'simulated' ? 'Test mode' : 'Live on TikTok') : 'Offline'}
        </span>
        <span className={`pill ${status.companionsOnline > 0 ? 'ok' : 'bad'}`}>
          {status.companionsOnline > 0 ? `${status.companionsOnline} companion online` : 'No companion connected'}
        </span>
        <span className="pill">{MODE_INFO[status.mode ?? host.mode].label} mode</span>
      </div>

      <div className="grid2">
        <label>
          TikTok username
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@yourname" />
        </label>
        <label>
          Max actions per second
          <input type="number" min={1} max={50} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </label>
      </div>
      <button onClick={saveSettings}>Save</button>

      <div className="actions">
        {status.live ? (
          <button className="danger" onClick={stop}>
            Stop
          </button>
        ) : (
          <>
            <button className="primary" disabled={busy || !host.tiktokUsername} onClick={start('tiktok')}>
              {busy ? 'Connecting…' : 'Go live on TikTok'}
            </button>
            <button disabled={busy} onClick={start('simulated')}>
              Start test mode
            </button>
          </>
        )}
      </div>
      {!host.tiktokUsername && <p className="muted">Save your TikTok username to go live. You must already be live on TikTok.</p>}

      {status.live && status.source === 'simulated' && (
        <form className="test-console" onSubmit={simulate}>
          <p className="muted">Pretend to be a viewer. Commands go to your companion like real chat.</p>
          <div className="inline">
            <input value={testViewer} onChange={(e) => setTestViewer(e.target.value)} placeholder="Viewer" title="Viewer name" aria-label="Viewer name" />
            <input value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="Comment" title="Comment" aria-label="Comment" />
            <button className="primary">Send comment</button>
          </div>
          <div className="inline">
            <input value={testGift} onChange={(e) => setTestGift(e.target.value)} placeholder="Gift name" title="Gift name" aria-label="Gift name" />
            <input
              className="num"
              type="number"
              min={1}
              max={100}
              value={testCount}
              onChange={(e) => setTestCount(Number(e.target.value))}
              title="Gift count"
              aria-label="Gift count"
            />
            <button type="button" onClick={simulateGift}>
              Send gift
            </button>
          </div>
          <div className="inline">
            {(['follow', 'share'] as const).map((event) => (
              <button key={event} type="button" onClick={guard(() => api('POST', '/live/simulate', { viewer: testViewer, event }))}>
                Send {event}
              </button>
            ))}
            <button
              type="button"
              onClick={guard(() => api('POST', '/live/simulate', { viewer: testViewer, event: 'like', count: 100 }))}
            >
              Send 100 likes
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ModeSection({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const { error, guard } = useError();
  const save = (patch: Partial<Host>) => guard(() => api('PATCH', '/settings', patch).then(refreshHost))();

  return (
    <section className="card">
      <h2>Crowd mode · {host.profileName}</h2>
      <p className="muted">
        Saved with the active profile. You can switch while live; votes and the queue are kept when you change other
        settings.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="modes" role="radiogroup" aria-label="Crowd mode">
        {MODES.map((mode) => (
          <label key={mode} className={`mode ${host.mode === mode ? 'selected' : ''}`}>
            <input type="radio" name="mode" checked={host.mode === mode} onChange={() => save({ mode })} />
            <strong>{MODE_INFO[mode].label}</strong>
            <span className="muted">{MODE_INFO[mode].help}</span>
          </label>
        ))}
      </div>
      <div className="grid2">
        <label>
          Voting window (seconds, democracy)
          <NumberCell
            value={host.voteWindowMs / 1000}
            min={1}
            max={30}
            onSave={(s) => save({ voteWindowMs: Math.round(s * 1000) })}
          />
        </label>
        <label>
          Turn length (seconds, queue)
          <NumberCell value={host.turnMs / 1000} min={5} max={300} onSave={(s) => save({ turnMs: Math.round(s * 1000) })} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={host.giftBoosts} onChange={(e) => save({ giftBoosts: e.target.checked })} />
        Gift boosts: in democracy a gift adds votes to the gifter's vote; in queue it moves them to the front.
      </label>
    </section>
  );
}

function ProfilesSection({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState('');
  const [gameProcess, setGameProcess] = useState('');
  const { error, guard } = useError();
  const load = useCallback(() => api<Profile[]>('GET', '/profiles').then(setProfiles), []);
  useEffect(() => void load(), [load, host.profileId]);

  const patch = (id: string, body: Partial<Profile>) => guard(() => api('PATCH', `/profiles/${id}`, body).then(load))();
  const activate = (id: string) => guard(() => api('POST', `/profiles/${id}/activate`).then(refreshHost))();
  const add = (e: FormEvent) => {
    e.preventDefault();
    guard(() =>
      api('POST', '/profiles', { name, gameProcess: gameProcess.trim() || null }).then(() => {
        setName('');
        setGameProcess('');
        return load();
      }),
    )();
  };

  return (
    <section className="card">
      <h2>Game profiles</h2>
      <p className="muted">
        Each profile has its own commands, gift triggers and crowd mode. Switching applies immediately, even while live.
        If a profile names its game's process (as listed in the companion, e.g. <code>gta5.exe</code> on Windows or{' '}
        <code>minecraft</code> on macOS), the companion switches to that game too.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>Game process</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <TextCell value={p.name} required onSave={(v) => patch(p.id, { name: v })} label="Profile name" />
                </td>
                <td>
                  <TextCell
                    value={p.gameProcess ?? ''}
                    placeholder="none"
                    onSave={(v) => patch(p.id, { gameProcess: v || null })}
                    label="Game process"
                  />
                </td>
                <td className="row-actions">
                  {p.active ? (
                    <span className="pill ok">Active</span>
                  ) : (
                    <>
                      <button onClick={() => activate(p.id)}>Switch to</button>
                      <button className="link" onClick={guard(() => api('DELETE', `/profiles/${p.id}`).then(load))}>
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="inline add-command" onSubmit={add}>
        <input placeholder="New profile name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={48} aria-label="New profile name" />
        <input placeholder="game process (optional)" value={gameProcess} onChange={(e) => setGameProcess(e.target.value)} aria-label="Game process" />
        <button className="primary">Add (copies {host.profileName})</button>
      </form>
    </section>
  );
}

function ProgressionSection({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const { error, guard } = useError();
  const save = (patch: Partial<Host>) => guard(() => api('PATCH', '/settings', patch).then(refreshHost))();
  return (
    <section className="card">
      <h2>Viewer progression</h2>
      <p className="muted">
        Viewers earn XP on your streams: 1 per command that presses a key, plus each gift's diamond value. Levels show
        on the overlay, with a shout-out when someone levels up. Level 2 takes {xpForLevel(2)} XP, level 3 {xpForLevel(3)},
        level 5 {xpForLevel(5)}, level 10 {xpForLevel(10)}.
      </p>
      {error && <p className="error">{error}</p>}
      <label className="check">
        <input type="checkbox" checked={host.progression} onChange={(e) => save({ progression: e.target.checked })} />
        Show XP and levels on the overlay
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={host.levelGating}
          disabled={!host.progression}
          onChange={(e) => save({ levelGating: e.target.checked })}
        />
        Level requirements: commands can require a minimum level (set per command). Off by default; gift triggers are
        never gated.
      </label>
    </section>
  );
}

const EVENT_LABELS: Record<AlertEvent, string> = { follow: 'Follow', share: 'Share', gift: 'Gift', likes: 'Likes' };
const DEFAULT_TEMPLATES: Record<AlertEvent, string> = {
  follow: '{viewer} followed!',
  share: '{viewer} shared the stream!',
  gift: '{viewer} sent {count}× {gift}!',
  likes: '{total} likes! Thanks {viewer}',
};

// One AudioContext for previewing sounds on the dashboard.
let previewAudio: AudioContext | null = null;
const previewSound = (sound: AlertSound) => playSound((previewAudio ??= new AudioContext()), sound);

function AlertsSection() {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [event, setEvent] = useState<AlertEvent>('follow');
  const { error, guard } = useError();
  const load = useCallback(() => api<AlertRule[]>('GET', '/alerts').then(setAlerts), []);
  useEffect(() => void load(), [load]);

  const update = (id: string, patch: Partial<AlertRule>) => guard(() => api('PATCH', `/alerts/${id}`, patch).then(load))();
  const add = () =>
    guard(() =>
      api('POST', '/alerts', {
        event,
        template: DEFAULT_TEMPLATES[event],
        sound: 'chime',
        ...(event === 'likes' && { likeStep: 1000 }),
      }).then(load),
    )();

  return (
    <section className="card">
      <h2>Alerts</h2>
      <p className="muted">
        Shown big on the overlay, one at a time, with a sound and optionally read aloud. Placeholders: {'{viewer}'},{' '}
        {'{count}'}, {'{gift}'}, {'{total}'} (likes). A gift alert for a specific gift replaces the any-gift one. Test
        sends a sample to your overlay, live or not.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>On</th>
              <th>Event</th>
              <th>When</th>
              <th>Text</th>
              <th>Sound</th>
              <th>Read aloud</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id}>
                <td>
                  <input type="checkbox" checked={a.enabled} onChange={(e) => update(a.id, { enabled: e.target.checked })} />
                </td>
                <td>{EVENT_LABELS[a.event]}</td>
                <td>
                  {a.event === 'gift' && (
                    <TextCell value={a.giftName ?? ''} placeholder="any gift" label="Gift name" onSave={(v) => update(a.id, { giftName: v || null })} />
                  )}
                  {a.event === 'likes' && (
                    <span className="inline">
                      every
                      <NumberCell value={a.likeStep ?? 1000} min={1} max={1_000_000} onSave={(likeStep) => update(a.id, { likeStep })} />
                    </span>
                  )}
                </td>
                <td>
                  <TextCell value={a.template} required label="Alert text" onSave={(template) => update(a.id, { template })} />
                </td>
                <td>
                  <span className="inline">
                    <select
                      value={a.sound ?? ''}
                      onChange={(e) => update(a.id, { sound: (e.target.value || null) as AlertSound | null })}
                      aria-label="Sound"
                    >
                      <option value="">none</option>
                      {ALERT_SOUNDS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {a.sound && (
                      <button className="link" onClick={() => previewSound(a.sound!)} aria-label={`Play ${a.sound}`}>
                        ▶
                      </button>
                    )}
                  </span>
                </td>
                <td>
                  <input type="checkbox" checked={a.speak} onChange={(e) => update(a.id, { speak: e.target.checked })} />
                </td>
                <td className="row-actions">
                  <button onClick={guard(() => api('POST', `/alerts/${a.id}/test`))}>Test</button>
                  <button className="link" onClick={guard(() => api('DELETE', `/alerts/${a.id}`).then(load))}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inline add-command">
        <select value={event} onChange={(e) => setEvent(e.target.value as AlertEvent)} aria-label="New alert event">
          {ALERT_EVENTS.map((e) => (
            <option key={e} value={e}>
              {EVENT_LABELS[e]}
            </option>
          ))}
        </select>
        <button className="primary" onClick={add}>
          Add alert
        </button>
      </div>
    </section>
  );
}

// Installed voices only: cloud "Online" voices exist in one browser (Edge) and never in OBS.
function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.localService));
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

const ENGINES: [TtsEngine, string, string][] = [
  ['piper', 'Piper (server)', 'Natural offline voices made on the Fluxion server. Plays through OBS.'],
  ['espeak', 'eSpeak (overlay)', 'Robotic voice made inside the overlay, many languages. Plays through OBS.'],
  ['cloud', 'Your cloud key', 'Google, Azure or ElevenLabs with your own API key (you pay them). Plays through OBS.'],
  ['browser', 'Browser voices', "The streaming PC's built-in voices. Plays outside OBS's mixer; capture Desktop Audio."],
];
const CLOUD_LABELS: Record<CloudProvider, string> = { google: 'Google Cloud', azure: 'Azure Speech', elevenlabs: 'ElevenLabs' };
const CLOUD_VOICE_HINTS: Record<CloudProvider, string> = {
  google: 'e.g. en-US-Neural2-F',
  azure: 'e.g. en-US-AriaNeural',
  elevenlabs: 'a voice ID, e.g. 21m00Tcm4TlvDq8ikWAM',
};

const EFFECT_LABELS: Record<VoiceEffect, string> = {
  none: 'None',
  chipmunk: 'Chipmunk',
  deep: 'Deep',
  monster: 'Monster',
  robot: 'Robot',
  radio: 'Radio',
  echo: 'Echo',
};

let previewPlayer: SpeechPlayer | null = null;

function TtsSection({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const { error, guard, setError } = useError();
  const voices = useVoices();
  const [options, setOptions] = useState<{ piperVoices: { name: string; speakers: number }[]; espeakVoices: string[] }>({
    piperVoices: [],
    espeakVoices: [],
  });
  const [cloudVoices, setCloudVoices] = useState<{ id: string; label: string }[] | null>(null);
  const loadCloudVoices = guard(() => api<{ id: string; label: string }[]>('GET', '/tts/cloud-voices').then(setCloudVoices));
  // A list from another provider or key would offer voices this account can't use.
  useEffect(() => setCloudVoices(null), [host.ttsCloudProvider, host.ttsCloudKeySet]);
  const [cloudKey, setCloudKey] = useState('');
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => void api<typeof options>('GET', '/tts/options').then(setOptions), []);
  const save = (patch: Partial<Host> | { ttsCloudKey: string | null }) =>
    guard(() => api('PATCH', '/settings', patch).then(refreshHost))();
  // Plays exactly what the overlay would get, so a bad cloud key or missing voice shows up here.
  const preview = async () => {
    setError(null);
    setPreviewing(true);
    try {
      const speech = await api<Speech>('POST', '/tts/preview', { text: 'viewer says hello from Fluxion' });
      previewPlayer ??= new SpeechPlayer(() => (previewAudio ??= new AudioContext()));
      await previewPlayer.play(speech);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Could not play the preview: ${String(e)}`);
    } finally {
      setPreviewing(false);
    }
  };
  const piperMissing = host.ttsEngine === 'piper' && options.piperVoices.length === 0;
  const piperVoice = options.piperVoices.find((v) => v.name === host.ttsPiperVoice) ?? options.piperVoices[0];

  return (
    <section className="card">
      <h2>Text-to-speech</h2>
      <p className="muted">
        Your overlay reads chat aloud as "viewer says …", and speaks alerts marked "Read aloud". Links are never read,
        and in "all chat" mode game commands are skipped.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="modes" role="radiogroup" aria-label="Text-to-speech mode">
        {(
          [
            ['off', 'Off', 'Only alerts marked "Read aloud" are spoken.'],
            ['prefix', 'Prefixed chat', `Comments starting with ${host.ttsPrefix}, e.g. "${host.ttsPrefix} hello".`],
            ['all', 'All chat', 'Every comment that passes the filters below. Busiest option.'],
          ] as const
        ).map(([mode, label, help]) => (
          <label key={mode} className={`mode ${host.ttsMode === mode ? 'selected' : ''}`}>
            <input type="radio" name="ttsMode" checked={host.ttsMode === mode} onChange={() => save({ ttsMode: mode })} />
            <strong>{label}</strong>
            <span className="muted">{help}</span>
          </label>
        ))}
      </div>

      <h3>Voice engine</h3>
      <div className="modes" role="radiogroup" aria-label="Voice engine">
        {ENGINES.map(([engine, label, help]) => (
          <label key={engine} className={`mode ${host.ttsEngine === engine ? 'selected' : ''}`}>
            <input type="radio" name="ttsEngine" checked={host.ttsEngine === engine} onChange={() => save({ ttsEngine: engine })} />
            <strong>{label}</strong>
            <span className="muted">{help}</span>
          </label>
        ))}
      </div>
      {piperMissing && (
        <p className="muted">This server has no Piper voices installed, so eSpeak is used instead. The Docker image includes Piper.</p>
      )}
      <div className="grid2">
        {host.ttsEngine === 'piper' && options.piperVoices.length > 0 && (
          <label>
            Piper voice
            <select
              value={host.ttsPiperVoice ?? ''}
              // A speaker number from the previous voice means nothing for the new one.
              onChange={(e) => save({ ttsPiperVoice: e.target.value || null, ttsPiperSpeaker: null })}
            >
              <option value="">Default ({options.piperVoices[0]!.name})</option>
              {options.piperVoices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                  {v.speakers > 1 ? ` (${v.speakers} speakers)` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {host.ttsEngine === 'piper' && piperVoice && piperVoice.speakers > 1 && (
          <label>
            Speaker (0–{piperVoice.speakers - 1}; each one sounds different)
            <span className="inline">
              <NumberCell
                value={host.ttsPiperSpeaker ?? 0}
                min={0}
                max={piperVoice.speakers - 1}
                onSave={(ttsPiperSpeaker) => save({ ttsPiperSpeaker })}
              />
              <button onClick={() => save({ ttsPiperSpeaker: Math.floor(Math.random() * piperVoice.speakers) })}>Random</button>
            </span>
          </label>
        )}
        {(host.ttsEngine === 'espeak' || piperMissing || host.ttsEngine === 'cloud') && (
          <label>
            eSpeak language{host.ttsEngine !== 'espeak' && ' (fallback)'}
            <select value={host.ttsEspeakVoice} onChange={(e) => save({ ttsEspeakVoice: e.target.value })}>
              {options.espeakVoices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
        {host.ttsEngine === 'browser' && (
          <label>
            Voice (installed on this PC)
            <select value={host.ttsVoice ?? ''} onChange={(e) => save({ ttsVoice: e.target.value || null })}>
              <option value="">Default voice</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        )}
        {host.ttsEngine === 'cloud' && (
          <>
            <label>
              Provider
              <select
                value={host.ttsCloudProvider ?? ''}
                onChange={(e) => save({ ttsCloudProvider: (e.target.value || null) as CloudProvider | null })}
              >
                <option value="">Choose…</option>
                {CLOUD_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {CLOUD_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              API key {host.ttsCloudKeySet && <span className="muted">(saved; enter a new one to replace it)</span>}
              <span className="inline">
                <input
                  type="password"
                  autoComplete="off"
                  value={cloudKey}
                  placeholder={host.ttsCloudKeySet ? '••••••••' : 'paste your key'}
                  onChange={(e) => setCloudKey(e.target.value)}
                  aria-label="Cloud API key"
                />
                <button disabled={!cloudKey.trim()} onClick={() => (save({ ttsCloudKey: cloudKey.trim() }), setCloudKey(''))}>
                  Save key
                </button>
                {host.ttsCloudKeySet && (
                  <button className="link" onClick={() => save({ ttsCloudKey: null })}>
                    Remove
                  </button>
                )}
              </span>
            </label>
            {host.ttsCloudProvider && (
              <label>
                Voice
                <span className="inline">
                  {cloudVoices ? (
                    <select value={host.ttsCloudVoice ?? ''} onChange={(e) => save({ ttsCloudVoice: e.target.value || null })}>
                      <option value="">Default</option>
                      {cloudVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <TextCell
                      value={host.ttsCloudVoice ?? ''}
                      placeholder={CLOUD_VOICE_HINTS[host.ttsCloudProvider]}
                      label="Cloud voice"
                      onSave={(v) => save({ ttsCloudVoice: v || null })}
                    />
                  )}
                  {host.ttsCloudKeySet && !cloudVoices && <button onClick={loadCloudVoices}>List my voices</button>}
                </span>
              </label>
            )}
            {host.ttsCloudProvider === 'azure' && (
              <label>
                Region
                <TextCell
                  value={host.ttsCloudRegion ?? ''}
                  placeholder="e.g. eastus"
                  label="Azure region"
                  onSave={(v) => save({ ttsCloudRegion: v || null })}
                />
              </label>
            )}
          </>
        )}
      </div>
      <label>
        Voice effect (any engine; browser voices only get pitch and speed)
        <select value={host.ttsEffect} onChange={(e) => save({ ttsEffect: e.target.value as VoiceEffect })}>
          {VOICE_EFFECTS.map((effect) => (
            <option key={effect} value={effect}>
              {EFFECT_LABELS[effect]}
            </option>
          ))}
        </select>
      </label>
      <button onClick={() => void preview()} disabled={previewing}>
        {previewing ? 'Speaking…' : 'Preview voice'}
      </button>

      <h3>Chat filters</h3>
      <div className="grid2">
        <label>
          Prefix
          <TextCell value={host.ttsPrefix} required label="Prefix" onSave={(ttsPrefix) => save({ ttsPrefix })} />
        </label>
        <label>
          Max length (characters)
          <NumberCell value={host.ttsMaxLength} min={10} max={300} onSave={(ttsMaxLength) => save({ ttsMaxLength })} />
        </label>
        <label>
          Cooldown per viewer (seconds)
          <NumberCell
            value={host.ttsCooldownMs / 1000}
            min={0}
            max={600}
            onSave={(s) => save({ ttsCooldownMs: s * 1000 })}
          />
        </label>
        {host.progression && (
          <label>
            Minimum level
            <NumberCell value={host.ttsMinLevel} min={1} max={MAX_LEVEL} onSave={(ttsMinLevel) => save({ ttsMinLevel })} />
          </label>
        )}
      </div>
      <label>
        Blocked words (comma-separated; a comment containing one is not read)
        <TextCell value={host.ttsBlockedWords} label="Blocked words" onSave={(ttsBlockedWords) => save({ ttsBlockedWords })} />
      </label>
    </section>
  );
}

const emptyCommand = { keyword: '', key: 'KeyA', holdMs: 300, cooldownMs: 1000 };

function CommandsSection({ host }: { host: Host }) {
  const gated = host.progression && host.levelGating;
  const [commands, setCommands] = useState<Command[]>([]);
  const [draft, setDraft] = useState(emptyCommand);
  const { error, guard } = useError();
  const load = useCallback(() => api<Command[]>('GET', '/commands').then(setCommands), []);
  useEffect(() => void load(), [load]);

  const update = (id: string, patch: Partial<Command>) => guard(() => api('PATCH', `/commands/${id}`, patch).then(load))();
  const remove = (id: string) => guard(() => api('DELETE', `/commands/${id}`).then(load))();
  const add = (e: FormEvent) => {
    e.preventDefault();
    guard(() => api('POST', '/commands', draft).then(() => (setDraft(emptyCommand), load())))();
  };

  return (
    <section className="card">
      <h2>Commands · {host.profileName}</h2>
      <p className="muted">A comment fires a command when it is exactly the keyword (any capitalization).</p>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>On</th>
              <th>Keyword</th>
              <th>Key</th>
              <th>Hold (ms)</th>
              <th>Cooldown per viewer (ms)</th>
              {gated && <th>Min level</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {commands.map((c) => (
              <tr key={c.id}>
                <td>
                  <input type="checkbox" checked={c.enabled} onChange={(e) => update(c.id, { enabled: e.target.checked })} />
                </td>
                <td>{c.keyword}</td>
                <td>
                  <KeySelect value={c.key} onChange={(key) => update(c.id, { key })} />
                </td>
                <td>
                  <NumberCell value={c.holdMs} min={10} max={5000} onSave={(holdMs) => update(c.id, { holdMs })} />
                </td>
                <td>
                  <NumberCell value={c.cooldownMs} min={0} max={600000} onSave={(cooldownMs) => update(c.id, { cooldownMs })} />
                </td>
                {gated && (
                  <td>
                    <NumberCell value={c.minLevel} min={1} max={MAX_LEVEL} onSave={(minLevel) => update(c.id, { minLevel })} />
                  </td>
                )}
                <td>
                  <button className="link" onClick={() => remove(c.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="inline add-command" onSubmit={add}>
        <input
          placeholder="keyword"
          value={draft.keyword}
          onChange={(e) => setDraft({ ...draft, keyword: e.target.value.replace(/\s/g, '') })}
          required
          maxLength={32}
          aria-label="New keyword"
        />
        <KeySelect value={draft.key} onChange={(key) => setDraft({ ...draft, key })} />
        <button className="primary">Add command</button>
      </form>
    </section>
  );
}

function GiftTriggersSection() {
  const [triggers, setTriggers] = useState<GiftTrigger[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [giftName, setGiftName] = useState('');
  const [commandId, setCommandId] = useState('');
  const { error, guard } = useError();
  const load = useCallback(
    () =>
      Promise.all([api<GiftTrigger[]>('GET', '/gift-triggers'), api<Command[]>('GET', '/commands')]).then(([t, c]) => {
        setTriggers(t);
        setCommands(c);
      }),
    [],
  );
  useEffect(() => void load(), [load]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    guard(() =>
      api('POST', '/gift-triggers', { giftName, commandId: commandId || commands[0]?.id }).then(() => (setGiftName(''), load())),
    )();
  };

  return (
    <section className="card">
      <h2>Gift triggers</h2>
      <p className="muted">
        When a viewer sends this gift, its command is pressed, in every mode. A streak of N gifts presses it N times (up to
        10). Use the gift's name as TikTok shows it, e.g. Rose.
      </p>
      {error && <p className="error">{error}</p>}
      {triggers.length > 0 && (
        <ul className="list">
          {triggers.map((t) => (
            <li key={t.id}>
              <span>{t.giftName}</span>
              <span className="muted">presses {t.keyword}</span>
              <button className="link" onClick={guard(() => api('DELETE', `/gift-triggers/${t.id}`).then(load))}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="inline add-command" onSubmit={add}>
        <input placeholder="Gift name" value={giftName} onChange={(e) => setGiftName(e.target.value)} required maxLength={64} aria-label="Gift name" />
        <select value={commandId} onChange={(e) => setCommandId(e.target.value)} aria-label="Command">
          {commands.map((c) => (
            <option key={c.id} value={c.id}>
              {c.keyword}
            </option>
          ))}
        </select>
        <button className="primary" disabled={commands.length === 0}>
          Add trigger
        </button>
      </form>
    </section>
  );
}

function LeaderboardSection({ host }: { host: Host }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const { error, guard } = useError();
  const load = useCallback(() => api<LeaderboardEntry[]>('GET', '/leaderboard').then(setEntries), []);
  useEffect(() => void load(), [load]);

  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <p className="muted">
        Commands that pressed a key and gifts sent, per viewer, ranked by XP (1 per command plus gift diamonds). Updates
        every few seconds.
      </p>
      {error && <p className="error">{error}</p>}
      {entries.length === 0 ? (
        <p className="muted">No activity yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Viewer</th>
                <th>Commands</th>
                <th>Gifts</th>
                {host.progression && <th>XP</th>}
                {host.progression && <th>Level</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.viewer}>
                  <td>{i + 1}</td>
                  <td>{e.viewer}</td>
                  <td>{e.commands}</td>
                  <td>{e.gifts}</td>
                  {host.progression && <td>{e.xp}</td>}
                  {host.progression && <td>{levelForXp(e.xp)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="actions">
        <button onClick={guard(load)}>Refresh</button>
        <button
          className="link"
          onClick={guard(async () => {
            if (confirm('Reset the leaderboard? This cannot be undone.')) await api('DELETE', '/leaderboard').then(load);
          })}
        >
          Reset
        </button>
      </div>
    </section>
  );
}

// Saves on blur, like NumberCell.
function TextCell({
  value,
  onSave,
  label,
  placeholder,
  required,
}: {
  value: string;
  onSave: (v: string) => Promise<unknown> | void;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  const { text, setText, revert, save } = useSavedText(value);
  return (
    <input
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = text.trim();
        if (next === value || (required && !next)) return revert();
        void save(() => onSave(next));
      }}
    />
  );
}

function KeySelect({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Key">
      {ALLOWED_KEYS.map((key) => (
        <option key={key} value={key}>
          {key}
        </option>
      ))}
    </select>
  );
}

// Saves on blur so typing doesn't send a request per keystroke.
// After a save, shows whatever the parent reloaded: the new value, or the old one if the save failed.
function useSavedText(value: string) {
  const [text, setText] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => setText(value), [value]);
  const save = (onSave: () => Promise<unknown> | void) => Promise.resolve(onSave()).then(() => setText(latest.current));
  return { text, setText, revert: () => setText(value), save };
}

function NumberCell({
  value,
  min,
  max,
  onSave,
}: {
  value: number;
  min: number;
  max: number;
  onSave: (n: number) => Promise<unknown> | void;
}) {
  const { text, setText, revert, save } = useSavedText(String(value));
  return (
    <input
      className="num"
      type="number"
      min={min}
      max={max}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text);
        if (n === value) return;
        if (text.trim() === '' || !Number.isInteger(n) || n < min || n > max) return revert();
        void save(() => onSave(n));
      }}
    />
  );
}

function CompanionsSection() {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const { error, guard } = useError();
  const load = useCallback(() => api<Companion[]>('GET', '/companions').then(setCompanions), []);
  useEffect(() => void load(), [load]);

  return (
    <section className="card">
      <h2>Companion app</h2>
      <p className="muted">
        The companion runs on your gaming PC and presses keys in your game. Create a code, then enter it in the companion with
        this server's address: <code>{location.origin}</code>
      </p>
      {error && <p className="error">{error}</p>}
      {pairing ? (
        <p className="pairing-code">
          <strong>{pairing.code}</strong>
          <span className="muted"> valid until {new Date(pairing.expiresAt).toLocaleTimeString()}</span>
        </p>
      ) : (
        <button className="primary" onClick={guard(() => api<typeof pairing>('POST', '/companions/pairing-code').then(setPairing))}>
          Create pairing code
        </button>
      )}
      {companions.length > 0 && (
        <ul className="list">
          {companions.map((c) => (
            <li key={c.id}>
              <span>{c.name}</span>
              <span className="muted">{c.lastSeenAt ? `last seen ${new Date(c.lastSeenAt).toLocaleString()}` : 'never connected'}</span>
              <button className="link" onClick={guard(() => api('DELETE', `/companions/${c.id}`).then(load))}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="link" onClick={() => (setPairing(null), load())}>
        Refresh list
      </button>
    </section>
  );
}

function OverlaySection({ host }: { host: Host }) {
  const url = `${location.origin}/overlay/${host.overlayToken}`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="card">
      <h2>Stream overlay</h2>
      <p className="muted">
        Add this URL as a browser source in TikTok LIVE Studio or OBS. It shows who sent each command. Keep it private.
      </p>
      <div className="inline">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Overlay URL" />
        <button onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy'}</button>
        <a className="button" href={url} target="_blank" rel="noreferrer">
          Preview
        </a>
      </div>
    </section>
  );
}
