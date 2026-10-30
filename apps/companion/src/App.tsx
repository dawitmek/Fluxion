import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@fluxion/theme/theme.css";
import "./App.css";
import { Icon, SectionHead } from "./icons";

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
  commands: CommandView[];
  pendingApprovals: number;
}

interface CommandView {
  keyword: string;
  key: string;
  label: string;
  enabled: boolean;
  combo: boolean;
  approved: boolean;
  problem: string | null;
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
          <Icon name="logo" strokeWidth={2.4} />
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
  // Suggest the PC's own name, unless the host has already typed one.
  useEffect(() => {
    invoke<string | null>("device_name").then((pc) => pc && setName((current) => (current === "My PC" ? pc : current)));
  }, []);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card pair stack"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        run("pair", { serverUrl, code, name }).finally(() => setBusy(false));
      }}
    >
      <div className="pair-intro">
        <h2>Pair this PC</h2>
        <p className="muted">Once paired, chat's commands on your stream press keys in your game, on this PC only.</p>
      </div>
      <ol className="pair-steps">
        <li>Open Companion on the Fluxion dashboard.</li>
        <li>Create a pairing code. The server address is shown with it.</li>
        <li>Enter both here.</li>
      </ol>
      <label className="field">
        Pairing code
        <input
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="••••••"
          autoFocus
          required
        />
      </label>
      <div className="pair-fields">
        <label className="field">
          Server address
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} required />
        </label>
        <label className="field">
          Device name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
      </div>
      <button className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? "Pairing…" : "Pair this PC"}
      </button>
    </form>
  );
}

function Paired({ state, run }: { state: Snapshot; run: Run }) {
  const [windows, setWindows] = useState<GameWindow[]>([]);
  const refreshWindows = () => invoke<GameWindow[]>("list_windows").then(setWindows);
  useEffect(() => void refreshWindows(), []);

  const connected = state.connection === "connected";
  // One state for the whole PC, most pressing first: nothing arrives while disconnected, nothing is pressed while
  // paused or with no game picked.
  const status = !connected
    ? { hue: "red", title: state.connection === "connecting" ? "Connecting" : "Offline", text: "Not connected to the server, so chat's keys can't reach this PC." }
    : state.paused
      ? { hue: "amber", title: "Paused", text: "Nothing is pressed until you resume." }
      : !state.targetProcess
        ? { hue: "amber", title: "Pick a game", text: "Nothing is pressed until you pick the game chat plays." }
        : { hue: "green", title: "Ready", text: `Chat's keys go to ${state.targetProcess} while its window is in focus.` };

  return (
    <>
      <section className={`hero ${status.hue}`} aria-label="Input">
        <div className="hero-main">
          <span className={`orb ${status.hue === "green" ? "live" : ""}`} aria-hidden="true">
            <span />
          </span>
          <div className="hero-text">
            <h2 className="hero-state">{status.title}</h2>
            <p className="muted small">{status.text}</p>
          </div>
          {connected ? (
            <button
              className={`btn hero-toggle ${state.paused ? "btn-success" : "btn-danger"}`}
              onClick={() => run("set_paused", { paused: !state.paused })}
            >
              <Icon name={state.paused ? "play" : "pause"} />
              {state.paused ? "Resume" : "Pause"}
            </button>
          ) : (
            <button className="btn hero-toggle" onClick={() => run("reconnect")}>
              <Icon name="refresh" />
              Reconnect
            </button>
          )}
        </div>

        <div className="hero-game">
          <label className="field">
            <span className="hero-label">
              Game
              {state.profileName && (
                <span className="tag teal" title="Switching profiles on the dashboard picks its game here when the profile names one.">
                  {state.profileName} profile
                </span>
              )}
            </span>
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
              <button className="btn btn-icon" onClick={refreshWindows} aria-label="Refresh the list of windows" title="Refresh the list of windows">
                <Icon name="refresh" />
              </button>
            </div>
          </label>
          {state.profileGame && state.targetProcess !== state.profileGame && (
            <p className="notice warning">
              The {state.profileName} profile is for {state.profileGame}, but this PC is targeting {state.targetProcess ?? "nothing"}.
            </p>
          )}
        </div>

        <footer className="hero-foot">
          <span className="panic">
            <Icon name="shield" size={14} />
            <kbd className="kbd">{state.panicHotkey}</kbd> pauses instantly and lets go of every held key
          </span>
          <span className="device" title={`${state.deviceName} on ${state.serverUrl}`}>
            {state.deviceName} on {state.serverUrl}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => run("unpair")}>
            Unpair
          </button>
        </footer>
      </section>

      {state.pendingApprovals > 0 && (
        <p className="notice warning">
          {state.pendingApprovals} key combination{state.pendingApprovals === 1 ? " needs" : "s need"} your OK before this PC
          will press {state.pendingApprovals === 1 ? "it" : "them"}. See Commands below.
        </p>
      )}

      <AllowedKeys state={state} run={run} />

      <Commands state={state} run={run} />

      <TiktokVoices serverUrl={state.serverUrl} />

      <section className="card stack" aria-labelledby="activity-title">
        <SectionHead id="activity-title" icon="feed" hue="sky" title="Activity">
          The latest keys chat pressed on this PC, and any it refused.
        </SectionHead>
        {state.log.length === 0 ? (
          <p className="empty">Keys appear here as chat presses them.</p>
        ) : (
          <ul className="log">
            {state.log.map((entry, i) => (
              <li key={i} className={entry.ok ? "ok" : "refused"}>
                <span className="log-mark" aria-label={entry.ok ? "Pressed" : "Refused"}>
                  <Icon name={entry.ok ? "check" : "close"} size={13} strokeWidth={2.6} />
                </span>
                <kbd className="kbd">{keyLabel(entry.key)}</kbd>
                <span className="muted small">{entry.ok ? "Pressed" : entry.reason}</span>
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
      <SectionHead id="tiktok-title" icon="voice" hue="pink" title="TikTok voices">
        Read chat aloud in TikTok's own voices. Sign in to TikTok here and Fluxion uses your account to make the speech.
      </SectionHead>
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

// Where each key sits on the keyboard drawn under Allowed keys: [code, row, first column, columns wide], on a grid of
// half-key columns so rows can be staggered like a real keyboard. Keys not placed here go in a row of their own below.
const row = (codes: string[], rowNumber: number, firstColumn: number): [string, number, number, number][] =>
  codes.map((code, i) => [code, rowNumber, firstColumn + i * 2, 2]);
const KEYBOARD: [string, number, number, number][] = [
  ...row(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => `Digit${d}`), 1, 1),
  ...row([..."QWERTYUIOP"].map((l) => `Key${l}`), 2, 2),
  ...row([..."ASDFGHJKL"].map((l) => `Key${l}`), 3, 3),
  ["Enter", 3, 21, 3],
  ["ShiftLeft", 4, 1, 2],
  ...row([..."ZXCVBNM"].map((l) => `Key${l}`), 4, 3),
  ["ShiftRight", 4, 17, 2],
  ["ArrowUp", 4, 19, 2],
  ["Space", 5, 5, 10],
  ...row(["ArrowLeft", "ArrowDown", "ArrowRight"], 5, 17),
];
// Shorter names where a key is narrow; the full name is its label for screen readers and its tooltip.
const CAP_NAMES: Record<string, string> = { ShiftLeft: "⇧", ShiftRight: "⇧", Enter: "Enter ↵" };

// The keys this PC lets the server press. A click allows or blocks one key. Clicking with Shift or Ctrl/Cmd held only
// selects, like a file list: Ctrl/Cmd-click picks single keys, Shift-click everything from the last key clicked to
// this one (in grid order), and Ctrl+Shift-click adds that range to the selection.
function AllowedKeys({ state, run }: { state: Snapshot; run: Run }) {
  const allowed = new Set(state.allowedKeys);
  // Keys in reading order of the drawn keyboard, which is the order a Shift-click range follows.
  const placed = KEYBOARD.filter(([code]) => state.allKeys.includes(code)).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  const order = [...placed.map(([code]) => code), ...state.allKeys.filter((k) => !KEYBOARD.some(([code]) => code === k))];
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
      const from = order.indexOf(anchor.current);
      const to = order.indexOf(key);
      const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
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
      <SectionHead id="keys-title" icon="commands" hue="indigo" title="Allowed keys on this PC">
        The server can only press the keys lit up here. Click a key to allow or block it. Key combinations like Ctrl+E are
        allowed one by one under Commands.
      </SectionHead>
      <div className={`keys ${selecting ? "selecting" : ""}`}>
        {order.map((key, i) => {
          // Keys not on the drawn keyboard fill the rows after it, eleven to a row.
          const extra = i - placed.length;
          const place = placed.find(([code]) => code === key) ?? [key, 6 + Math.floor(extra / 11), 1 + (extra % 11) * 2, 2];
          return (
            <button
              key={key}
              className={`keycap ${allowed.has(key) ? "on" : ""} ${selected.has(key) ? "selected" : ""}`}
              style={{ gridRow: place[1], gridColumn: `${place[2]} / span ${place[3]}` }}
              aria-pressed={allowed.has(key)}
              aria-label={`${keyLabel(key)}${selected.has(key) ? ", selected" : ""}`}
              title={keyLabel(key)}
              onMouseDown={(e) => onMouseDown(e, key)}
              onClick={(e) => onClick(e, key)}
              // macOS also sends a Ctrl-click as a right-click; it already selected on mouse down, so just skip the menu.
              onContextMenu={(e) => e.preventDefault()}
            >
              {CAP_NAMES[key] ?? keyLabel(key)}
            </button>
          );
        })}
      </div>
      <p className="muted small keys-legend">
        <span className="legend-cap on" aria-hidden="true" /> Allowed
        <span className="legend-cap" aria-hidden="true" /> Blocked
        <span className="spacer" />
        Shift-click selects a range, Ctrl-click (⌘ on a Mac) single keys.
      </p>
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

// The dashboard's commands for the active profile, and whether this PC will press each one. Single keys follow the
// allowed-keys grid; each key combination needs its own OK here, which the server can't give.
function Commands({ state, run }: { state: Snapshot; run: Run }) {
  if (state.commands.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby="commands-title">
      <SectionHead id="commands-title" icon="chat" hue="violet" title={`Commands${state.profileName ? ` for ${state.profileName}` : ""}`}>
        What chat can trigger, from your dashboard. Key combinations are only pressed once you allow them here, so a change
        on the dashboard can't add one without your OK.
      </SectionHead>
      <ul className="command-list">
        {state.commands.map((c) => (
          <li key={c.keyword} className={c.enabled ? "" : "off"}>
            <strong className="command-word">{c.keyword}</strong>
            <span className="command-keys">
              {c.label.split("+").map((part, i) => (
                <span key={i}>
                  {i > 0 && <span className="plus">+</span>}
                  <kbd className="kbd">{part}</kbd>
                </span>
              ))}
            </span>
            <span className="command-status">
              {!c.enabled ? (
                <span className="muted small">Off on the dashboard</span>
              ) : c.problem ? (
                <span className="tag red" title={c.problem}>
                  {c.problem}
                </span>
              ) : c.combo ? (
                <label className="approve">
                  <span className={`small ${c.approved ? "" : "muted"}`}>{c.approved ? "Allowed" : "Needs your OK"}</span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={c.approved}
                      aria-label={`Allow ${c.label} for ${c.keyword}`}
                      onChange={(e) => run("set_combo_approved", { key: c.key, approved: e.target.checked })}
                    />
                  </span>
                </label>
              ) : (
                <span className="tag green">Will press</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
