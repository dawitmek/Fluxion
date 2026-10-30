import type { VoiceEffect } from '@fluxion/shared';

// Wires `source` through the effect and returns the node to connect to the speakers.
// Pitch effects change playbackRate, so they also change speed, like a sped-up tape.
export function applyEffect(ctx: AudioContext, source: AudioBufferSourceNode, effect: VoiceEffect): AudioNode {
  switch (effect) {
    case 'none':
      return source;
    case 'chipmunk':
      source.playbackRate.value = 1.45;
      return source;
    case 'deep':
      source.playbackRate.value = 0.8;
      return source;
    case 'monster': {
      source.playbackRate.value = 0.68;
      const growl = shaper(ctx, 4);
      const muffle = filter(ctx, 'lowpass', 2200);
      source.connect(growl).connect(muffle);
      return muffle;
    }
    case 'robot': {
      // Ring modulation: multiply the voice by a low tone for the classic metallic robot sound.
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const carrier = ctx.createOscillator();
      carrier.frequency.value = 50;
      carrier.connect(ring.gain);
      carrier.start();
      source.addEventListener('ended', () => carrier.stop());
      source.connect(ring);
      return ring;
    }
    case 'radio': {
      const low = filter(ctx, 'highpass', 400);
      const high = filter(ctx, 'lowpass', 3000);
      const crunch = shaper(ctx, 12);
      source.connect(low).connect(high).connect(crunch);
      return crunch;
    }
    case 'echo': {
      const out = ctx.createGain();
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.22;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.35;
      source.connect(out);
      source.connect(delay).connect(feedback).connect(delay);
      delay.connect(out);
      return out;
    }
  }
}

// Browser voices can only change pitch (0–2) and rate.
export function utteranceEffect(utterance: SpeechSynthesisUtterance, effect: VoiceEffect) {
  const settings: Partial<Record<VoiceEffect, [pitch: number, rate: number]>> = {
    chipmunk: [2, 1.3],
    deep: [0.4, 0.9],
    monster: [0.1, 0.8],
  };
  const [pitch, rate] = settings[effect] ?? [1, 1];
  utterance.pitch = pitch;
  utterance.rate = rate;
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  return node;
}

// Soft clipping; higher amounts sound harsher.
function shaper(ctx: AudioContext, amount: number) {
  const node = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  node.curve = curve;
  return node;
}
