import type { Speech, TtsEngine, VoiceEffect } from '@fluxion/shared';
import type { hosts } from '../db/schema.js';
import { synthesizeCloud, type CloudVoice } from './cloud.js';
import type { Piper } from './piper.js';

export interface VoiceConfig {
  engine: TtsEngine;
  browserVoice: string | null;
  espeakVoice: string;
  piperVoice: string | null;
  piperSpeaker: number | null;
  cloud: CloudVoice | null; // null until the host sets a provider and key
  effect: VoiceEffect;
}

export function voiceConfig(host: typeof hosts.$inferSelect): VoiceConfig {
  return {
    engine: host.ttsEngine,
    browserVoice: host.ttsVoice,
    espeakVoice: host.ttsEspeakVoice,
    piperVoice: host.ttsPiperVoice,
    piperSpeaker: host.ttsPiperSpeaker,
    effect: host.ttsEffect,
    cloud:
      host.ttsCloudProvider && host.ttsCloudKey
        ? { provider: host.ttsCloudProvider, key: host.ttsCloudKey, region: host.ttsCloudRegion, voice: host.ttsCloudVoice }
        : null,
  };
}

// Turns text into whatever the overlay needs to say it. Server-side engines that fail fall back to eSpeak,
// which runs in the overlay and always works, so a line is never silently lost.
export class SpeechService {
  constructor(
    private piper: Piper,
    private onError: (err: unknown) => void = () => {},
    readonly fetchImpl: typeof fetch = fetch, // tests swap in a fake provider
  ) {}

  async speak(cfg: VoiceConfig, text: string): Promise<Speech> {
    const espeak: Speech = { kind: 'espeak', text, voice: cfg.espeakVoice, effect: cfg.effect };
    try {
      return await this.speakStrict(cfg, text);
    } catch (err) {
      this.onError(err);
      return espeak;
    }
  }

  // Like speak(), but reports failures; the dashboard's preview uses it to show what went wrong.
  async speakStrict(cfg: VoiceConfig, text: string): Promise<Speech> {
    return { ...(await this.make(cfg, text)), effect: cfg.effect };
  }

  private async make(cfg: VoiceConfig, text: string): Promise<Speech> {
    switch (cfg.engine) {
      case 'browser':
        return { kind: 'browser', text, voice: cfg.browserVoice };
      case 'espeak':
        return { kind: 'espeak', text, voice: cfg.espeakVoice };
      case 'piper': {
        if ((await this.piper.voices()).length === 0) return { kind: 'espeak', text, voice: cfg.espeakVoice }; // not installed
        const audio = await this.piper.synthesize(text, cfg.piperVoice, cfg.piperSpeaker);
        return { kind: 'audio', data: audio.toString('base64'), mime: 'audio/wav' };
      }
      case 'cloud': {
        if (!cfg.cloud) throw new Error('Choose a cloud provider and enter your API key first');
        const { data, mime } = await synthesizeCloud(cfg.cloud, text, this.fetchImpl);
        return { kind: 'audio', data: data.toString('base64'), mime };
      }
    }
  }
}
