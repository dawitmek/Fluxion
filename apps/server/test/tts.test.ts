import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Piper, wav } from '../src/tts/piper.js';
import { errorMessage, listCloudVoices, synthesizeCloud } from '../src/tts/cloud.js';
import { SpeechService, type VoiceConfig } from '../src/tts/speech.js';
import { synthesizeTiktok } from '../src/tts/tiktok.js';
import type { ServerTiktokAccount } from '../src/tts/tiktok-account.js';

const fixture = (p: string) => fileURLToPath(new URL(`./fixtures/${p}`, import.meta.url));
// The fake Piper is a Node script, so it runs the same on macOS, Linux and Windows.
const fakePiper = () => new Piper(process.execPath, fixture('piper-voices'), [fixture('fake-piper.mjs')]);

const voice = (cfg: Partial<VoiceConfig>): VoiceConfig => ({
  engine: 'piper',
  browserVoice: null,
  espeakVoice: 'en-us',
  piperVoice: null,
  piperSpeaker: null,
  cloud: null,
  tiktok: { session: null, voice: null },
  effect: 'none',
  ...cfg,
});

describe('piper', () => {
  it('lists voices that have a model and a config, with their speaker counts', async () => {
    expect(await fakePiper().voices()).toEqual([
      { name: 'another_voice', speakers: 1 },
      { name: 'many_voices', speakers: 3 },
      { name: 'test_voice', speakers: 1 },
    ]);
    expect(await new Piper(undefined, fixture('piper-voices')).voices()).toEqual([]);
  });

  it("wraps Piper's raw output in a WAV header with the voice's sample rate", async () => {
    const audio = await fakePiper().synthesize('hello', 'test_voice');
    expect(audio.subarray(0, 4).toString()).toBe('RIFF');
    expect(audio.readUInt32LE(24)).toBe(16000);
    expect(audio.length).toBe(44 + 10); // fake Piper writes 2 bytes per character
    expect((await fakePiper().synthesize('hi', 'missing')).readUInt32LE(24)).toBe(22050); // first voice
  });

  it('passes the speaker to multi-speaker voices only, and only when it exists', async () => {
    const speakerOf = async (voice: string, speaker: number | null) => (await fakePiper().synthesize('hi', voice, speaker))[44];
    expect(await speakerOf('many_voices', 2)).toBe(2);
    expect(await speakerOf('many_voices', 3)).toBe(0); // out of range
    expect(await speakerOf('many_voices', null)).toBe(0);
    expect(await speakerOf('test_voice', 2)).toBe(0); // single-speaker model
  });

  it('reports Piper failures', async () => {
    await expect(fakePiper().synthesize('FAIL', null)).rejects.toThrow('synthesis failed');
  });

  it('runs at most two at once but finishes every queued line', async () => {
    const piper = fakePiper();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => piper.synthesize(`line ${i}`, null)));
    expect(results.map((r) => r.length)).toEqual(Array(6).fill(44 + 12));
  });

  it('builds a valid WAV header', () => {
    const out = wav(Buffer.alloc(8), 24000);
    expect([out.toString('ascii', 8, 12), out.readUInt32LE(4), out.readUInt32LE(40)]).toEqual(['WAVE', 44, 8]);
  });
});

describe('cloud TTS', () => {
  const recorder = () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return new Response(new Uint8Array([1, 2, 3]));
    }) as typeof fetch;
    return { calls, fetchImpl };
  };

  it('calls Azure with escaped SSML and the region', async () => {
    const { calls, fetchImpl } = recorder();
    const out = await synthesizeCloud({ provider: 'azure', key: 'k', region: 'eastus', voice: null }, 'a < b & "c"', fetchImpl);
    expect(out).toEqual({ data: Buffer.from([1, 2, 3]), mime: 'audio/mpeg' });
    expect(calls[0]!.url).toBe('https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');
    expect((calls[0]!.init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe('k');
    expect(calls[0]!.init.body).toBe(
      '<speak version="1.0" xml:lang="en-US"><voice name="en-US-AriaNeural">a &lt; b &amp; &quot;c&quot;</voice></speak>',
    );
    await expect(synthesizeCloud({ provider: 'azure', key: 'k', region: null, voice: null }, 'x', fetchImpl)).rejects.toThrow('region');
  });

  it("shows the provider's own error message", () => {
    expect(errorMessage('{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","details":[]}}')).toBe(
      'API key not valid. Please pass a valid API key.',
    );
    expect(errorMessage('{"detail":{"status":"invalid_api_key","message":"Invalid API key"}}')).toBe('Invalid API key');
    expect(errorMessage('{"detail":"Not found"}')).toBe('Not found');
    expect(errorMessage('')).toBe('no details');
    expect(errorMessage('Unauthorized')).toBe('Unauthorized');
  });

  it("lists each provider's voices for the picker", async () => {
    const respond = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch;
    expect(
      await listCloudVoices(
        { provider: 'google', key: 'k', region: null },
        respond({ voices: [{ name: 'en-US-Neural2-F', ssmlGender: 'FEMALE' }, { name: 'de-DE-Neural2-B' }] }),
      ),
    ).toEqual([
      { id: 'de-DE-Neural2-B', label: 'de-DE-Neural2-B' },
      { id: 'en-US-Neural2-F', label: 'en-US-Neural2-F (female)' },
    ]);
    expect(
      await listCloudVoices(
        { provider: 'azure', key: 'k', region: 'eastus' },
        respond([{ ShortName: 'en-US-AriaNeural', LocalName: 'Aria', Gender: 'Female' }]),
      ),
    ).toEqual([{ id: 'en-US-AriaNeural', label: 'en-US-AriaNeural — Aria (female)' }]);
    expect(
      await listCloudVoices(
        { provider: 'elevenlabs', key: 'k', region: null },
        respond({ voices: [{ voice_id: 'x1', name: 'Rachel', category: 'premade' }] }),
      ),
    ).toEqual([{ id: 'x1', label: 'Rachel (premade)' }]);
  });

  it('calls ElevenLabs with the voice id in the path', async () => {
    const { calls, fetchImpl } = recorder();
    await synthesizeCloud({ provider: 'elevenlabs', key: 'k', region: null, voice: 'abc/../x' }, 'hi', fetchImpl);
    expect(calls[0]!.url).toBe('https://api.elevenlabs.io/v1/text-to-speech/abc%2F..%2Fx');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ text: 'hi' });
  });
});

describe('speech service', () => {
  it('falls back to in-overlay eSpeak when a server engine fails, and reports why', async () => {
    const errors: unknown[] = [];
    const failing = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const service = new SpeechService(fakePiper(), (e) => errors.push(e), failing);
    const cloud = voice({ engine: 'cloud', espeakVoice: 'de', cloud: { provider: 'google', key: 'k', region: null, voice: null } });
    expect(await service.speak({ ...cloud, effect: 'echo' }, 'hallo')).toEqual({ kind: 'espeak', text: 'hallo', voice: 'de', effect: 'echo' });
    expect(String(errors[0])).toContain('Google TTS failed (500)');
    await expect(service.speakStrict(cloud, 'hallo')).rejects.toThrow('500');
    expect(await service.speak(voice({ engine: 'piper' }), 'FAIL')).toMatchObject({ kind: 'espeak' });
  });

  it('returns Piper audio, browser voices and eSpeak as asked', async () => {
    const service = new SpeechService(fakePiper());
    expect(await service.speak(voice({ engine: 'piper', piperVoice: 'test_voice' }), 'hi')).toMatchObject({ kind: 'audio', mime: 'audio/wav' });
    expect(await service.speak(voice({ engine: 'browser', browserVoice: 'Zira' }), 'hi')).toEqual({
      kind: 'browser',
      text: 'hi',
      voice: 'Zira',
      effect: 'none',
    });
    expect(await service.speak(voice({ engine: 'espeak', espeakVoice: 'fr', effect: 'robot' }), 'hi')).toEqual({
      kind: 'espeak',
      text: 'hi',
      voice: 'fr',
      effect: 'robot',
    });
    // Piper selected on a server without Piper: eSpeak, no error.
    expect(await new SpeechService(new Piper(undefined, undefined)).speakStrict(voice({}), 'hi')).toMatchObject({ kind: 'espeak' });
  });
});

describe('tiktok voices', () => {
  const ok = () => Response.json({ status_code: 0, data: { v_str: Buffer.from('mp3').toString('base64') } });

  it('sends the session as a cookie and decodes the audio', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const audio = await synthesizeTiktok({ session: 'abc', voice: null }, 'a+b', (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return ok();
    }) as typeof fetch);
    expect(audio.toString()).toBe('mp3');
    expect(new Headers(calls[0]!.init.headers).get('cookie')).toBe('sessionid=abc');
    const query = new URL(calls[0]!.url).searchParams;
    expect([query.get('text_speaker'), query.get('req_text')]).toEqual(['en_us_001', 'a plus b']);
  });

  it('moves to the next API host when one cannot be reached', async () => {
    const hosts: string[] = [];
    const audio = await synthesizeTiktok({ session: 'abc', voice: 'en_us_002' }, 'hi', (async (url: string) => {
      hosts.push(new URL(url).host);
      if (hosts.length === 1) throw new TypeError('fetch failed');
      return ok();
    }) as typeof fetch);
    expect(audio.toString()).toBe('mp3');
    expect(hosts).toHaveLength(2);
    expect(hosts[0]).not.toBe(hosts[1]);
  });

  it('tries the next host when one refuses the session', async () => {
    let calls = 0;
    const audio = await synthesizeTiktok({ session: 'abc', voice: null }, 'hi', (async () =>
      ++calls === 1 ? Response.json({ status_code: 1, status_msg: 'Couldn’t load speech' }) : ok()) as unknown as typeof fetch);
    expect([audio.toString(), calls]).toEqual(['mp3', 2]);
  });

  it("uses the server's account unless the host signed in with their own", async () => {
    const cookies: (string | null)[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      cookies.push(new Headers(init.headers).get('cookie'));
      return ok();
    }) as typeof fetch;
    const account = { session: 'serveraccount', record: async () => {}, recordFailure: async () => {} } as unknown as ServerTiktokAccount;
    const service = new SpeechService(fakePiper(), () => {}, fetchImpl, account);
    await service.speakStrict(voice({ engine: 'tiktok' }), 'hi');
    await service.speakStrict(voice({ engine: 'tiktok', tiktok: { session: 'hostaccount', voice: null } }), 'hi');
    expect(cookies).toEqual(['sessionid=serveraccount', 'sessionid=hostaccount']);
    await expect(new SpeechService(fakePiper(), () => {}, fetchImpl).speakStrict(voice({ engine: 'tiktok' }), 'hi')).rejects.toThrow('Sign in to TikTok');
  });

  it("explains TikTok's status codes", async () => {
    const answer = (body: object) => (async () => Response.json(body)) as unknown as typeof fetch;
    await expect(synthesizeTiktok({ session: 'x', voice: 'gone' }, 'hi', answer({ status_code: 4 }))).rejects.toThrow('no longer offers that voice');
    await expect(synthesizeTiktok({ session: 'x', voice: null }, 'hi', answer({ status_code: 9, status_msg: 'odd' }))).rejects.toThrow('TikTok TTS failed (9): odd');
    const unreachable = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(synthesizeTiktok({ session: 'x', voice: null }, 'hi', unreachable)).rejects.toThrow("Could not reach TikTok's voice service: fetch failed");
  });
});
