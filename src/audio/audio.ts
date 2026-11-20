// Procedural audio: no samples. Biome ambience (filtered noise + little events), generative music that follows the
// era, and short synthesized effects. Everything routes through a master gain with a shared reverb.

type Layer = 'wind' | 'water' | 'rumble' | 'crackle' | 'bubbles' | 'birds' | 'insects' | 'frogs' | 'rain';
type Mix = Partial<Record<Layer, number>>;

const BIOME_MIX: Record<string, Mix> = {
  reef: { water: 0.6, bubbles: 0.5 }, kelp: { water: 0.6, bubbles: 0.3 }, ocean: { water: 0.5, rumble: 0.15 }, deep: { rumble: 0.45, bubbles: 0.2 },
  vents: { rumble: 0.5, bubbles: 0.5, crackle: 0.2 }, river: { water: 0.5, birds: 0.2 }, swamp: { water: 0.2, frogs: 0.6, insects: 0.5 }, mangrove: { water: 0.3, frogs: 0.4, birds: 0.3 },
  grassland: { wind: 0.35, birds: 0.4, insects: 0.3 }, savanna: { wind: 0.4, insects: 0.4, birds: 0.2 }, plains: { wind: 0.5, birds: 0.2 }, forest: { wind: 0.2, birds: 0.5, insects: 0.3 },
  rainforest: { rain: 0.4, birds: 0.5, insects: 0.5, frogs: 0.3 }, desert: { wind: 0.5 }, tundra: { wind: 0.85 }, mountains: { wind: 0.6, birds: 0.1 }, volcanic: { rumble: 0.6, crackle: 0.6 }, sky: { wind: 0.7 },
};

// pentatonic-ish scales per era mood (semitone offsets)
const SCALES: number[][] = [
  [0, 3, 7, 10], [0, 2, 7, 9], [0, 2, 5, 7, 9], [0, 2, 5, 7, 9], [0, 2, 4, 7, 9], [0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 4, 7, 9], [0, 2, 4, 5, 7, 9], [0, 2, 3, 7, 8], [0, 2, 4, 7, 11], [0, 2, 3, 7, 10],
];
const ROOTS = [45, 45, 47, 48, 50, 48, 43, 52, 50, 48, 45, 46]; // MIDI per era
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  volume = 0.6; music = true; sfx = true;
  private master!: GainNode; private musicBus!: GainNode; private sfxBus!: GainNode; private ambBus!: GainNode; private reverb!: ConvolverNode; private revSend!: GainNode;
  private lp!: BiquadFilterNode; // underwater muffling
  private noiseBuf!: AudioBuffer;
  private layers = new Map<Layer, { gain: GainNode; target: number }>();
  private era = 0; private biome = 'reef'; private speed = 1;
  private timers: number[] = [];
  private lastSfx = 0; private sfxCount = 0;

  /** Must be called from a user gesture (browsers keep audio suspended until then). */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      const ctx = this.ctx = new AudioContext();
      this.master = ctx.createGain(); this.master.gain.value = this.volume * 0.8; this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
      this.master.connect(this.lp); this.lp.connect(ctx.destination);
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.music ? 0.8 : 0; this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfx ? 0.9 : 0; this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.95;
      this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(2.8); this.revSend = ctx.createGain(); this.revSend.gain.value = 0.55; this.revSend.connect(this.reverb); this.reverb.connect(this.master);
      for (const b of [this.musicBus, this.sfxBus, this.ambBus]) b.connect(this.master);
      this.musicBus.connect(this.revSend);
      const n = ctx.sampleRate * 3, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; } // slightly pinkish
      this.noiseBuf = buf;
      this.buildAmbience(); this.setBiome(this.biome); this.scheduleMusic();
      this.timers.push(window.setInterval(() => this.tickAmbience(), 700));
    } catch { this.ctx = null; }
  }

  private impulse(sec: number) {
    const ctx = this.ctx!, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return b;
  }
  private noise(): AudioBufferSourceNode { const s = this.ctx!.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.loopStart = Math.random() * 2; return s; }

  setVolume(v: number) { this.volume = v; if (this.ctx) this.master.gain.setTargetAtTime(v * 0.8, this.ctx.currentTime, 0.08); }
  setMusic(on: boolean) { this.music = on; if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.3); }
  setSfx(on: boolean) { this.sfx = on; if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05); }
  setUnderwater(on: boolean) { if (this.ctx) this.lp.frequency.setTargetAtTime(on ? 700 : 20000, this.ctx.currentTime, 0.25); }
  setSpeed(v: number) { this.speed = v; }
  setEra(i: number) { this.era = Math.min(11, Math.max(0, i)); }

  // ------------------------------------------------------------------ ambience
  private buildAmbience() {
    const ctx = this.ctx!;
    const mk = (l: Layer, type: BiquadFilterType, freq: number, q: number, lfo?: number) => {
      const src = this.noise(), f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(this.ambBus); src.start();
      if (lfo) { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = lfo; og.gain.value = freq * 0.35; o.connect(og); og.connect(f.frequency); o.start(); }
      this.layers.set(l, { gain: g, target: 0 });
    };
    mk('wind', 'bandpass', 520, 0.7, 0.11); mk('water', 'lowpass', 420, 0.5, 0.07); mk('rumble', 'lowpass', 90, 1.2, 0.05); mk('rain', 'highpass', 3200, 0.4);
    mk('insects', 'bandpass', 5200, 6, 0.9);
    for (const l of ['crackle', 'bubbles', 'birds', 'frogs'] as Layer[]) this.layers.set(l, { gain: ctx.createGain(), target: 0 });
  }
  setBiome(id: string) {
    this.biome = id; if (!this.ctx) return;
    const mix = BIOME_MIX[id] ?? {};
    for (const [l, v] of this.layers) { v.target = mix[l] ?? 0; if (l === 'wind' || l === 'water' || l === 'rumble' || l === 'rain' || l === 'insects') v.gain.gain.setTargetAtTime(v.target * (l === 'insects' ? 0.05 : l === 'rain' ? 0.12 : 0.3), this.ctx.currentTime, 1.5); }
  }
  /** Random little ambient events, throttled; runs a few times per second. */
  private tickAmbience() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const L = (l: Layer) => this.layers.get(l)?.target ?? 0, r = Math.random;
    if (L('birds') && r() < 0.35 * L('birds')) this.chirp();
    if (L('frogs') && r() < 0.4 * L('frogs')) this.frog();
    if (L('bubbles') && r() < 0.8 * L('bubbles')) this.bubble();
    if (L('crackle') && r() < 0.9 * L('crackle')) this.crackle();
  }
  private tone(freq: number, dur: number, type: OscillatorType, gain: number, bus: AudioNode, o: { slideTo?: number; delay?: number; attack?: number; filter?: number; send?: number } = {}) {
    const ctx = this.ctx!, t = ctx.currentTime + (o.delay ?? 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t); if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + (o.attack ?? 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out: AudioNode = osc; if (o.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter; osc.connect(f); out = f; }
    out.connect(g); g.connect(bus); if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(this.revSend); }
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  private burst(dur: number, freq: number, q: number, gain: number, bus: AudioNode, type: BiquadFilterType = 'bandpass', delay = 0, slideTo?: number) {
    const ctx = this.ctx!, t = ctx.currentTime + delay, s = this.noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t); if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur); f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  }
  private chirp() { const b = 2200 + Math.random() * 2200; const n = 1 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) this.tone(b * (1 + Math.random() * 0.25), 0.08, 'sine', 0.05, this.ambBus, { slideTo: b * (0.7 + Math.random() * 0.8), delay: i * 0.11, send: 0.3 }); }
  private frog() { const f = 140 + Math.random() * 120; for (let i = 0; i < 3; i++) this.tone(f, 0.07, 'square', 0.03, this.ambBus, { slideTo: f * 1.4, delay: i * 0.09, filter: 600 }); }
  private bubble() { const f = 300 + Math.random() * 700; this.tone(f, 0.12, 'sine', 0.06, this.ambBus, { slideTo: f * 2, send: 0.2 }); }
  private crackle() { this.burst(0.03, 1500 + Math.random() * 2500, 2, 0.1, this.ambBus); }

  // ------------------------------------------------------------------ music
  private chordIdx = 0; private nextChord = 0;
  private scheduleMusic() {
    const ctx = this.ctx!; this.nextChord = ctx.currentTime + 0.5;
    this.timers.push(window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || !this.music) return;
      const now = this.ctx.currentTime;
      if (now + 1.5 > this.nextChord) this.playChord(this.nextChord);
    }, 400));
  }
  private playChord(at: number) {
    const ctx = this.ctx!, scale = SCALES[this.era], root = ROOTS[this.era];
    const steps = [0, 2, 1, 3, 0, 2, 4, 1]; this.chordIdx = (this.chordIdx + 1) % steps.length;
    const deg = steps[this.chordIdx] % scale.length, len = 9 + Math.random() * 5 - Math.min(3, this.era * 0.25);
    const note = (d: number, oct: number) => root + 12 * oct + scale[((d % scale.length) + scale.length) % scale.length] + 12 * Math.floor(d / scale.length);
    const voices = [note(deg, 0), note(deg + 2, 0), note(deg + 4, 1)];
    const bass = root - 12 + scale[deg];
    const pad = (m: number, g: number, type: OscillatorType) => {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
      o.type = o2.type = type; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 1.004; f.type = 'lowpass'; f.frequency.value = 700 + this.era * 70; f.Q.value = 0.3;
      gn.gain.setValueAtTime(0.0001, at); gn.gain.exponentialRampToValueAtTime(g, at + len * 0.35); gn.gain.exponentialRampToValueAtTime(0.0001, at + len + 2);
      o.connect(f); o2.connect(f); f.connect(gn); gn.connect(this.musicBus); o.start(at); o2.start(at); o.stop(at + len + 2.2); o2.stop(at + len + 2.2);
    };
    for (const m of voices) pad(m, 0.05, 'triangle');
    pad(bass, 0.09, 'sine');
    // sparse melody that grows with the era
    const mel = Math.min(0.9, this.era * 0.09);
    for (let i = 0; i < 6; i++) if (Math.random() < mel * (i % 2 ? 0.5 : 0.8)) {
      const m = note(Math.floor(Math.random() * scale.length * 1.5), 1 + (Math.random() < 0.3 ? 1 : 0)), t = at + 0.5 + i * (len / 6) + Math.random() * 0.6;
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = this.era >= 9 ? 'square' : 'triangle'; o.frequency.value = mtof(m);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = this.era >= 9 ? 1800 : 1200;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(this.era >= 9 ? 0.025 : 0.04, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(f); f.connect(g); g.connect(this.musicBus); const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(this.revSend); o.start(t); o.stop(t + 2);
    }
    if (this.era >= 10) { for (let i = 0; i < 8; i++) { const t = at + i * (len / 8); this.tone(mtof(root + scale[(i * 2) % scale.length] + 24), 0.12, 'square', 0.012, this.musicBus, { filter: 1500, delay: t - ctx.currentTime, send: 0.4 }); } }
    this.nextChord = at + len * 0.82;
  }

  // ------------------------------------------------------------------ effects
  private ok(): boolean {
    if (!this.ctx || this.ctx.state !== 'running' || !this.sfx) return false;
    const now = this.ctx.currentTime; if (now - this.lastSfx > 0.1) { this.lastSfx = now; this.sfxCount = 0; } return ++this.sfxCount <= 8;
  }
  ui() { if (!this.ok()) return; this.tone(880, 0.05, 'square', 0.04, this.sfxBus, { slideTo: 1320, filter: 3000 }); }
  toast(kind: string) {
    if (!this.ok()) return;
    const b = this.sfxBus;
    if (kind === 'era') [0, 4, 7, 12].forEach((s, i) => this.tone(mtof(60 + s), 1.6, 'triangle', 0.09, b, { delay: i * 0.13, send: 0.7 }));
    else if (kind === 'species') { this.tone(mtof(84), 0.9, 'sine', 0.07, b, { send: 0.8 }); this.tone(mtof(91), 0.9, 'sine', 0.05, b, { delay: 0.1, send: 0.8 }); }
    else if (kind === 'extinct') { this.tone(mtof(48), 1.4, 'sine', 0.1, b, { slideTo: mtof(43), send: 0.5 }); }
    else if (kind === 'ok') { this.tone(mtof(72), 0.5, 'triangle', 0.07, b, { send: 0.6 }); this.tone(mtof(79), 0.6, 'triangle', 0.06, b, { delay: 0.09, send: 0.6 }); }
    else if (kind === 'warn') this.tone(mtof(55), 0.3, 'square', 0.05, b, { slideTo: mtof(50), filter: 900 });
    else this.tone(mtof(76), 0.4, 'sine', 0.06, b, { send: 0.5 });
  }
  choice() { if (!this.ok()) return; [0, 7, 12].forEach((s, i) => this.tone(mtof(57 + s), 1.4, 'sine', 0.07, this.sfxBus, { delay: i * 0.05, send: 0.8 })); }
  ending(good: boolean) {
    if (!this.ctx || !this.sfx) return;
    if (good) [0, 4, 7, 12, 16].forEach((s, i) => this.tone(mtof(55 + s), 5, 'triangle', 0.08, this.sfxBus, { delay: i * 0.3, attack: 0.4, send: 0.9 }));
    else { [0, 3, 6].forEach((s, i) => this.tone(mtof(36 + s), 7, 'sawtooth', 0.05, this.sfxBus, { delay: i * 0.4, attack: 1.2, filter: 500, send: 0.9 })); this.burst(2.5, 200, 0.5, 0.15, this.sfxBus, 'lowpass', 0, 60); }
  }
  pop() { if (this.ok()) { this.tone(420, 0.12, 'sine', 0.1, this.sfxBus, { slideTo: 900 }); this.burst(0.05, 2400, 1, 0.05, this.sfxBus); } }
  boom() { if (!this.ctx || !this.sfx) return; this.tone(110, 1.2, 'sine', 0.35, this.sfxBus, { slideTo: 28 }); this.burst(1.4, 1200, 0.4, 0.4, this.sfxBus, 'lowpass', 0, 90); }
  bolt() { if (!this.ctx || !this.sfx) return; this.burst(0.18, 5000, 0.5, 0.35, this.sfxBus, 'highpass'); this.burst(1.6, 300, 0.4, 0.22, this.sfxBus, 'lowpass', 0.1, 70); }
  shimmer() { if (!this.ok()) return; for (let i = 0; i < 5; i++) this.tone(mtof(84 + [0, 4, 7, 11, 14][i]), 0.9, 'sine', 0.04, this.sfxBus, { delay: i * 0.07, send: 0.9 }); }
  /** In-world events from the sim, attenuated by distance from the view centre. */
  worldEvent(ev: { t: string; x: number; y: number; size?: number }, view: { x0: number; x1: number; y0: number; y1: number }) {
    if (!this.ok()) return;
    const cx = (view.x0 + view.x1) / 2, cy = (view.y0 + view.y1) / 2, span = Math.max(8, view.x1 - view.x0);
    const d = Math.hypot(ev.x - cx, (ev.y - cy) * 1.6) / span; if (d > 0.75) return;
    const v = (1 - d / 0.75) * Math.min(1, 12 / span + 0.25), s = Math.min(8, ev.size ?? 1);
    if (ev.t === 'hit') { this.burst(0.07, 300 + 600 / (1 + s), 1.2, 0.18 * v, this.sfxBus); if (s > 1.2) this.tone(120 / Math.sqrt(s), 0.15, 'sine', 0.12 * v, this.sfxBus); }
    else if (ev.t === 'death' && s > 0.45) { this.tone(260 / (1 + s * 0.4), 0.5, 'sawtooth', 0.09 * v, this.sfxBus, { slideTo: 60, filter: 700 }); this.burst(0.25, 400, 0.8, 0.12 * v, this.sfxBus, 'lowpass'); }
    else if (ev.t === 'eat' && s > 0.3) this.burst(0.05, 1800, 1.5, 0.06 * v, this.sfxBus);
  }
  dispose() { this.timers.forEach(clearInterval); void this.ctx?.close(); this.ctx = null; }
}
export const audio = new AudioEngine();
