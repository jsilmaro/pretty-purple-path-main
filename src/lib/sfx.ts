// Lightweight WebAudio SFX - no assets, synthesized on the fly
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
};

export const initSfx = () => {
  getCtx();
};

export const setSfxMuted = (m: boolean) => {
  muted = m;
  if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
};

export const isSfxMuted = () => muted;

const env = (
  c: AudioContext,
  dest: AudioNode,
  attack: number,
  decay: number,
  peak: number,
) => {
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return { node: g, stopAt: t + attack + decay + 0.05 };
};

// Footstep — short low thump with a soft noise tail; alternates pitch L/R
let stepToggle = false;
export const playFootstep = (intensity = 1) => {
  const c = getCtx();
  if (!c || !masterGain || muted) return;
  stepToggle = !stepToggle;

  // Thump (sine)
  const osc = c.createOscillator();
  osc.type = "sine";
  const baseFreq = stepToggle ? 110 : 95;
  osc.frequency.setValueAtTime(baseFreq * 1.6, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, c.currentTime + 0.08);
  const { node: g, stopAt } = env(c, masterGain, 0.005, 0.08, 0.18 * intensity);
  osc.connect(g);
  osc.start();
  osc.stop(stopAt);

  // Soft noise scuff
  const bufferSize = Math.floor(c.sampleRate * 0.06);
  const buf = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.8;
  const ng = c.createGain();
  ng.gain.value = 0.06 * intensity;
  noise.connect(filter).connect(ng).connect(masterGain);
  noise.start();
  noise.stop(c.currentTime + 0.07);
};

// Jump — soft upward whoosh
export const playJump = () => {
  const c = getCtx();
  if (!c || !masterGain || muted) return;

  // Filtered noise sweep up
  const bufferSize = Math.floor(c.sampleRate * 0.35);
  const buf = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(500, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(2400, c.currentTime + 0.28);
  const { node: g, stopAt } = env(c, masterGain, 0.01, 0.28, 0.22);
  noise.connect(filter).connect(g);
  noise.start();
  noise.stop(stopAt);

  // Tiny "hop" sine for body
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(380, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(720, c.currentTime + 0.2);
  const { node: og, stopAt: oStop } = env(c, masterGain, 0.005, 0.18, 0.08);
  osc.connect(og);
  osc.start();
  osc.stop(oStop);
};

// Collect — sparkly two-note chime
export const playCollect = (kind: "flower" | "leaf" | "gem" = "flower") => {
  const c = getCtx();
  if (!c || !masterGain || muted) return;
  const base = kind === "gem" ? 880 : kind === "flower" ? 740 : 620;
  const interval = kind === "gem" ? 1.5 : 1.3334; // perfect 5th vs 4th
  const peak = kind === "gem" ? 0.22 : 0.17;

  const tones = [base, base * interval];
  tones.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = "sine";
    const t = c.currentTime + i * 0.06;
    osc.frequency.setValueAtTime(freq, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(g).connect(masterGain!);
    osc.start(t);
    osc.stop(t + 0.5);
  });

  // Shimmer for gems
  if (kind === "gem") {
    const osc = c.createOscillator();
    osc.type = "triangle";
    const t = c.currentTime + 0.12;
    osc.frequency.setValueAtTime(base * 2, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g).connect(masterGain!);
    osc.start(t);
    osc.stop(t + 0.55);
  }
};

// Stomp — defeating an enemy by jumping on it
export const playStomp = () => {
  const c = getCtx();
  if (!c || !masterGain || muted) return;
  const osc = c.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(220, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.18);
  const { node: g, stopAt } = env(c, masterGain, 0.005, 0.2, 0.22);
  osc.connect(g);
  osc.start();
  osc.stop(stopAt);

  const o2 = c.createOscillator();
  o2.type = "triangle";
  o2.frequency.setValueAtTime(900, c.currentTime + 0.02);
  o2.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.18);
  const { node: g2, stopAt: s2 } = env(c, masterGain, 0.005, 0.16, 0.1);
  o2.connect(g2);
  o2.start(c.currentTime + 0.02);
  o2.stop(s2);
};

// Bounce — small upward boop after stomping an enemy
export const playBounce = () => {
  const c = getCtx();
  if (!c || !masterGain || muted) return;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.15);
  const { node: g, stopAt } = env(c, masterGain, 0.005, 0.15, 0.16);
  osc.connect(g);
  osc.start();
  osc.stop(stopAt);
};

// Oof — soft failure sound
export const playOof = () => {
  const c = getCtx();
  if (!c || !masterGain || muted) return;
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(280, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.4);
  const { node: g, stopAt } = env(c, masterGain, 0.01, 0.4, 0.18);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  osc.connect(filter).connect(g);
  osc.start();
  osc.stop(stopAt);
};

// Zombie moan — low, eerie growl
export const playZombieMoan = () => {
  const c = getCtx();
  if (!c || !masterGain || muted) return;
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(90, c.currentTime);
  osc.frequency.linearRampToValueAtTime(70, c.currentTime + 0.6);
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 6;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain).connect(osc.frequency);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 500;
  const { node: g, stopAt } = env(c, masterGain, 0.05, 0.6, 0.18);
  osc.connect(filter).connect(g);
  osc.start();
  lfo.start();
  osc.stop(stopAt);
  lfo.stop(stopAt);
};

// Sorcerer cackle — eerie descending laugh
export const playSorcererCackle = () => {
  const c = getCtx();
  if (!c || !masterGain || muted) return;
  const notes = [520, 460, 400, 340];
  notes.forEach((freq, i) => {
    const t = c.currentTime + i * 0.07;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.08);
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 800;
    filter.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(filter).connect(g).connect(masterGain!);
    osc.start(t);
    osc.stop(t + 0.22);
  });
};

// Level complete fanfare — ascending arpeggio
export const playFanfare = () => {
  const c = getCtx();
  if (!c || !masterGain || muted) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = "triangle";
    const t = c.currentTime + i * 0.11;
    osc.frequency.setValueAtTime(freq, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(g).connect(masterGain!);
    osc.start(t);
    osc.stop(t + 0.5);
  });
  const t0 = c.currentTime + 0.45;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(2093, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.12, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
  o.connect(g).connect(masterGain!);
  o.start(t0);
  o.stop(t0 + 0.65);
};

