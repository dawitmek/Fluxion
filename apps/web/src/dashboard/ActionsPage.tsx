import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ACTION_TRIGGERS, ALERT_SOUNDS, AUDIENCES, MAX_KEY_REPEATS, MAX_MEDIA_TOTAL_BYTES, type ServerToOverlay } from '@fluxion/shared';
import { api, uploadMedia, type Action, type ActionTrigger, type Audience, type Command, type Goal, type Host, type MediaItem, type Screen } from '../api';
import { playSound } from '../sounds';
import { Card, ErrorNotice, HueIcon, Scrubber, useError, type Hue } from '../ui';
import { Icon, type IconName } from '../icons';
import { alertPlace } from '../Overlay';
import { GiftBus, usePreview } from '../overlay-widgets';
import { CANVAS, FadedWidgets } from './OverlayPage';
import { playAlertPreview, previewAudio } from './audio';
import { Link } from '../router';
import type { PageProps } from './Dashboard';

export function ActionsPage({ host }: PageProps) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const loadMedia = useCallback(() => api<MediaItem[]>('GET', '/media').then(setMedia), []);
  useEffect(() => void loadMedia(), [loadMedia]);
  return (
    <div className="stack">
      <ActionsCard host={host} media={media} />
      <MediaCard media={media} reload={loadMedia} />
    </div>
  );
}

// Each trigger's icon and color match the same thing elsewhere: followers sky, gifts amber, goals violet.
const TRIGGERS: Record<ActionTrigger, { label: string; placeholders: string; icon: IconName; hue: Hue }> = {
  follow: { label: 'Follows you', placeholders: '{viewer}', icon: 'follower', hue: 'sky' },
  share: { label: 'Shares the stream', placeholders: '{viewer}', icon: 'share', hue: 'green' },
  gift: { label: 'Sends a gift', placeholders: '{viewer}, {gift}, {count}, {coins}', icon: 'gift', hue: 'amber' },
  likes: { label: 'Likes reach a number', placeholders: '{viewer}, {total}, {count}', icon: 'heart', hue: 'pink' },
  join: { label: 'Joins the stream', placeholders: '{viewer}', icon: 'crowd', hue: 'teal' },
  subscribe: { label: 'Subscribes', placeholders: '{viewer}, {months}', icon: 'star', hue: 'violet' },
  emote: { label: 'Sends a subscriber sticker', placeholders: '{viewer}', icon: 'sparkle', hue: 'orange' },
  command: { label: 'Types a chat command', placeholders: '{viewer}, {text} (what they typed after the command)', icon: 'chat', hue: 'indigo' },
  first_activity: { label: 'Does anything for the first time this stream', placeholders: '{viewer}', icon: 'bell', hue: 'teal' },
  goal: { label: 'Reaches a goal', placeholders: '{viewer} (who reached it), {goal}, {target}', icon: 'target', hue: 'violet' },
};

const AUDIENCE_LABELS: Record<Audience, string> = {
  everyone: 'Everyone',
  followers: 'Followers',
  subscribers: 'Subscribers',
  moderators: 'Moderators',
  top_gifters: 'Top 3 gifters',
  viewer: 'One viewer',
};

type Draft = Omit<Action, 'id'>;
const newDraft = (): Draft => ({
  profileId: null,
  name: '',
  enabled: true,
  trigger: 'follow',
  giftName: null,
  minDiamonds: null,
  likeStep: 1000,
  command: null,
  goalId: null,
  audience: 'everyone',
  audienceViewer: null,
  cooldownMs: 0,
  viewerCooldownMs: 0,
  random: false,
  text: '{viewer} followed!',
  sound: 'chime',
  soundMediaId: null,
  mediaId: null,
  speak: false,
  durationMs: 5000,
  alertX: null,
  alertY: null,
  alertScale: 100,
  keyCommandId: null,
  repeatWithCount: false,
  points: 0,
  screenId: null,
});

function ActionsCard({ host, media }: { host: Host; media: MediaItem[] }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [tested, setTested] = useState<{ id: string; overlays: number } | null>(null);
  const { error, guard } = useError();
  // Test runs on the overlay. With none open it plays here instead, so it's still heard; either way it says where it went.
  const test = (id: string) =>
    guard(async () => {
      const result = await api<{ alert: Extract<ServerToOverlay, { type: 'alert' }>; overlays: number }>('POST', `/actions/${id}/test`);
      if (result.overlays === 0) playAlertPreview(result.alert);
      setTested({ id, overlays: result.overlays });
    })();
  const load = useCallback(
    () =>
      Promise.all([api<Action[]>('GET', '/actions'), api<Command[]>('GET', '/commands'), api<Screen[]>('GET', '/screens'), api<Goal[]>('GET', '/goals')]).then(
        ([a, c, s, g]) => {
          setActions(a);
          setCommands(c);
          setScreens(s);
          setGoals(g);
        },
      ),
    [],
  );
  // Switching profiles changes which actions and commands apply.
  useEffect(() => void load(), [load, host.profileId]);

  const save = (id: string | null, draft: Draft) => {
    // Only the editable fields: a loaded action also carries its id and bookkeeping.
    const body = Object.fromEntries(Object.keys(newDraft()).map((k) => [k, draft[k as keyof Draft]]));
    return (id ? api('PATCH', `/actions/${id}`, body) : api('POST', '/actions', body)).then(() => (setEditing(null), load()));
  };
  const update = (id: string, patch: Partial<Action>) => guard(() => api('PATCH', `/actions/${id}`, patch).then(load))();
  const context = { host, commands, media, screens, goals };

  return (
    <Card
      title="Actions"
      description="What happens when viewers do something: an alert on your overlay, a sound, a picture or video, a voice, a key press, or points. Test sends an action's alert to your open overlays, live or not."
      actions={
        <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={editing === 'new'}>
          New action
        </button>
      }
    >
      <ErrorNotice error={error} />
      {editing === 'new' && <ActionEditor title="New action" initial={newDraft()} {...context} onSave={(d) => save(null, d)} onCancel={() => setEditing(null)} />}
      {actions.length === 0 && editing !== 'new' && <p className="empty">No actions yet. Add one to thank followers, react to gifts, or let chat trigger something.</p>}
      <ul className="action-list">
        {actions.map((a) => (
          <li key={a.id} className={a.enabled ? '' : 'off'}>
            <div className="action-row">
              <label className="switch">
                <input type="checkbox" checked={a.enabled} aria-label={`${a.name} on`} onChange={(e) => update(a.id, { enabled: e.target.checked })} />
              </label>
              <HueIcon name={TRIGGERS[a.trigger].icon} hue={TRIGGERS[a.trigger].hue} />
              <div className="action-summary">
                <strong>{a.name}</strong>
                <span className="muted small">{describeWhen(a, goals)}</span>
                <span className="action-does">
                  {describeDoes(a, commands, media, host).map(([d, hue]) => (
                    <span key={d} className={`tag ${hue}`}>
                      {d}
                    </span>
                  ))}
                </span>
              </div>
              <span className="action-buttons">
                <button className="btn btn-sm btn-try" onClick={() => test(a.id)} title="Show this alert on your open overlays">
                  Test
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(editing === a.id ? null : a.id)} aria-expanded={editing === a.id}>
                  Edit
                </button>
                <button className="btn btn-ghost btn-sm btn-delete" onClick={guard(() => api('DELETE', `/actions/${a.id}`).then(load))}>
                  Delete
                </button>
              </span>
            </div>
            {tested?.id === a.id && (
              <p className="notice info test-result" role="status">
                {tested.overlays > 0 ? (
                  `Sent to ${tested.overlays} open overlay${tested.overlays === 1 ? '' : 's'}. The sound plays there, not on this page.`
                ) : (
                  <>
                    No overlay is open, so the sound played on this page instead. To see the alert itself, open a preview on the{' '}
                    <Link href="/dashboard/overlay">Stream overlay</Link> page and test again.
                  </>
                )}
              </p>
            )}
            {editing === a.id && <ActionEditor title="Editing" initial={a} {...context} onSave={(d) => save(a.id, d)} onCancel={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function describeWhen(a: Action, goals: Goal[]): string {
  const who = a.audience === 'viewer' ? `only ${a.audienceViewer}` : a.audience === 'everyone' ? '' : `${AUDIENCE_LABELS[a.audience].toLowerCase()} only`;
  const what =
    a.trigger === 'gift'
      ? `Sends ${a.giftName ?? 'any gift'}${a.minDiamonds ? ` worth ${a.minDiamonds}+ coins` : ''}`
      : a.trigger === 'likes'
        ? `Every ${a.likeStep?.toLocaleString()} likes`
        : a.trigger === 'command'
          ? `Types ${a.command}`
          : a.trigger === 'goal'
            ? `${goals.find((g) => g.id === a.goalId)?.name ?? 'A goal'} is reached`
            : TRIGGERS[a.trigger].label;
  return [what, who, a.random ? 'random pick' : '', a.profileId ? 'this profile' : ''].filter(Boolean).join(', ');
}

// What an action does, each with its color: alerts pink, sounds violet, pictures sky, voice teal, key presses amber
// (like the keycaps on the Live page), points green.
function describeDoes(a: Action, commands: Command[], media: MediaItem[], host: Host): [string, Hue][] {
  const does: [string, Hue][] = [];
  if (a.text) does.push(['Alert', 'pink']);
  if (a.sound) does.push([`Sound: ${a.sound}`, 'violet']);
  if (a.soundMediaId) does.push([`Sound: ${media.find((m) => m.id === a.soundMediaId)?.name ?? 'file'}`, 'violet']);
  if (a.mediaId) does.push([media.find((m) => m.id === a.mediaId)?.kind === 'video' ? 'Video' : 'Picture', 'sky']);
  if (a.speak && a.text) does.push(['Read aloud', 'teal']);
  const command = commands.find((c) => c.id === a.keyCommandId);
  if (command) does.push([`Presses ${command.keyword}`, 'amber']);
  if (a.points > 0 && host.points) does.push([`+${a.points.toLocaleString()} points`, 'green']);
  return does;
}

function ActionEditor({
  title,
  initial,
  host,
  commands,
  media,
  screens,
  goals,
  onSave,
  onCancel,
}: {
  title: string;
  initial: Draft;
  host: Host;
  commands: Command[];
  media: MediaItem[];
  screens: Screen[];
  goals: Goal[];
  onSave: (draft: Draft) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const { error, guard } = useError();
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const text = (value: string) => value.trim() || null;
  const sounds = media.filter((m) => m.kind === 'audio');
  const visuals = media.filter((m) => m.kind !== 'audio');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim() || TRIGGERS[draft.trigger].label;
    guard(() => onSave({ ...draft, name }))();
  };
  const soundValue = draft.soundMediaId ? `file:${draft.soundMediaId}` : (draft.sound ?? '');
  const setSound = (value: string) =>
    set(value.startsWith('file:') ? { sound: null, soundMediaId: value.slice(5) } : { sound: (value || null) as Draft['sound'], soundMediaId: null });

  return (
    <form className="action-editor stack" onSubmit={submit} aria-label={title}>
      <div className="action-editor-head">
        <HueIcon name={TRIGGERS[draft.trigger].icon} hue={TRIGGERS[draft.trigger].hue} />
        <div className="action-editor-title">
          <h3>{draft.name.trim() || TRIGGERS[draft.trigger].label}</h3>
          <span className="muted small">{title}</span>
        </div>
      </div>
      <ErrorNotice error={error} />
      <label className="field">
        Name
        <input className="input" value={draft.name} maxLength={60} placeholder={TRIGGERS[draft.trigger].label} onChange={(e) => set({ name: e.target.value })} />
      </label>

      <Section title="When a viewer" icon={TRIGGERS[draft.trigger].icon} hue={TRIGGERS[draft.trigger].hue}>
        <div className="form-grid">
          <label className="field">
            Does this
            <select className="input" value={draft.trigger} onChange={(e) => set({ trigger: e.target.value as ActionTrigger })}>
              {ACTION_TRIGGERS.map((t) => (
                <option key={t} value={t}>
                  {TRIGGERS[t].label}
                </option>
              ))}
            </select>
          </label>
          {draft.trigger === 'gift' && (
            <>
              <label className="field">
                Gift
                <span className="hint">As TikTok names it, like Rose. Empty for any gift.</span>
                <input className="input" value={draft.giftName ?? ''} maxLength={64} placeholder="Any gift" onChange={(e) => set({ giftName: text(e.target.value) })} />
              </label>
              <label className="field">
                Worth at least
                <span className="hint">In coins, counting the whole streak. Empty for any amount.</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={draft.minDiamonds ?? ''}
                  placeholder="Any"
                  onChange={(e) => set({ minDiamonds: e.target.value ? Number(e.target.value) : null })}
                />
              </label>
            </>
          )}
          {draft.trigger === 'likes' && (
            <label className="field">
              Every this many likes
              <span className="hint">Counted across the whole stream.</span>
              <input className="input" type="number" min={1} required value={draft.likeStep ?? ''} onChange={(e) => set({ likeStep: Number(e.target.value) || null })} />
            </label>
          )}
          {draft.trigger === 'goal' && (
            <label className="field">
              Goal
              <span className="hint">{goals.length === 0 ? 'Add a goal on the Stream overlay page first.' : 'Runs once a stream, when it\'s reached.'}</span>
              <select className="input" required value={draft.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value || null })}>
                <option value="">Pick a goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {draft.trigger === 'command' && (
            <label className="field">
              Command
              <span className="hint">The start of their message, like !dance. Any capitalization.</span>
              <input
                className="input"
                required
                maxLength={32}
                value={draft.command ?? ''}
                placeholder="!dance"
                onChange={(e) => set({ command: e.target.value.replace(/\s/g, '') || null })}
              />
            </label>
          )}
          <label className="field">
            Who
            <span className="hint">TikTok says who follows, subscribes or moderates when they chat or gift.</span>
            <select className="input" value={draft.audience} onChange={(e) => set({ audience: e.target.value as Audience })}>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
          {draft.audience === 'viewer' && (
            <label className="field">
              Viewer
              <span className="hint">Their TikTok username.</span>
              <input className="input" required maxLength={64} value={draft.audienceViewer ?? ''} onChange={(e) => set({ audienceViewer: text(e.target.value) })} />
            </label>
          )}
          <label className="field">
            Wait between runs, in seconds
            <span className="hint">For everyone. 0 means no wait.</span>
            <input className="input" type="number" min={0} max={3600} value={draft.cooldownMs / 1000} onChange={(e) => set({ cooldownMs: Math.round(Number(e.target.value) * 1000) })} />
          </label>
          <label className="field">
            Wait per viewer, in seconds
            <span className="hint">Before the same viewer can run it again.</span>
            <input
              className="input"
              type="number"
              min={0}
              max={3600}
              value={draft.viewerCooldownMs / 1000}
              onChange={(e) => set({ viewerCooldownMs: Math.round(Number(e.target.value) * 1000) })}
            />
          </label>
        </div>
        <label className="switch">
          <input type="checkbox" checked={draft.random} onChange={(e) => set({ random: e.target.checked })} />
          <span>
            Random pick
            <small>When something matches several random actions, only one of them runs. Use it for a set of sounds or reactions.</small>
          </span>
        </label>
      </Section>

      <Section title="Show on stream" icon="bell" hue="pink">
        <label className="field">
          Alert text
          <span className="hint">Placeholders: {TRIGGERS[draft.trigger].placeholders}. Empty shows no text.</span>
          <input className="input" maxLength={200} value={draft.text ?? ''} onChange={(e) => set({ text: e.target.value || null })} />
        </label>
        <AlertPreview draft={draft} media={media} />
        <div className="form-grid">
          <label className="field">
            Sound
            <span className="row" style={{ flexWrap: 'nowrap' }}>
              <select className="input" value={soundValue} onChange={(e) => setSound(e.target.value)}>
                <option value="">None</option>
                <optgroup label="Built in">
                  {ALERT_SOUNDS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </optgroup>
                {sounds.length > 0 && (
                  <optgroup label="Your uploads">
                    {sounds.map((m) => (
                      <option key={m.id} value={`file:${m.id}`}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <PreviewSound value={soundValue} />
            </span>
          </label>
          <label className="field">
            Picture or video
            <span className="hint">{visuals.length === 0 ? 'Upload one below first.' : 'Shown above the text.'}</span>
            <select className="input" value={draft.mediaId ?? ''} disabled={visuals.length === 0} onChange={(e) => set({ mediaId: e.target.value || null })}>
              <option value="">None</option>
              {visuals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.kind})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Show for, in seconds
            <input className="input" type="number" min={1} max={60} value={draft.durationMs / 1000} onChange={(e) => set({ durationMs: Math.round(Number(e.target.value) * 1000) })} />
          </label>
          <AlertPlaceField draft={draft} screens={screens} media={media} onChange={set} />
          {screens.length > 1 && (
            <label className="field">
              Screen
              <span className="hint">Every screen showing alerts, or just one.</span>
              <select className="input" value={draft.screenId ?? ''} onChange={(e) => set({ screenId: e.target.value || null })}>
                <option value="">Every screen</option>
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="switch">
          <input type="checkbox" checked={draft.speak} disabled={!draft.text} onChange={(e) => set({ speak: e.target.checked })} />
          <span>
            Read the text aloud
            <small>With your voice settings.</small>
          </span>
        </label>
      </Section>

      <Section title="Do" icon="commands" hue="indigo">
        <div className="form-grid">
          <label className="field">
            Press a command's key
            <span className="hint">Skips crowd-mode limits. Ties the action to the {host.profileName} profile.</span>
            <select className="input" value={draft.keyCommandId ?? ''} onChange={(e) => set({ keyCommandId: e.target.value || null })}>
              <option value="">No key press</option>
              {commands.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.keyword}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Give points
            <span className="hint">{host.points ? 'To the viewer who did it.' : 'Turn on points on the Leaderboard page first.'}</span>
            <input className="input" type="number" min={0} disabled={!host.points} value={draft.points} onChange={(e) => set({ points: Math.max(0, Number(e.target.value)) })} />
          </label>
        </div>
        {draft.trigger === 'gift' && draft.keyCommandId && (
          <label className="switch">
            <input type="checkbox" checked={draft.repeatWithCount} onChange={(e) => set({ repeatWithCount: e.target.checked })} />
            <span>
              Once per gift in a streak
              <small>A streak of 5 roses presses it 5 times, up to {MAX_KEY_REPEATS}.</small>
            </span>
          </label>
        )}
        {!draft.keyCommandId && (
          <label className="switch">
            <input type="checkbox" checked={draft.profileId !== null} onChange={(e) => set({ profileId: e.target.checked ? host.profileId : null })} />
            <span>
              Only with the {host.profileName} profile
              <small>Otherwise it runs whichever game profile is active.</small>
            </span>
          </label>
        )}
      </Section>

      <div className="action-editor-foot">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary">Save action</button>
      </div>
    </form>
  );
}

function Section({ title, icon, hue, children }: { title: string; icon: IconName; hue: Hue; children: ReactNode }) {
  const id = `action-section-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section className="action-section stack" role="group" aria-labelledby={id}>
      <h4 id={id} className="action-section-title">
        <HueIcon name={icon} hue={hue} size="sm" />
        {title}
      </h4>
      {children}
    </section>
  );
}

// The alert as it looks on stream, with sample names in its placeholders, over a stand-in for the stream. Its place
// and size are set with Place and size.
function AlertPreview({ draft, media }: { draft: Draft; media: MediaItem[] }) {
  const file = media.find((m) => m.id === draft.mediaId);
  const text = draft.text ? sampleText(draft.text) : '';
  return (
    <div className="alert-preview" aria-label="Alert preview">
      {text || file ? (
        <div className={`overlay-alert ${text ? '' : 'media-only'}`}>
          {file?.kind === 'image' && <img className="overlay-alert-media" src={`/media/${file.id}`} alt="" />}
          {file?.kind === 'video' && <video className="overlay-alert-media" src={`/media/${file.id}`} muted autoPlay loop playsInline />}
          {text}
        </div>
      ) : (
        <span className="alert-preview-empty">No text or picture, so nothing shows. A sound or voice still plays.</span>
      )}
      <span className="alert-preview-note">Preview, with sample names</span>
    </div>
  );
}

function PreviewSound({ value }: { value: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  if (!value) return null;
  const play = () => {
    if (value.startsWith('file:')) {
      audio.current?.pause();
      audio.current = new Audio(`/media/${value.slice(5)}`);
      void audio.current.play();
    } else playSound(previewAudio(), value as (typeof ALERT_SOUNDS)[number]);
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={play} aria-label="Play sound">
      ▶
    </button>
  );
}

const megabytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${Number((bytes / 1024 / 1024).toFixed(1))} MB`;

function MediaCard({ media, reload }: { media: MediaItem[]; reload: () => Promise<unknown> }) {
  const [uploading, setUploading] = useState(false);
  const { error, guard } = useError();
  const used = media.reduce((sum, m) => sum + m.size, 0);
  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    setUploading(true);
    guard(async () => {
      for (const file of files) await uploadMedia(file);
    })().finally(() => (setUploading(false), void reload()));
  };

  return (
    <Card
      title="Uploads"
      description={`Pictures (PNG, JPEG, GIF, WebP), videos (MP4, WebM) and sounds (MP3, OGG, WAV, M4A) for your actions. Up to 10 MB each, ${megabytes(MAX_MEDIA_TOTAL_BYTES)} in all.`}
      actions={
        <label className={`btn btn-primary ${uploading ? 'disabled' : ''}`}>
          {uploading ? 'Uploading…' : 'Upload files'}
          <input type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,audio/*" onChange={upload} disabled={uploading} />
        </label>
      }
    >
      <ErrorNotice error={error} />
      <div className="meter" role="meter" aria-label="Upload space used" aria-valuemin={0} aria-valuemax={MAX_MEDIA_TOTAL_BYTES} aria-valuenow={used}>
        <span style={{ width: `${Math.min(100, (used / MAX_MEDIA_TOTAL_BYTES) * 100)}%` }} />
      </div>
      <p className="muted small">
        {megabytes(used)} of {megabytes(MAX_MEDIA_TOTAL_BYTES)} used.
      </p>
      {media.length === 0 ? (
        <p className="empty">Nothing uploaded yet.</p>
      ) : (
        <ul className="media-grid">
          {media.map((m) => (
            <li key={m.id}>
              <div className="media-preview">
                {m.kind === 'image' && <img src={`/media/${m.id}`} alt="" loading="lazy" />}
                {m.kind === 'video' && <video src={`/media/${m.id}`} muted loop playsInline onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />}
                {m.kind === 'audio' && <audio src={`/media/${m.id}`} controls preload="none" />}
              </div>
              <div className="media-meta">
                <strong title={m.name}>{m.name}</strong>
                <span className="muted small">
                  {m.kind}, {megabytes(m.size)}
                </span>
              </div>
              <button className="btn btn-ghost btn-sm btn-delete" onClick={guard(() => api('DELETE', `/media/${m.id}`).then(reload))}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Where an alert shows, and how big: the screen's own alert position unless placed by hand.
// The placeholders get sample values in the preview.
const SAMPLE_VALUES: Record<string, string> = {
  viewer: 'nightowl', gift: 'Rose', count: '5', coins: '5', diamonds: '5', likes: '1,000', total: '1,000', months: '3', text: 'hello', goal: 'Like goal', target: '1,000',
};
const sampleText = (text: string) => text.replace(/\{(\w+)\}/g, (all, key: string) => SAMPLE_VALUES[key] ?? all);
// Where the screen's top, middle and bottom alert positions put an alert's middle, roughly, for the little map.
const DEFAULT_PLACE = { top: 30, middle: 50, bottom: 82 } as const;

type Place = Pick<Draft, 'alertX' | 'alertY' | 'alertScale'>;

function AlertPlaceField({ draft, screens, media, onChange }: { draft: Draft; screens: Screen[]; media: MediaItem[]; onChange: (patch: Place) => void }) {
  const [open, setOpen] = useState(false);
  const screen = screens.find((s) => s.id === draft.screenId) ?? screens.find((s) => s.main);
  const placed = draft.alertX !== null && draft.alertY !== null;
  const dot = placed ? { x: draft.alertX!, y: draft.alertY! } : { x: 50, y: DEFAULT_PLACE[screen?.alertPosition ?? 'top'] };
  return (
    <div className="field">
      Place and size
      <span className="hint">Drag it where you want it on the screen.</span>
      <button type="button" className="btn alert-place-btn" onClick={() => setOpen(true)} disabled={!screen}>
        <span className="spot-map placed indigo" aria-hidden="true">
          <span className="spot-dot" style={{ left: `calc(${dot.x}% - 3px)`, top: `calc(${dot.y}% - 3px)` }} />
        </span>
        {placed ? 'Placed by hand' : "Screen's position"}, {draft.alertScale}%
      </button>
      {open && screen && <AlertPlaceDialog draft={draft} screen={screen} media={media} onDone={(place) => (onChange(place), setOpen(false))} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AlertPlaceDialog({ draft, screen, media, onDone, onClose }: { draft: Draft; screen: Screen; media: MediaItem[]; onDone: (place: Place) => void; onClose: () => void }) {
  const [place, setPlace] = useState<Place>({ alertX: draft.alertX, alertY: draft.alertY, alertScale: draft.alertScale });
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.4);
  const [bus] = useState(() => new GiftBus());
  const { stats, chat } = usePreview(true, bus);
  const file = media.find((m) => m.id === draft.mediaId);

  useEffect(() => dialog.current?.showModal(), []);
  useLayoutEffect(() => {
    const measure = () => stage.current && setFit(stage.current.clientWidth / CANVAS.width);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(stage.current!);
    return () => resize.disconnect();
  }, []);

  // Dragging moves the alert's middle, keeping all of it on the screen.
  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const box = stage.current!.getBoundingClientRect();
    const alert = e.currentTarget.getBoundingClientRect();
    const grab = { x: e.clientX - (alert.left + alert.width / 2), y: e.clientY - (alert.top + alert.height / 2) };
    const half = { x: (alert.width / 2 / box.width) * 100, y: (alert.height / 2 / box.height) * 100 };
    const clamp = (n: number, h: number) => Math.round(Math.min(Math.max(n, Math.min(h, 50)), Math.max(100 - h, 50)) * 10) / 10;
    const move = (m: PointerEvent) =>
      setPlace((p) => ({
        ...p,
        alertX: clamp(((m.clientX - grab.x - box.left) / box.width) * 100, half.x),
        alertY: clamp(((m.clientY - grab.y - box.top) / box.height) * 100, half.y),
      }));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const placed = place.alertX !== null && place.alertY !== null;
  const text = draft.text ? sampleText(draft.text) : '';
  return (
    <dialog ref={dialog} className="pos-dialog" onClose={onClose} aria-labelledby="alert-place-title">
      <div className="pos-head">
        <div>
          <h2 id="alert-place-title">{draft.name.trim() || 'Alert'}: place and size</h2>
          <p className="muted small">
            Drag the alert anywhere on {screen.name}. Your widgets show faded, with sample viewers and gifts. Save the action to keep it.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => dialog.current?.close()} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="pos-stage" ref={stage} style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}>
        <div className="pos-canvas" style={{ ...CANVAS, transform: `scale(${fit})` }}>
          <div className={`overlay-screen alerts-${screen.alertPosition}`} style={{ '--overlay-scale': screen.scale / 100 } as CSSProperties}>
            <FadedWidgets widgets={screen.widgets} feed={{ stats, chat, bus }} />
            <div
              className={`overlay-alert alert-drag ${text ? '' : 'media-only'}`}
              style={alertPlace({ pos: placed ? { x: place.alertX!, y: place.alertY! } : null, scale: place.alertScale })}
              onPointerDown={startDrag}
            >
              {file?.kind === 'image' && <img className="overlay-alert-media" src={`/media/${file.id}`} alt="" draggable={false} />}
              {file?.kind === 'video' && <video className="overlay-alert-media" src={`/media/${file.id}`} muted autoPlay loop playsInline />}
              {text ? <span>{text}</span> : !file && <span>Your alert</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="pos-foot">
        <div className="field alert-size">
          Size, in percent
          <Scrubber value={place.alertScale} min={50} max={200} buttonStep={10} unit="%" label="Alert size" onSave={(alertScale) => setPlace((p) => ({ ...p, alertScale }))} />
        </div>
        <span className="muted small">{placed ? `Middle at ${Math.round(place.alertX!)}% across, ${Math.round(place.alertY!)}% down` : `The screen's ${screen.alertPosition} position`}</span>
        <span className="spacer" />
        {placed && (
          <button className="btn btn-ghost" onClick={() => setPlace((p) => ({ ...p, alertX: null, alertY: null }))}>
            Use the screen's position
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onDone(place)}>
          Done
        </button>
      </div>
    </dialog>
  );
}
