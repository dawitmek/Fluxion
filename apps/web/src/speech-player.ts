import type { Speech, VoiceEffect } from '@fluxion/shared';
import { espeakWav } from './espeak';
import { applyEffect, utteranceEffect } from './voice-effects';

const MAX_PENDING = 5; // busy chat: drop new lines rather than fall minutes behind

// Says one thing at a time. Audio and eSpeak play through the page's AudioContext, which OBS captures;
// browser voices go straight to the system output.
export class SpeechPlayer {
  private queue: Speech[] = [];
  private speaking = false;

  constructor(private audio: () => AudioContext) {}

  say(speech: Speech) {
    if (this.queue.length >= MAX_PENDING) return;
    this.queue.push(speech);
    void this.pump();
  }

  stop() {
    this.queue = [];
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  // Plays one line now and reports failures; the dashboard's preview uses it.
  async play(speech: Speech) {
    const effect = speech.effect ?? 'none';
    switch (speech.kind) {
      case 'browser':
        return this.browser(speech.text, speech.voice, effect);
      case 'espeak':
        return this.buffer(await espeakWav(speech.text, speech.voice), effect);
      case 'audio':
        return this.buffer(Uint8Array.from(atob(speech.data), (c) => c.charCodeAt(0)).buffer, effect);
    }
  }

  private async pump() {
    const next = this.speaking ? undefined : this.queue.shift();
    if (!next) return;
    this.speaking = true;
    try {
      await this.play(next);
    } catch (err) {
      console.warn('Fluxion: could not speak', err);
    } finally {
      this.speaking = false;
      void this.pump();
    }
  }

  private async buffer(bytes: ArrayBuffer, effect: VoiceEffect) {
    const ctx = this.audio();
    const buffer = await ctx.decodeAudioData(bytes);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    applyEffect(ctx, source, effect).connect(ctx.destination);
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  }

  private browser(text: string, voiceName: string | null, effect: VoiceEffect) {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceEffect(utterance, effect);
    const voice = voiceName ? speechSynthesis.getVoices().find((v) => v.name === voiceName) : undefined;
    if (voice) utterance.voice = voice;
    return new Promise<void>((resolve) => {
      utterance.onend = utterance.onerror = () => resolve();
      speechSynthesis.speak(utterance);
    });
  }
}
