import type { AlertSound } from '@fluxion/shared';

// Alert sounds, synthesized with Web Audio so there are no audio files to host or license.
type Note = { freq: number; start: number; length: number; type?: OscillatorType; gain?: number };

function tone(ctx: AudioContext, { freq, start, length, type = 'sine', gain = 0.25 }: Note, endFreq?: number) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + length);
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length);
}

function noise(ctx: AudioContext, length: number) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.5;
  const t = ctx.currentTime;
  filter.frequency.setValueAtTime(300, t);
  filter.frequency.exponentialRampToValueAtTime(3000, t + length * 0.6);
  filter.frequency.exponentialRampToValueAtTime(500, t + length);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.001, t);
  amp.gain.exponentialRampToValueAtTime(0.4, t + length * 0.5);
  amp.gain.exponentialRampToValueAtTime(0.001, t + length);
  source.connect(filter).connect(amp).connect(ctx.destination);
  source.start(t);
}

export function playSound(ctx: AudioContext, sound: AlertSound) {
  switch (sound) {
    case 'chime':
      tone(ctx, { freq: 1318.5, start: 0, length: 0.6 });
      tone(ctx, { freq: 1975.5, start: 0.12, length: 0.9 });
      break;
    case 'coin':
      tone(ctx, { freq: 987.8, start: 0, length: 0.08, type: 'square', gain: 0.12 });
      tone(ctx, { freq: 1318.5, start: 0.08, length: 0.45, type: 'square', gain: 0.12 });
      break;
    case 'pop':
      tone(ctx, { freq: 600, start: 0, length: 0.12, gain: 0.4 }, 180);
      break;
    case 'fanfare':
      [523.3, 659.3, 784, 1046.5].forEach((freq, i) =>
        tone(ctx, { freq, start: i * 0.11, length: i === 3 ? 0.8 : 0.2, type: 'triangle', gain: 0.3 }),
      );
      break;
    case 'whoosh':
      noise(ctx, 0.7);
      break;
  }
}
