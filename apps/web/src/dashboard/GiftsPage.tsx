import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ALERT_EVENTS, ALERT_SOUNDS } from '@fluxion/shared';
import { api, type AlertEvent, type AlertRule, type AlertSound, type Command, type GiftTrigger } from '../api';
import { playSound } from '../sounds';
import { Card, ErrorNotice, NumberCell, TextCell, useError } from '../ui';
import { previewAudio } from './audio';

export function GiftsPage() {
  return (
    <div className="stack">
      <GiftTriggersCard />
      <AlertsCard />
    </div>
  );
}

function GiftTriggersCard() {
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
    <Card
      title="Gift triggers"
      description="When a viewer sends this gift, its command is pressed, in every mode. A streak of N gifts presses it N times (up to 10). Use the gift's name as TikTok shows it, e.g. Rose."
    >
      <ErrorNotice error={error} />
      {triggers.length > 0 && (
        <ul className="list">
          {triggers.map((t) => (
            <li key={t.id}>
              <span className="tag pink">{t.giftName}</span>
              <span className="muted">presses</span>
              <strong>{t.keyword}</strong>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm btn-delete" onClick={guard(() => api('DELETE', `/gift-triggers/${t.id}`).then(load))}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="row add-row" onSubmit={add}>
        <input className="input" placeholder="Gift name" value={giftName} onChange={(e) => setGiftName(e.target.value)} required maxLength={64} aria-label="Gift name" />
        <select className="input" value={commandId} onChange={(e) => setCommandId(e.target.value)} aria-label="Command">
          {commands.map((c) => (
            <option key={c.id} value={c.id}>
              {c.keyword}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={commands.length === 0}>
          Add trigger
        </button>
      </form>
    </Card>
  );
}

const EVENT_LABELS: Record<AlertEvent, string> = { follow: 'Follow', share: 'Share', gift: 'Gift', likes: 'Likes' };
const DEFAULT_TEMPLATES: Record<AlertEvent, string> = {
  follow: '{viewer} followed!',
  share: '{viewer} shared the stream!',
  gift: '{viewer} sent {count}× {gift}!',
  likes: '{total} likes! Thanks {viewer}',
};

function AlertsCard() {
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
    <Card
      title="Alerts"
      description={
        <>
          Shown big on the overlay, one at a time, with a sound and optionally read aloud. Placeholders: {'{viewer}'},{' '}
          {'{count}'}, {'{gift}'}, {'{total}'} (likes). A gift alert for a specific gift replaces the any-gift one. Test sends a
          sample to your overlay, live or not.
        </>
      }
    >
      <ErrorNotice error={error} />
      <div className="table-wrap">
        <table className="table">
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
                  <label className="switch">
                    <input type="checkbox" checked={a.enabled} aria-label="Alert on" onChange={(e) => update(a.id, { enabled: e.target.checked })} />
                  </label>
                </td>
                <td>
                  <span className="tag pink">{EVENT_LABELS[a.event]}</span>
                </td>
                <td>
                  {a.event === 'gift' && (
                    <TextCell value={a.giftName ?? ''} placeholder="any gift" label="Gift name" onSave={(v) => update(a.id, { giftName: v || null })} />
                  )}
                  {a.event === 'likes' && (
                    <span className="row" style={{ flexWrap: 'nowrap' }}>
                      every
                      <NumberCell value={a.likeStep ?? 1000} min={1} max={1_000_000} label="Likes per alert" onSave={(likeStep) => update(a.id, { likeStep })} />
                    </span>
                  )}
                </td>
                <td>
                  <TextCell value={a.template} required label="Alert text" onSave={(template) => update(a.id, { template })} />
                </td>
                <td>
                  <span className="row" style={{ flexWrap: 'nowrap' }}>
                    <select
                      className="input"
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
                      <button className="btn btn-ghost btn-sm" onClick={() => playSound(previewAudio(), a.sound!)} aria-label={`Play ${a.sound}`}>
                        ▶
                      </button>
                    )}
                  </span>
                </td>
                <td>
                  <label className="switch">
                    <input type="checkbox" checked={a.speak} aria-label="Read aloud" onChange={(e) => update(a.id, { speak: e.target.checked })} />
                  </label>
                </td>
                <td className="actions">
                  <button className="btn btn-sm" onClick={guard(() => api('POST', `/alerts/${a.id}/test`))}>
                    Test
                  </button>
                  <button className="btn btn-ghost btn-sm btn-delete" onClick={guard(() => api('DELETE', `/alerts/${a.id}`).then(load))}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {alerts.length === 0 && <p className="empty">No alerts yet. Pick an event below to add one.</p>}
      <div className="row add-row">
        <select className="input" value={event} onChange={(e) => setEvent(e.target.value as AlertEvent)} aria-label="New alert event">
          {ALERT_EVENTS.map((e) => (
            <option key={e} value={e}>
              {EVENT_LABELS[e]}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={add}>
          Add alert
        </button>
      </div>
    </Card>
  );
}
