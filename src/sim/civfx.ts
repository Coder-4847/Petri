// How civilization and its endings reach into the living world.
import { G, K_ANIMAL, K_PRODUCER, K_FREE, K_CARCASS, clamp } from '../shared/constants';
import type { Sim } from './sim';
import { die } from './ecology';
import { syncCount } from './coarse';
import type { EndingDef } from '../data/civ';
import { civEra, type CivState } from './civ';

/** Can this species build a civilization? (clever and social) */
export const isThinker = (g: ArrayLike<number>) => g[G.INTEL] > 0.45 && g[G.SOCIAL] > 0.25;

export function countThinkers(sim: Sim): { n: number; best: string; bestId: number } {
  const sp = sim.ctx.sp; let n = 0, bn = 0, best = 'Hominids', bestId = -1;
  for (let id = 0; id < sp.list.length; id++) { const c = sp.count[id]; if (c > 0 && isThinker(sp.founders[id])) { n += c; if (c > bn) { bn = c; best = sp.list[id].name; bestId = id; } } }
  return { n, best, bestId };
}

/** Kill a fraction of life everywhere. Bigger animals suffer most; `thinkersOnly` removes only civilized species. */
export function massKill(sim: Sim, f: number, thinkersOnly = false) {
  const sp = sim.ctx.sp, rng = sim.rng;
  for (const w of sim.worlds) {
    if (w.mode === 'coarse' && w.cs) {
      for (const s of w.cs.sp.values()) {
        const think = isThinker(s.g);
        if (thinkersOnly && !think) continue;
        const kill = thinkersOnly ? 1 : s.kind === K_ANIMAL ? f * (0.55 + 0.45 * clamp(s.t.size / 6)) : f * 0.45;
        s.pop *= 1 - clamp(kill); syncCount(sim.ctx, s, w.tick);
      }
    } else if (w.ents) {
      const e = w.ents;
      for (let i = 0; i < e.hi; i++) {
        const k = e.kind[i]; if (k === K_FREE || k === K_CARCASS) continue;
        const g = e.genome.subarray(i * 55, i * 55 + 55); const think = isThinker(g);
        if (thinkersOnly && !think) continue;
        const kill = thinkersOnly ? 1 : k === K_ANIMAL ? f * (0.55 + 0.45 * clamp(e.size[i] / 6)) : f * 0.45;
        if (rng.next() < kill) die(w, sim.ctx, i, 'impact');
      }
    }
  }
  void sp; void K_PRODUCER;
}

function nudgeEnv(sim: Sim, key: 'temp' | 'toxicity', d: number) {
  for (const w of sim.worlds) { w.env[key] = clamp(w.env[key] + d); }
  sim.world.recomputeLight(); sim.world.terrainVersion++;
}

export function applyEnding(sim: Sim, def: EndingDef) {
  if (def.kill) massKill(sim, def.kill);
  if (def.wipeCiv) massKill(sim, 1, true);
  if (def.dust) for (const w of sim.worlds) w.dust = Math.max(w.dust, def.dust);
  if (def.temp) nudgeEnv(sim, 'temp', def.temp);
  if (def.tox) nudgeEnv(sim, 'toxicity', def.tox);
  sim.world.recomputeLight(); sim.world.terrainVersion++;
}

/** Slow feedback from civilization onto the world: warming, pollution and hunting/habitat pressure. */
export function civPressure(sim: Sim, c: CivState) {
  if (!c.active) return;
  const ind = clamp((c.tech - 0.4) / 0.4);
  const tgtT = c.climate * 0.2, tgtX = (1 - c.eco) * 0.25 * (0.3 + ind);
  const dT = tgtT - c.appliedTemp, dX = tgtX - c.appliedTox;
  if (Math.abs(dT) > 0.01) { c.appliedTemp += dT; nudgeEnv(sim, 'temp', dT); }
  if (Math.abs(dX) > 0.01) { c.appliedTox += dX; nudgeEnv(sim, 'toxicity', dX); }
  // hunting and habitat loss thin out the big animals in proportion to the human footprint
  const pressure = clamp(c.pop / 8000) * (1 - 0.6 * c.eco) * (c.tech > 0.2 ? 1 : 0.3);
  if (pressure > 0.002) {
    const w = sim.world, rng = sim.rng;
    if (w.mode === 'full' && w.ents) { const e = w.ents; for (let i = 0; i < e.hi; i++) if (e.kind[i] === K_ANIMAL && e.size[i] > 2 && !isThinker(e.genome.subarray(i * 55, i * 55 + 55)) && rng.next() < pressure * 0.01) die(w, sim.ctx, i, 'hunted'); }
  }
}

export const civProgress = (c: CivState) => { const e = civEra(c); return e >= 11 ? 1 : e === 10 ? clamp((c.tech - 0.5) / 0.3) : clamp(c.tech / 0.5); };
