import { Container, Particle, ParticleContainer, Rectangle, Texture, Sprite } from 'pixi.js';
import { W, H, PX_DUMMY, IS_WATER, IS_SOLID } from './fxconst';
import { makeCanvas } from './util';
import type { Camera } from './camera';

// Particle kinds
const BLOOD = 0, GIB_ORGAN = 1, GIB_BONE = 2, CLOUD = 3, CRUMB = 4, SPLASH = 5, DUSTC = 6, SPARK = 7, GLOWP = 8;
const MAX = 1400;

/** Blood, gibs, bones and clouds in water, plus lasting stains where gore lands. Cosmetic only. */
export class Fx {
  container: ParticleContainer;
  stains: Sprite;
  private stainCanvas = makeCanvas(W * 4, H * 4);
  private stainTex: Texture;
  private parts: Particle[] = [];
  private kind = new Uint8Array(MAX); private x = new Float32Array(MAX); private y = new Float32Array(MAX); private vx = new Float32Array(MAX); private vy = new Float32Array(MAX);
  private life = new Float32Array(MAX); private maxLife = new Float32Array(MAX); private sz = new Float32Array(MAX); private rot = new Float32Array(MAX); private spin = new Float32Array(MAX); private tn = new Uint32Array(MAX);
  private n = 0; private head = 0;
  private tex: { px: Texture; glow: Texture; base: Texture };
  private medium: Uint8Array = new Uint8Array(W * H);
  gore = true;
  private stainFade = 0;

  constructor() {
    const c = makeCanvas(16, 8); const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, 2, 2);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const d = Math.hypot(i - 2.5, j - 2.5) / 3; if (d < 1) { x.fillStyle = `rgba(255,255,255,${(1 - d) * (1 - d)})`; x.fillRect(8 + i, j, 1, 1); } }
    const t = Texture.from(c); t.source.scaleMode = 'nearest';
    this.tex = { base: t, px: new Texture({ source: t.source, frame: new Rectangle(0, 0, 2, 2) }), glow: new Texture({ source: t.source, frame: new Rectangle(8, 0, 6, 6) }) };
    this.container = new ParticleContainer({ texture: t, dynamicProperties: { position: true, vertex: true, uvs: true, color: true, rotation: true }, roundPixels: true });
    this.container.boundsArea = new Rectangle(-20, -20, W + 40, H + 40);
    for (let i = 0; i < MAX; i++) this.parts.push(new Particle({ texture: this.tex.px, anchorX: 0.5, anchorY: 0.5 }));
    this.stainTex = Texture.from(this.stainCanvas); this.stainTex.source.scaleMode = 'nearest';
    this.stains = new Sprite(this.stainTex); this.stains.scale.set(0.25);
  }

  setWorld(medium: Uint8Array) {
    this.medium = medium; this.n = 0; this.container.particleChildren.length = 0;
    this.stainCanvas.getContext('2d')!.clearRect(0, 0, this.stainCanvas.width, this.stainCanvas.height); this.stainTex.source.update();
  }

  private spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, sz: number, tint = 0xffffff) {
    const i = this.head; this.head = (this.head + 1) % MAX; if (this.n < MAX) this.n++;
    this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.life[i] = life; this.maxLife[i] = life; this.sz[i] = sz; this.rot[i] = 0; this.spin[i] = (Math.random() - 0.5) * 12; this.tn[i] = tint;
  }
  private cell(x: number, y: number) { const cx = x | 0, cy = y | 0; return cx < 0 || cx >= W || cy < 0 || cy >= H ? 5 : this.medium[cy * W + cx]; }

  /** Turn simulation events into particles. `sizeOfSp` lets us scale effects by the victim's size. */
  onEvents(events: any[], view: { x0: number; x1: number; y0: number; y1: number }) {
    for (const ev of events) {
      if (ev.x < view.x0 - 30 || ev.x > view.x1 + 30 || ev.y < view.y0 - 30 || ev.y > view.y1 + 30) continue;
      if (ev.t === 'boom') {
        for (let k = 0; k < 46; k++) { const a = Math.random() * 6.283, v = 3 + Math.random() * 9; this.spawn(DUSTC, ev.x + Math.cos(a) * 2, ev.y + Math.sin(a) * 1.5, Math.cos(a) * v, Math.sin(a) * v * 0.7 - 2, 1.4 + Math.random() * 1.6, 1.5 + Math.random() * 2.5, k % 3 ? 0xb9a07a : 0x8a7a68); }
        for (let k = 0; k < 40; k++) { const a = Math.random() * 6.283, v = 8 + Math.random() * 16; this.spawn(SPARK, ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v - 8, 0.5 + Math.random() * 0.9, 0.35, k % 2 ? 0xffc060 : 0xff7a30); }
      } else if (ev.t === 'bolt') {
        let bx = ev.x + (Math.random() - 0.5) * 6; for (let yy = Math.max(0, ev.y - 70); yy < ev.y; yy += 1.1) { bx += (Math.random() - 0.5) * 1.4; bx += (ev.x - bx) * 0.06; this.spawn(SPARK, bx, yy, 0, 0, 0.28, 0.55, 0xeef6ff); }
        for (let k = 0; k < 14; k++) this.spawn(SPARK, ev.x, ev.y, (Math.random() - 0.5) * 14, -Math.random() * 10, 0.5, 0.35, 0xffe27a);
      } else if (ev.t === 'glow') {
        for (let k = 0; k < 36; k++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * ev.r; this.spawn(GLOWP, ev.x + Math.cos(a) * r, ev.y + Math.sin(a) * r * 0.7, 0, -1.5 - Math.random() * 2, 1.2 + Math.random(), 1.6 + Math.random(), 0xb8ffd8); }
      }
    }
    if (!this.gore) return;
    for (const ev of events) {
      if (ev.x < view.x0 - 4 || ev.x > view.x1 + 4 || ev.y < view.y0 - 4 || ev.y > view.y1 + 4) continue;
      const inWater = IS_WATER[this.cell(ev.x, ev.y)] === 1, s = Math.max(0.3, Math.min(8, ev.size));
      if (ev.t === 'hit') {
        const n = Math.min(10, 2 + Math.floor(s * 1.5 * Math.min(1.5, ev.amt * 3 + 0.4)));
        for (let k = 0; k < n; k++) this.spawn(BLOOD, ev.x, ev.y, (ev.dx || 0) * (1 + Math.random() * 4) + (Math.random() - 0.5) * 4, -Math.random() * 4 - 1, 0.5 + Math.random() * 0.5, 0.25 + s * 0.04);
        if (inWater) this.spawn(CLOUD, ev.x, ev.y, 0, -0.3, 1.6, 0.6 + s * 0.35);
      } else if (ev.t === 'death' && ev.size >= 0.45) {
        const n = Math.min(26, 6 + Math.floor(s * 3));
        for (let k = 0; k < n; k++) this.spawn(BLOOD, ev.x, ev.y, (Math.random() - 0.5) * 9, -Math.random() * 6 - 1, 0.6 + Math.random() * 0.7, 0.28 + s * 0.04);
        const gibs = Math.min(10, 2 + Math.floor(s * 1.2));
        for (let k = 0; k < gibs; k++) this.spawn(Math.random() < 0.55 ? GIB_ORGAN : GIB_BONE, ev.x, ev.y, (Math.random() - 0.5) * 7, -Math.random() * 5 - 1, 3 + Math.random() * 3, 0.4 + Math.random() * 0.35 + s * 0.05);
        this.spawn(CLOUD, ev.x, ev.y, 0, -0.2, 2.6, 1.2 + s * 0.6);
      } else if (ev.t === 'death') { this.spawn(CRUMB, ev.x, ev.y, 0, -0.5, 0.6, 0.4); }
      else if (ev.t === 'eat') { for (let k = 0; k < 3; k++) this.spawn(CRUMB, ev.x, ev.y, (Math.random() - 0.5) * 3, -Math.random() * 2, 0.5, 0.3); }
    }
  }

  private stain(x: number, y: number, big: boolean) {
    // a small irregular splat at terrain resolution, darker in the middle
    const c = this.stainCanvas.getContext('2d')!, X = Math.round(x * 4), Y = Math.round(y * 4) - 1, n = big ? 5 : 3;
    c.fillStyle = 'rgba(122,14,26,0.55)'; for (let k = 0; k < n; k++) c.fillRect(X + Math.round((Math.random() - 0.5) * n * 1.6), Y + Math.round(Math.random() * 1.5), 1 + (Math.random() * 2 | 0), 1);
    c.fillStyle = 'rgba(90,8,18,0.7)'; c.fillRect(X, Y, big ? 2 : 1, 1);
    this.stainDirty = true;
  }
  private stainDirty = false;


  update(dt: number, cam: Camera) {
    const zoom = cam.zoom, pxW = 1 / zoom;
    const arr = this.container.particleChildren; let k = 0;
    for (let i = 0; i < MAX && k < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const kind = this.kind[i];
      const m = this.cell(this.x[i], this.y[i]), water = IS_WATER[m] === 1;
      if (kind === BLOOD || kind === GIB_ORGAN || kind === GIB_BONE) {
        if (water) { this.vx[i] *= 1 - Math.min(1, dt * 4); this.vy[i] += (kind === BLOOD ? 1.5 : 4) * dt; this.vy[i] *= 1 - Math.min(1, dt * 2.5); } else this.vy[i] += 22 * dt;
        const nx = this.x[i] + this.vx[i] * dt, ny = this.y[i] + this.vy[i] * dt;
        if (IS_SOLID[this.cell(nx, ny)]) { // landed
          if (kind === BLOOD) { this.stain(this.x[i], this.y[i], this.sz[i] > 0.35); this.life[i] = 0; continue; }
          this.vy[i] = -this.vy[i] * 0.25; this.vx[i] *= 0.4; this.spin[i] *= 0.2; if (Math.abs(this.vy[i]) < 0.6) { this.vy[i] = 0; this.vx[i] = 0; this.spin[i] = 0; if (this.life[i] > 3) this.life[i] = 3; }
        } else { this.x[i] = nx; this.y[i] = ny; }
        this.rot[i] += this.spin[i] * dt;
      } else if (kind === CLOUD || kind === DUSTC || kind === GLOWP) { this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.sz[i] += dt * (kind === GLOWP ? 0.2 : 0.9); if (kind === DUSTC) { this.vx[i] *= 1 - dt * 1.4; this.vy[i] *= 1 - dt * 1.4; } } else { this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.vy[i] += 8 * dt; }
      const p = this.parts[i];
      const t = this.life[i] / this.maxLife[i];
      p.x = this.x[i]; p.y = this.y[i];
      if (kind === DUSTC || kind === GLOWP) { p.texture = this.tex.glow; const s = this.sz[i] / 6; p.scaleX = s; p.scaleY = s; p.tint = this.tn[i]; p.alpha = Math.min(kind === GLOWP ? 0.8 : 0.5, t * 0.7); p.rotation = 0; }
      else if (kind === CLOUD) { p.texture = this.tex.glow; const s = this.sz[i] / 6; p.scaleX = s; p.scaleY = s; p.tint = 0x9a1424; p.alpha = Math.min(0.55, t * 0.6); p.rotation = 0; }
      else {
        p.texture = this.tex.px; const s = Math.max(2, this.sz[i] * zoom * (kind === BLOOD ? 1 : 1.2)) / zoom / 2; p.scaleX = s; p.scaleY = s * (kind === GIB_BONE ? 0.55 : 1);
        p.tint = kind === SPARK ? this.tn[i] : kind === BLOOD ? (this.sz[i] > 0.35 ? 0xb3202e : 0xd8303c) : kind === GIB_ORGAN ? 0xe0809a : kind === GIB_BONE ? 0xefe9d6 : 0xd8d0b0; p.alpha = kind === BLOOD ? Math.min(1, t * 2.4) : Math.min(1, t * 1.5); p.rotation = this.rot[i];
      }
      arr[k++] = p;
    }
    arr.length = k; this.container.update();
    if (this.stainDirty) { this.stainDirty = false; this.stainTex.source.update(); }
    // stains fade slowly
    this.stainFade += dt; if (this.stainFade > 6) { this.stainFade = 0; const c = this.stainCanvas.getContext('2d')!; c.globalCompositeOperation = 'destination-out'; c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(0, 0, this.stainCanvas.width, this.stainCanvas.height); c.globalCompositeOperation = 'source-over'; this.stainTex.source.update(); }
  }
}
void Container; void PX_DUMMY; void SPLASH;
