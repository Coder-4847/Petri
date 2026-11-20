import { Container, Particle, ParticleContainer, Texture, Rectangle } from 'pixi.js';
import { W, H, IS_WATER, IS_SOLID } from '../shared/constants';
import type { AmbientSpec, BiomeDef } from '../data/biomes';
import { RNG } from '../shared/rng';
import { makeCanvas } from './util';
import type { Camera } from './camera';

type Kind = AmbientSpec['kind'];

/** Tiny atlas of soft pixel particles shared by every ambient effect. */
function buildTextures() {
  const c = makeCanvas(64, 64); const x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, 2, 2); // dot            (0,0,2,2)
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const d = Math.hypot(i - 3.5, j - 3.5) / 4; if (d < 1) { x.fillStyle = `rgba(255,255,255,${(1 - d) * (1 - d)})`; x.fillRect(8 + i, j, 1, 1); } } // soft glow (8,0,8,8)
  x.fillStyle = '#fff'; x.fillRect(18, 0, 1, 5); // rain streak (18,0,1,5)
  x.fillStyle = '#fff'; x.fillRect(21, 1, 3, 1); x.fillRect(22, 0, 1, 3); // snow flake (21,0,3,3)
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.strokeRect(26.5, 0.5, 5, 5); x.clearRect(26, 0, 1, 1); x.clearRect(31, 0, 1, 1); x.clearRect(26, 5, 1, 1); x.clearRect(31, 5, 1, 1);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(28, 1, 1, 1); // bubble (26,0,6,6)
  x.fillStyle = '#fff'; x.fillRect(34, 1, 3, 2); // leaf (34,0,3,3)
  for (let i = 0; i < 32; i++) for (let j = 0; j < 16; j++) { const d = Math.hypot((i - 15.5) / 16, (j - 7.5) / 8); if (d < 1) { x.fillStyle = `rgba(255,255,255,${(1 - d) * 0.5})`; x.fillRect(i, 16 + j, 1, 1); } } // mist (0,16,32,16)
  const t = Texture.from(c); t.source.scaleMode = 'nearest';
  const f = (a: number, b: number, w: number, h: number) => new Texture({ source: t.source, frame: new Rectangle(a, b, w, h) });
  return { base: t, dot: f(0, 0, 2, 2), glow: f(8, 0, 8, 8), rain: f(18, 0, 1, 5), snow: f(21, 0, 3, 3), bubble: f(26, 0, 6, 6), leaf: f(34, 0, 3, 3), mist: f(0, 16, 32, 16) };
}

const MAX = 700;

export class Ambient {
  container: ParticleContainer;
  private tex = buildTextures();
  private parts: Particle[] = [];
  private kind: Kind[] = [];
  private x = new Float32Array(MAX); private y = new Float32Array(MAX); private vx = new Float32Array(MAX); private vy = new Float32Array(MAX);
  private ph = new Float32Array(MAX); private sz = new Float32Array(MAX);
  private n = 0;
  private rng = new RNG(99);
  private def!: BiomeDef;
  private medium: Uint8Array = new Uint8Array(W * H);
  density = 1;

  constructor() {
    this.container = new ParticleContainer({ texture: this.tex.base, dynamicProperties: { position: true, vertex: true, uvs: true, color: true, rotation: true }, roundPixels: true });
    this.container.boundsArea = new Rectangle(-10, -10, W + 20, H + 20);
  }

  private vents: { x: number; y: number }[] = [];
  private plume: { x: number; y: number; t: number; ph: number }[] = [];
  private plumeParts: Particle[] = [];
  setVents(v: { x: number; y: number }[]) { this.vents = v; }

  setWorld(def: BiomeDef, medium: Uint8Array) {
    this.def = def; this.medium = medium; this.n = 0; this.kind.length = 0;
    this.container.particleChildren.length = 0; this.parts = [];
    for (const a of def.ambient) {
      const cnt = Math.min(MAX - this.n, Math.round(a.n * this.density));
      for (let i = 0; i < cnt; i++) { const k = this.n++; this.kind[k] = a.kind; this.parts.push(new Particle({ texture: this.texFor(a.kind), anchorX: 0.5, anchorY: 0.5 })); this.x[k] = -999; this.ph[k] = this.rng.next() * 6.28; }
    }
    this.plume = []; this.plumeParts = [];
    for (const v of this.vents) for (let i = 0; i < 28; i++) { this.plume.push({ x: v.x + 0.5, y: v.y, t: i / 28, ph: i * 1.7 + v.x }); this.plumeParts.push(new Particle({ texture: this.tex.glow, anchorX: 0.5, anchorY: 0.5 })); }
    this.container.particleChildren = this.parts.concat(this.plumeParts); this.container.update();
  }

  private texFor(k: Kind): Texture {
    switch (k) { case 'bubbles': return this.tex.bubble; case 'rain': return this.tex.rain; case 'snow': return this.tex.snow; case 'leaves': return this.tex.leaf;
      case 'mist': return this.tex.mist; case 'fireflies': case 'embers': case 'sparks': return this.tex.glow; default: return this.tex.dot; }
  }
  private cell(x: number, y: number) { const cx = x | 0, cy = y | 0; return cx < 0 || cx >= W || cy < 0 || cy >= H ? 5 : this.medium[cy * W + cx]; }

  private respawn(i: number, v: { x0: number; x1: number; y0: number; y1: number }, anywhere: boolean) {
    const k = this.kind[i], r = this.rng;
    const wantWater = k === 'bubbles' || k === 'plankton';
    const wantAir = k === 'rain' || k === 'snow' || k === 'leaves' || k === 'pollen' || k === 'dust' || k === 'embers' || k === 'ash' || k === 'fireflies' || k === 'sparks' || k === 'mist' || k === 'spores';
    for (let t = 0; t < 14; t++) {
      let x = r.range(v.x0, v.x1), y = r.range(v.y0, v.y1);
      if (!anywhere && (k === 'rain' || k === 'snow' || k === 'leaves' || k === 'ash')) y = v.y0 - r.range(0, 4);
      if (k === 'bubbles' && !anywhere) y = v.y1 + r.range(0, 3);
      if (k === 'embers' || k === 'sparks') { if (!anywhere) y = v.y1 + r.range(0, 4); }
      const c = this.cell(x, y);
      const ok = wantWater ? IS_WATER[c] : wantAir ? (c === 0 && !(this.def.group !== 'sky' && y > H * 0.9)) : !IS_SOLID[c];
      if (ok || t === 13) {
        this.x[i] = x; this.y[i] = y; break;
      }
    }
    switch (k) {
      case 'bubbles': this.vx[i] = 0; this.vy[i] = -r.range(1.2, 2.8); this.sz[i] = r.range(0.4, 0.9); break;
      case 'rain': this.vx[i] = -3; this.vy[i] = r.range(40, 55); this.sz[i] = 1; break;
      case 'snow': this.vx[i] = r.range(-1, 1); this.vy[i] = r.range(3, 6); this.sz[i] = r.range(0.5, 0.9); break;
      case 'leaves': this.vx[i] = r.range(-1, 2); this.vy[i] = r.range(1.5, 3); this.sz[i] = r.range(0.6, 1); break;
      case 'ash': this.vx[i] = r.range(-1, 1); this.vy[i] = r.range(1, 2.5); this.sz[i] = r.range(0.3, 0.6); break;
      case 'embers': case 'sparks': this.vx[i] = r.range(-1, 1); this.vy[i] = -r.range(2, 6); this.sz[i] = r.range(0.5, 1.1); break;
      case 'dust': this.vx[i] = r.range(4, 9); this.vy[i] = r.range(-0.4, 0.4); this.sz[i] = r.range(0.3, 0.6); break;
      case 'mist': this.vx[i] = r.range(0.4, 1.4); this.vy[i] = 0; this.sz[i] = r.range(12, 28); break;
      case 'fireflies': this.vx[i] = r.range(-1, 1); this.vy[i] = r.range(-0.5, 0.5); this.sz[i] = r.range(0.8, 1.4); break;
      default: this.vx[i] = r.range(-0.4, 0.4); this.vy[i] = r.range(-0.3, 0.3); this.sz[i] = r.range(0.3, 0.7);
    }
  }

  update(dt: number, cam: Camera, time: number) {
    const v = cam.view(); const pad = 3;
    v.x0 -= pad; v.x1 += pad; v.y0 -= pad; v.y1 += pad;
    const zoom = cam.zoom;
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i];
      if (this.x[i] < v.x0 || this.x[i] > v.x1 || this.y[i] < v.y0 || this.y[i] > v.y1) this.respawn(i, v, this.x[i] === -999 || true);
      const ph = this.ph[i];
      let x = this.x[i], y = this.y[i];
      switch (k) {
        case 'bubbles': x += Math.sin(time * 3 + ph) * 0.4 * dt; break;
        case 'snow': case 'leaves': x += Math.sin(time * 1.3 + ph) * 1.2 * dt; break;
        case 'pollen': case 'spores': case 'motes': case 'plankton': x += Math.sin(time * 0.7 + ph) * 0.5 * dt; y += Math.cos(time * 0.9 + ph * 1.3) * 0.4 * dt; break;
        case 'fireflies': x += Math.sin(time * 0.9 + ph) * 1.2 * dt; y += Math.cos(time * 1.3 + ph) * 0.9 * dt; break;
        case 'embers': case 'sparks': x += Math.sin(time * 2 + ph) * 1.2 * dt; break;
      }
      x += this.vx[i] * dt; y += this.vy[i] * dt;
      this.x[i] = x; this.y[i] = y;
      // collisions with the environment: bubbles pop at the surface, falling things die on ground
      const c = this.cell(x, y);
      if (k === 'bubbles' && !IS_WATER[c]) this.x[i] = -999;
      else if ((k === 'rain' || k === 'snow' || k === 'leaves' || k === 'ash') && c !== 0) this.x[i] = -999;
      const p = this.parts[i];
      const screen = k === 'mist' ? this.sz[i] * zoom : Math.min(5, Math.max(this.sz[i] * zoom, 2));
      const tex = p.texture; const wpx = tex.frame.width;
      const sc = screen / zoom / wpx * (k === 'mist' || k === 'fireflies' || k === 'embers' || k === 'sparks' ? 1 : 1);
      p.x = x; p.y = y; p.scaleX = k === 'rain' || k === 'mist' ? sc : sc * (k === 'bubbles' ? 1 : 1); p.scaleY = p.scaleX;
      if (k === 'rain') { p.scaleX = Math.max(1.5, zoom * 0.35) / zoom; p.scaleY = Math.max(1.5, zoom * 0.5) / zoom / 5 * 5 / 1; }
      p.rotation = k === 'leaves' ? time * 2 + ph : 0;
      let a = 0.7, tint = 0xffffff;
      switch (k) {
        case 'bubbles': a = 0.55; tint = 0xdff8ff; break;
        case 'plankton': a = 0.25 + 0.3 * Math.abs(Math.sin(time * 1.2 + ph)); tint = 0xd8ffee; break;
        case 'motes': a = 0.18 + 0.25 * Math.abs(Math.sin(time * 0.8 + ph)); tint = 0xffffff; break;
        case 'pollen': a = 0.55; tint = 0xfff2a0; break;
        case 'spores': a = 0.5; tint = 0xc8ff90; break;
        case 'dust': a = 0.35; tint = 0xe8d0a0; break;
        case 'rain': a = 0.45; tint = 0xbfd8ff; break;
        case 'snow': a = 0.9; tint = 0xffffff; break;
        case 'leaves': a = 0.85; tint = ((i * 37) % 3 === 0) ? 0xc87a30 : ((i * 37) % 3 === 1) ? 0x6aa040 : 0xb0502a; break;
        case 'embers': case 'sparks': a = 0.5 + 0.5 * Math.sin(time * 9 + ph); tint = 0xff8a30; break;
        case 'ash': a = 0.55; tint = 0x7a7480; break;
        case 'fireflies': a = Math.max(0, Math.sin(time * 1.7 + ph * 3)); a = a * a; tint = 0xe8ff70; break;
        case 'mist': a = 0.07; tint = 0xffffff; break;
      }
      p.alpha = a; p.tint = tint;
    }
    for (let i = 0; i < this.plume.length; i++) {
      const q = this.plume[i], pp = this.plumeParts[i]; q.t += dt * 0.2; if (q.t >= 1) q.t -= 1;
      const t = q.t; pp.x = q.x + Math.sin(time * 1.2 + q.ph) * t * 2.4; pp.y = q.y - t * 18; const sc = (0.9 + t * 3.2) / 6; pp.scaleX = sc; pp.scaleY = sc;
      const hot = Math.max(0, 1 - t * 5); pp.tint = hot > 0 ? (0xff9a40) : 0x4a4250; pp.alpha = (1 - t) * (hot > 0 ? 0.85 : 0.38);
    }
    this.container.update();
  }
}
void Container;
