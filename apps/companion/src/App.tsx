import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

export default function App() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<Snapshot>("get_state").then(setState);
    const unlisten = listen<Snapshot>("state", (event) => setState(event.payload));
    return () => void unlisten.then((stop) => stop());
  }, []);

  // Runs a Rust command and shows its error, if any.
  const run = (command: string, args?: Record<string, unknown>) =>
    invoke(command, args)
      .then(() => setError(null))
      .catch((e) => setError(String(e)));

  if (!state) return null;

  return (
    <main>
      <h1>Fluxion Companion</h1>
      {!state.platformSupported && (
        <p className="warning">Key input only works on Windows and macOS so far. This build can pair and connect, but refuses every action.</p>
      )}
      {state.permissionProblem && (
        <div className="warning">
          <p>
            {state.permissionProblem}. Click below, then in System Settings → Privacy &amp; Security → Accessibility turn on
            Fluxion Companion.
          </p>
          <div className="row">
            <button onClick={() => run("request_permission")}>Open Accessibility settings</button>
            <button onClick={() => invoke<Snapshot>("get_state").then(setState)}>Check again</button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {state.paired ? <Paired state={state} run={run} /> : <PairForm run={run} defaultServer={state.serverUrl} />}
    </main>
  );
}

function PairForm({ run, defaultServer }: { run: (c: string, a?: Record<string, unknown>) => Promise<void>; defaultServer: string | null }) {
  const [serverUrl, setServerUrl] = useState(defaultServer ?? "http://127.0.0.1:3000");
  const [code, setCode] = useState("");
  const [name, setName] = useState("My PC");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        run("pair", { serverUrl, code, name }).finally(() => setBusy(false));
      }}
    >
      <h2>Pair this PC</h2>
      <p className="hint">On the Fluxion dashboard, open Companions and create a pairing code.</p>
      <label>
        Server
        <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} required />
      </label>
      <label>
        Pairing code
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} required />
      </label>
      <label>
        Device name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <button disabled={busy}>{busy ? "Pairing…" : "Pair"}</button>
    </form>
  );
}

function Paired({ state, run }: { state: Snapshot; run: (c: string, a?: Record<string, unknown>) => Promise<void> }) {
  const [windows, setWindows] = useState<GameWindow[]>([]);
  const refreshWindows = () => invoke<GameWindow[]>("list_windows").then(setWindows);
  useEffect(() => void refreshWindows(), []);

  const connected = state.connection === "connected";
  const allowed = new Set(state.allowedKeys);
  const toggleKey = (key: string) => {
    const next = allowed.has(key) ? state.allowedKeys.filter((k) => k !== key) : [...state.allowedKeys, key];
    run("set_allowed_keys", { keys: next });
  };

  return (
    <>
      <section className="card">
        <div className="row">
          <span className={`pill ${connected ? "ok" : "bad"}`}>{state.connection}</span>
          <span className="hint">
            {state.deviceName} · {state.serverUrl}
          </span>
        </div>
        <button className={state.paused ? "resume" : "pause"} onClick={() => run("set_paused", { paused: !state.paused })}>
          {state.paused ? "Resume input" : "Pause input"}
        </button>
        <p className="hint">Panic hotkey: {state.panicHotkey} pauses instantly and releases every held key.</p>
        <div className="row">
          {!connected && <button onClick={() => run("reconnect")}>Reconnect</button>}
          <button className="link" onClick={() => run("unpair")}>
            Unpair
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Game</h2>
        <p className="hint">Keys are only pressed while this program's window is focused.</p>
        {state.profileName && (
          <p className="hint">
            Dashboard profile: <strong>{state.profileName}</strong>. Switching profiles on the dashboard picks its game here
            when the profile names one.
          </p>
        )}
        {state.profileGame && state.targetProcess !== state.profileGame && (
          <p className="warning">
            The {state.profileName} profile is for {state.profileGame}, but this PC is targeting {state.targetProcess ?? "nothing"}.
          </p>
        )}
        <div className="row">
          <select value={state.targetProcess ?? ""} onChange={(e) => run("set_target", { process: e.target.value || null })}>
            <option value="">Select a game…</option>
            {state.targetProcess && !windows.some((w) => w.process === state.targetProcess) && (
              <option value={state.targetProcess}>{state.targetProcess} (not running)</option>
            )}
            {windows.map((w) => (
              <option key={w.process} value={w.process}>
                {w.process} · {w.title.slice(0, 40)}
              </option>
            ))}
          </select>
          <button onClick={refreshWindows}>Refresh</button>
        </div>
      </section>

      <section className="card">
        <h2>Allowed keys on this PC</h2>
        <p className="hint">The server can only press keys checked here.</p>
        <div className="keys">
          {state.allKeys.map((key) => (
            <label key={key} className="key">
              <input type="checkbox" checked={allowed.has(key)} onChange={() => toggleKey(key)} />
              {key.replace(/^Key|^Digit/, "")}
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Activity</h2>
        {state.log.length === 0 ? (
          <p className="hint">No actions yet.</p>
        ) : (
          <ul className="log">
            {state.log.map((entry, i) => (
              <li key={i} className={entry.ok ? "ok" : "bad"}>
                {entry.key} {entry.ok ? "pressed" : `refused: ${entry.reason}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
