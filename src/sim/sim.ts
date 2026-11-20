import { W, H, TICK_RATE, NG, G, K_ANIMAL, K_PRODUCER, K_FREE, IS_SOLID, IS_WATER } from '../shared/constants';
import { FRAME_STRIDE, type SpeciesInfo as SpeciesInfo_, type ToWorker } from '../shared/protocol';
import { BIOMES, BIOME_INDEX } from '../data/biomes';
import { World } from './world';
import { stepWorld, spawn, type Ctx } from './ecology';
import { SpeciesRegistry } from './species';
import { RNG } from '../shared/rng';
import { baseGenome } from './genes';
import { seedPreview } from './seed';

type Post = (msg: any, transfer?: Transferable[]) => void;

/**
 * The simulation host (runs inside a Web Worker). Owns every biome's world, advances the
 * active one at a fixed tick rate regardless of render framerate, and ships compact
 * snapshots to the renderer.
 */
export class Sim {
  worlds: (World | null)[] = BIOMES.map(() => null);
  active = 0;
  speed = 1; // sim speed multiplier; 0 = paused
  acc = 0;
  last = 0;
  seed = 1;
  view = { x0: 0, y0: 0, x1: W, y1: H, zoom: 4 };
  rng = new RNG(1);
  ctx: Ctx = { sp: new SpeciesRegistry(this.rng), events: [] };
  simMs = 0; tps = 0; tpsCount = 0; tpsT = 0;
  lastFrame = 0; lastStats = 0;
  sentTerrain = -1;

  constructor(private post: Post) {}

  get world(): World { return this.worlds[this.active]!; }

  getWorld(i: number): World {
    let w = this.worlds[i];
    if (!w) { w = new World(i, this.seed); w.ctxRef = this.ctx; this.worlds[i] = w; seedPreview(w, this.ctx); }
    return w;
  }

  handle(m: ToWorker) {
    switch (m.t) {
      case 'init': this.seed = m.seed; this.rng = new RNG(m.seed); this.ctx.sp = new SpeciesRegistry(this.rng); this.active = BIOME_INDEX[m.biome] ?? 0; this.getWorld(this.active); this.sentTerrain = -1; this.last = performance.now(); break;
      case 'speed': this.speed = m.v; break;
      case 'biome': { const i = BIOME_INDEX[m.id]; if (i !== undefined) { this.active = i; this.getWorld(i); this.sentTerrain = -1; } break; }
      case 'view': this.view = { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1, zoom: m.zoom }; break;
      case 'stress': this.stress(m.n); break;
      case 'env': { const w = this.world; (w.env as any)[m.key] = m.value; w.recomputeLight(); w.terrainVersion++; break; }
    }
  }

  /** Debug: fill the active world with n creatures of 16 random species to stress-test rendering. */
  stress(n: number) {
    const w = this.world; w.allocEntities();
    const e = w.ents, sp = this.ctx.sp;
    while (sp.list.length < 16) {
      const g = baseGenome(); for (let k = 0; k < NG; k++) g[k] = w.rng.next();
      g[0] = 0.3 + w.rng.next() * 0.3; g[G.PHOTO] = 0; g[G.HERB] = 0.8; g[G.CARN] = 0; g[G.SWIM] = 0.7; g[G.WALK] = 0; g[G.FLY] = 0;
      sp.create(-1, g, 0, 0, undefined);
    }
    sp.disabled = true;
    for (let i = 0; i < e.hi; i++) if (e.kind[i] !== K_FREE) e.release(i);
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let tries = 0; tries < 30; tries++) { x = w.rng.range(2, W - 2); y = w.rng.range(2, H - 2); const c = w.medium[(y | 0) * W + (x | 0)]; if (IS_WATER[c]) break; }
      const id = w.rng.int(16);
      spawn(w, this.ctx, id, sp.founders[id], 0, x, y, { grown: true, energyFrac: 0.7 });
    }
  }

  /** Called from the worker's timer. Runs as many fixed ticks as wall time (x speed) demands. */
  loop() {
    const now = performance.now();
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.25) dt = 0.25;
    const w = this.worlds[this.active];
    if (!w) return;
    if (this.speed > 0) {
      this.acc += dt * TICK_RATE * this.speed;
      const budget = now + 10; // ms per loop iteration, keeps the worker responsive
      let n = 0;
      while (this.acc >= 1 && performance.now() < budget) {
        const t0 = performance.now();
        stepWorld(w, this.ctx);
        this.simMs = this.simMs * 0.95 + (performance.now() - t0) * 0.05;
        this.acc -= 1; n++;
      }
      if (this.acc > 4) this.acc = 4; // can't keep up: run slower rather than spiral
      this.tpsCount += n;
    }
    if (now - this.tpsT > 1000) { this.tps = this.tpsCount * 1000 / (now - this.tpsT); this.tpsCount = 0; this.tpsT = now; }
    if (now - this.lastFrame > 30) { this.lastFrame = now; this.sendFrame(w); }
    if (now - this.lastStats > 500) { this.lastStats = now; this.sendStats(w); }
  }

  sendFrame(w: World) {
    if (this.sentTerrain !== w.terrainVersion) {
      this.sentTerrain = w.terrainVersion;
      this.post({ t: 'world', biome: w.def.id, medium: w.medium.slice(), surfaceY: w.surfaceY, waterTop: w.waterTop, vents: w.vents, light: w.light.slice(), version: w.terrainVersion, env: { ...w.env } });
    }
    const sp = this.ctx.sp;
    if (sp.dirty.size) { const list = [...sp.dirty].map((id) => sp.list[id]); sp.dirty.clear(); this.post({ t: 'species', list }); }
    if (!w.ents) { this.post({ t: 'frame', tick: w.tick, data: new Float32Array(0), n: 0, events: [] }); return; }
    const e = w.ents, v = this.view;
    const mx = 6, x0 = v.x0 - mx, x1 = v.x1 + mx, y0 = v.y0 - mx, y1 = v.y1 + mx;
    let n = 0;
    const out = new Float32Array(e.alive * FRAME_STRIDE + FRAME_STRIDE);
    for (let i = 0; i < e.hi; i++) {
      const k = e.kind[i]; if (k === K_FREE) continue;
      const x = e.x[i], y = e.y[i];
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const o = n * FRAME_STRIDE;
      out[o] = i; out[o + 1] = e.uid[i]; out[o + 2] = x; out[o + 3] = y; out[o + 4] = e.species[i];
      const hp = Math.max(0, Math.min(15, (e.health[i] * 15) | 0));
      out[o + 5] = ((e.anim[i] | 0) & 15) | (e.facing[i] < 0 ? 16 : 0) | (k << 5) | (e.hurt[i] > 0 ? 128 : 0) | (e.flags[i] & 1 ? 256 : 0) | (hp << 9) | ((e.state[i] & 7) << 13);
      out[o + 6] = e.size[i]; out[o + 7] = Math.atan2(e.vy[i], Math.abs(e.vx[i]) + 0.001) * 0.6 * (e.facing[i] < 0 ? -1 : 1);
      n++;
    }
    const events = this.ctx.events; this.ctx.events = [];
    this.post({ t: 'frame', tick: w.tick, data: out.subarray(0, n * FRAME_STRIDE), n, events }, [out.buffer]);
  }

  sendStats(w: World) {
    const counts: Record<number, number> = {};
    if (w.ents) { const e = w.ents; for (let i = 0; i < e.hi; i++) if (e.kind[i] !== K_FREE) counts[e.species[i]] = (counts[e.species[i]] || 0) + 1; }
    this.post({ t: 'stats', stats: { tick: w.tick, biome: w.def.id, entities: w.ents ? w.ents.alive : 0, species: this.ctx.sp.list.length, counts, simMs: this.simMs, tps: this.tps, env: { ...w.env } } });
  }
}
void IS_SOLID; void K_ANIMAL; void K_PRODUCER; void TICK_RATE;
