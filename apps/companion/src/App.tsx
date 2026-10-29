import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@fluxion/theme/theme.css";
import "./App.css";

interface LogEntry {
  key: string;
  ok: boolean;
  reason: string | null;
}

interface Snapshot {
  paired: boolean;
  serverUrl: string | null;
  deviceName: string | null;
  connection: string;
  paused: boolean;
  targetProcess: string | null;
  profileName: string | null;
  profileGame: string | null;
  allowedKeys: string[];
  allKeys: string[];
  log: LogEntry[];
  platformSupported: boolean;
  permissionProblem: string | null;
  panicHotkey: string;
}

interface GameWindow {
  title: string;
  process: string;
}

type Run = (command: string, args?: Record<string, unknown>) => Promise<void>;

// Key codes as people know them: KeyA -> A, ArrowLeft -> ←, Digit1 -> 1, Control+Shift+KeyE -> Ctrl+Shift+E.
function keyLabel(code: string): string {
  if (code.includes("+")) return code.split("+").map(keyLabel).join("+");
  const names: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Control: "Ctrl" };
  return names[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "").replace(/(Left|Right)$/, " $1");
}

export default function App() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<Snapshot>("get_state").then(setState);
    const unlisten = listen<Snapshot>("state", (event) => setState(event.payload));
    return () => void unlisten.then((stop) => stop());
  }, []);

  // Runs a Rust command and shows its error, if any.
  const run: Run = (command, args) =>
    invoke(command, args)
      .then(() => setError(null))
      .catch((e) => setError(String(e)));

  if (!state) return null;

  return (
    <main className="companion">
      <header className="top">
        <span className="logo-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M4 16c3-8 6-8 8 0s5 8 8 0" />
          </svg>
        </span>
        <h1>Fluxion Companion</h1>
        {state.paired && <ConnectionTag connection={state.connection} />}
      </header>
      {!state.platformSupported && (
        <p className="notice warning">Key input only works on Windows and macOS so far. This build can pair and connect, but refuses every action.</p>
      )}
      {state.permissionProblem && (
        <div className="notice warning">
          <p>
            {state.permissionProblem}. Click below, then in System Settings → Privacy &amp; Security → Accessibility turn on
            Fluxion Companion.
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => run("request_permission")}>
              Open Accessibility settings
            </button>
            <button className="btn btn-sm" onClick={() => invoke<Snapshot>("get_state").then(setState)}>
              Check again
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {state.paired ? <Paired state={state} run={run} /> : <PairForm run={run} defaultServer={state.serverUrl} />}
    </main>
  );
}

function ConnectionTag({ connection }: { connection: string }) {
  const hue = connection === "connected" ? "green" : connection === "connecting" ? "amber" : "red";
  return (
    <span className={`tag ${hue} connection`} title={connection}>
      <span className="dot" aria-hidden="true" />
      {connection[0]!.toUpperCase() + connection.slice(1)}
    </span>
  );
}

function PairForm({ run, defaultServer }: { run: Run; defaultServer: string | null }) {
  const [serverUrl, setServerUrl] = useState(defaultServer ?? "http://127.0.0.1:3000");
  const [code, setCode] = useState("");
  const [name, setName] = useState("My PC");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        run("pair", { serverUrl, code, name }).finally(() => setBusy(false));
      }}
    >
      <div>
        <h2>Pair this PC</h2>
        <p className="muted">On the Fluxion dashboard, open Companion and create a pairing code. It shows the server address too.</p>
      </div>
      <label className="field">
        Server address
        <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} required />
      </label>
      <label className="field">
        Pairing code
        <input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} required />
      </label>
      <label className="field">
        Device name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <button className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? "Pairing…" : "Pair"}
      </button>
    </form>
  );
}

function Paired({ state, run }: { state: Snapshot; run: Run }) {
  const [windows, setWindows] = useState<GameWindow[]>([]);
  const refreshWindows = () => invoke<GameWindow[]>("list_windows").then(setWindows);
  useEffect(() => void refreshWindows(), []);

  const connected = state.connection === "connected";

  return (
    <>
      <section className={`tile ${state.paused ? "amber" : "green"} control`} aria-label="Input">
        <div className="tile-title" style={{ color: state.paused ? "var(--amber)" : "var(--green)" }}>
          <span className="dot" aria-hidden="true" />
          {state.paused ? "Input paused" : "Ready to press keys"}
        </div>
        <p className="muted small">
          {state.deviceName} on {state.serverUrl}
        </p>
        <button
          className={`btn btn-lg ${state.paused ? "btn-success" : "btn-danger"}`}
          onClick={() => run("set_paused", { paused: !state.paused })}
        >
          {state.paused ? "Resume input" : "Pause input"}
        </button>
        <p className="muted small">
          Panic hotkey: <kbd className="kbd">{state.panicHotkey}</kbd> pauses instantly and lets go of every held key.
        </p>
        <div className="row">
          {!connected && (
            <button className="btn btn-sm" onClick={() => run("reconnect")}>
              Reconnect
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => run("unpair")}>
            Unpair
          </button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="game-title">
        <div>
          <h2 id="game-title">Game</h2>
          <p className="muted">Keys are only pressed while this program's window is in focus.</p>
        </div>
        {state.profileName && (
          <p className="muted small">
            Dashboard profile: <span className="tag teal">{state.profileName}</span> Switching profiles on the dashboard picks its
            game here when the profile names one.
          </p>
        )}
        {state.profileGame && state.targetProcess !== state.profileGame && (
          <p className="notice warning">
            The {state.profileName} profile is for {state.profileGame}, but this PC is targeting {state.targetProcess ?? "nothing"}.
          </p>
        )}
        <div className="row">
          <select className="input" value={state.targetProcess ?? ""} onChange={(e) => run("set_target", { process: e.target.value || null })}>
            <option value="">Select a game…</option>
            {state.targetProcess && !windows.some((w) => w.process === state.targetProcess) && (
              <option value={state.targetProcess}>{state.targetProcess} (not running)</option>
            )}
            {windows.map((w) => (
              <option key={w.process} value={w.process}>
                {w.process}: {w.title.slice(0, 40)}
              </option>
            ))}
          </select>
          <button className="btn" onClick={refreshWindows}>
            Refresh
          </button>
        </div>
      </section>

      <AllowedKeys state={state} run={run} />

      <TiktokVoices serverUrl={state.serverUrl} />

      <section className="card" aria-labelledby="activity-title">
        <h2 id="activity-title" style={{ marginBottom: 8 }}>
          Activity
        </h2>
        {state.log.length === 0 ? (
          <p className="muted">Keys appear here as chat presses them.</p>
        ) : (
          <ul className="log">
            {state.log.map((entry, i) => (
              <li key={i}>
                <span className={`tag ${entry.ok ? "indigo" : "red"}`}>{entry.ok ? "Pressed" : "Refused"}</span>
                <kbd className="kbd">{keyLabel(entry.key)}</kbd>
                {!entry.ok && <span className="muted small">{entry.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// Signs in to TikTok in a separate window so the server can use TikTok's own voices for text-to-speech.
function TiktokVoices({ serverUrl }: { serverUrl: string | null }) {
  // null until the server answers. `needed` is false while the server's own TikTok account works.
  const [status, setStatus] = useState<{ signedIn: boolean; needed: boolean } | null>(null);
  const signedIn = status?.signedIn ?? false;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // The dashboard can sign out too, so check again whenever this window comes back into focus.
  useEffect(() => {
    const check = () => invoke<{ signedIn: boolean; needed: boolean }>("tiktok_status").then(setStatus, () => {});
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  const signIn = () => {
    setBusy(true);
    setMessage(null);
    invoke<boolean>("tiktok_sign_in")
      .then((done) => {
        if (done) {
          setStatus({ signedIn: true, needed: true });
          setMessage({ ok: true, text: "Signed in to TikTok." });
        }
      })
      .catch((e) => setMessage({ ok: false, text: String(e) }))
      .finally(() => setBusy(false));
  };

  // Nothing to show while the server's account covers TikTok voices (or before the server has answered),
  // unless a message from this sign-in is still on screen.
  if (!status?.needed && !message) return null;

  return (
    <section className="card stack" aria-labelledby="tiktok-title">
      <div>
        <h2 id="tiktok-title">TikTok voices</h2>
        <p className="muted">
          Read chat aloud in TikTok's own voices. Sign in to TikTok here and Fluxion uses your account to make the speech.
        </p>
      </div>
      {message && (
        <div className={`notice ${message.ok ? "info" : "error"}`} role="status">
          {message.text}
          {message.ok && serverUrl && (
            <>
              {" "}
              <a href="#" onClick={(e) => (e.preventDefault(), void openUrl(`${serverUrl}/dashboard/voice`))}>
                Choose a TikTok voice on the dashboard
              </a>
            </>
          )}
        </div>
      )}
      <div className="row">
        {signedIn ? (
          <span className="tag green signed-in">
            <span className="dot" aria-hidden="true" />
            Signed in to TikTok
          </span>
        ) : (
          <button className="btn" disabled={busy} onClick={signIn}>
            {busy ? "Waiting for you to sign in…" : "Sign in to TikTok"}
          </button>
        )}
      </div>
    </section>
  );
}

const WIDE_KEYS = ["Space", "Enter", "ShiftLeft", "ShiftRight"];

// The keys this PC lets the server press. A click allows or blocks one key. Clicking with Shift or Ctrl/Cmd held only
// selects, like a file list: Ctrl/Cmd-click picks single keys, Shift-click everything from the last key clicked to
// this one (in grid order), and Ctrl+Shift-click adds that range to the selection.
function AllowedKeys({ state, run }: { state: Snapshot; run: Run }) {
  const allowed = new Set(state.allowedKeys);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false); // Shift is held: clicks select instead of toggling
  const anchor = useRef<string | null>(null); // the last key clicked: where a Shift-click range starts

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setSelecting(e.shiftKey);
      if (e.type === "keydown" && e.key === "Escape") setSelected(new Set());
    };
    const onBlur = () => setSelecting(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const setAllowed = (keys: string[], allow: boolean) => {
    const next = allow ? [...new Set([...state.allowedKeys, ...keys])] : state.allowedKeys.filter((k) => !keys.includes(k));
    run("set_allowed_keys", { keys: next });
  };
  const select = (e: React.MouseEvent, key: string) => {
    if (e.shiftKey && anchor.current) {
      const from = state.allKeys.indexOf(anchor.current);
      const to = state.allKeys.indexOf(key);
      const range = state.allKeys.slice(Math.min(from, to), Math.max(from, to) + 1);
      return setSelected(new Set([...(e.ctrlKey || e.metaKey ? selected : []), ...range]));
    }
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
    anchor.current = key;
  };
  const withModifier = (e: React.MouseEvent) => e.shiftKey || e.ctrlKey || e.metaKey;
  // Selecting happens on mouse down: a Ctrl-click on a Mac sends a click and a right-click in some webviews and only
  // a right-click in others, but always exactly one mouse down.
  const onMouseDown = (e: React.MouseEvent, key: string) => {
    if (!withModifier(e) || (e.button === 2 && !e.ctrlKey)) return;
    e.preventDefault();
    select(e, key);
  };
  const onClick = (e: React.MouseEvent, key: string) => {
    if (withModifier(e)) {
      if (e.detail === 0) select(e, key); // Shift+Enter or Shift+Space from the keyboard: no mouse down came first
      return;
    }
    anchor.current = key;
    setSelected(new Set());
    setAllowed([key], !allowed.has(key));
  };
  const apply = (allow: boolean) => {
    setAllowed([...selected], allow);
    setSelected(new Set());
  };

  return (
    <section className="card stack" aria-labelledby="keys-title">
      <div>
        <h2 id="keys-title">Allowed keys on this PC</h2>
        <p className="muted">
          The server can only press the keys lit up here. Click a key to allow or block it. To change several at once, select
          them first: Shift-click selects a range from the last key you clicked, Ctrl-click (⌘-click on a Mac) picks single
          keys. Ctrl and Alt are only ever pressed as part of a combination, like Ctrl+E.
        </p>
      </div>
      <div className={`keys ${selecting ? "selecting" : ""}`}>
        {state.allKeys.map((key) => (
          <button
            key={key}
            className={`keycap ${allowed.has(key) ? "on" : ""} ${selected.has(key) ? "selected" : ""} ${WIDE_KEYS.includes(key) ? "wide" : ""}`}
            aria-pressed={allowed.has(key)}
            aria-label={`${keyLabel(key)}${selected.has(key) ? ", selected" : ""}`}
            onMouseDown={(e) => onMouseDown(e, key)}
            onClick={(e) => onClick(e, key)}
            // macOS also sends a Ctrl-click as a right-click; it already selected on mouse down, so just skip the menu.
            onContextMenu={(e) => e.preventDefault()}
          >
            {keyLabel(key)}
          </button>
        ))}
      </div>
      {selected.size > 0 && (
        <div className="selection-bar" role="status">
          <span>
            {selected.size} key{selected.size === 1 ? "" : "s"} selected
          </span>
          <span className="spacer" />
          <button className="btn btn-sm btn-primary" onClick={() => apply(true)}>
            Allow
          </button>
          <button className="btn btn-sm" onClick={() => apply(false)}>
            Block
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}
    </section>
  );
}
