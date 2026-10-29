import type { ServerToOverlay } from '@fluxion/shared';
import { playSound } from '../sounds';
import { SpeechPlayer } from '../speech-player';

// One AudioContext for previewing sounds and voices on the dashboard, made on first use (after a click).
let context: AudioContext | null = null;
export const previewAudio = () => (context ??= new AudioContext());

let speech: SpeechPlayer | null = null;

// Plays an alert's sound and voice here, the way the overlay would.
export function playAlertPreview(alert: Extract<ServerToOverlay, { type: 'alert' }>) {
  const audio = previewAudio();
  void audio.resume();
  if (alert.sound) playSound(audio, alert.sound);
  if (alert.soundFile) void new Audio(`/media/${alert.soundFile}`).play();
  if (alert.speech) (speech ??= new SpeechPlayer(previewAudio)).say(alert.speech);
}
