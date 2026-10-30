import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ALERT_POSITIONS, GOAL_METRICS, MAX_WIDGETS, WIDGET_SPOTS, WIDGET_TYPES, type GoalMetric, type ScreenWidget, type StreamStats, type WidgetSpot, type WidgetType } from '@fluxion/shared';
import { api, type AlertPosition, type Goal, type Screen } from '../api';
import { Card, ErrorNotice, HueIcon, NumberCell, Scrubber, Seg, TextCell, useError, type Hue } from '../ui';
import { Icon, type IconName } from '../icons';
import { DEFAULT_FIREWORK_DIAMONDS, Fireworks, GiftBus, usePreview, Widget, type ChatLine } from '../overlay-widgets';

const POSITION_LABELS: Record<AlertPosition, string> = { top: 'Top', middle: 'Middle', bottom: 'Bottom' };

export function OverlayPage() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [name, setName] = useState('');
  const { error, guard } = useError();
  const [goals, setGoals] = useState<Goal[]>([]);
  const load = useCallback(() => api<Screen[]>('GET', '/screens').then(setScreens), []);
  const loadGoals = useCallback(() => api<Goal[]>('GET', '/goals').then(setGoals), []);
  useEffect(() => void (load(), loadGoals()), [load, loadGoals]);
  const main = screens.find((s) => s.main);
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
        <ScreenCard key={s.id} screen={s} goals={goals} reload={load} />
      ))}
      {main && <WidgetLinksCard main={main} goals={goals} />}
      {/* Deleting a goal also takes its widgets off the screens. */}
      <GoalsCard goals={goals} reload={() => Promise.all([loadGoals(), load()])} />
    </div>
  );
}

// Colored by what they show: gifts amber, followers sky, chat indigo, numbers teal, goals violet.
const WIDGETS: Record<WidgetType, { label: string; help: string; spot: WidgetSpot; icon: IconName; hue: Hue }> = {
  goals: { label: 'Goals', help: 'Progress bars for your goals below.', spot: 'top', icon: 'target', hue: 'violet' },
  top_gift: { label: 'Top gift', help: "The stream's most valuable gift and who sent it.", spot: 'top-right', icon: 'trophy', hue: 'amber' },
  top_streak: { label: 'Longest streak', help: 'The biggest gift combo so far.', spot: 'top-right', icon: 'flame', hue: 'orange' },
  last_follower: { label: 'Latest follower', help: 'Who followed last.', spot: 'bottom-right', icon: 'follower', hue: 'sky' },
  last_gifter: { label: 'Latest gift', help: 'Who sent the last gift, and what.', spot: 'bottom-right', icon: 'gift', hue: 'amber' },
  stats: { label: 'Stream stats', help: 'Viewers, likes, follows and diamonds this stream.', spot: 'top', icon: 'analytics', hue: 'teal' },
  chat: { label: 'Chat', help: 'The last few chat messages.', spot: 'bottom-right', icon: 'chat', hue: 'indigo' },
  coin_jar: { label: 'Coin jar', help: 'Gifts drop coins into a jar that fills toward a diamond target.', spot: 'bottom-right', icon: 'coin', hue: 'amber' },
  firework: { label: 'Gift fireworks', help: 'Fireworks across the screen for big gifts.', spot: 'top', icon: 'sparkle', hue: 'pink' },
};
const SPOT_LABELS: Record<WidgetSpot, string> = {
  'top-left': 'Top left',
  top: 'Top',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  bottom: 'Bottom',
  'bottom-right': 'Bottom right',
};

// A tiny map of the screen with the widget's spot lit; every spot for one that covers the whole screen.
function SpotMap({ spot, hue }: { spot: WidgetSpot | null; hue: Hue }) {
  return (
    <span className={`spot-map ${hue}`} aria-hidden="true">
      {WIDGET_SPOTS.map((s) => (
        <span key={s} className={spot === null || spot === s ? 'lit' : ''} />
      ))}
    </span>
  );
}

// A widget's name and look. A goal's own widget is named after the goal and drawn like what it counts.
function widgetInfo(w: Pick<ScreenWidget, 'type' | 'goalId'>, goals: Goal[]) {
  if (!w.goalId) return WIDGETS[w.type];
  const goal = goals.find((g) => g.id === w.goalId);
  return { ...WIDGETS.goals, label: goal?.name ?? 'Goal', help: "Just this goal's progress bar.", ...(goal && METRIC_ICONS[goal.metric]) };
}
// Each widget once per screen: a type, or one goal's own.
const widgetKey = (w: Pick<ScreenWidget, 'type' | 'goalId'>) => (w.goalId ? `goal:${w.goalId}` : w.type);

function WidgetsEditor({ widgets, goals, onSave }: { widgets: ScreenWidget[]; goals: Goal[]; onSave: (widgets: ScreenWidget[]) => void }) {
  const [previewing, setPreviewing] = useState<string | null>(null);
  const change = (i: number, patch: Partial<ScreenWidget>) => onSave(widgets.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const used = new Set(widgets.map(widgetKey));
  const types = WIDGET_TYPES.filter((t) => !used.has(t));
  const ownGoals = goals.filter((g) => !used.has(`goal:${g.id}`));
  const options: WidgetChoice[] = [...types.map((type) => ({ type })), ...ownGoals.map((g) => ({ type: 'goals' as const, goalId: g.id }))];
  const add = (w: WidgetChoice) => onSave([...widgets, { ...w, spot: w.goalId ? 'top' : WIDGETS[w.type].spot }]);

  return (
    <div className="stack">
      <h3>
        Widgets {widgets.length > 0 && <span className="tag">{widgets.length}</span>}
      </h3>
      {widgets.length === 0 ? (
        <p className="muted small">None yet. They show while you're live or in test mode, in the spot you pick. Widgets in the same spot stack.</p>
      ) : (
        <ul className="list">
          {widgets.map((w, i) => {
            const info = widgetInfo(w, goals);
            const key = widgetKey(w);
            return (
              <li key={key}>
                <HueIcon name={info.icon} hue={info.hue} />
                <span className="widget-name">
                  <strong>{info.label}</strong>
                  <span className="muted small">{info.help}</span>
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
                <SpotMap spot={w.type === 'firework' ? null : w.spot} hue={info.hue} />
                {w.type !== 'firework' && (
                  <select className="input widget-spot" value={w.spot} aria-label={`Where ${info.label} goes`} onChange={(e) => change(i, { spot: e.target.value as WidgetSpot })}>
                    {WIDGET_SPOTS.map((s) => (
                      <option key={s} value={s}>
                        {SPOT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="btn btn-sm btn-try btn-icon"
                  aria-expanded={previewing === key}
                  aria-label={`${previewing === key ? 'Hide preview of' : 'Preview'} ${info.label}`}
                  title={previewing === key ? 'Hide preview' : 'Preview'}
                  onClick={() => setPreviewing(previewing === key ? null : key)}
                >
                  <Icon name={previewing === key ? 'eyeOff' : 'eye'} />
                </button>
                <button className="btn btn-ghost btn-sm btn-delete" onClick={() => onSave(widgets.filter((_, j) => j !== i))}>
                  Remove
                </button>
                {previewing === key && <WidgetPreview widget={w} />}
              </li>
            );
          })}
        </ul>
      )}
      {options.length > 0 && widgets.length < MAX_WIDGETS && <WidgetPicker options={options} goals={goals} onAdd={add} />}
    </div>
  );
}

// Every widget, and every goal on its own, as a browser source of its own: for a stream that wants just the chat, say.
function WidgetLinksCard({ main, goals }: { main: Screen; goals: Goal[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const link = (w: Pick<ScreenWidget, 'type' | 'goalId'>) =>
    `${location.origin}/overlay/${main.token}?widget=${w.type}${w.goalId ? `&goal=${w.goalId}` : ''}`;
  const all: WidgetChoice[] = [...WIDGET_TYPES.map((type) => ({ type })), ...goals.map((g) => ({ type: 'goals' as const, goalId: g.id }))];
  return (
    <Card
      title="Widget links"
      description="Each widget on its own, as a browser source of its own, without a whole screen. Size and the coin jar and fireworks amounts follow your Main screen. Keep the links private."
    >
      <ul className="list">
        {all.map((w) => {
          const info = widgetInfo(w, goals);
          const key = widgetKey(w);
          return (
            <li key={key}>
              <HueIcon name={info.icon} hue={info.hue} />
              <span className="widget-name">
                <strong>{w.type === 'goals' && !w.goalId ? 'Goals (all of them)' : info.label}</strong>
                <span className="muted small">{info.help}</span>
              </span>
              <span className="spacer" />
              <button
                className="btn btn-sm btn-try btn-icon"
                aria-expanded={previewing === key}
                aria-label={`${previewing === key ? 'Hide preview of' : 'Preview'} ${info.label}`}
                title={previewing === key ? 'Hide preview' : 'Preview'}
                onClick={() => setPreviewing(previewing === key ? null : key)}
              >
                <Icon name={previewing === key ? 'eyeOff' : 'eye'} />
              </button>
              <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(link(w)).then(() => setCopied(key))}>
                {copied === key ? 'Copied' : 'Copy link'}
              </button>
              {/* With the Main screen's settings for it, as the link uses them. */}
              {previewing === key && <WidgetPreview widget={{ ...main.widgets.find((m) => widgetKey(m) === key), ...w, spot: 'top-left' }} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

type WidgetChoice = Pick<ScreenWidget, 'type' | 'goalId'>;
type PreviewFeed = { stats: StreamStats | null; chat: ChatLine[]; bus: GiftBus };

// The widget as it looks on stream, over a stand-in for the stream, fed sample viewers and gifts.
function PreviewStage({ widget, feed, compact }: { widget: ScreenWidget; feed: PreviewFeed; compact?: boolean }) {
  const goals = widget.goalId ? feed.stats?.goals.filter((g) => g.id === widget.goalId) : feed.stats?.goals;
  return (
    <div className={`widget-stage ${compact ? 'compact' : ''}`}>
      {widget.type === 'firework' ? (
        <Fireworks min={widget.minDiamonds ?? DEFAULT_FIREWORK_DIAMONDS} bus={feed.bus} />
      ) : (
        <Widget widget={widget} stats={feed.stats} chat={feed.chat} bus={feed.bus} />
      )}
      {widget.type === 'goals' && goals?.length === 0 && <p className="widget-stage-empty">Add a goal in the Goals card to see it here.</p>}
      {widget.type === 'firework' && compact && <p className="widget-stage-empty">For gifts worth {DEFAULT_FIREWORK_DIAMONDS}+ diamonds</p>}
      {!compact && (
        <span className="widget-stage-note">
          {widget.type === 'firework'
            ? `Sample gifts of up to 1,500 diamonds. Only those worth ${(widget.minDiamonds ?? DEFAULT_FIREWORK_DIAMONDS).toLocaleString()} or more set off fireworks.`
            : 'Sample viewers and gifts'}
        </span>
      )}
    </div>
  );
}

function WidgetPreview({ widget }: { widget: ScreenWidget }) {
  const [bus] = useState(() => new GiftBus());
  const { stats, chat } = usePreview(true, bus);
  return <PreviewStage widget={widget} feed={{ stats, chat, bus }} />;
}

// Adding a widget: every one you can add, two to a row, each showing itself. One sample feed drives them all.
function WidgetPicker({ options, goals, onAdd }: { options: WidgetChoice[]; goals: Goal[]; onAdd: (w: WidgetChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [bus] = useState(() => new GiftBus());
  const { stats, chat } = usePreview(open, bus);
  return (
    <div className="stack">
      <button className="btn picker-toggle" aria-expanded={open} aria-controls="widget-picker" onClick={() => setOpen(!open)}>
        <Icon name="chevron" />
        Add a widget
      </button>
      {open && (
        <div id="widget-picker" className="stack">
          <p className="muted small">Previews use sample viewers and gifts.</p>
          <div className="widget-picker">
            {options.map((w) => {
              const info = widgetInfo(w, goals);
              return (
                <div key={widgetKey(w)} className="picker-card">
                  <div className="picker-head">
                    <HueIcon name={info.icon} hue={info.hue} />
                    <span className="widget-name">
                      <strong>{w.type === 'goals' && !w.goalId ? 'Goals (all of them)' : info.label}</strong>
                      <span className="muted small">{info.help}</span>
                    </span>
                    <button className="btn btn-sm btn-primary" onClick={() => onAdd(w)} aria-label={`Add ${info.label}`}>
                      Add
                    </button>
                  </div>
                  <PreviewStage widget={{ ...w, spot: 'top' }} feed={{ stats, chat, bus }} compact />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const METRIC_LABELS: Record<GoalMetric, string> = { likes: 'Likes', follows: 'Follows', shares: 'Shares', diamonds: 'Diamonds', subscriptions: 'Subscriptions' };
const METRIC_ICONS: Record<GoalMetric, { icon: IconName; hue: Hue }> = {
  likes: { icon: 'heart', hue: 'pink' },
  follows: { icon: 'follower', hue: 'sky' },
  shares: { icon: 'share', hue: 'green' },
  diamonds: { icon: 'diamond', hue: 'amber' },
  subscriptions: { icon: 'star', hue: 'violet' },
};

function GoalsCard({ goals, reload: load }: { goals: Goal[]; reload: () => Promise<unknown> }) {
  const [draft, setDraft] = useState<{ name: string; metric: GoalMetric; target: number }>({ name: '', metric: 'likes', target: 1000 });
  const { error, guard } = useError();
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
                    <span className="with-icon">
                      <HueIcon name={METRIC_ICONS[g.metric].icon} hue={METRIC_ICONS[g.metric].hue} size="sm" />
                      <select className="input" value={g.metric} aria-label="What it counts" onChange={(e) => update(g.id, { metric: e.target.value as GoalMetric })}>
                        {GOAL_METRICS.map((m) => (
                          <option key={m} value={m}>
                            {METRIC_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    </span>
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

function ScreenCard({ screen, goals, reload }: { screen: Screen; goals: Goal[]; reload: () => Promise<unknown> }) {
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
        <a className="btn btn-try" href={`${url}?preview`} target="_blank" rel="noreferrer" title="Shows your widgets and goals with sample numbers until you go live">
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
        <div className="field">
          Size
          <span className="hint">Of everything on this screen. 100% is normal.</span>
          <Scrubber value={screen.scale} min={50} max={200} buttonStep={5} unit="%" label="Size" onSave={(scale) => save({ scale })} />
        </div>
      </div>
      <div className="screen-switches">
        {SCREEN_PARTS.map((part) => (
          <PartToggle key={part.part} {...part} checked={screen[part.part]} onChange={(on) => save({ [part.part]: on })} />
        ))}
      </div>
      <WidgetsEditor widgets={screen.widgets} goals={goals} onSave={(widgets) => save({ widgets })} />
    </Card>
  );
}

// What a screen shows, each in the color of the dashboard page it comes from (Actions pink, Commands indigo, and so on).
const SCREEN_PARTS: { part: 'alerts' | 'feed' | 'leaderboard' | 'mode' | 'audio'; label: string; hint?: string; icon: IconName; hue: Hue }[] = [
  { part: 'alerts', label: 'Alerts', hint: 'From your actions, unless an action picks another screen.', icon: 'bell', hue: 'pink' },
  { part: 'feed', label: 'Command feed', hint: 'Who pressed what, level-ups and !points answers.', icon: 'feed', hue: 'indigo' },
  { part: 'leaderboard', label: 'Leaderboard', hint: 'The top players, by level or commands.', icon: 'leaderboard', hue: 'sky' },
  { part: 'mode', label: 'Crowd mode panel', hint: 'Votes, the queue, or the gift-mode banner.', icon: 'crowd', hue: 'teal' },
  { part: 'audio', label: 'Sound', hint: 'Alert sounds, voices and read-aloud chat.', icon: 'voice', hue: 'violet' },
];

function PartToggle({ label, hint, icon, hue, checked, onChange }: (typeof SCREEN_PARTS)[number] & { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={`part-toggle ${hue} ${checked ? 'on' : ''}`}>
      <HueIcon name={icon} hue={hue} />
      <span className="part-toggle-text">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </span>
    </label>
  );
}
