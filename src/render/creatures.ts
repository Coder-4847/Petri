import { Container, Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';
import { W, H, ENT_CAP } from '../shared/constants';
import { FRAME_STRIDE, type SpeciesInfo } from '../shared/protocol';
import { Atlas } from './atlas';
import { generateSprite, type SpriteSet } from './spritegen';
import type { Camera } from './camera';

interface SpeciesSprites { set: SpriteSet; page: number; tex: Texture[]; dot: Texture; nMove: number; }

/**
 * Draws every visible creature with ParticleContainers over a shared dynamic atlas.
 * Snapshots arrive from the worker; positions are interpolated between the last two.
 */
export class CreatureLayer {
  root = new Container();
  atlas = new Atlas();
  info = new Map<number, SpeciesInfo>();
  private sprites = new Map<number, SpeciesSprites>();
  private groups: Container[] = [new Container(), new Container(), new Container()]; // producers, carcasses, animals
  private containers: (ParticleContainer | undefined)[][] = [[], [], []];
  private pools: Particle[][][] = [[], [], []];
  private used: number[][] = [[], [], []];

  // snapshots
  private cur: Float32Array = new Float32Array(0); private curN = 0; private curTick = -1;
  private px = new Float32Array(ENT_CAP); private py = new Float32Array(ENT_CAP); private puid = new Float32Array(ENT_CAP);
  private cx = new Float32Array(ENT_CAP); private cy = new Float32Array(ENT_CAP);
  private tArrive = 0; private interval = 33;
  visible = 0;

  constructor() { for (const g of this.groups) this.root.addChild(g); }

  setSpecies(list: SpeciesInfo[]) { for (const s of list) { this.info.set(s.id, s); } }

  reset() { this.cur = new Float32Array(0); this.curN = 0; this.curTick = -1; this.puid.fill(0); }

  onFrame(data: Float32Array, n: number, tick: number, now: number) {
    if (tick === this.curTick && n === this.curN) { this.cur = data; return; } // same tick: keep interpolation running
    // promote current positions to "previous"
    const c = this.cur;
    for (let i = 0; i < this.curN; i++) { const o = i * FRAME_STRIDE, s = c[o] | 0; this.px[s] = c[o + 2]; this.py[s] = c[o + 3]; this.puid[s] = c[o + 1]; }
    this.interval = Math.min(120, Math.max(16, this.interval * 0.8 + (now - this.tArrive) * 0.2));
    this.tArrive = now; this.cur = data; this.curN = n; this.curTick = tick;
  }

  private ensure(id: number): SpeciesSprites | null {
    let s = this.sprites.get(id);
    if (s) return s;
    const info = this.info.get(id); if (!info) return null;
    const set = generateSprite(info.genome);
    const { page, tex } = this.atlas.add(set.frames);
    s = { set, page, tex: tex.slice(0, -1), dot: tex[tex.length - 1], nMove: tex.length - 1 };
    this.sprites.set(id, s);
    return s;
  }

  private container(layer: number, page: number): ParticleContainer {
    let c = this.containers[layer][page];
    if (!c) {
      c = new ParticleContainer({ texture: this.atlas.pages[page].texture, dynamicProperties: { position: true, vertex: true, uvs: true, color: true, rotation: true }, roundPixels: true });
      c.boundsArea = new Rectangle(-50, -50, W + 100, H + 100);
      this.containers[layer][page] = c; this.pools[layer][page] = []; this.groups[layer].addChild(c);
    }
    return c;
  }

  render(cam: Camera, now: number) {
    this.atlas.flush();
    const used = this.used;
    for (let l = 0; l < 3; l++) for (let p = 0; p < this.containers[l].length; p++) used[l][p] = 0;
    const t = Math.min(1, (now - this.tArrive) / this.interval);
    const zoom = cam.zoom, data = this.cur;
    let vis = 0;
    for (let i = 0; i < this.curN; i++) {
      const o = i * FRAME_STRIDE;
      const slot = data[o] | 0, sp = this.ensure(data[o + 4] | 0);
      if (!sp) continue;
      const packed = data[o + 5] | 0, kind = (packed >> 5) & 3;
      const layer = kind === 1 ? 0 : kind === 3 ? 1 : 2;
      const size = data[o + 6], x1 = data[o + 2], y1 = data[o + 3];
      let x = x1, y = y1;
      if (this.puid[slot] === data[o + 1]) { x = this.px[slot] + (x1 - this.px[slot]) * t; y = this.py[slot] + (y1 - this.py[slot]) * t; }
      const c = this.container(layer, sp.page);
      const pool = this.pools[layer][sp.page];
      const u = used[layer][sp.page] ?? 0;
      let p = pool[u];
      if (!p) { p = new Particle({ texture: sp.dot, anchorX: 0.5, anchorY: 0.5 }); pool[u] = p; }
      const screenPx = size * zoom;
      const left = packed & 16;
      if (screenPx < 3.2) {
        p.texture = sp.dot; const d = Math.max(1.8, screenPx) / zoom / 2; p.scaleX = d; p.scaleY = d; p.rotation = 0; p.tint = sp.set.color;
      } else {
        p.texture = sp.tex[(packed & 15) % sp.nMove];
        const sc = size / sp.set.basePx; p.scaleX = left ? -sc : sc; p.scaleY = sc; p.rotation = data[o + 7];
        p.tint = packed & 128 ? 0xff9a9a : packed & 256 ? 0xb4ff9a : 0xffffff;
      }
      p.x = x; p.y = y; p.alpha = 1;
      c.particleChildren[u] = p; used[layer][sp.page] = u + 1; vis++;
    }
    for (let l = 0; l < 3; l++) for (let pg = 0; pg < this.containers[l].length; pg++) {
      const c = this.containers[l][pg]; if (!c) continue;
      c.particleChildren.length = used[l][pg] ?? 0; c.update();
    }
    this.visible = vis;
  }

  clearSprites() { /* species sprites persist across biome switches */ }
}
void W; void H;
