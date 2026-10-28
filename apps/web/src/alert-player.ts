import type { ServerToOverlay, Speech } from '@fluxion/shared';
import { playSound } from './sounds';
import { SpeechPlayer } from './speech-player';

type AlertMessage = Extract<ServerToOverlay, { type: 'alert' }>;

const ALERT_MS = 5000;
const MAX_QUEUED_ALERTS = 20; // a follow storm shouldn't keep alerts running for minutes

// Shows alerts one at a time with their sound, and speaks alert and chat text.
export class AlertPlayer {
  private queue: AlertMessage[] = [];
  private showing = false;
  private audio: AudioContext | null = null;
  private speech = new SpeechPlayer(() => this.context());
  private nextId = 0;

  constructor(
    private onShow: (alert: { id: number; text: string } | null) => void,
    // Browsers (not OBS) block audio until the page is clicked; the overlay asks for a click then.
    private onBlocked: (blocked: boolean) => void,
  ) {}

  // Sets up audio on page load, so a browser that blocks it asks for a click before the first alert, not after.
  start() {
    this.context();
  }

  enqueue(alert: AlertMessage) {
    if (this.queue.length >= MAX_QUEUED_ALERTS) this.queue.shift();
    this.queue.push(alert);
    this.next();
  }

  say(speech: Speech) {
    this.speech.say(speech);
  }

  // Called from a click on the page.
  unblock() {
    void this.context().resume();
  }

  stop() {
    this.queue = [];
    this.speech.stop();
    void this.audio?.close();
    this.audio = null;
  }

  private next() {
    const alert = this.showing ? undefined : this.queue.shift();
    if (!alert) return;
    this.showing = true;
    this.onShow({ id: this.nextId++, text: alert.text });
    if (alert.sound) playSound(this.context(), alert.sound);
    if (alert.speech) this.say(alert.speech);
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
