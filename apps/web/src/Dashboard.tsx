import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ALLOWED_KEYS } from '@fluxion/shared';
import { api, ApiError, type Command, type Companion, type Host, type LiveStatus } from './api';

export function Dashboard() {
  const [host, setHost] = useState<Host | null | undefined>(undefined);
  const refresh = useCallback(() => {
    api<Host>('GET', '/auth/me')
      .then(setHost)
      .catch(() => setHost(null));
  }, []);
  useEffect(refresh, [refresh]);

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

function Main({ host, refreshHost, onLogout }: { host: Host; refreshHost: () => void; onLogout: () => void }) {
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
      <CommandsSection />
      <CompanionsSection />
      <OverlaySection host={host} />
    </main>
  );
}

function LiveSection({ host, refreshHost }: { host: Host; refreshHost: () => void }) {
  const [status, setStatus] = useState<LiveStatus>({ live: false, companionsOnline: 0 });
  const [username, setUsername] = useState(host.tiktokUsername ?? '');
  const [rate, setRate] = useState(host.actionsPerSecond);
  const [testViewer, setTestViewer] = useState('tester');
  const [testText, setTestText] = useState('left');
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
        <span className="pill">Anarchy mode</span>
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
            <input value={testViewer} onChange={(e) => setTestViewer(e.target.value)} aria-label="Viewer name" />
            <input value={testText} onChange={(e) => setTestText(e.target.value)} aria-label="Comment" />
            <button className="primary">Send comment</button>
          </div>
        </form>
      )}
    </section>
  );
}

const emptyCommand = { keyword: '', key: 'KeyA', holdMs: 300, cooldownMs: 1000 };

function CommandsSection() {
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
      <h2>Commands</h2>
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
function NumberCell({ value, min, max, onSave }: { value: number; min: number; max: number; onSave: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="num"
      type="number"
      min={min}
      max={max}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => Number(text) !== value && onSave(Number(text))}
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
