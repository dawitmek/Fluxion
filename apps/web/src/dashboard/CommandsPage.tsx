import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BLOCKED_COMBOS, MAX_LEVEL, MODES } from '@fluxion/shared';
import { api, type Command, type Host } from '../api';
import { Card, Choices, ErrorNotice, KeyCapture, NumberCell, Switch, useError } from '../ui';
import type { PageProps } from './Dashboard';
import { MODE_INFO } from './modes';

export function CommandsPage({ host, refreshHost }: PageProps) {
  return (
    <div className="stack">
      <CommandsCard host={host} />
      <ModeCard host={host} refreshHost={refreshHost} />
    </div>
  );
}

const emptyCommand = { keyword: '', key: 'KeyA', holdMs: 300, cooldownMs: 1000 };

function CommandsCard({ host }: { host: Host }) {
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
    <Card
      title="Commands"
      description={`For the ${host.profileName} profile. A comment fires a command when it is exactly the keyword, in any capitalization. To set a key, click it and press the key or combination, like Ctrl+Shift+E.`}
    >
      <ErrorNotice error={error} />
      <div className="table-wrap">
        <table className="table">
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
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      aria-label={`${c.keyword} on`}
                      onChange={(e) => update(c.id, { enabled: e.target.checked })}
                    />
                  </label>
                </td>
                <td>
                  <strong>{c.keyword}</strong>
                </td>
                <td>
                  <KeyCapture value={c.key} label={`Key for ${c.keyword}`} onChange={(key) => update(c.id, { key })} />
                </td>
                <td>
                  <NumberCell value={c.holdMs} min={10} max={5000} label="Hold (ms)" onSave={(holdMs) => update(c.id, { holdMs })} />
                </td>
                <td>
                  <NumberCell
                    value={c.cooldownMs}
                    min={0}
                    max={600000}
                    label="Cooldown (ms)"
                    onSave={(cooldownMs) => update(c.id, { cooldownMs })}
                  />
                </td>
                {gated && (
                  <td>
                    <NumberCell value={c.minLevel} min={1} max={MAX_LEVEL} label="Minimum level" onSave={(minLevel) => update(c.id, { minLevel })} />
                  </td>
                )}
                <td className="actions">
                  <button className="btn btn-ghost btn-sm btn-delete" onClick={() => remove(c.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {commands.length === 0 && <p className="empty">No commands yet. Add the first one below.</p>}
      <form className="row add-row" onSubmit={add}>
        <input
          className="input"
          placeholder="keyword, e.g. jump"
          value={draft.keyword}
          onChange={(e) => setDraft({ ...draft, keyword: e.target.value.replace(/\s/g, '') })}
          required
          maxLength={32}
          aria-label="New keyword"
        />
        <KeyCapture value={draft.key} label="Key for the new command" onChange={(key) => setDraft({ ...draft, key })} />
        <button className="btn btn-primary">Add command</button>
      </form>
      <BlockedCombos />
    </Card>
  );
}

// Combinations Fluxion refuses, so hosts know before they try one. The companion refuses them too.
function BlockedCombos() {
  return (
    <details className="blocked-combos">
      <summary>Blocked key combinations</summary>
      <p className="muted small">
        These do something outside the game, so Fluxion never presses them, even with extra modifiers. Win and Cmd are never
        pressed either, so shortcuts like Win+R can't happen. Your browser may act on some of them, like Ctrl+W, before
        Fluxion sees the keys.
      </p>
      <ul>
        {BLOCKED_COMBOS.map((c) => (
          <li key={c.label}>
            <kbd className="kbd">{c.label}</kbd> <span className="muted">{c.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ModeCard({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const { error, guard } = useError();
  const save = (patch: Partial<Host>) => guard(() => api('PATCH', '/settings', patch).then(refreshHost))();

  return (
    <Card
      title="Crowd mode"
      description="Saved with the active profile. You can switch while live; votes and the queue are kept when you change other settings."
    >
      <ErrorNotice error={error} />
      <Choices
        label="Crowd mode"
        value={host.mode}
        options={MODES.map((m) => [m, MODE_INFO[m].label, MODE_INFO[m].help] as const)}
        onChange={(mode) => save({ mode })}
      />
      <div className="form-grid">
        <label className="field">
          Voting window, in seconds
          <span className="hint">Democracy: how long each vote stays open.</span>
          <NumberCell value={host.voteWindowMs / 1000} min={1} max={30} onSave={(s) => save({ voteWindowMs: Math.round(s * 1000) })} />
        </label>
        <label className="field">
          Turn length, in seconds
          <span className="hint">Queue: how long each viewer gets.</span>
          <NumberCell value={host.turnMs / 1000} min={5} max={300} onSave={(s) => save({ turnMs: Math.round(s * 1000) })} />
        </label>
      </div>
      <Switch
        checked={host.giftBoosts}
        onChange={(giftBoosts) => save({ giftBoosts })}
        hint="In democracy a gift adds votes to the gifter's vote; in queue it moves them to the front."
      >
        Gift boosts
      </Switch>
    </Card>
  );
}
