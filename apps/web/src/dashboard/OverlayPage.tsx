import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ALERT_POSITIONS, GOAL_METRICS, MAX_WIDGETS, WIDGET_SPOTS, WIDGET_TYPES, type GoalMetric, type ScreenWidget, type WidgetSpot, type WidgetType } from '@fluxion/shared';
import { api, type AlertPosition, type Goal, type Screen } from '../api';
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
      <GoalsCard />
    </div>
  );
}

const WIDGETS: Record<WidgetType, { label: string; help: string; spot: WidgetSpot }> = {
  goals: { label: 'Goals', help: 'Progress bars for your goals below.', spot: 'top' },
  top_gift: { label: 'Top gift', help: "The stream's most valuable gift and who sent it.", spot: 'top-right' },
  top_streak: { label: 'Longest streak', help: 'The biggest gift combo so far.', spot: 'top-right' },
  last_follower: { label: 'Latest follower', help: 'Who followed last.', spot: 'bottom-right' },
  last_gifter: { label: 'Latest gift', help: 'Who sent the last gift, and what.', spot: 'bottom-right' },
  stats: { label: 'Stream stats', help: 'Viewers, likes, follows and diamonds this stream.', spot: 'top' },
  chat: { label: 'Chat', help: 'The last few chat messages.', spot: 'bottom-right' },
  coin_jar: { label: 'Coin jar', help: 'Gifts drop coins into a jar that fills toward a diamond target.', spot: 'bottom-right' },
  firework: { label: 'Gift fireworks', help: 'Fireworks across the screen for big gifts.', spot: 'top' },
};
const SPOT_LABELS: Record<WidgetSpot, string> = {
  'top-left': 'Top left',
  top: 'Top',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  bottom: 'Bottom',
  'bottom-right': 'Bottom right',
};

function WidgetsEditor({ widgets, onSave }: { widgets: ScreenWidget[]; onSave: (widgets: ScreenWidget[]) => void }) {
  const [type, setType] = useState<WidgetType>('goals');
  const change = (i: number, patch: Partial<ScreenWidget>) => onSave(widgets.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const used = new Set(widgets.map((w) => w.type));
  const available = WIDGET_TYPES.filter((t) => !used.has(t));
  const adding = available.includes(type) ? type : available[0];

  return (
    <div className="stack">
      <h3>Widgets</h3>
      {widgets.length === 0 ? (
        <p className="muted small">None yet. They show while you're live or in test mode, in the spot you pick. Widgets in the same spot stack.</p>
      ) : (
        <ul className="list">
          {widgets.map((w, i) => (
            <li key={w.type}>
              <span className="widget-name">
                <strong>{WIDGETS[w.type].label}</strong>
                <span className="muted small">{WIDGETS[w.type].help}</span>
              </span>
              <span className="spacer" />
              {w.type === 'firework' || w.type === 'coin_jar' ? (
                <label className="row" style={{ flexWrap: 'nowrap' }}>
                  <span className="muted small">{w.type === 'firework' ? 'From' : 'Full at'}</span>
                  <NumberCell
                    value={w.minDiamonds ?? (w.type === 'firework' ? 100 : 1000)}
                    min={1}
                    max={10_000_000}
                    label={w.type === 'firework' ? 'Fireworks for gifts worth at least, in diamonds' : 'Diamonds that fill the jar'}
                    onSave={(minDiamonds) => change(i, { minDiamonds })}
                  />
                  <span className="muted small">diamonds</span>
                </label>
              ) : null}
              {w.type !== 'firework' && (
                <select className="input widget-spot" value={w.spot} aria-label={`Where ${WIDGETS[w.type].label} goes`} onChange={(e) => change(i, { spot: e.target.value as WidgetSpot })}>
                  {WIDGET_SPOTS.map((s) => (
                    <option key={s} value={s}>
                      {SPOT_LABELS[s]}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn btn-ghost btn-sm btn-delete" onClick={() => onSave(widgets.filter((_, j) => j !== i))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && widgets.length < MAX_WIDGETS && (
        <div className="row add-row">
          <select className="input" value={adding} onChange={(e) => setType(e.target.value as WidgetType)} aria-label="Widget to add">
            {available.map((t) => (
              <option key={t} value={t}>
                {WIDGETS[t].label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => onSave([...widgets, { type: adding, spot: WIDGETS[adding].spot }])}>
            Add widget
          </button>
        </div>
      )}
    </div>
  );
}

const METRIC_LABELS: Record<GoalMetric, string> = { likes: 'Likes', follows: 'Follows', shares: 'Shares', diamonds: 'Diamonds', subscriptions: 'Subscriptions' };

function GoalsCard() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [draft, setDraft] = useState<{ name: string; metric: GoalMetric; target: number }>({ name: '', metric: 'likes', target: 1000 });
  const { error, guard } = useError();
  const load = useCallback(() => api<Goal[]>('GET', '/goals').then(setGoals), []);
  useEffect(() => void load(), [load]);
  const update = (id: string, patch: Partial<Goal>) => guard(() => api('PATCH', `/goals/${id}`, patch).then(load))();
  const add = (e: FormEvent) => {
    e.preventDefault();
    guard(() => api('POST', '/goals', { ...draft, name: draft.name || `${METRIC_LABELS[draft.metric]} goal` }).then(() => (setDraft({ ...draft, name: '' }), load())))();
  };

  return (
    <Card
      title="Goals"
      description="Targets for each stream, counted from when you go live. Show them with the Goals widget, and use the Actions page's “Reaches a goal” trigger to celebrate."
    >
      <ErrorNotice error={error} />
      {goals.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>On</th>
                <th>Name</th>
                <th>Counts</th>
                <th>Target</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {goals.map((g) => (
                <tr key={g.id}>
                  <td>
                    <label className="switch">
                      <input type="checkbox" checked={g.enabled} aria-label={`${g.name} on`} onChange={(e) => update(g.id, { enabled: e.target.checked })} />
                    </label>
                  </td>
                  <td>
                    <TextCell value={g.name} required label="Goal name" onSave={(name) => update(g.id, { name })} />
                  </td>
                  <td>
                    <select className="input" value={g.metric} aria-label="What it counts" onChange={(e) => update(g.id, { metric: e.target.value as GoalMetric })}>
                      {GOAL_METRICS.map((m) => (
                        <option key={m} value={m}>
                          {METRIC_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <NumberCell value={g.target} min={1} max={100_000_000} label="Target" onSave={(target) => update(g.id, { target })} />
                  </td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm btn-delete" onClick={guard(() => api('DELETE', `/goals/${g.id}`).then(load))}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="row add-row" onSubmit={add}>
        <input className="input" placeholder="Goal name, e.g. Like goal" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="New goal name" />
        <select className="input" value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value as GoalMetric })} aria-label="What the new goal counts">
          {GOAL_METRICS.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>
        <input
          className="input short"
          type="number"
          min={1}
          value={draft.target}
          onChange={(e) => setDraft({ ...draft, target: Number(e.target.value) })}
          aria-label="New goal target"
        />
        <button className="btn btn-primary">Add goal</button>
      </form>
    </Card>
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
        <a className="btn" href={`${url}?preview`} target="_blank" rel="noreferrer" title="Shows your widgets and goals with sample numbers until you go live">
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
      <WidgetsEditor widgets={screen.widgets} onSave={(widgets) => save({ widgets })} />
    </Card>
  );
}
