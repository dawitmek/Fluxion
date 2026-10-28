import type { CloudProvider } from '@fluxion/shared';

export interface CloudVoice {
  provider: CloudProvider;
  key: string;
  region: string | null; // Azure only
  voice: string | null;
}

const TIMEOUT_MS = 10_000;

// Sensible defaults when the host leaves the voice empty.
export const DEFAULT_CLOUD_VOICES: Record<CloudProvider, string> = {
  google: 'en-US-Neural2-F',
  azure: 'en-US-AriaNeural',
  elevenlabs: '21m00Tcm4TlvDq8ikWAM', // "Rachel", a premade voice
};

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

// "en-US-Neural2-F" -> "en-US"
const languageOf = (voice: string) => voice.split('-').slice(0, 2).join('-');

// The provider's own explanation, if its error body has one: Google {error:{message}},
// ElevenLabs {detail:{message}} or {detail:"..."}; otherwise the start of the raw body.
export function errorMessage(body: string): string {
  try {
    const json = JSON.parse(body);
    const message = json?.error?.message ?? json?.detail?.message ?? json?.detail ?? json?.message;
    if (typeof message === 'string' && message) return message;
  } catch {
    // not JSON
  }
  return body.trim().slice(0, 200) || 'no details';
}

async function check(res: Response, provider: string) {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  throw new Error(`${provider} TTS failed (${res.status}): ${errorMessage(body)}`);
}

// Calls the host's own TTS provider. Returns encoded audio the overlay can decode.
export async function synthesizeCloud(
  cfg: CloudVoice,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ data: Buffer; mime: string }> {
  const voice = cfg.voice || DEFAULT_CLOUD_VOICES[cfg.provider];
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  switch (cfg.provider) {
    case 'google': {
      const res = await fetchImpl(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(cfg.key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: languageOf(voice), name: voice },
          audioConfig: { audioEncoding: 'MP3' },
        }),
        signal,
      });
      await check(res, 'Google');
      const { audioContent } = (await res.json()) as { audioContent: string };
      return { data: Buffer.from(audioContent, 'base64'), mime: 'audio/mpeg' };
    }
    case 'azure': {
      if (!cfg.region) throw new Error('Azure TTS needs a region, e.g. eastus');
      const res = await fetchImpl(`https://${encodeURIComponent(cfg.region)}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': cfg.key,
          'content-type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'user-agent': 'fluxion',
        },
        body: `<speak version="1.0" xml:lang="${escapeXml(languageOf(voice))}"><voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`,
        signal,
      });
      await check(res, 'Azure');
      return { data: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' };
    }
    case 'elevenlabs': {
      const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
        method: 'POST',
        headers: { 'xi-api-key': cfg.key, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
        signal,
      });
      await check(res, 'ElevenLabs');
      return { data: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' };
    }
  }
}

export interface CloudVoiceOption {
  id: string; // what goes in the voice setting
  label: string;
}

// The voices the host's account can use, for the dashboard's picker. ElevenLabs includes the host's own
// library (premade, cloned and community voices they added).
export async function listCloudVoices(
  cfg: Omit<CloudVoice, 'voice'>,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudVoiceOption[]> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  switch (cfg.provider) {
    case 'google': {
      const res = await fetchImpl(`https://texttospeech.googleapis.com/v1/voices?key=${encodeURIComponent(cfg.key)}`, { signal });
      await check(res, 'Google');
      const { voices = [] } = (await res.json()) as { voices?: { name: string; ssmlGender?: string }[] };
      return voices
        .map((v) => ({ id: v.name, label: `${v.name}${v.ssmlGender ? ` (${v.ssmlGender.toLowerCase()})` : ''}` }))
        .sort((a, b) => a.id.localeCompare(b.id));
    }
    case 'azure': {
      if (!cfg.region) throw new Error('Azure TTS needs a region, e.g. eastus');
      const res = await fetchImpl(`https://${encodeURIComponent(cfg.region)}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
        headers: { 'Ocp-Apim-Subscription-Key': cfg.key },
        signal,
      });
      await check(res, 'Azure');
      const voices = (await res.json()) as { ShortName: string; LocalName?: string; Gender?: string; Locale?: string }[];
      return voices
        .map((v) => ({ id: v.ShortName, label: `${v.ShortName} — ${v.LocalName ?? ''}${v.Gender ? ` (${v.Gender.toLowerCase()})` : ''}` }))
        .sort((a, b) => a.id.localeCompare(b.id));
    }
    case 'elevenlabs': {
      const res = await fetchImpl('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': cfg.key }, signal });
      await check(res, 'ElevenLabs');
      const { voices = [] } = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string }[] };
      return voices
        .map((v) => ({ id: v.voice_id, label: `${v.name}${v.category ? ` (${v.category})` : ''}` }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
  }
}
