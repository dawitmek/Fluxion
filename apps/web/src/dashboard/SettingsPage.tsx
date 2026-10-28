import { useState } from 'react';
import { api } from '../api';
import { navigate } from '../router';
import { Card, ErrorNotice, useError } from '../ui';
import type { PageProps } from './Dashboard';

export function SettingsPage({ host, refreshHost }: PageProps) {
  const [username, setUsername] = useState(host.tiktokUsername ?? '');
  const [rate, setRate] = useState(host.actionsPerSecond);
  const [saved, setSaved] = useState(false);
  const { error, guard } = useError();
  const save = guard(() =>
    api('PATCH', '/settings', { tiktokUsername: username.trim() || null, actionsPerSecond: rate })
      .then(refreshHost)
      .then(() => setSaved(true)),
  );

  return (
    <div className="stack">
      <Card title="Stream" description="You must already be live on TikTok before Fluxion can connect to your stream.">
        <ErrorNotice error={error} />
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="form-grid">
            <label className="field">
              TikTok username
              <input value={username} onChange={(e) => (setUsername(e.target.value), setSaved(false))} placeholder="@yourname" />
            </label>
            <label className="field">
              Max key presses per second
              <span className="hint">Across all of chat, so a busy stream can't flood your game.</span>
              <input type="number" min={1} max={50} value={rate} onChange={(e) => (setRate(Number(e.target.value)), setSaved(false))} />
            </label>
          </div>
          <div className="row">
            <button className="btn btn-primary">Save</button>
            {saved && <span className="muted">Saved</span>}
          </div>
        </form>
      </Card>
      <Card title="Account" description={`Signed in as ${host.email}.`}>
        <div className="row">
          <button className="btn" onClick={() => api('POST', '/auth/logout').then(() => navigate('/'))}>
            Log out
          </button>
        </div>
      </Card>
    </div>
  );
}
