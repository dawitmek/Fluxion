import type { ServerToOverlay } from '@fluxion/shared';
import { playSound } from './sounds';

type AlertMessage = Extract<ServerToOverlay, { type: 'alert' }>;

const ALERT_MS = 5000;
const MAX_QUEUED_ALERTS = 20; // a follow storm shouldn't keep alerts running for minutes
const MAX_PENDING_SPEECH = 5; // busy chat: drop new lines rather than fall minutes behind

// Shows alerts one at a time with their sound, and speaks alert and chat text with the browser's voices.
export class AlertPlayer {
  private queue: AlertMessage[] = [];
  private showing = false;
  private audio: AudioContext | null = null;
  private pendingSpeech = 0;
  private nextId = 0;

  constructor(
    private onShow: (alert: { id: number; text: string } | null) => void,
    // Browsers (not OBS) block audio until the page is clicked; the overlay asks for a click then.
    private onBlocked: (blocked: boolean) => void,
  ) {}

  enqueue(alert: AlertMessage) {
    if (this.queue.length >= MAX_QUEUED_ALERTS) this.queue.shift();
    this.queue.push(alert);
    this.next();
  }

  speak(text: string, voiceName: string | null) {
    if (!('speechSynthesis' in window) || this.pendingSpeech >= MAX_PENDING_SPEECH) return;
    this.context(); // surfaces the click-to-enable hint when audio is blocked
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voiceName ? speechSynthesis.getVoices().find((v) => v.name === voiceName) : undefined;
    if (voice) utterance.voice = voice;
    this.pendingSpeech++;
    utterance.onend = utterance.onerror = () => this.pendingSpeech--;
    speechSynthesis.speak(utterance);
  }

  // Called from a click on the page.
  unblock() {
    void this.context().resume();
  }

  stop() {
    this.queue = [];
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    void this.audio?.close();
    this.audio = null;
  }

  private next() {
    const alert = this.showing ? undefined : this.queue.shift();
    if (!alert) return;
    this.showing = true;
    this.onShow({ id: this.nextId++, text: alert.text });
    if (alert.sound) playSound(this.context(), alert.sound);
    if (alert.speak) this.speak(alert.text, alert.voice);
    setTimeout(() => {
      this.showing = false;
      this.onShow(null);
      this.next();
    }, ALERT_MS);
  }

  private context() {
    if (!this.audio) {
      this.audio = new AudioContext();
      const audio = this.audio;
      audio.onstatechange = () => this.onBlocked(audio.state === 'suspended');
      this.onBlocked(audio.state === 'suspended');
    }
    return this.audio;
  }
}
