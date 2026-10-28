import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Piper, wav } from '../src/tts/piper.js';
import { errorMessage, synthesizeCloud } from '../src/tts/cloud.js';
import { SpeechService, type VoiceConfig } from '../src/tts/speech.js';

const fixture = (p: string) => fileURLToPath(new URL(`./fixtures/${p}`, import.meta.url));
// The fake Piper is a Node script, so it runs the same on macOS, Linux and Windows.
const fakePiper = () => new Piper(process.execPath, fixture('piper-voices'), [fixture('fake-piper.mjs')]);

const voice = (cfg: Partial<VoiceConfig>): VoiceConfig => ({
  engine: 'piper',
  browserVoice: null,
  espeakVoice: 'en-us',
  piperVoice: null,
  cloud: null,
  ...cfg,
});

describe('piper', () => {
  it('lists voices that have a model and a config', async () => {
    expect(await fakePiper().voices()).toEqual(['another_voice', 'test_voice']);
    expect(await new Piper(undefined, fixture('piper-voices')).voices()).toEqual([]);
  });

  it("wraps Piper's raw output in a WAV header with the voice's sample rate", async () => {
    const audio = await fakePiper().synthesize('hello', 'test_voice');
    expect(audio.subarray(0, 4).toString()).toBe('RIFF');
    expect(audio.readUInt32LE(24)).toBe(16000);
    expect(audio.length).toBe(44 + 10); // fake Piper writes 2 bytes per character
    expect((await fakePiper().synthesize('hi', 'missing')).readUInt32LE(24)).toBe(22050); // first voice
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
    expect(await service.speak(cloud, 'hallo')).toEqual({ kind: 'espeak', text: 'hallo', voice: 'de' });
    expect(String(errors[0])).toContain('Google TTS failed (500)');
    await expect(service.speakStrict(cloud, 'hallo')).rejects.toThrow('500');
    expect(await service.speak(voice({ engine: 'piper' }), 'FAIL')).toMatchObject({ kind: 'espeak' });
  });

  it('returns Piper audio, browser voices and eSpeak as asked', async () => {
    const service = new SpeechService(fakePiper());
    expect(await service.speak(voice({ engine: 'piper', piperVoice: 'test_voice' }), 'hi')).toMatchObject({ kind: 'audio', mime: 'audio/wav' });
    expect(await service.speak(voice({ engine: 'browser', browserVoice: 'Zira' }), 'hi')).toEqual({ kind: 'browser', text: 'hi', voice: 'Zira' });
    expect(await service.speak(voice({ engine: 'espeak', espeakVoice: 'fr' }), 'hi')).toEqual({ kind: 'espeak', text: 'hi', voice: 'fr' });
    // Piper selected on a server without Piper: eSpeak, no error.
    expect(await new SpeechService(new Piper(undefined, undefined)).speakStrict(voice({}), 'hi')).toMatchObject({ kind: 'espeak' });
  });
});
