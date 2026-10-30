import type { Speech, VoiceEffect } from '@fluxion/shared';
import { espeakWav } from './espeak';
import { applyEffect, utteranceEffect } from './voice-effects';

const MAX_PENDING = 5; // busy chat: drop new lines rather than fall minutes behind

export type Report = (message: string, data?: Record<string, unknown>) => void; // for the server's debug log
const about = (speech: Speech) => ({ kind: speech.kind, ...(speech.kind !== 'audio' && { text: speech.text }) });

// Says one thing at a time. Audio and eSpeak play through the page's AudioContext, which OBS captures;
// browser voices go straight to the system output.
type Line = { speech: Speech; chat: boolean }; // chat: read-aloud chat, rather than an alert's text

export class SpeechPlayer {
  private queue: Line[] = [];
  private speaking: Line | null = null;
  private source: AudioBufferSourceNode | null = null; // the line playing now, if it's audio
  private generation = 0; // bumped by stop(), so a line still being made isn't played after it
  private gain: GainNode | null = null; // every line plays through it, so a volume change reaches the one playing
  private volume = 1;
  report: Report = () => {};

  constructor(private audio: () => AudioContext) {}

  say(speech: Speech, chat = false) {
    if (this.queue.length >= MAX_PENDING) return this.report('speech dropped, too many waiting', about(speech));
    this.queue.push({ speech, chat });
    this.report('speech queued', { ...about(speech), waiting: this.queue.length, speaking: !!this.speaking });
    void this.pump();
  }

  // Drops what's waiting and cuts off what's playing; with chatOnly, just the read-aloud chat.
  stop(reason: string, chatOnly = false) {
    const dropped = this.queue.filter((l) => !chatOnly || l.chat).length;
    const cut = !!this.speaking && (!chatOnly || this.speaking.chat);
    if (dropped || cut) this.report(`speech stopped: ${reason}`, { dropped, cutOff: cut });
    this.queue = chatOnly ? this.queue.filter((l) => !l.chat) : [];
    if (!cut) return;
    this.generation++;
    this.source?.stop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  // 0 to 1. Audio and eSpeak change at once, mid-line too; a browser voice from its next line.
  setVolume(volume: number) {
    this.volume = volume;
    if (this.gain) this.gain.gain.value = volume;
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
    this.speaking = next;
    this.report('speaking', { ...about(next.speech), waiting: this.queue.length });
    try {
      await this.play(next.speech);
    } catch (err) {
      console.warn('Fluxion: could not speak', err);
      this.report('could not speak', { error: String(err) });
    } finally {
      this.speaking = null;
      void this.pump();
    }
  }

  private async buffer(bytes: ArrayBuffer, effect: VoiceEffect, generation: number) {
    const ctx = this.audio();
    const buffer = await ctx.decodeAudioData(bytes);
    if (generation !== this.generation) return; // stopped while it was being made
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    applyEffect(ctx, source, effect).connect(this.output(ctx));
    this.source = source;
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
    if (this.source === source) this.source = null;
  }

  // A new page's audio (the overlay remakes it after closing) gets a new volume node.
  private output(ctx: AudioContext) {
    if (this.gain?.context !== ctx) {
      this.gain = ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(ctx.destination);
    }
    return this.gain;
  }

  private browser(text: string, voiceName: string | null, effect: VoiceEffect) {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceEffect(utterance, effect);
    utterance.volume = this.volume;
    const voice = voiceName ? speechSynthesis.getVoices().find((v) => v.name === voiceName) : undefined;
    if (voice) utterance.voice = voice;
    return new Promise<void>((resolve) => {
      utterance.onend = utterance.onerror = () => resolve();
      speechSynthesis.speak(utterance);
    });
  }
}
