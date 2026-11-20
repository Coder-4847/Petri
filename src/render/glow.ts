// Additive light: bioluminescent creatures, lava and hydrothermal vents glow against the dark.
import { ParticleContainer, Particle, Texture, Rectangle } from 'pixi.js';
import { W, H, LAVA } from '../shared/constants';
import { makeCanvas } from './util';

export class GlowLayer {
  container: ParticleContainer;
  private tex: Texture;
  private pool: Particle[] = []; private n = 0;
  private statics: { x: number; y: number; size: number; tint: number; base: number; ph: number }[] = [];
  enabled = true;

  constructor() {
    const c = makeCanvas(32, 32), x = c.getContext('2d')!;
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    this.tex = Texture.from(c); this.tex.source.scaleMode = 'linear';
    this.container = new ParticleContainer({ texture: this.tex, dynamicProperties: { position: true, vertex: true, color: true }, roundPixels: false });
    this.container.blendMode = 'add';
    this.container.boundsArea = new Rectangle(-60, -60, W + 120, H + 120);
  }

  /** Static lights for this world: lava surfaces and vents. */
  setWorld(medium: Uint8Array, vents: { x: number; y: number }[]) {
    this.statics = [];
    for (let x = 2; x < W; x += 5) for (let y = 0; y < H; y++) if (medium[y * W + x] === LAVA) { this.statics.push({ x, y: y + 1, size: 15, tint: 0xff5a1a, base: 0.5, ph: x * 0.7 }); break; }
    for (const v of vents) this.statics.push({ x: v.x + 0.5, y: v.y - 1, size: 14, tint: 0x58c8ff, base: 0.4, ph: v.x });
  }

  begin() { this.n = 0; }
  add(x: number, y: number, size: number, tint: number, alpha: number) {
    if (!this.enabled) return;
    let p = this.pool[this.n]; if (!p) { p = new Particle({ texture: this.tex, anchorX: 0.5, anchorY: 0.5 }); this.pool[this.n] = p; }
    const s = size / 32; p.x = x; p.y = y; p.scaleX = s; p.scaleY = s; p.tint = tint; p.alpha = alpha;
    this.container.particleChildren[this.n++] = p;
  }
  end(time: number) {
    if (this.enabled) for (const s of this.statics) this.add(s.x, s.y, s.size * (1 + 0.1 * Math.sin(time * 1.7 + s.ph)), s.tint, s.base * (0.8 + 0.2 * Math.sin(time * 2.3 + s.ph * 1.3)));
    this.container.particleChildren.length = this.n; this.container.update();
  }
}
void H;
