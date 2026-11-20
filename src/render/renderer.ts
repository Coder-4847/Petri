import { Application, Container } from 'pixi.js';
import { W, H } from '../shared/constants';
import { BIOME_BY_ID, type BiomeDef } from '../data/biomes';
import type { FromWorker } from '../shared/protocol';
import { Camera } from './camera';
import { TerrainLayer } from './terrain';
import { Background } from './background';
import { Ambient } from './ambient';
import { CreatureLayer } from './creatures';
import { Lighting } from './lighting';
import { Settlements } from './settlements';
import { Fx } from './fx';
import { hexR, hexG, hexB } from './util';

type WorldMsg = Extract<FromWorker, { t: 'world' }>;

/** Owns the Pixi application and every visual layer. The simulation never touches this. */
export class Renderer {
  app!: Application;
  cam = new Camera();
  bg = new Background();
  terrain = new TerrainLayer();
  ambient = new Ambient();
  creatures = new CreatureLayer();
  lighting = new Lighting();
  fx = new Fx();
  settlements = new Settlements();
  def: BiomeDef | null = null;
  medium: Uint8Array = new Uint8Array(W * H);
  time = 0;
  onViewChange: ((v: { x0: number; y0: number; x1: number; y1: number; zoom: number }) => void) | null = null;
  onPick: ((x: number, y: number, px: number, py: number) => void) | null = null;
  private skyC = new Container(); // world-space sky
  private worldC = new Container(); // world-space: terrain, creatures, fx
  private lastView = '';
  private viewT = 0;
  fps = 0;
  follow: { slot: number; uid: number } | null = null;
  onFollowEnd: (() => void) | null = null;
  /** world-space radius of the power reticle is drawn by the UI; the renderer only converts coordinates */
  cpuMs = 0;
  quality = 1;

  async init(parent: HTMLElement) {
    this.app = new Application();
    await this.app.init({
      resizeTo: parent, background: 0x0a0e14, antialias: false, autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2), powerPreference: 'high-performance', preference: 'webgl',
    });
    parent.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    const st = this.app.stage;
    this.skyC.addChild(this.bg.sky);
    this.worldC.addChild(this.terrain.ground, this.creatures.root);
    st.addChild(this.skyC, this.bg.layers, this.worldC, this.lighting.sprite);
    this.worldC.addChild(this.ambient.container);
    this.cam.setScreen(this.app.screen.width, this.app.screen.height);
    this.lighting.resize(this.app.screen.width, this.app.screen.height);
    this.app.renderer.on('resize', (w: number, h: number) => { this.cam.setScreen(w, h); this.lighting.resize(w, h); });
    this.bindInput(this.app.canvas);
    this.app.ticker.add((tk) => this.tick(tk.deltaMS / 1000));
  }

  setGore(on: boolean) { this.fx.gore = on; this.creatures.gore = on; }

  setWorld(m: WorldMsg) {
    this.settlements.setTerrain(m.surfaceY, m.waterTop);
    const def = BIOME_BY_ID[m.biome]; const changed = this.def?.id !== def.id;
    this.def = def; this.medium = m.medium;
    if (changed) {
      this.terrain.build(def, m.medium, m.light);
      // water meshes sit between ground and creatures (back) / above creatures (front)
      this.worldC.removeChildren();
      this.worldC.addChild(this.terrain.ground, this.fx.stains, this.settlements.container, this.terrain.waterBack!, this.creatures.root, this.fx.container, this.terrain.waterFront!, this.ambient.container);
      const horizon = def.terrain.water > 0 ? def.terrain.water * H : Math.min(...Array.from(m.surfaceY).filter((v) => v < H), H * 0.5);
      this.bg.build(def, horizon);
      this.ambient.setVents(m.vents); this.ambient.setWorld(def, m.medium); this.fx.setWorld(m.medium);
      this.lighting.setAmbient(def.light);
      this.creatures.reset();
    } else {
      this.terrain.build(def, m.medium, m.light); // terrain edited (power / regen): repaint
      this.worldC.removeChildren();
      this.worldC.addChild(this.terrain.ground, this.fx.stains, this.settlements.container, this.terrain.waterBack!, this.creatures.root, this.fx.container, this.terrain.waterFront!, this.ambient.container);
      this.ambient.setWorld(def, m.medium);
    }
  }

  tick(dt: number) {
    const t0 = performance.now();
    this.time += dt;
    this.fps = this.fps * 0.9 + this.app.ticker.FPS * 0.1;
    const cam = this.cam;
    if (this.follow) { const p = this.creatures.find(this.follow.slot, this.follow.uid); if (p) cam.focus(p.x, p.y); }
    cam.update(dt);
    const ox = cam.ox, oy = cam.oy, z = cam.zoom;
    for (const c of [this.skyC, this.worldC]) { c.position.set(ox, oy); c.scale.set(z); }
    if (this.def) {
      this.bg.update(cam, this.time, this.def.fog);
      this.terrain.update(this.time);
      this.ambient.update(dt, cam, this.time); this.fx.update(dt, cam);
      this.creatures.render(cam, performance.now());
    }
    // tell the sim what we can see (throttled)
    const v = cam.view(); this.viewT += dt;
    const key = `${v.x0 | 0},${v.y0 | 0},${v.x1 | 0},${v.y1 | 0}`;
    if (key !== this.lastView && this.viewT > 0.08) { this.lastView = key; this.viewT = 0; this.onViewChange?.({ ...v, zoom: z }); }
    this.cpuMs = this.cpuMs * 0.92 + (performance.now() - t0) * 0.08;
  }

  private bindInput(el: HTMLElement) {
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt = { x: 0, y: 0 }, moved = 0, pinchD = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { downAt = { x: e.clientX, y: e.clientY }; moved = 0; }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    el.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) { moved += Math.abs(dx) + Math.abs(dy); if (moved > 4) { this.cam.pan(dx, dy); if (this.follow) { this.follow = null; this.onFollowEnd?.(); } } }
      else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) this.cam.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD);
        pinchD = d; this.cam.pan(dx / 2, dy / 2); moved = 99;
      }
    });
    const up = (e: PointerEvent) => {
      if (pointers.size === 1 && moved <= 4) { const r = el.getBoundingClientRect(); const w = this.cam.screenToWorld(e.clientX - r.left, e.clientY - r.top); this.onPick?.(w.x, w.y, e.clientX, e.clientY); }
      pointers.delete(e.pointerId); if (pointers.size < 2) pinchD = 0;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); this.cam.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const s = 90; // px per key press
      if (e.key === 'ArrowLeft' || e.key === 'a') this.cam.pan(s, 0); else if (e.key === 'ArrowRight' || e.key === 'd') this.cam.pan(-s, 0);
      else if (e.key === 'ArrowUp' || e.key === 'w') this.cam.pan(0, s); else if (e.key === 'ArrowDown' || e.key === 's') this.cam.pan(0, -s);
      else if (e.key === '+' || e.key === '=') this.cam.zoomAt(this.cam.sw / 2, this.cam.sh / 2, 1.3); else if (e.key === '-') this.cam.zoomAt(this.cam.sw / 2, this.cam.sh / 2, 1 / 1.3);
    });
  }
}
void hexR; void hexG; void hexB;
