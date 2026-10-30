import type { MediaKind, ServerToOverlay, Speech } from '@fluxion/shared';
import { playSound } from './sounds';
import { SpeechPlayer, type Report } from './speech-player';

type AlertMessage = Extract<ServerToOverlay, { type: 'alert' }>;
export type ShownAlert = {
  id: number;
  text: string;
  media: { url: string; kind: MediaKind } | null;
  pos: { x: number; y: number } | null; // placed by hand; null: the screen's alert position
  scale: number; // percent
};

const ALERT_MS = 5000;
const MAX_QUEUED_ALERTS = 20; // a follow storm shouldn't keep alerts running for minutes

// Shows alerts one at a time with their sound, and speaks alert and chat text. With audio off (a screen
// that shouldn't double the main one's sound) it only shows.
export class AlertPlayer {
  private queue: AlertMessage[] = [];
  private showing: AlertMessage | null = null;
  private timer: number | undefined; // ends the alert on screen
  private audio: AudioContext | null = null;
  private speech = new SpeechPlayer(() => this.context());
  private sounds = new Map<string, Promise<AudioBuffer>>(); // uploaded sounds, decoded once
  private nextId = 0;
  audible = true;

  set report(report: Report) {
    this.speech.report = report;
  }
  get report() {
    return this.speech.report;
  }

  constructor(
    private onShow: (alert: ShownAlert | null) => void,
    // Browsers (not OBS) block audio until the page is clicked; the overlay asks for a click then.
    private onBlocked: (blocked: boolean) => void,
  ) {}

  // Sets up audio on page load, so a browser that blocks it asks for a click before the first alert, not after.
  start() {
    this.context();
  }

  enqueue(alert: AlertMessage) {
    this.report('alert received', { text: alert.text, speaks: !!alert.speech, waiting: this.queue.length });
    if (this.queue.length >= MAX_QUEUED_ALERTS) this.queue.shift();
    this.queue.push(alert);
    this.next();
  }

  say(speech: Speech, chat = false, action?: string) {
    if (this.audible) this.speech.say(speech, chat, action);
    else this.report('speech not played: this screen has sound off', { kind: speech.kind });
  }

  // Called from a click on the page.
  unblock() {
    void this.context().resume();
  }

  // The voice changed: drop speech made with the old one. Or reading chat was turned off: drop just the chat.
  clearSpeech(chatOnly = false) {
    if (chatOnly) this.speech.stop('reading chat was turned off', (l) => l.chat);
    else this.speech.stop('the voice changed');
  }

  // Alerts from these actions (all alerts, with no list) go: waiting ones, the one showing, and their speech.
  dropAlerts(reason: string, actions?: string[]) {
    const from = (action: string | undefined) => !actions || (!!action && actions.includes(action));
    const dropped = this.queue.filter((a) => from(a.action)).length;
    const shown = !!this.showing && from(this.showing.action);
    if (dropped || shown) this.report(`alerts dropped: ${reason}`, { dropped, takenDown: shown });
    this.queue = this.queue.filter((a) => !from(a.action));
    this.speech.stop(reason, (l) => !l.chat && from(l.action));
    if (shown) {
      clearTimeout(this.timer);
      this.showing = null;
      this.onShow(null);
      this.next();
    }
  }

  // The screen's sound was turned off: stop speaking now, not after the lines waiting.
  silence() {
    this.speech.stop("this screen's sound was turned off");
  }

  speechVolume(volume: number) {
    this.report('voice volume', { volume });
    this.speech.setVolume(volume);
  }

  // The stream ended: drop the alerts and speech still waiting, and take down the one showing.
  clear() {
    if (this.queue.length) this.report('alerts dropped: the stream ended', { dropped: this.queue.length });
    this.queue = [];
    this.speech.stop('the stream ended');
    clearTimeout(this.timer);
    if (this.showing) (this.showing = null), this.onShow(null);
  }

  stop() {
    this.queue = [];
    this.speech.stop('the page closed');
    void this.audio?.close();
    this.audio = null;
  }

  private next() {
    const alert = this.showing ? undefined : this.queue.shift();
    if (!alert) return;
    this.showing = alert;
    const media = alert.media ? { url: `/media/${alert.media.id}`, kind: alert.media.kind } : null;
    this.onShow({ id: this.nextId++, text: alert.text, media, pos: alert.pos ?? null, scale: alert.scale ?? 100 });
    if (this.audible) {
      if (alert.sound) playSound(this.context(), alert.sound);
      if (alert.soundFile) void this.playFile(alert.soundFile);
    }
    if (alert.speech) this.say(alert.speech, false, alert.action);
    this.timer = window.setTimeout(() => {
      this.showing = null;
      this.onShow(null);
      this.next();
    }, alert.durationMs ?? ALERT_MS);
  }

  private async playFile(id: string) {
    const audio = this.context();
    let decoded = this.sounds.get(id);
    if (!decoded) {
      decoded = fetch(`/media/${id}`)
        .then((res) => res.arrayBuffer())
        .then((data) => audio.decodeAudioData(data));
      this.sounds.set(id, decoded);
    }
    try {
      const source = audio.createBufferSource();
      source.buffer = await decoded;
      source.connect(audio.destination);
      source.start();
    } catch {
      this.sounds.delete(id); // a file that failed to load or decode can be tried again next time
    }
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
