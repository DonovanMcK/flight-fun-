/** Tiny WebAudio blips — no assets, fully offline. */
let AC: AudioContext | null = null;
let enabled = true;

export function setSfxEnabled(on: boolean): void { enabled = on; }
export function sfxEnabled(): boolean { return enabled; }

function ac(): AudioContext | null {
  if (!AC) {
    try { AC = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { AC = null; }
  }
  return AC;
}

/** iOS requires resuming audio from a user gesture. */
export function resumeAudio(): void {
  const a = ac();
  if (a && a.state === 'suspended') void a.resume();
}

function beep(freq: number, dur: number, type: OscillatorType, vol: number, delayMs = 0): void {
  if (!enabled) return;
  const a = ac(); if (!a) return;
  const go = () => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(a.destination);
    const t = a.currentTime;
    o.start(t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.stop(t + dur);
  };
  delayMs ? window.setTimeout(go, delayMs) : go();
}

export type SfxKind = 'spawn' | 'shoot' | 'hit' | 'build' | 'evolve' | 'boom' | 'win' | 'lose' | 'die' | 'vet';

export function sfx(kind: SfxKind): void {
  switch (kind) {
    case 'spawn': beep(420, 0.08, 'square', 0.035); break;
    case 'shoot': beep(700, 0.05, 'sawtooth', 0.022); break;
    case 'hit': beep(180, 0.05, 'square', 0.028); break;
    case 'die': beep(140, 0.12, 'triangle', 0.03); break;
    case 'build': beep(300, 0.12, 'triangle', 0.05); break;
    case 'evolve': // rising power-up stinger
      beep(392, 0.1, 'triangle', 0.05);
      beep(523, 0.1, 'triangle', 0.055, 90);
      beep(659, 0.12, 'triangle', 0.06, 180);
      beep(784, 0.2, 'triangle', 0.065, 280);
      break;
    case 'boom': beep(90, 0.35, 'sawtooth', 0.08); beep(60, 0.4, 'sawtooth', 0.06, 60); break;
    case 'vet': beep(880, 0.07, 'triangle', 0.045); beep(1175, 0.1, 'triangle', 0.045, 70); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'triangle', 0.06, i * 130)); break;
    case 'lose': [400, 320, 240, 160].forEach((f, i) => beep(f, 0.2, 'sawtooth', 0.05, i * 140)); break;
  }
}
