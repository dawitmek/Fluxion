import { useEffect, useState } from 'react';
import { CLOUD_PROVIDERS, MAX_LEVEL, TIKTOK_VOICES, VOICE_EFFECTS } from '@fluxion/shared';
import { api, ApiError, type CloudProvider, type Host, type Speech, type TtsEngine, type VoiceEffect } from '../api';
import { SpeechPlayer } from '../speech-player';
import { Card, Choices, ErrorNotice, NumberCell, TextCell, useError } from '../ui';
import type { PageProps } from './Dashboard';
import { previewAudio } from './audio';

// Installed voices only: cloud "Online" voices exist in one browser (Edge) and never in OBS.
function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.localService));
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

const ENGINES: [TtsEngine, string, string][] = [
  ['piper', 'Piper (server)', 'Natural offline voices made on the Fluxion server. Plays through OBS.'],
  ['espeak', 'eSpeak (overlay)', 'Robotic voice made inside the overlay, many languages. Plays through OBS.'],
  ['tiktok', 'TikTok voices', "TikTok's own voices, through your TikTok account. Unofficial: TikTok may change or block it."],
  ['cloud', 'Your cloud key', 'Google, Azure or ElevenLabs with your own API key (you pay them). Plays through OBS.'],
  ['browser', 'Browser voices', "The streaming PC's built-in voices. Plays outside OBS's mixer; capture Desktop Audio."],
];
const CLOUD_LABELS: Record<CloudProvider, string> = { google: 'Google Cloud', azure: 'Azure Speech', elevenlabs: 'ElevenLabs' };
const CLOUD_VOICE_HINTS: Record<CloudProvider, string> = {
  google: 'e.g. en-US-Neural2-F',
  azure: 'e.g. en-US-AriaNeural',
  elevenlabs: 'a voice ID, e.g. 21m00Tcm4TlvDq8ikWAM',
};
const EFFECT_LABELS: Record<VoiceEffect, string> = {
  none: 'None',
  chipmunk: 'Chipmunk',
  deep: 'Deep',
  monster: 'Monster',
  robot: 'Robot',
  radio: 'Radio',
  echo: 'Echo',
};

let previewPlayer: SpeechPlayer | null = null;

// Secrets the dashboard can set or clear but never reads back.
type SettingsPatch = Partial<Host> | { ttsCloudKey: string | null } | { ttsTiktokSession: null };

export function VoicePage({ host, refreshHost }: PageProps) {
  const { error, guard, setError } = useError();
  const save = (patch: SettingsPatch) =>
    guard(() => api('PATCH', '/settings', patch).then(refreshHost))();

  return (
    <div className="stack">
      <ErrorNotice error={error} />
      <Card
        title="What gets read aloud"
        description='Your overlay reads chat aloud as "viewer says …", and speaks alerts marked "Read aloud". Links are never read, and in "all chat" mode game commands are skipped.'
      >
        <Choices
          label="Text-to-speech mode"
          value={host.ttsMode}
          options={[
            ['off', 'Off', 'Only alerts marked "Read aloud" are spoken.'],
            ['prefix', 'Prefixed chat', `Comments starting with ${host.ttsPrefix}, e.g. "${host.ttsPrefix} hello".`],
            ['all', 'All chat', 'Every comment that passes the filters below. Busiest option.'],
          ]}
          onChange={(ttsMode) => save({ ttsMode })}
        />
      </Card>
      <VoiceCard host={host} save={save} guard={guard} setError={setError} refreshHost={refreshHost} />
      <Card title="Chat filters" description="Applies to chat only; alerts are always read.">
        <div className="form-grid">
          <label className="field">
            Prefix
            <TextCell value={host.ttsPrefix} required label="Prefix" onSave={(ttsPrefix) => save({ ttsPrefix })} />
          </label>
          <label className="field">
            Max length, in characters
            <NumberCell value={host.ttsMaxLength} min={10} max={300} onSave={(ttsMaxLength) => save({ ttsMaxLength })} />
          </label>
          <label className="field">
            Cooldown per viewer, in seconds
            <NumberCell value={host.ttsCooldownMs / 1000} min={0} max={600} onSave={(s) => save({ ttsCooldownMs: s * 1000 })} />
          </label>
          {host.progression && (
            <label className="field">
              Minimum level
              <NumberCell value={host.ttsMinLevel} min={1} max={MAX_LEVEL} onSave={(ttsMinLevel) => save({ ttsMinLevel })} />
            </label>
          )}
        </div>
        <label className="field">
          Blocked words
          <span className="hint">Comma-separated. A comment containing one is not read.</span>
          <TextCell value={host.ttsBlockedWords} label="Blocked words" onSave={(ttsBlockedWords) => save({ ttsBlockedWords })} />
        </label>
      </Card>
    </div>
  );
}

function VoiceCard({
  host,
  save,
  guard,
  setError,
  refreshHost,
}: {
  host: Host;
  save: (patch: SettingsPatch) => void;
  guard: ReturnType<typeof useError>['guard'];
  setError: (e: string | null) => void;
  refreshHost: () => void;
}) {
  const voices = useVoices();
  const [options, setOptions] = useState<{ piperVoices: { name: string; speakers: number }[]; espeakVoices: string[] }>({
    piperVoices: [],
    espeakVoices: [],
  });
  const [cloudVoices, setCloudVoices] = useState<{ id: string; label: string }[] | null>(null);
  const loadCloudVoices = guard(() => api<{ id: string; label: string }[]>('GET', '/tts/cloud-voices').then(setCloudVoices));
  // A list from another provider or key would offer voices this account can't use.
  useEffect(() => setCloudVoices(null), [host.ttsCloudProvider, host.ttsCloudKeySet]);
  const [cloudKey, setCloudKey] = useState('');
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => void api<typeof options>('GET', '/tts/options').then(setOptions), []);

  // Plays exactly what the overlay would get, so a bad cloud key or missing voice shows up here.
  const preview = async () => {
    setError(null);
    setPreviewing(true);
    try {
      const speech = await api<Speech>('POST', '/tts/preview', { text: 'viewer says hello from Fluxion' });
      previewPlayer ??= new SpeechPlayer(previewAudio);
      await previewPlayer.play(speech);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Could not play the preview: ${String(e)}`);
    } finally {
      setPreviewing(false);
    }
  };
  const piperMissing = host.ttsEngine === 'piper' && options.piperVoices.length === 0;
  const tiktokWaiting = host.ttsEngine === 'tiktok' && !host.ttsTiktokConnected;
  // The sign-in happens in the companion app; notice it here without a reload.
  useEffect(() => {
    if (!tiktokWaiting) return;
    const timer = setInterval(refreshHost, 3000);
    return () => clearInterval(timer);
  }, [tiktokWaiting, refreshHost]);
  const piperVoice = options.piperVoices.find((v) => v.name === host.ttsPiperVoice) ?? options.piperVoices[0];

  return (
    <Card
      title="Voice"
      actions={
        <button className="btn btn-primary" onClick={() => void preview()} disabled={previewing}>
          {previewing ? 'Speaking…' : 'Preview voice'}
        </button>
      }
    >
      <Choices label="Voice engine" value={host.ttsEngine} options={ENGINES} onChange={(ttsEngine) => save({ ttsEngine })} />
      {tiktokWaiting && (
        <p className="notice info">
          Sign in to TikTok from the companion app: open it on your PC and choose Sign in to TikTok. Until then, chat is read
          with eSpeak.
        </p>
      )}
      {piperMissing && (
        <p className="notice warning">This server has no Piper voices installed, so eSpeak is used instead. The Docker image includes Piper.</p>
      )}
      <div className="form-grid">
        {host.ttsEngine === 'piper' && options.piperVoices.length > 0 && (
          <label className="field">
            Piper voice
            <select
              value={host.ttsPiperVoice ?? ''}
              // A speaker number from the previous voice means nothing for the new one.
              onChange={(e) => save({ ttsPiperVoice: e.target.value || null, ttsPiperSpeaker: null })}
            >
              <option value="">Default ({options.piperVoices[0]!.name})</option>
              {options.piperVoices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                  {v.speakers > 1 ? ` (${v.speakers} speakers)` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {host.ttsEngine === 'piper' && piperVoice && piperVoice.speakers > 1 && (
          <div className="field">
            Speaker
            <span className="hint">0–{piperVoice.speakers - 1}; each one sounds different.</span>
            <span className="row" style={{ flexWrap: 'nowrap' }}>
              <NumberCell
                value={host.ttsPiperSpeaker ?? 0}
                min={0}
                max={piperVoice.speakers - 1}
                label="Speaker"
                onSave={(ttsPiperSpeaker) => save({ ttsPiperSpeaker })}
              />
              <button className="btn" onClick={() => save({ ttsPiperSpeaker: Math.floor(Math.random() * piperVoice.speakers) })}>
                Random
              </button>
            </span>
          </div>
        )}
        {host.ttsEngine === 'tiktok' && (
          <>
            <label className="field">
              TikTok voice
              <select value={host.ttsTiktokVoice ?? ''} onChange={(e) => save({ ttsTiktokVoice: e.target.value || null })}>
                {TIKTOK_VOICES.map((v, i) => (
                  <option key={v.id} value={i === 0 ? '' : v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            {host.ttsTiktokConnected && (
              <div className="field">
                TikTok account
                <span className="row" style={{ flexWrap: 'nowrap' }}>
                  <span className="tag green">Signed in</span>
                  <button className="btn btn-ghost" onClick={() => save({ ttsTiktokSession: null })}>
                    Sign out
                  </button>
                </span>
              </div>
            )}
          </>
        )}
        {(host.ttsEngine === 'espeak' || piperMissing || host.ttsEngine === 'cloud' || host.ttsEngine === 'tiktok') && (
          <label className="field">
            eSpeak language{host.ttsEngine !== 'espeak' && ' (fallback)'}
            <select value={host.ttsEspeakVoice} onChange={(e) => save({ ttsEspeakVoice: e.target.value })}>
              {options.espeakVoices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
        {host.ttsEngine === 'browser' && (
          <label className="field">
            Voice installed on this PC
            <select value={host.ttsVoice ?? ''} onChange={(e) => save({ ttsVoice: e.target.value || null })}>
              <option value="">Default voice</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        )}
        {host.ttsEngine === 'cloud' && (
          <>
            <label className="field">
              Provider
              <select value={host.ttsCloudProvider ?? ''} onChange={(e) => save({ ttsCloudProvider: (e.target.value || null) as CloudProvider | null })}>
                <option value="">Choose…</option>
                {CLOUD_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {CLOUD_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              API key
              {host.ttsCloudKeySet && <span className="hint">Saved. Enter a new one to replace it.</span>}
              <span className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={cloudKey}
                  placeholder={host.ttsCloudKeySet ? '••••••••' : 'paste your key'}
                  onChange={(e) => setCloudKey(e.target.value)}
                  aria-label="Cloud API key"
                />
                <button className="btn" disabled={!cloudKey.trim()} onClick={() => (save({ ttsCloudKey: cloudKey.trim() }), setCloudKey(''))}>
                  Save key
                </button>
                {host.ttsCloudKeySet && (
                  <button className="btn btn-ghost" onClick={() => save({ ttsCloudKey: null })}>
                    Remove
                  </button>
                )}
              </span>
            </div>
            {host.ttsCloudProvider && (
              <div className="field">
                Cloud voice
                <span className="row" style={{ flexWrap: 'nowrap' }}>
                  {cloudVoices ? (
                    <select className="input" value={host.ttsCloudVoice ?? ''} onChange={(e) => save({ ttsCloudVoice: e.target.value || null })}>
                      <option value="">Default</option>
                      {cloudVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <TextCell
                      value={host.ttsCloudVoice ?? ''}
                      placeholder={CLOUD_VOICE_HINTS[host.ttsCloudProvider]}
                      label="Cloud voice"
                      onSave={(v) => save({ ttsCloudVoice: v || null })}
                    />
                  )}
                  {host.ttsCloudKeySet && !cloudVoices && (
                    <button className="btn" onClick={loadCloudVoices}>
                      List my voices
                    </button>
                  )}
                </span>
              </div>
            )}
            {host.ttsCloudProvider === 'azure' && (
              <label className="field">
                Region
                <TextCell value={host.ttsCloudRegion ?? ''} placeholder="e.g. eastus" label="Azure region" onSave={(v) => save({ ttsCloudRegion: v || null })} />
              </label>
            )}
          </>
        )}
        <label className="field">
          Voice effect
          <span className="hint">Any engine; browser voices only get pitch and speed.</span>
          <select value={host.ttsEffect} onChange={(e) => save({ ttsEffect: e.target.value as VoiceEffect })}>
            {VOICE_EFFECTS.map((effect) => (
              <option key={effect} value={effect}>
                {EFFECT_LABELS[effect]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}
