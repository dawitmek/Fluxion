import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ALERT_POSITIONS } from '@fluxion/shared';
import { api, type AlertPosition, type Screen } from '../api';
import { Card, ErrorNotice, NumberCell, Seg, Switch, TextCell, useError } from '../ui';

const POSITION_LABELS: Record<AlertPosition, string> = { top: 'Top', middle: 'Middle', bottom: 'Bottom' };

export function OverlayPage() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [name, setName] = useState('');
  const { error, guard } = useError();
  const load = useCallback(() => api<Screen[]>('GET', '/screens').then(setScreens), []);
  useEffect(() => void load(), [load]);
  const add = (e: FormEvent) => {
    e.preventDefault();
    guard(() => api('POST', '/screens', { name }).then(() => (setName(''), load())))();
  };

  return (
    <div className="stack">
      <Card
        title="Overlay screens"
        description="Add each screen's address as a browser source in TikTok LIVE Studio or OBS. The background is transparent, so size the source to cover your whole canvas. Keep the addresses private."
      >
        <ErrorNotice error={error} />
        <p className="muted small">
          Use more than one screen to put alerts and widgets in different places, like alerts in a corner and the leaderboard on
          another scene. Turn sound on for one screen only, or you'll hear everything twice.
        </p>
        <form className="row add-row" onSubmit={add}>
          <input className="input" placeholder="Screen name, e.g. Alerts corner" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} aria-label="New screen name" />
          <button className="btn btn-primary">Add screen</button>
        </form>
      </Card>
      {screens.map((s) => (
        <ScreenCard key={s.id} screen={s} reload={load} />
      ))}
    </div>
  );
}

function ScreenCard({ screen, reload }: { screen: Screen; reload: () => Promise<unknown> }) {
  const url = `${location.origin}/overlay/${screen.token}`;
  const [copied, setCopied] = useState(false);
  const { error, guard } = useError();
  const save = (patch: Partial<Screen>) => guard(() => api('PATCH', `/screens/${screen.id}`, patch).then(reload))();

  return (
    <Card
      title={screen.name}
      id={`screen-${screen.id}`}
      description={screen.main ? 'Your original overlay address. It shows everything unless you change it.' : undefined}
      actions={
        !screen.main && (
          <button className="btn btn-ghost btn-sm btn-delete" onClick={guard(() => api('DELETE', `/screens/${screen.id}`).then(reload))}>
            Delete
          </button>
        )
      }
    >
      <ErrorNotice error={error} />
      <div className="row">
        <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label={`${screen.name} address`} />
        <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a className="btn" href={url} target="_blank" rel="noreferrer">
          Open preview
        </a>
      </div>
      <div className="form-grid">
        <label className="field">
          Name
          <TextCell value={screen.name} required label="Screen name" onSave={(name) => save({ name })} />
        </label>
        <div className="field">
          Alerts appear at the
          <Seg label="Alert position" value={screen.alertPosition} options={ALERT_POSITIONS.map((p) => [p, POSITION_LABELS[p]] as const)} onChange={(alertPosition) => save({ alertPosition })} />
        </div>
        <label className="field">
          Size, in percent
          <span className="hint">Of everything on this screen. 100 is normal.</span>
          <NumberCell value={screen.scale} min={50} max={200} label="Size" onSave={(scale) => save({ scale })} />
        </label>
      </div>
      <div className="screen-switches">
        <Switch checked={screen.alerts} onChange={(alerts) => save({ alerts })} hint="From your actions, unless an action picks another screen.">
          Alerts
        </Switch>
        <Switch checked={screen.feed} onChange={(feed) => save({ feed })} hint="Who pressed what, level-ups and !points answers.">
          Command feed
        </Switch>
        <Switch checked={screen.leaderboard} onChange={(leaderboard) => save({ leaderboard })}>
          Leaderboard
        </Switch>
        <Switch checked={screen.mode} onChange={(mode) => save({ mode })} hint="Votes, the queue, or the gift-mode banner.">
          Crowd mode panel
        </Switch>
        <Switch checked={screen.audio} onChange={(audio) => save({ audio })} hint="Alert sounds, voices and read-aloud chat.">
          Sound
        </Switch>
      </div>
    </Card>
  );
}
