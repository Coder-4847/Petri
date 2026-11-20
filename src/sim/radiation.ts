// Adaptive radiation into vacant niches. A blueprint describes a body plan that becomes possible once its
// ecological prerequisites exist (a suitable ancestor and food). Evolution is stochastic: a daughter lineage
// appears from a living parent (keeping the parent's environmental tolerances), then population dynamics
// decide whether it survives. This keeps the era ladder reachable at any speed while sliders and ecology
// still decide *which* lineages thrive.
import { G, NG, K_ANIMAL, K_PRODUCER, W, H, clamp } from '../shared/constants';
import type { World } from './world';
import type { Ctx } from './ecology';
import { spawn } from './ecology';
import { traitsOf, mutate, distance, type GeneSpec, type Traits } from './genes';
import { ensureCoarse, randomSpot, syncCount, type CoarseSp } from './coarse';

type Habitat = 'sea' | 'fresh' | 'land' | 'sky';
export interface Living { id: number; pop: number; g: ArrayLike<number>; t: Traits; }

export interface Blueprint {
  id: string; name: string; tpl: string;
  habitats: Habitat[];
  /** which living species may be the ancestor */
  from: (g: ArrayLike<number>, t: Traits) => boolean;
  /** extra ecological precondition (e.g. food exists) given everything living in the world */
  needs?: (all: Living[]) => boolean;
  /** body-plan genes that jump toward these values (tolerances come from the parent) */
  g: GeneSpec;
  rate: number; // per coarse step (50 ticks) when available
  minParent?: number;
}

const prod = (g: ArrayLike<number>) => Math.max(g[G.PHOTO], g[G.CHEMO]) >= Math.max(g[G.HERB], g[G.CARN], g[G.SCAV], g[G.FILTER], g[G.PARASITE]);
const aquatic = (g: ArrayLike<number>) => g[G.GILLS] > 0.4;
const has = (all: Living[], f: (l: Living) => boolean, n = 12) => all.some((l) => l.pop >= n && f(l));
const bigger = (s: number) => (l: Living) => l.t.size >= s;
const animal = (l: Living) => l.t.kind === K_ANIMAL;
const hunter = (l: Living) => l.g[G.CARN] > 0.4;
const grazer = (l: Living) => l.g[G.HERB] > 0.4;

const SEA: Habitat[] = ['sea', 'fresh'], LAND: Habitat[] = ['land', 'fresh'], ANY: Habitat[] = ['sea', 'fresh', 'land', 'sky'];

export const BLUEPRINTS: Blueprint[] = [
  // ---- multicellularity: colonies of cells
  { id: 'colony-alga', name: 'colonial alga', tpl: 'volvox', habitats: ['sea', 'fresh'], from: (g, t) => prod(g) && t.size < 0.35 && g[G.SWIM] < 0.4, g: { SIZE: 0.2, MULTICELL: 0.55, PHOTO: 0.9, SWIM: 0.06 }, rate: 0.0012, minParent: 25 },
  { id: 'mat', name: 'microbial mat', tpl: 'stromatolite', habitats: ANY, from: (g, t) => prod(g) && t.size < 0.3, g: { SIZE: 0.19, MULTICELL: 0.5, PHOTO: 0.9, SWIM: 0, CUTICLE: 0.4 }, rate: 0.0009, minParent: 25 },
  { id: 'colony-grazer', name: 'colonial grazer', tpl: 'choanoflagellate', habitats: ANY, from: (g, t) => g[G.HERB] > 0.5 && t.size < 0.35, needs: (a) => has(a, (l) => prod(l.g) && l.t.size >= 0.2, 15), g: { SIZE: 0.2, MULTICELL: 0.5, HERB: 0.8, SWIM: 0.35, EYES: 0.05 }, rate: 0.0011, minParent: 25 },
  // ---- early marine animals
  { id: 'sponge', name: 'filter-feeding sessile animal', tpl: 'sponge', habitats: SEA, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.2 && t.size < 0.5, needs: (a) => has(a, (l) => prod(l.g)), g: { SIZE: 0.3, FILTER: 0.85, HERB: 0.15, SWIM: 0, SHELL: 0.35, MULTICELL: 0.8, LIFESPAN: 0.8, BURROW: 0 }, rate: 0.0009, minParent: 12 },
  { id: 'copepod', name: 'swimming grazer', tpl: 'copepod', habitats: SEA, from: (g, t) => g[G.HERB] > 0.4 && t.size >= 0.17 && t.size < 0.45, needs: (a) => has(a, (l) => prod(l.g) && l.t.size >= 0.2, 20), g: { SIZE: 0.37, HERB: 0.75, SWIM: 0.6, FINS: 0.2, EYES: 0.3, VISION: 0.35, SHELL: 0.2, MULTICELL: 0.8, TAIL: 0.2 }, rate: 0.0012, minParent: 12 },
  { id: 'jelly', name: 'drifting predator', tpl: 'jellyfish', habitats: SEA, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.2 && t.size < 0.5, needs: (a) => has(a, (l) => animal(l) && l.t.size >= 0.2, 20), g: { SIZE: 0.4, CARN: 0.85, HERB: 0, SWIM: 0.3, VENOM: 0.45, MULTICELL: 0.9, EYES: 0.1, BIOLUM: 0.3 }, rate: 0.001, minParent: 12 },
  { id: 'worm', name: 'burrowing worm', tpl: 'worm', habitats: ANY, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.17 && t.size < 0.5 && g[G.SCAV] > 0.3, needs: (a) => has(a, (l) => l.t.size >= 0.25), g: { SIZE: 0.33, SCAV: 0.7, HERB: 0.1, BURROW: 0.6, CRAWL: 0.6, SWIM: 0.2, SEGMENTS: 0.7, MULTICELL: 0.8, CUTICLE: 0.5 }, rate: 0.0009, minParent: 12 },
  // ---- fish and armoured seas
  { id: 'trilobite', name: 'armoured crawler', tpl: 'trilobite', habitats: SEA, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.3 && aquatic(g), needs: (a) => has(a, (l) => animal(l) && l.t.size >= 0.3, 15), g: { SIZE: 0.42, HERB: 0.5, SCAV: 0.5, CRAWL: 0.7, SWIM: 0.35, SHELL: 0.65, ARMOR: 0.3, EYES: 0.5, VISION: 0.45, SEGMENTS: 0.8, LIMBS: 0.4 }, rate: 0.001, minParent: 12 },
  { id: 'fish', name: 'jawed fish', tpl: 'fish', habitats: SEA, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.3 && g[G.SWIM] > 0.4 && aquatic(g), needs: (a) => has(a, (l) => animal(l) && l.t.size >= 0.3, 20), g: { SIZE: 0.5, CARN: 0.75, HERB: 0.15, SWIM: 0.85, FINS: 0.65, TAIL: 0.65, JAWS: 0.55, EYES: 0.6, VISION: 0.6, SMELL: 0.45, ARMOR: 0.35, HEAD: 0.6, SEGMENTS: 0.5, INTEL: 0.12 }, rate: 0.0012, minParent: 12 },
  { id: 'grazing-fish', name: 'grazing fish', tpl: 'fish', habitats: SEA, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.3 && g[G.SWIM] > 0.4 && aquatic(g), needs: (a) => has(a, (l) => prod(l.g) && l.t.size >= 0.2, 40), g: { SIZE: 0.5, HERB: 0.8, CARN: 0, SWIM: 0.8, FINS: 0.6, TAIL: 0.55, EYES: 0.5, VISION: 0.45, ARMOR: 0.15, HEAD: 0.5, SOCIAL: 0.45 }, rate: 0.0011, minParent: 12 },
  { id: 'big-fish', name: 'apex fish', tpl: 'dunkleosteus', habitats: SEA, from: (g, t) => t.kind === K_ANIMAL && t.size >= 1.2 && g[G.CARN] > 0.5 && g[G.SWIM] > 0.6, needs: (a) => has(a, (l) => animal(l) && l.t.size >= 1.0, 20), g: { SIZE: 0.66, CARN: 0.9, SWIM: 0.8, FINS: 0.7, TAIL: 0.7, JAWS: 0.85, ARMOR: 0.55, EYES: 0.6, SMELL: 0.7, ELECTRO: 0.45, INTEL: 0.2 }, rate: 0.0008, minParent: 10 },
  { id: 'cephalopod', name: 'clever swimmer', tpl: 'squid', habitats: ['sea'], from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.4 && aquatic(g) && g[G.SWIM] > 0.4, needs: (a) => has(a, (l) => animal(l) && l.t.size >= 0.3, 20), g: { SIZE: 0.55, CARN: 0.8, SWIM: 0.75, JAWS: 0.35, EYES: 0.85, VISION: 0.8, INTEL: 0.45, CAMO: 0.6, SHELL: 0.1, SOCIAL: 0.1, BIOLUM: 0.25, FINS: 0.3, LIMBS: 0.4 }, rate: 0.0006, minParent: 10 },
  // ---- onto land (only in biomes that have dry land)
  { id: 'moss', name: 'moss / lichen', tpl: 'moss', habitats: LAND, from: (g, t) => prod(g) && t.size < 0.4 && g[G.CUTICLE] > 0.3, g: { SIZE: 0.3, MULTICELL: 0.6, PHOTO: 0.9, CUTICLE: 0.7, GILLS: 0.05, LUNGS: 0.3, HUMID_OPT: 0.45, SWIM: 0, WOODY: 0.1 }, rate: 0.0012, minParent: 25 },
  { id: 'fern', name: 'vascular plant', tpl: 'fern', habitats: LAND, from: (g, t) => prod(g) && t.size >= 0.25 && t.size < 0.5 && g[G.CUTICLE] > 0.45, needs: (a) => has(a, (l) => prod(l.g) && l.t.size >= 0.25, 25), g: { SIZE: 0.45, MULTICELL: 0.8, PHOTO: 0.9, CUTICLE: 0.8, GILLS: 0, LUNGS: 0.4, WOODY: 0.35, HUMID_OPT: 0.5, LIFESPAN: 0.6 }, rate: 0.001, minParent: 20 },
  { id: 'tree', name: 'tree', tpl: 'tree', habitats: LAND, from: (g, t) => prod(g) && t.size >= 0.4 && g[G.CUTICLE] > 0.5, needs: (a) => has(a, (l) => prod(l.g) && l.t.size >= 0.4, 25), g: { SIZE: 0.66, MULTICELL: 0.9, PHOTO: 0.95, CUTICLE: 0.85, GILLS: 0, LUNGS: 0.4, WOODY: 0.85, LIFESPAN: 0.95, REPRO_STRAT: 0.35, SWIM: 0 }, rate: 0.0007, minParent: 20 },
  { id: 'kelp', name: 'kelp / seaweed', tpl: 'kelp', habitats: ['sea'], from: (g, t) => prod(g) && t.size >= 0.18 && aquatic(g), needs: (a) => has(a, (l) => prod(l.g) && l.t.size >= 0.18, 25), g: { SIZE: 0.5, MULTICELL: 0.85, PHOTO: 0.9, SWIM: 0, WOODY: 0.3, TAIL: 0.4, LIFESPAN: 0.7 }, rate: 0.0009, minParent: 20 },
  { id: 'insect', name: 'insect', tpl: 'insect', habitats: LAND, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.14 && t.size < 0.5 && g[G.CUTICLE] > 0.4, needs: (a) => has(a, (l) => prod(l.g) && l.t.size >= 0.25, 30), g: { SIZE: 0.3, HERB: 0.55, SCAV: 0.3, CRAWL: 0.7, WALK: 0.45, LIMBS: 0.5, SEGMENTS: 0.8, CUTICLE: 0.85, SHELL: 0.3, EYES: 0.5, VISION: 0.45, LUNGS: 0.1, GILLS: 0, MULTICELL: 0.8, LIFESPAN: 0.2, REPRO_RATE: 0.9, REPRO_STRAT: 0.05 }, rate: 0.0011, minParent: 15 },
  { id: 'flying-insect', name: 'flying insect', tpl: 'dragonfly', habitats: ['land', 'sky'], from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.25 && t.size < 0.6 && g[G.CUTICLE] > 0.6 && g[G.LIMBS] > 0.3, needs: (a) => has(a, (l) => animal(l) && l.g[G.CUTICLE] > 0.6, 20), g: { SIZE: 0.32, WINGS: 0.85, FLY: 0.75, HERB: 0.3, CARN: 0.45, EYES: 0.75, VISION: 0.7, CRAWL: 0.3, LIMBS: 0.5 }, rate: 0.0008, minParent: 15 },
  { id: 'predator-bug', name: 'predatory arthropod', tpl: 'scorpion', habitats: LAND, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.25 && g[G.CUTICLE] > 0.6 && g[G.LIMBS] > 0.3, needs: (a) => has(a, (l) => animal(l) && l.g[G.CUTICLE] > 0.6, 25), g: { SIZE: 0.4, CARN: 0.85, HERB: 0, VENOM: 0.6, JAWS: 0.5, ARMOR: 0.3, WALK: 0.55, SHELL: 0.2, EYES: 0.4 }, rate: 0.0007, minParent: 12 },
  // ---- vertebrates take to land
  { id: 'amphibian', name: 'amphibian', tpl: 'amphibian', habitats: ['fresh', 'land'], from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.3 && g[G.SWIM] > 0.45 && aquatic(g) && g[G.FINS] > 0.3, needs: (a) => has(a, (l) => animal(l) && l.t.size >= 0.3, 20), g: { SIZE: 0.5, LIMBS: 0.65, WALK: 0.45, SWIM: 0.55, GILLS: 0.55, LUNGS: 0.6, CUTICLE: 0.25, HUMID_OPT: 0.8, CARN: 0.6, HERB: 0.2, EYES: 0.6, VISION: 0.55, TAIL: 0.5, FINS: 0.15 }, rate: 0.0009, minParent: 12 },
  { id: 'reptile', name: 'reptile', tpl: 'reptile', habitats: LAND, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.4 && g[G.LIMBS] > 0.45 && g[G.LUNGS] > 0.4, needs: (a) => has(a, (l) => animal(l) && l.t.size >= 0.3, 20), g: { SIZE: 0.56, LIMBS: 0.75, WALK: 0.6, LUNGS: 0.85, GILLS: 0, CUTICLE: 0.55, ARMOR: 0.3, SHELL: 0.1, CARN: 0.55, HERB: 0.35, EYES: 0.6, VISION: 0.55, TAIL: 0.6, HUMID_OPT: 0.4, ENDOTHERM: 0.05, JAWS: 0.5 }, rate: 0.0009, minParent: 12 },
  { id: 'giant-herbivore', name: 'giant herbivore', tpl: 'sauropod', habitats: LAND, from: (g, t) => t.kind === K_ANIMAL && t.size >= 2 && g[G.LIMBS] > 0.5 && g[G.WALK] > 0.4, needs: (a) => has(a, (l) => prod(l.g) && l.t.size >= 0.4, 40), g: { SIZE: 0.8, HERB: 0.9, CARN: 0, WALK: 0.55, LIMBS: 0.85, ARMOR: 0.3, TAIL: 0.8, HEAD: 0.4, LIFESPAN: 0.9, REPRO_STRAT: 0.5, SOCIAL: 0.5, HORNS: 0.1, LUNGS: 0.9 }, rate: 0.0007, minParent: 10 },
  { id: 'giant-carnivore', name: 'giant predator', tpl: 'theropod', habitats: LAND, from: (g, t) => t.kind === K_ANIMAL && t.size >= 2 && g[G.LIMBS] > 0.5 && g[G.CARN] > 0.4, needs: (a) => has(a, (l) => animal(l) && l.t.size >= 3 && grazer(l), 15), g: { SIZE: 0.74, CARN: 0.92, HERB: 0, WALK: 0.75, LIMBS: 0.85, JAWS: 0.85, TAIL: 0.7, EYES: 0.7, VISION: 0.65, SMELL: 0.65, LUNGS: 0.9, REPRO_STRAT: 0.45, AGGR: 0.8 }, rate: 0.0006, minParent: 8 },
  // ---- warm blood, birds, mammals
  { id: 'bird', name: 'bird', tpl: 'bird', habitats: ['land', 'sky'], from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.3 && g[G.LIMBS] > 0.45 && g[G.LUNGS] > 0.5, needs: (a) => has(a, (l) => animal(l) && l.t.size >= 0.3 && l.g[G.LUNGS] > 0.5, 15), g: { SIZE: 0.4, WINGS: 0.9, FLY: 0.8, ENDOTHERM: 0.6, LIMBS: 0.6, WALK: 0.45, EYES: 0.8, VISION: 0.8, INTEL: 0.25, HEAD: 0.5, ARMOR: 0, SHELL: 0, LUNGS: 0.95, TAIL: 0.5, CARN: 0.4, HERB: 0.4, SOCIAL: 0.35 }, rate: 0.0008, minParent: 12 },
  { id: 'mammal', name: 'mammal', tpl: 'mammal', habitats: LAND, from: (g, t) => t.kind === K_ANIMAL && t.size >= 0.25 && g[G.LIMBS] > 0.5 && g[G.LUNGS] > 0.5, needs: (a) => has(a, (l) => animal(l) && l.t.size >= 0.3 && l.g[G.LUNGS] > 0.5, 15), g: { SIZE: 0.42, ENDOTHERM: 0.7, WALK: 0.7, LIMBS: 0.8, INTEL: 0.3, SMELL: 0.7, VISION: 0.55, EYES: 0.6, HERB: 0.45, CARN: 0.4, ARMOR: 0, SHELL: 0, TAIL: 0.5, SOCIAL: 0.3, REPRO_STRAT: 0.5, LUNGS: 0.95, HUMID_OPT: 0.4 }, rate: 0.001, minParent: 12 },
  { id: 'big-mammal', name: 'large mammal', tpl: 'mammoth', habitats: LAND, from: (g, t) => t.kind === K_ANIMAL && g[G.ENDOTHERM] > 0.45 && g[G.WALK] > 0.5 && t.size >= 0.8, needs: (a) => has(a, (l) => prod(l.g) && l.t.size >= 0.4, 40), g: { SIZE: 0.74, ENDOTHERM: 0.8, WALK: 0.65, LIMBS: 0.85, HERB: 0.85, CARN: 0.05, INTEL: 0.4, SOCIAL: 0.6, HORNS: 0.35, LIFESPAN: 0.9, REPRO_STRAT: 0.7, LUNGS: 0.95 }, rate: 0.0007, minParent: 10 },
  { id: 'big-cat', name: 'large predatory mammal', tpl: 'sabertooth', habitats: LAND, from: (g, t) => t.kind === K_ANIMAL && g[G.ENDOTHERM] > 0.45 && g[G.WALK] > 0.5 && t.size >= 1.0, needs: (a) => has(a, (l) => animal(l) && grazer(l) && l.t.size >= 1.5, 15), g: { SIZE: 0.66, CARN: 0.95, HERB: 0, ENDOTHERM: 0.75, WALK: 0.88, LIMBS: 0.85, JAWS: 0.75, INTEL: 0.45, SMELL: 0.75, VISION: 0.75, EYES: 0.75, AGGR: 0.7, SOCIAL: 0.3, REPRO_STRAT: 0.6, LUNGS: 0.95 }, rate: 0.0006, minParent: 8 },
  { id: 'marine-mammal', name: 'marine mammal', tpl: 'whale', habitats: ['sea'], from: (g, t) => t.kind === K_ANIMAL && t.size >= 1.5 && g[G.SWIM] > 0.6, needs: (a) => has(a, (l) => animal(l) && l.g[G.ENDOTHERM] > 0.4, 10), g: { SIZE: 0.88, ENDOTHERM: 0.7, SWIM: 0.85, FINS: 0.7, TAIL: 0.8, LUNGS: 0.95, GILLS: 0.02, CARN: 0.7, FILTER: 0.3, INTEL: 0.6, SOCIAL: 0.7, LIFESPAN: 0.95, REPRO_STRAT: 0.8, EYES: 0.5, VIBRATION: 0.8 }, rate: 0.0004, minParent: 8 },
  { id: 'hominid', name: 'clever upright primate', tpl: 'hominid', habitats: LAND, from: (g, t) => t.kind === K_ANIMAL && g[G.ENDOTHERM] > 0.45 && g[G.LIMBS] > 0.6 && g[G.INTEL] > 0.25 && t.size >= 0.3 && t.size < 1.5, needs: (a) => has(a, (l) => animal(l) && l.g[G.ENDOTHERM] > 0.45, 30) && has(a, (l) => prod(l.g) && l.t.size >= 0.4, 40), g: { SIZE: 0.5, INTEL: 0.62, SOCIAL: 0.65, LIMBS: 0.9, WALK: 0.8, EYES: 0.8, VISION: 0.85, HERB: 0.5, CARN: 0.4, ENDOTHERM: 0.75, HEAD: 0.8, TAIL: 0, REPRO_STRAT: 0.8, LIFESPAN: 0.7, LUNGS: 0.95 }, rate: 0.0005, minParent: 20 },
];

const habitatsOf = (w: World): Habitat[] => {
  const r: Habitat[] = [];
  const g = w.def.group;
  if (g === 'sea') r.push('sea'); else if (g === 'sky') r.push('sky', 'land');
  else if (g === 'fresh') r.push('fresh', 'land'); else r.push('land');
  if (w.def.terrain.water > 0 && g !== 'sea' && !r.includes('fresh')) r.push('fresh');
  return r;
};

/** All species alive in this world, whichever model currently holds them. */
export function livingIn(w: World, ctx: Ctx): Living[] {
  const out: Living[] = [];
  if (w.mode === 'coarse' && w.cs) { for (const s of w.cs.sp.values()) if (s.pop >= 1) out.push({ id: s.id, pop: s.pop, g: s.g, t: s.t }); return out; }
  if (!w.ents) return out;
  const e = w.ents; const cnt = new Map<number, number>();
  for (let i = 0; i < e.hi; i++) { const k = e.kind[i]; if (k === 1 || k === 2) cnt.set(e.species[i], (cnt.get(e.species[i]) ?? 0) + 1); }
  for (const [id, n] of cnt) { const g = ctx.sp.founders[id]; if (g) out.push({ id, pop: n, g, t: traitsOf(g, 0, {} as Traits) }); }
  return out;
}

const KEEP_TOL = [G.TEMP_OPT, G.TEMP_TOL, G.HUMID_OPT, G.SAL_OPT, G.SAL_TOL, G.DEPTH_PREF, G.PRESS_TOL, G.TOXIN_RES, G.O2_NEED, G.HUE, G.SAT];

/**
 * Called once per coarse step's worth of time. `dt` = number of coarse steps elapsed (may be < 1 in the
 * individual model, where the caller passes the fraction).
 */
export function radiate(w: World, ctx: Ctx, dt: number, reached: number): number {
  if (ctx.sp.disabled) return 0;
  const hab = habitatsOf(w);
  let all: Living[] | null = null; let made = 0;
  const rng = w.rng;
  for (const bp of BLUEPRINTS) {
    if (!bp.habitats.some((h) => hab.includes(h))) continue;
    // later tiers need the era before them to be reached (keeps the story ordered)
    if (rng.next() > bp.rate * dt * (1 + 0.25 * Math.min(4, reached))) continue;
    all ??= livingIn(w, ctx);
    if (bp.needs && !bp.needs(all)) continue;
    const parents = all.filter((l) => l.pop >= (bp.minParent ?? 12) && bp.from(l.g, l.t));
    if (!parents.length) continue;
    // ancestors are chosen in proportion to abundance
    let tot = 0; for (const p of parents) tot += p.pop; let r = rng.next() * tot; let par = parents[0];
    for (const p of parents) { r -= p.pop; if (r <= 0) { par = p; break; } }
    const child = new Float32Array(NG); for (let i = 0; i < NG; i++) child[i] = par.g[i];
    const s = 0.8 + rng.next() * 0.2;
    for (const k in bp.g) { const gi = (G as any)[k] as number; if (KEEP_TOL.includes(gi)) continue; const tgt = (bp.g as any)[k] as number + (rng.next() - 0.5) * 0.08; child[gi] = clamp(child[gi] + (tgt - child[gi]) * s); }
    // not everything about a new body plan is in the blueprint
    const jit = new Float32Array(NG); mutate(jit, 0, child, 0, rng, 1.2); for (let i = 0; i < NG; i++) child[i] = KEEP_TOL.includes(i) ? child[i] : jit[i];
    // a new body plan must be a real change
    if (distance(child, par.g, 0, 0) < 0.03) continue;
    const t = traitsOf(child, 0, {} as Traits);
    const n = Math.max(3, Math.min(6, par.pop * 0.006));
    const id = ctx.sp.create(par.id, child, 0, w.tick, bp.tpl);
    if (id === par.id) continue;
    ctx.events.push({ t: 'radiation', id, parent: par.id, blueprint: bp.id, world: w.idx });
    if (w.mode === 'coarse') {
      const cs = ensureCoarse(w);
      const sp: CoarseSp = { id, pop: n, g: child, t, kind: t.kind, p: new Float32Array(cs.samples.length), stress: 0, r: 0 };
      cs.sp.set(id, sp); (sp as any)._cnt = 0; (sp as any).born = cs.steps;
      const parentSp = cs.sp.get(par.id); if (parentSp) { parentSp.pop = Math.max(1, parentSp.pop - n * 0.4); syncCount(ctx, parentSp, w.tick); }
      syncCount(ctx, sp, w.tick);
    } else {
      let ok = 0;
      for (let k = 0; k < n; k++) { const spot = randomSpot(w, child); if (!spot) continue; const tmp = new Float32Array(NG); mutate(tmp, 0, child, 0, rng, 0.3); if (spawn(w, ctx, id, tmp, 0, spot.x, spot.y, { grown: rng.next() < 0.6, energyFrac: 0.6, age: rng.int(300) }) >= 0) ok++; }
      void ok;
    }
    made++;
  }
  return made;
}
void H; void W; void K_PRODUCER;
