// Save / load: a snapshot is plain structured-clone data (typed arrays, Maps, objects), so it can go straight into
// IndexedDB or through postMessage. Export packs it into a gzip file (see ui/saves.ts).
import { NG } from '../shared/constants';
import type { World } from './world';
import { EntityStore, SpatialHash } from './entities';
import { CoarseState } from './coarse';
import { SpeciesRegistry } from './species';
import type { Sim } from './sim';
import { ENT_CAP, W, H } from '../shared/constants';

export const SAVE_VERSION = 1;

const ENT_FIELDS = (e: EntityStore) => Object.keys(e).filter((k) => ArrayBuffer.isView((e as any)[k]));

function snapEntities(e: EntityStore) {
  const arrays: Record<string, ArrayBufferView> = {};
  for (const k of ENT_FIELDS(e)) {
    const a = (e as any)[k] as Float32Array;
    arrays[k] = k === 'genome' ? a.slice(0, e.hi * NG) : a.slice(0, e.hi);
  }
  return { hi: e.hi, alive: e.alive, nextUid: e.nextUid, free: [...(e as any).free], arrays };
}

function restoreEntities(w: World, d: ReturnType<typeof snapEntities>) {
  w.allocEntities(); const e = w.ents; e.clear();
  for (const k in d.arrays) (e as any)[k].set(d.arrays[k] as any);
  e.hi = d.hi; e.alive = d.alive; e.nextUid = d.nextUid; (e as any).free = [...d.free];
}

export function snapshot(sim: Sim) {
  const sp = sim.ctx.sp;
  const founders = new Float32Array(sp.list.length * NG); sp.founders.forEach((g, i) => founders.set(g, i * NG));
  return {
    v: SAVE_VERSION, seed: sim.seed, rng: sim.rng.state(), active: sim.active, totalTicks: sim.totalTicks,
    era: { ...sim.era, history: sim.era.history.map((h) => ({ ...h })) }, history: sim.history.slice(-300),
    found: [...sim.found], spawned: { ...(sim.ctx.spawned ?? {}) }, timed: sim.timed.map((t) => ({ ...t })), config: { ...sim.config },
    species: { list: sp.list.map((s) => ({ ...s })), founders, count: sp.count.slice(0, sp.list.length), taken: [...sp.taken], extinctions: sp.extinctions.map((x) => ({ ...x })) },
    worlds: sim.worlds.map((w) => ({
      tick: w.tick, env: { ...w.env }, nutrients: w.nutrients, chem: w.chem, detritus: w.detritus, dust: w.dust, mode: w.mode, rng: w.rng.state(), seeded: w.seeded,
      edited: w.edited ? { medium: w.medium, surfaceY: w.surfaceY, waterTop: w.waterTop } : null,
      cs: w.cs ?? null, ents: w.mode === 'full' && w.ents ? snapEntities(w.ents) : null,
    })),
  };
}

export type SaveData = ReturnType<typeof snapshot>;

export function restore(sim: Sim, d: SaveData) {
  sim.restoring(d.seed);
  const sp = new SpeciesRegistry(sim.rng); sim.ctx.sp = sp;
  sp.list = d.species.list.map((s) => ({ ...s })); sp.founders = sp.list.map((_, i) => d.species.founders.slice(i * NG, i * NG + NG));
  sp.count.fill(0); sp.count.set(d.species.count); sp.taken = new Set(d.species.taken); sp.extinctions = d.species.extinctions.map((x) => ({ ...x }));
  sp.dirty = new Set(sp.list.map((s) => s.id));
  sim.hookRegistry();
  sim.rng.setState(d.rng); sim.era = { ...d.era, history: d.era.history.map((h) => ({ ...h })) }; sim.ctx.era = sim.era;
  sim.history = d.history.slice(); sim.found = new Set(d.found); sim.ctx.spawned = { ...d.spawned }; sim.timed = d.timed.map((t) => ({ ...t })); sim.config = { ...sim.config, ...d.config };
  sim.totalTicks = d.totalTicks;
  d.worlds.forEach((wd, i) => {
    const w = sim.worlds[i];
    w.tick = wd.tick; w.env = { ...wd.env }; w.nutrients.set(wd.nutrients); w.chem.set(wd.chem); w.detritus.set(wd.detritus); w.dust = wd.dust; w.mode = wd.mode; w.rng.setState(wd.rng); w.seeded = wd.seeded;
    if (wd.edited) { w.medium.set(wd.edited.medium); w.surfaceY.set(wd.edited.surfaceY); w.waterTop.set(wd.edited.waterTop); w.edited = true; }
    w.recomputeLight(); w.terrainVersion++;
    if (wd.cs) { w.cs = Object.assign(new CoarseState(), wd.cs); } else w.cs = undefined;
    if (wd.ents) restoreEntities(w, wd.ents); else if (w.ents) w.ents.clear();
  });
  sim.active = d.active; sim.sentTerrain = -1; sim.debt = sim.worlds.map(() => 0);
}

void ENT_CAP; void W; void H; void SpatialHash;
