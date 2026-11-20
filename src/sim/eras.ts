import { G, K_ANIMAL, K_PRODUCER, clamp } from '../shared/constants';
import type { SpeciesRegistry } from './species';
import { traitsOf, type Traits } from './genes';
import { ERAS } from '../data/eras';

export interface EraState {
  reached: number; // index of the era the world has reached
  progress: number; // 0..1 toward the next milestone
  /** best species working toward the next milestone, for the hint line */
  leader: string;
  clock: number; // cosmetic geological clock, Ma before present
  tick: number; // tick when each era was reached
  history: { era: number; tick: number }[];
}

const ramp = (x: number, a: number, b: number) => clamp((x - a) / (b - a), 0, 1);
const soft = (...v: number[]) => { let m = 1; for (const x of v) m = Math.min(m, x); return m; };

interface C { g: ArrayLike<number>; t: Traits; n: number; }
// Each milestone scores a species 0..1 (1 = satisfied). Gated by population in evaluate().
const MILESTONES: { need: number; hint: string; score: (c: C) => number }[] = [
  /* 1 multicellular */ { need: 15, hint: 'larger bodies', score: (c) => ramp(c.t.size, 0.25, 0.6) },
  /* 2 marine animals */ { need: 15, hint: 'mobile aquatic grazers & hunters', score: (c) => (c.t.kind === K_ANIMAL ? soft(ramp(c.t.size, 0.5, 1.0), ramp(c.g[G.SWIM], 0.12, 0.35), ramp(c.g[G.GILLS], 0.2, 0.5)) : 0) },
  /* 3 fish & armour */ { need: 15, hint: 'jawed or armoured swimmers', score: (c) => (c.t.kind === K_ANIMAL ? soft(ramp(c.t.size, 1.2, 2.5), ramp(c.g[G.SWIM], 0.25, 0.5), ramp(Math.max(c.g[G.JAWS], c.g[G.ARMOR], c.g[G.SHELL]), 0.1, 0.3), ramp(c.g[G.GILLS], 0.2, 0.5)) : 0) },
  /* 4 land plants + insects */ { need: 15, hint: 'life leaving the water', score: (c) => {
    const plant = c.t.kind === K_PRODUCER ? soft(ramp(c.t.size, 0.5, 1.0), ramp(c.g[G.CUTICLE], 0.2, 0.4), 1 - ramp(c.g[G.GILLS], 0.3, 0.6)) : 0;
    const bug = c.t.kind === K_ANIMAL ? soft(ramp(c.t.size, 0.3, 0.6), ramp(c.g[G.CUTICLE], 0.2, 0.4), ramp(Math.max(c.g[G.CRAWL], c.g[G.WALK]), 0.15, 0.3), 1 - ramp(c.g[G.GILLS], 0.5, 0.8)) : 0;
    return Math.max(plant, bug * 0.9);
  } },
  /* 5 amphibians & reptiles */ { need: 15, hint: 'four-limbed land animals', score: (c) => (c.t.kind === K_ANIMAL ? soft(ramp(c.t.size, 1.2, 2.5), ramp(c.g[G.LIMBS], 0.25, 0.5), ramp(c.g[G.WALK], 0.2, 0.4), ramp(c.g[G.LUNGS], 0.25, 0.5)) : 0) },
  /* 6 megafauna */ { need: 8, hint: 'giants on land', score: (c) => (c.t.kind === K_ANIMAL ? soft(ramp(c.t.size, 4, 8), ramp(c.g[G.LIMBS], 0.25, 0.5), ramp(c.g[G.WALK], 0.2, 0.4), ramp(c.g[G.LUNGS], 0.25, 0.5)) : 0) },
  /* 7 mammals & birds */ { need: 15, hint: 'warm-blooded animals', score: (c) => (c.t.kind === K_ANIMAL ? soft(ramp(c.g[G.ENDOTHERM], 0.25, 0.45), ramp(c.t.size, 0.8, 1.5), ramp(Math.max(c.g[G.WALK], c.g[G.FLY]), 0.2, 0.4), ramp(c.g[G.LUNGS], 0.25, 0.5)) : 0) },
  /* 8 hominids */ { need: 15, hint: 'clever, social, upright animals', score: (c) => (c.t.kind === K_ANIMAL ? soft(ramp(c.g[G.INTEL], 0.3, 0.55), ramp(c.g[G.SOCIAL], 0.2, 0.4), ramp(c.g[G.LIMBS], 0.3, 0.5), ramp(c.g[G.WALK], 0.3, 0.5), ramp(c.t.size, 1.5, 2.5)) : 0) },
];
export const MILESTONE_COUNT = MILESTONES.length; // era index 0..8 reachable by evolution; 9+ come from civilization

export function newEraState(): EraState { return { reached: 0, progress: 0, leader: '', clock: ERAS[0].ma, tick: 0, history: [{ era: 0, tick: 0 }] }; }

export function evaluateEras(st: EraState, sp: SpeciesRegistry, tick: number): { advanced: boolean } {
  let advanced = false;
  const living: C[] = [];
  const tr = {} as Traits;
  for (let id = 0; id < sp.list.length; id++) {
    const n = sp.count[id]; if (n < 8) continue;
    const info = sp.list[id]; const g = sp.founders[id];
    living.push({ g, t: { ...traitsOf(g, 0, tr) }, n });
  }
  // advance as far as satisfied milestones allow (era n requires milestone n)
  while (st.reached < MILESTONES.length && st.reached < 9) {
    const m = MILESTONES[st.reached];
    let best = 0; let leader = '';
    for (const c of living) { const sc = m.score(c) * Math.min(1, c.n / m.need); if (sc > best) { best = sc; } }
    if (best >= 0.999) { st.reached++; st.tick = tick; st.history.push({ era: st.reached, tick }); advanced = true; continue; }
    st.progress = best; st.leader = leader || m.hint;
    break;
  }
  if (st.reached >= MILESTONES.length) { st.progress = 1; st.leader = 'Civilization awaits'; }
  // cosmetic clock: interpolate between era start times (log scale), driven by progress
  const a = ERAS[Math.min(st.reached, ERAS.length - 1)].ma, b = ERAS[Math.min(st.reached + 1, ERAS.length - 1)].ma;
  st.clock = Math.exp(Math.log(Math.max(a, 0.0001)) + (Math.log(Math.max(b, 0.0001)) - Math.log(Math.max(a, 0.0001))) * st.progress);
  return { advanced };
}
