import { TIKTOK_VOICES } from '@fluxion/shared';

// TikTok's own text-to-speech, the endpoint its app uses. It's unofficial: it needs a signed-in TikTok
// session (the sessionid cookie) and may change without notice. The host signs in from the companion app.

export interface TiktokVoice {
  session: string;
  voice: string | null;
}

const TIMEOUT_MS = 10_000;
export const TIKTOK_MAX_CHARS = 300; // longer text is refused by TikTok

// Tried in order. A session only works where TikTok stores its account: US accounts on the .us host, others on
// the global ones. So a refusal, like a network failure, moves on to the next host.
const API_HOSTS = [
  'api16-normal-useast5.us.tiktokv.com',
  'api16-normal-v6.tiktokv.com',
  'api16-normal-c-useast1a.tiktokv.com',
  'api22-normal-c-useast2a.tiktokv.com',
];
const USER_AGENT = 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; en_US; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)';

// What TikTok's status codes mean for the host.
const STATUS_MESSAGES: Record<number, string> = {
  1: 'TikTok signed you out. Sign in to TikTok again from the companion app.',
  2: 'That text is too long for TikTok voices',
  4: 'TikTok no longer offers that voice. Pick another one.',
  5: 'Sign in to TikTok from the companion app first',
};

export class TiktokError extends Error {}

interface TiktokResponse {
  status_code?: number;
  status_msg?: string;
  data?: { v_str?: string };
}

export async function synthesizeTiktok(cfg: TiktokVoice, text: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  const query = new URLSearchParams({
    text_speaker: cfg.voice || TIKTOK_VOICES[0].id,
    // Spelled out, as other TikTok TTS clients do: the endpoint has mishandled both.
    req_text: text.slice(0, TIKTOK_MAX_CHARS).replace(/\+/g, ' plus ').replace(/&/g, ' and '),
    speaker_map_type: '0',
    aid: '1233',
  });
  let networkError: unknown;
  let refusal: TiktokResponse | null = null; // the most telling refusal: anything beats "signed out" (1)
  for (const host of API_HOSTS) {
    let res: Response;
    try {
      res = await fetchImpl(`https://${host}/media/api/text/speech/invoke/?${query}`, {
        method: 'POST',
        body: '', // the .us host rejects a POST without a Content-Length
        headers: { 'user-agent': USER_AGENT, cookie: `sessionid=${cfg.session}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      networkError = err;
      continue;
    }
    const body = (await res.json().catch(() => null)) as TiktokResponse | null;
    if (!body) {
      networkError = new Error(`unexpected response (${res.status})`);
      continue;
    }
    if (body.status_code === 0 && body.data?.v_str) return Buffer.from(body.data.v_str, 'base64');
    if (!refusal || refusal.status_code === 1) refusal = body;
  }
  if (refusal) {
    const code = refusal.status_code ?? -1;
    throw new TiktokError(STATUS_MESSAGES[code] ?? `TikTok TTS failed (${code}): ${refusal.status_msg || 'no details'}`);
  }
  throw new TiktokError(`Could not reach TikTok's voice service: ${(networkError as Error)?.message ?? 'unknown error'}`);
}
