/** Layered procedural WebAudio effects. Noise, filtered transients, pitch
 *  sweeps and resonant metal replace the old single-oscillator arcade blips
 *  while preserving the game's one-file, fully offline build. */
let AC: AudioContext | null = null;
let master: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let enabled = true;

const lastPlayed: Partial<Record<SfxKind, number>> = {};
const MIN_INTERVAL: Partial<Record<SfxKind, number>> = { shoot: 0.035, hit: 0.025, die: 0.05 };

export function setSfxEnabled(on: boolean): void { enabled = on; }
export function sfxEnabled(): boolean { return enabled; }

function ac(): AudioContext | null {
  if (!AC) {
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      AC = new AudioContextCtor();
      master = AC.createGain();
      compressor = AC.createDynamicsCompressor();
      master.gain.value = 0.58;
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      master.connect(compressor);
      compressor.connect(AC.destination);
    } catch { AC = null; }
  }
  return AC;
}

/** iOS requires resuming audio from a user gesture. */
export function resumeAudio(): void {
  const a = ac();
  if (a && a.state === 'suspended') void a.resume();
}

function output(): GainNode | null {
  const a = ac();
  if (!a || !master) return null;
  return master;
}

function whiteNoise(a: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === a.sampleRate) return noiseBuffer;
  noiseBuffer = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < channel.length; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    channel[i] = white * 0.72 + brown * 2.1;
  }
  return noiseBuffer;
}

function envelope(gain: GainNode, at: number, peak: number, attack: number, duration: number): void {
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.max(0.002, attack));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
}

function tone(
  a: AudioContext,
  at: number,
  startHz: number,
  endHz: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
): void {
  const out = output(); if (!out) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, startHz), at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), at + duration);
  envelope(gain, at, volume, 0.004, duration);
  osc.connect(gain); gain.connect(out);
  osc.start(at); osc.stop(at + duration + 0.02);
}

function noise(
  a: AudioContext,
  at: number,
  duration: number,
  volume: number,
  filterType: BiquadFilterType,
  startHz: number,
  endHz = startHz,
  q = 0.7,
): void {
  const out = output(); if (!out) return;
  const source = a.createBufferSource();
  const filter = a.createBiquadFilter();
  const gain = a.createGain();
  source.buffer = whiteNoise(a);
  source.playbackRate.value = 0.92 + Math.random() * 0.16;
  filter.type = filterType;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(Math.max(30, startHz), at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(30, endHz), at + duration);
  envelope(gain, at, volume, 0.002, duration);
  source.connect(filter); filter.connect(gain); gain.connect(out);
  source.start(at, Math.random() * 0.15, duration + 0.02);
  source.stop(at + duration + 0.03);
}

function impact(a: AudioContext, at: number, weight = 1): void {
  noise(a, at, 0.09, 0.075 * weight, 'bandpass', 1100, 260, 0.9);
  noise(a, at, 0.14, 0.055 * weight, 'lowpass', 520, 100);
  tone(a, at, 105, 48, 0.13, 0.095 * weight);
}

function metal(a: AudioContext, at: number, weight = 1): void {
  noise(a, at, 0.055, 0.05 * weight, 'highpass', 1700, 900, 1.1);
  tone(a, at, 620, 535, 0.18, 0.024 * weight, 'sine');
  tone(a, at + 0.006, 1030, 870, 0.13, 0.018 * weight, 'sine');
  tone(a, at + 0.012, 1470, 1190, 0.1, 0.012 * weight, 'sine');
}

function explosion(a: AudioContext, at: number, weight = 1): void {
  noise(a, at, 0.055, 0.13 * weight, 'highpass', 2200, 700, 0.5);
  noise(a, at + 0.015, 0.62, 0.16 * weight, 'lowpass', 1450, 80, 0.8);
  tone(a, at, 92, 28, 0.7, 0.18 * weight);
  tone(a, at + 0.025, 51, 24, 0.55, 0.12 * weight);
}

export type SfxKind = 'spawn' | 'shoot' | 'hit' | 'build' | 'evolve' | 'boom' | 'win' | 'lose' | 'die' | 'vet';

export function sfx(kind: SfxKind): void {
  if (!enabled) return;
  const a = ac(); if (!a) return;
  const now = a.currentTime;
  const minInterval = MIN_INTERVAL[kind] ?? 0;
  if (lastPlayed[kind] !== undefined && now - lastPlayed[kind]! < minInterval) return;
  lastPlayed[kind] = now;

  switch (kind) {
    case 'spawn':
      noise(a, now, 0.12, 0.035, 'bandpass', 720, 240, 0.8);
      tone(a, now, 135, 82, 0.16, 0.05);
      break;
    case 'shoot':
      noise(a, now, 0.045, 0.075, 'highpass', 2600, 1100, 0.4);
      noise(a, now + 0.006, 0.09, 0.045, 'bandpass', 1250, 460, 0.8);
      tone(a, now, 125, 52, 0.085, 0.06);
      break;
    case 'hit':
      impact(a, now, 0.72 + Math.random() * 0.2);
      break;
    case 'die':
      impact(a, now, 0.8);
      noise(a, now + 0.025, 0.28, 0.04, 'lowpass', 430, 75, 0.7);
      tone(a, now + 0.015, 82, 38, 0.3, 0.055);
      break;
    case 'build':
      metal(a, now, 0.9);
      metal(a, now + 0.085, 0.65);
      impact(a, now + 0.14, 0.55);
      break;
    case 'evolve':
      noise(a, now, 0.85, 0.055, 'bandpass', 180, 1900, 0.55);
      tone(a, now, 72, 145, 0.62, 0.075);
      tone(a, now + 0.16, 145, 290, 0.52, 0.052, 'sine');
      metal(a, now + 0.48, 0.75);
      noise(a, now + 0.5, 0.28, 0.07, 'highpass', 1200, 4600, 0.5);
      break;
    case 'boom':
      explosion(a, now, 1);
      noise(a, now + 0.16, 0.82, 0.055, 'bandpass', 380, 95, 0.5);
      break;
    case 'vet':
      metal(a, now, 0.62);
      noise(a, now + 0.035, 0.26, 0.035, 'highpass', 1500, 5400, 0.6);
      tone(a, now + 0.025, 330, 495, 0.24, 0.035, 'sine');
      break;
    case 'win':
      explosion(a, now, 0.38);
      [131, 196, 262, 330].forEach((hz, i) => tone(a, now + i * 0.12, hz, hz * 1.02, 0.65, 0.04, 'sine'));
      noise(a, now + 0.22, 0.72, 0.04, 'bandpass', 520, 2600, 0.5);
      break;
    case 'lose':
      noise(a, now, 0.75, 0.05, 'lowpass', 650, 65, 0.8);
      tone(a, now, 110, 42, 0.8, 0.095);
      metal(a, now + 0.08, 0.35);
      break;
  }
}
