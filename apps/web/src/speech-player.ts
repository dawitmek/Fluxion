import type { Speech, VoiceEffect } from '@fluxion/shared';
import { espeakWav } from './espeak';
import { applyEffect, utteranceEffect } from './voice-effects';

const MAX_PENDING = 5; // busy chat: drop new lines rather than fall minutes behind

export type Report = (message: string, data?: Record<string, unknown>) => void; // for the server's debug log
const about = (speech: Speech) => ({ kind: speech.kind, ...(speech.kind !== 'audio' && { text: speech.text }) });

// Says one thing at a time. Audio and eSpeak play through the page's AudioContext, which OBS captures;
// browser voices go straight to the system output.
export class SpeechPlayer {
  private queue: Speech[] = [];
  private speaking = false;
  private source: AudioBufferSourceNode | null = null; // the line playing now, if it's audio
  private generation = 0; // bumped by stop(), so a line still being made isn't played after it
  report: Report = () => {};

  constructor(private audio: () => AudioContext) {}

  say(speech: Speech) {
    if (this.queue.length >= MAX_PENDING) return this.report('speech dropped, too many waiting', about(speech));
    this.queue.push(speech);
    this.report('speech queued', { ...about(speech), waiting: this.queue.length, speaking: this.speaking });
    void this.pump();
  }

  // Drops what's waiting and cuts off what's playing.
  stop(reason: string) {
    if (this.queue.length || this.speaking) this.report(`speech stopped: ${reason}`, { dropped: this.queue.length, cutOff: this.speaking });
    this.queue = [];
    this.generation++;
    this.source?.stop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  // Plays one line now and reports failures; the dashboard's preview uses it.
  async play(speech: Speech) {
    const effect = speech.effect ?? 'none';
    const generation = this.generation;
    switch (speech.kind) {
      case 'browser':
        return this.browser(speech.text, speech.voice, effect);
      case 'espeak':
        return this.buffer(await espeakWav(speech.text, speech.voice), effect, generation);
      case 'audio':
        return this.buffer(Uint8Array.from(atob(speech.data), (c) => c.charCodeAt(0)).buffer, effect, generation);
    }
  }

  private async pump() {
    const next = this.speaking ? undefined : this.queue.shift();
    if (!next) return;
    this.speaking = true;
    this.report('speaking', { ...about(next), waiting: this.queue.length });
    try {
      await this.play(next);
    } catch (err) {
      console.warn('Fluxion: could not speak', err);
      this.report('could not speak', { error: String(err) });
    } finally {
      this.speaking = false;
      void this.pump();
    }
  }

  private async buffer(bytes: ArrayBuffer, effect: VoiceEffect, generation: number) {
    const ctx = this.audio();
    const buffer = await ctx.decodeAudioData(bytes);
    if (generation !== this.generation) return; // stopped while it was being made
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    applyEffect(ctx, source, effect).connect(ctx.destination);
    this.source = source;
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
    if (this.source === source) this.source = null;
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
