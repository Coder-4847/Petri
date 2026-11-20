import { G, NG, clamp, K_PRODUCER, K_ANIMAL } from '../shared/constants';
import type { RNG } from '../shared/rng';

/** A neutral, microbe-like starting genome. Templates override a handful of genes. */
export function baseGenome(): Float32Array {
  const g = new Float32Array(NG);
  g[G.SIZE] = 0.06; g[G.TEMP_OPT] = 0.5; g[G.TEMP_TOL] = 0.5; g[G.HUMID_OPT] = 0.5; g[G.SAL_OPT] = 0.35; g[G.SAL_TOL] = 0.5;
  g[G.DEPTH_PREF] = 0.3; g[G.O2_NEED] = 0.3; g[G.PRESS_TOL] = 0.55; g[G.TOXIN_RES] = 0.2; g[G.METAB] = 0.5;
  g[G.GILLS] = 0.9; g[G.HUE] = 0.4; g[G.SAT] = 0.5; g[G.LIFESPAN] = 0.4; g[G.REPRO_RATE] = 0.6; g[G.REPRO_STRAT] = 0.1;
  g[G.MUT] = 0.5; g[G.SWIM] = 0.2; g[G.VISION] = 0.05; g[G.SMELL] = 0.1; g[G.MULTICELL] = 0;
  return g;
}

export type GeneSpec = Partial<Record<keyof typeof G, number>>;
export function genome(over: GeneSpec): Float32Array {
  const g = baseGenome();
  for (const k in over) g[(G as any)[k]] = (over as any)[k];
  return g;
}

export const sizeOf = (g: ArrayLike<number>) => 0.12 * Math.pow(250, g[G.SIZE]);

export function autotroph(g: ArrayLike<number>) { return Math.max(g[G.PHOTO], g[G.CHEMO]); }
export function heterotroph(g: ArrayLike<number>) { return Math.max(g[G.HERB], g[G.CARN], g[G.SCAV], g[G.FILTER], g[G.PARASITE]); }
export function kindOf(g: ArrayLike<number>): number { return autotroph(g) >= heterotroph(g) && autotroph(g) > 0.35 ? K_PRODUCER : K_ANIMAL; }

// distance weights: size and diet matter most for "is this a new species"
const W_ = new Float32Array(NG).fill(0.6);
for (const [k, w] of Object.entries({
  SIZE: 3, HERB: 2, CARN: 2, PHOTO: 2, CHEMO: 2, SCAV: 1.5, FILTER: 1.5, PARASITE: 1.5, SWIM: 1.5, WALK: 1.5, FLY: 1.5, CRAWL: 1, BURROW: 1,
  LIMBS: 1.2, FINS: 1.2, WINGS: 1.2, SHELL: 1.2, ARMOR: 1.2, JAWS: 1, HORNS: 1, INTEL: 1.2, TEMP_OPT: 1.2, HUMID_OPT: 1, SAL_OPT: 1.2, HUE: 0.8, GILLS: 1, LUNGS: 1, CUTICLE: 1,
  MUT: 0.2, SAT: 0.3, PATTERN: 0.4, CAMO: 0.5,
})) W_[(G as any)[k]] = w;
let WSUM = 0; for (let i = 0; i < NG; i++) WSUM += W_[i];

/** Weighted mean absolute genome difference in [0,1]. */
export function distance(a: ArrayLike<number>, b: ArrayLike<number>, ao = 0, bo = 0): number {
  let s = 0;
  for (let i = 0; i < NG; i++) { const d = a[ao + i] - b[bo + i]; s += W_[i] * (d < 0 ? -d : d); }
  return s / WSUM;
}

// Rare structural "innovations": a gene jumps from ~0 to a usable level (fins, limbs, jaws, eyes ...)
const INNOVATE = [G.FINS, G.LIMBS, G.WINGS, G.JAWS, G.EYES, G.SHELL, G.ARMOR, G.HORNS, G.LUNGS, G.CUTICLE, G.SEGMENTS, G.TAIL, G.HEAD, G.VENOM, G.BIOLUM, G.ENDOTHERM, G.MULTICELL, G.ELECTRO, G.WOODY, G.GLIDE, G.BURROW, G.VIBRATION];

/**
 * Copy `src` into `out` (slot offset `oo`) applying mutation.
 * `rate` multiplies the per-gene mutation probability (toxicity/radiation raises it).
 */
export function mutate(out: Float32Array, oo: number, src: ArrayLike<number>, so: number, rng: RNG, rate: number) {
  const m = src[so + G.MUT];
  const p = (0.14 + m * 0.2) * rate, sigma = 0.025 + m * 0.045;
  for (let i = 0; i < NG; i++) {
    let v = src[so + i];
    if (rng.next() < p) v += rng.gauss() * sigma;
    out[oo + i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  // gene-level macro mutations
  if (rng.next() < 0.0035 * rate) {
    const k = INNOVATE[rng.int(INNOVATE.length)];
    if (out[oo + k] < 0.25) out[oo + k] = 0.25 + rng.next() * 0.25; else out[oo + k] = clamp(out[oo + k] + rng.gauss() * 0.25);
  }
  if (rng.next() < 0.004 * rate) { const k = rng.int(NG); out[oo + k] = clamp(out[oo + k] + rng.gauss() * 0.3); }
}

/** Uniform crossover of two same-species parents (written into `out`). */
export function crossover(out: Float32Array, oo: number, a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number, rng: RNG) {
  for (let i = 0; i < NG; i++) out[oo + i] = rng.next() < 0.5 ? a[ao + i] : b[bo + i];
}

/** Maximum speed (cells/s) for a body of this size before locomotion-specific scaling. */
export const speedCap = (size: number) => 1.4 + 2.4 * Math.sqrt(size);

export interface Traits {
  speed: number; size: number; kind: number; maxE: number; bmr: number; spSwim: number; spWalk: number; spFly: number;
  sense: number; atk: number; def: number; life: number;
}
/** Decode a genome into the cached per-entity trait values used every tick. */
export function traitsOf(g: ArrayLike<number>, o = 0, t: Traits = {} as Traits): Traits {
  const size = 0.12 * Math.pow(250, g[o + G.SIZE]);
  const mass = size * size;
  const cap = speedCap(size);
  const complexity = 0.45 * (g[o + G.LIMBS] + g[o + G.FINS] + g[o + G.WINGS] * 1.5 + g[o + G.JAWS] + g[o + G.HORNS] * 0.5 + g[o + G.SHELL] * 1.2 + g[o + G.ARMOR] * 1.2 + g[o + G.EYES] * 0.5 + g[o + G.TAIL] * 0.3 + g[o + G.MULTICELL] * 0.5) + 0.3 * (g[o + G.BIOLUM] + g[o + G.VENOM] + g[o + G.ELECTRO]) + 0.25 * Math.max(g[o + G.VISION], g[o + G.SMELL], g[o + G.VIBRATION]) * (1 + Math.min(1, size) * 0.5);
  // maintaining unused machinery is wasteful: generalists pay for every extra diet / locomotion mode
  const dmax = Math.max(g[o + G.PHOTO], g[o + G.CHEMO], g[o + G.HERB], g[o + G.CARN], g[o + G.SCAV], g[o + G.FILTER], g[o + G.PARASITE]);
  const dsum = g[o + G.PHOTO] + g[o + G.CHEMO] + g[o + G.HERB] + g[o + G.CARN] + g[o + G.SCAV] + g[o + G.FILTER] + g[o + G.PARASITE];
  const lmax = Math.max(g[o + G.SWIM], g[o + G.WALK], g[o + G.FLY], g[o + G.CRAWL] * 0.6, g[o + G.BURROW] * 0.6);
  const lsum = g[o + G.SWIM] + g[o + G.WALK] + g[o + G.FLY] + g[o + G.CRAWL] * 0.6 + g[o + G.BURROW] * 0.6;
  const waste = 1 + 0.9 * (dsum - dmax) + 0.5 * Math.max(0, lsum - lmax - 0.05);
  const brain = 1 + 2.2 * g[o + G.INTEL] * g[o + G.INTEL] * Math.min(1, 0.3 + size * 0.3);
  const metab = 0.5 + g[o + G.METAB];
  t.size = size; t.kind = kindOf(g.constructor === Float32Array ? (g as Float32Array).subarray(o, o + NG) : Array.prototype.slice.call(g, o, o + NG));
  t.bmr = 0.0026 * Math.pow(mass, 0.75) * metab * (1 + complexity * 0.45 * (1 + 2.5 * Math.max(0, 0.7 - size))) * brain * (1 + 0.5 * g[o + G.ENDOTHERM]) * (1 + 0.04 * g[o + G.MULTICELL]) * (1 - 0.3 * g[o + G.CARN] * (1 - g[o + G.ENDOTHERM])) * waste;
  t.maxE = 9 * mass * (0.7 + 0.6 * g[o + G.REPRO_STRAT]) * (1 + 0.8 * g[o + G.CARN]) + 2 * Math.pow(mass, 0.75);
  const act = 1 + 0.25 * g[o + G.ENDOTHERM]; // warm blood = stamina
  t.spSwim = cap * Math.max(g[o + G.SWIM], 0.08) * (0.75 + 0.4 * g[o + G.FINS] + 0.25 * g[o + G.TAIL]) * 1.3 * act;
  const legs = Math.max(g[o + G.WALK] * (0.6 + 0.4 * g[o + G.LIMBS]), g[o + G.CRAWL] * 0.4);
  t.spWalk = cap * legs * 0.95 * act;
  t.spFly = g[o + G.FLY] > 0.25 ? cap * 1.5 * g[o + G.FLY] * (0.4 + 0.6 * g[o + G.WINGS]) * act : 0;
  const vis = g[o + G.VISION] * (0.4 + 0.6 * g[o + G.EYES]);
  t.sense = (1 + 0.5 * g[o + G.INTEL]) * (1.8 + size * 1.5 + 14 * Math.max(vis, g[o + G.SMELL] * 0.85, g[o + G.VIBRATION] * 0.6, g[o + G.ELECTRO] * 0.4) * (0.6 + 0.4 * Math.sqrt(size)));
  t.atk = (0.35 + 1.1 * g[o + G.JAWS] + 0.5 * g[o + G.HORNS] + 0.9 * g[o + G.VENOM]) * Math.pow(mass, 0.55) * (0.6 + 0.8 * g[o + G.AGGR]) * (0.5 + 0.5 * Math.max(g[o + G.CARN], 0.3));
  t.def = 1 + 3.2 * (0.55 * g[o + G.ARMOR] + 0.65 * g[o + G.SHELL]) + 0.8 * g[o + G.HORNS];
  const heavy = 1 / (1 + 0.6 * (g[o + G.ARMOR] + g[o + G.SHELL])); // armour slows you down
  t.spSwim *= heavy; t.spWalk *= heavy; t.spFly *= heavy;
  t.speed = Math.max(t.spSwim, t.spWalk, t.spFly);
  t.life = 2400 * (0.3 + 2.6 * g[o + G.LIFESPAN]) * Math.pow(Math.max(size, 0.2), 0.25);
  return t;
}

// ---------- plain-language description (inspector / codex) ----------
export function describeGenome(g: ArrayLike<number>): string[] {
  const out: string[] = [];
  const size = sizeOf(g);
  out.push(size < 0.5 ? 'microscopic' : size < 1.5 ? 'tiny' : size < 4 ? 'small' : size < 9 ? 'medium-sized' : size < 18 ? 'large' : 'enormous');
  if (g[G.PHOTO] > 0.4) out.push('photosynthetic'); if (g[G.CHEMO] > 0.4) out.push('feeds on chemicals');
  if (g[G.HERB] > 0.4 && g[G.CARN] > 0.4) out.push('omnivore'); else if (g[G.HERB] > 0.4) out.push('herbivore'); else if (g[G.CARN] > 0.4) out.push('carnivore');
  if (g[G.SCAV] > 0.4) out.push('scavenger'); if (g[G.FILTER] > 0.4) out.push('filter feeder'); if (g[G.PARASITE] > 0.4) out.push('parasite');
  if (g[G.FLY] > 0.4) out.push('flies'); else if (g[G.GLIDE] > 0.4) out.push('glides');
  if (g[G.SWIM] > 0.5) out.push('strong swimmer'); if (g[G.WALK] > 0.5) out.push('fast on land'); if (g[G.BURROW] > 0.5) out.push('burrows');
  if (g[G.SHELL] > 0.4) out.push('shelled'); if (g[G.ARMOR] > 0.4) out.push('armoured'); if (g[G.HORNS] > 0.4) out.push('horned'); if (g[G.VENOM] > 0.4) out.push('venomous');
  if (g[G.BIOLUM] > 0.4) out.push('bioluminescent'); if (g[G.ENDOTHERM] > 0.5) out.push('warm-blooded'); if (g[G.INTEL] > 0.6) out.push('clever'); if (g[G.SOCIAL] > 0.6) out.push('social');
  return out;
}

// ---------- species names ----------
const STEM: Record<string, string[]> = {
  micro: ['Micro', 'Nano', 'Cocc', 'Bacill', 'Spiro', 'Vibr', 'Proto'], alga: ['Phyc', 'Chlor', 'Algo', 'Cyan', 'Diatom', 'Phyto', 'Viri'], chemo: ['Thermo', 'Sulf', 'Ferr', 'Abyss', 'Pyro'],
  aquatic: ['Aqua', 'Hydro', 'Pelag', 'Thalas', 'Nere', 'Limn'], herb: ['Herb', 'Gram', 'Pasc', 'Phyll', 'Fol'], carn: ['Rapt', 'Carn', 'Preda', 'Saev', 'Lest'], scav: ['Necro', 'Sapro', 'Detri', 'Putr'],
  big: ['Mega', 'Gigant', 'Titan', 'Magn', 'Macro'], fly: ['Ptero', 'Aero', 'Volit', 'Pter'], glow: ['Lumin', 'Photu', 'Noct', 'Fulg'], armor: ['Ankyl', 'Thyre', 'Scler', 'Loric'], land: ['Terr', 'Geo', 'Cursor', 'Gressor'],
  parasite: ['Paras', 'Hamat', 'Sangu'], filter: ['Cten', 'Cilio', 'Rotif'], intel: ['Sapi', 'Cogit', 'Homin'], burrow: ['Fossor', 'Talp', 'Cunic'],
};
const SUFFIX = ['us', 'a', 'ia', 'ella', 'odon', 'ites', 'ys', 'ion', 'aria', 'oides', 'ichthys', 'saurus', 'therium', 'ornis', 'pterus', 'pus', 'ax', 'elix', 'ium', 'ina'];
const EPITH: Record<string, string[]> = {
  red: ['rubra', 'rufus', 'coccinea'], orange: ['aurantia', 'fulva'], yellow: ['aurea', 'flava', 'solaris'], green: ['viridis', 'smaragdina', 'prasina'], cyan: ['cyanea', 'marina', 'aquamarina'], blue: ['azurea', 'caerulea', 'indigo'], purple: ['violacea', 'purpurea'], pink: ['rosea', 'carnea'],
  dark: ['nigra', 'obscura', 'umbrosa', 'profunda'], pale: ['pallida', 'alba', 'hyalina'], spots: ['maculata', 'punctata'], stripes: ['striata', 'fasciata'], fast: ['velox', 'celer', 'rapida'], big: ['gigas', 'maxima', 'magna'], small: ['minor', 'minuta', 'pusilla'],
  spiny: ['spinosa', 'aculeata'], wide: ['vulgaris', 'communis', 'ubiqua'], cold: ['glacialis', 'borealis', 'frigida'], hot: ['thermalis', 'ardens', 'solaris'], dry: ['arida', 'deserti'], wet: ['palustris', 'humida'],
};
function hueWord(h: number, s: number, l: number): string {
  if (l < 0.28) return 'dark'; if (l > 0.78 || s < 0.15) return 'pale';
  const d = h * 360; return d < 15 || d >= 345 ? 'red' : d < 40 ? 'orange' : d < 70 ? 'yellow' : d < 160 ? 'green' : d < 200 ? 'cyan' : d < 255 ? 'blue' : d < 300 ? 'purple' : 'pink';
}

/** Deterministic-ish Latin binomial from a genome. */
export function speciesName(g: ArrayLike<number>, rng: RNG, taken: Set<string>): string {
  const size = sizeOf(g);
  const keys: string[] = [];
  if (size < 0.5) keys.push('micro');
  if (g[G.PHOTO] > 0.4) keys.push('alga'); if (g[G.CHEMO] > 0.4) keys.push('chemo');
  if (g[G.CARN] > 0.45) keys.push('carn'); if (g[G.HERB] > 0.45) keys.push('herb'); if (g[G.SCAV] > 0.45) keys.push('scav'); if (g[G.PARASITE] > 0.45) keys.push('parasite'); if (g[G.FILTER] > 0.45) keys.push('filter');
  if (g[G.FLY] > 0.4) keys.push('fly'); if (g[G.BIOLUM] > 0.4) keys.push('glow'); if (g[G.ARMOR] + g[G.SHELL] > 0.7) keys.push('armor');
  if (size > 12) keys.push('big'); if (g[G.INTEL] > 0.7) keys.push('intel'); if (g[G.BURROW] > 0.5) keys.push('burrow');
  if (g[G.SWIM] > 0.5 && g[G.WALK] < 0.3) keys.push('aquatic'); if (g[G.WALK] > 0.5) keys.push('land');
  if (!keys.length) keys.push('micro');
  const col: string[] = [hueWord(g[G.HUE], g[G.SAT], 0.5)];
  if (g[G.PATTERN] > 0.65) col.push(g[G.PATTERN] > 0.82 ? 'stripes' : 'spots');
  if (g[G.HORNS] + g[G.JAWS] > 1.1) col.push('spiny'); if (size > 9) col.push('big'); else if (size < 0.4) col.push('small');
  if (g[G.TEMP_OPT] < 0.3) col.push('cold'); else if (g[G.TEMP_OPT] > 0.75) col.push('hot'); if (g[G.HUMID_OPT] < 0.25) col.push('dry'); if (g[G.WALK] + g[G.SWIM] > 1.2) col.push('fast');
  for (let tries = 0; tries < 12; tries++) {
    const stems = STEM[rng.pick(keys)]; const genus = rng.pick(stems) + rng.pick(SUFFIX);
    const epi = rng.pick(EPITH[rng.pick(col)] ?? EPITH.wide);
    const name = `${genus} ${epi}`;
    if (!taken.has(name)) { taken.add(name); return name; }
  }
  let n = 2; const stems = STEM[keys[0]]; const base = `${stems[0]}${SUFFIX[0]} ${EPITH.wide[0]}`;
  while (taken.has(`${base} ${n}`)) n++; taken.add(`${base} ${n}`); return `${base} ${n}`;
}
void K_ANIMAL;
