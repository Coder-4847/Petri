// Population-level ("coarse") model. Used for biomes that are not on screen and for deep-time fast-forward.
// Every species becomes a population count + a mean genome. The same economics as the individual model
// (metabolism, light, nutrients, edibility rules, stress) drive births, deaths and selection, so a world
// can be collapsed to this model and rebuilt into individuals without changing its character.
import { W, H, NG, G, CW, CH, BLOCK, K_PRODUCER, K_ANIMAL, IS_WATER, IS_SOLID, AIR, clamp } from '../shared/constants';
import type { World } from './world';
import type { Ctx } from './ecology';
import { stressAt, spawn, cellM } from './ecology';
import { traitsOf, mutate, distance, type Traits } from './genes';
import { radiate } from './radiation';

export const COARSE_STEP = 50;
const MAX_SPECIES_PER_WORLD = 40; // simulated ticks per coarse step
export const WORLD_CAP = 5200; // max individuals a world holds (matches the entity store)

export interface CoarseSp {
  id: number;
  pop: number;
  g: Float32Array; // mean genome
  t: Traits;
  kind: number;
  // per-step scratch
  p: Float32Array; // habitat distribution over samples
  stress: number;
  r: number; // last per-capita growth rate (per tick)
  gain?: number; // producers: per-capita energy gain per tick (last step)
  cf?: number; // density-dependent birth scaling applied last step (so payoffs are compared at equilibrium)
  F?: number; // predators: total weighted prey availability (last step)
  ib?: number; // predators: per-capita bite intake (last step)
}

interface Sample { x: number; y: number; m: number; w: number; area: number; L: number; zone: number; }

export class CoarseState {
  sp = new Map<number, CoarseSp>();
  samples: Sample[] = [];
  nut = 0.4; det = 0.1; carc = 0;
  steps = 0;
}

const K_SAMPLES = 28;

export function ensureCoarse(w: World): CoarseState {
  if (!w.cs) { w.cs = new CoarseState(); buildSamples(w); }
  return w.cs;
}

/** Representative habitat points, weighted by the area of the habitat they stand for. */
export function buildSamples(w: World) {
  const cs = w.cs!; const S: Sample[] = []; const rng = w.rng;
  // water column by depth
  const waterCells: [number, number][] = [];
  for (let x = 0; x < W; x += 3) for (let y = 0; y < H; y += 2) if (IS_WATER[w.medium[y * W + x]]) waterCells.push([x, y]);
  if (waterCells.length) {
    waterCells.sort((a, b) => (a[1] - (w.waterTop[a[0]] >= 0 ? w.waterTop[a[0]] : 0)) - (b[1] - (w.waterTop[b[0]] >= 0 ? w.waterTop[b[0]] : 0)));
    const n = Math.min(12, Math.max(3, (waterCells.length / 30) | 0));
    const total = waterCells.length * 6;
    for (let k = 0; k < n; k++) {
      const [x, y] = waterCells[Math.min(waterCells.length - 1, ((k + 0.5) / n * waterCells.length) | 0)];
      S.push({ x: x + rng.next(), y: y + rng.next(), m: w.medium[y * W + x], w: 0, area: total / n, L: w.light[y * W + x] / 255, zone: 0 });
    }
  }
  // land surface strip, high air, soil pores
  const dry: number[] = []; for (let x = 0; x < W; x++) if (w.waterTop[x] < 0 && w.surfaceY[x] < H) dry.push(x);
  if (dry.length && !w.def.noFloor) {
    const area = dry.length * 8;
    for (let k = 0; k < 4; k++) { const x = dry[rng.int(dry.length)]; const y = w.surfaceY[x] - 2; S.push({ x: x + 0.5, y, m: AIR, w: 0, area: area / 4, L: w.light[(y | 0) * W + x] / 255, zone: 1 }); }
    for (let k = 0; k < 3; k++) { const x = dry[rng.int(dry.length)]; const y = Math.max(1, w.surfaceY[x] - 20 - rng.next() * 12); S.push({ x: x + 0.5, y, m: AIR, w: 0, area: dry.length * 24 / 3, L: w.light[(y | 0) * W + x] / 255, zone: 2 }); }
    for (let k = 0; k < 5; k++) { const x = dry[rng.int(dry.length)]; const y = w.surfaceY[x] + 1 + k * 1.6; if (y < H - 1) S.push({ x: x + 0.5, y, m: w.medium[(y | 0) * W + x], w: 0, area: dry.length * 8 / 5, L: w.light[(y | 0) * W + x] / 255, zone: 3 }); }
  }
  if (w.def.noFloor) for (let k = 0; k < 8; k++) { const y = 8 + (k / 8) * (H - 20); const x = 20 + rng.next() * (W - 40); S.push({ x, y, m: AIR, w: 0, area: W * H * 0.5 / 8, L: w.light[(y | 0) * W + (x | 0)] / 255, zone: 2 }); }
  // vents
  for (const v of w.vents) S.push({ x: v.x + 0.5, y: v.y + 1, m: w.medium[(v.y + 1) * W + v.x], w: 0, area: 400, L: 0.05, zone: 4 });
  let tot = 0; for (const s of S) tot += s.area; for (const s of S) s.w = s.area / tot;
  cs.samples = S;
}

const DENS = (size: number) => 0.14 / Math.pow(1 + size, 1.6);

export let lastSuit = 0;
const chemAt = (w: World, sm: Sample) => (sm.zone === 4 ? 1 : w.vents.length && IS_WATER[sm.m] ? 0.3 : 0.02); // diffuse chemistry around vents
function profile(w: World, cs: CoarseState, g: Float32Array, t: Traits, kind: number, out: Float32Array): number {
  // habitat suitability per sample -> distribution p; returns mean stress weighted by p
  const S = cs.samples; let tot = 0, st = 0;
  const gills = g[G.GILLS], lungs = g[G.LUNGS], cut = g[G.CUTICLE];
  const tiny = t.size < 0.45;
  for (let k = 0; k < S.length; k++) {
    const s = S[k]; const inWater = IS_WATER[s.m] === 1;
    let stress = stressAt(w, g, 0, s.x, s.y, s.m);
    let ok = 1;
    if (inWater) {
      if (!tiny) ok = 0.02 + 0.98 * Math.pow(Math.min(1, gills / 0.5), 2);
      if (kind === K_ANIMAL && t.size >= 0.5) ok *= 0.2 + 0.8 * Math.min(1, t.spSwim / (0.3 * (1.4 + 2.4 * Math.sqrt(t.size))));
    } else if (s.zone === 3) { // soil pores
      if (t.size >= 0.5) ok = 0.01 + 0.99 * Math.pow(Math.min(1, g[G.BURROW] / 0.4), 2);
      if (kind === K_PRODUCER) stress += 0.15 + 0.5 * (1 - s.L) * (g[G.PHOTO] > 0.3 ? 1 : 0);
    } else { // open air
      const air = Math.max(lungs, t.size < 1.6 ? cut * 0.8 : 0);
      if (!tiny) ok = 0.03 + 0.97 * Math.pow(Math.min(1, air / 0.5), 2);
      if (kind === K_ANIMAL && s.zone === 2) ok *= t.spFly > 0 ? 1 : 0.05;
      if (kind === K_PRODUCER && t.size >= 0.6 && s.zone === 2) ok *= 0.2;
      if (tiny && cut < 0.25 && s.zone !== 3) ok *= 0.5;
      if (kind === K_ANIMAL && t.size >= 0.5 && s.zone !== 2) ok *= 0.12 + 0.88 * Math.min(1, Math.max(t.spWalk, t.spFly * 0.7) / (0.4 * (1.4 + 2.4 * Math.sqrt(t.size))));
    }
    if (kind === K_PRODUCER) {
      const needL = g[G.PHOTO] > g[G.CHEMO];
      ok *= needL ? Math.pow(Math.max(0.01, s.L), 0.7) : Math.max(0.05, chemAt(w, s));
    }
    const suit = ok * Math.exp(-2.4 * Math.max(0, stress)) * s.w * (1 + 0.5 * (inWater ? 1 - Math.abs(g[G.DEPTH_PREF] - (s.y / H)) : 0));
    out[k] = suit; tot += suit; st += suit * stress;
  }
  lastSuit = tot;
  if (tot < 1e-9) { for (let k = 0; k < S.length; k++) out[k] = 1 / S.length; return 3; }
  for (let k = 0; k < S.length; k++) out[k] /= tot;
  return st / tot;
}

function edible(pred: CoarseSp, prey: CoarseSp): number {
  const g = pred.g, pg = prey.g;
  if (pred.id === prey.id) return 0;
  const size = pred.t.size, sj = prey.t.size;
  if (prey.kind === K_PRODUCER) {
    const herb = g[G.HERB], filt = g[G.FILTER];
    if (herb > 0.3 && sj <= size * 10) return herb;
    if (filt > 0.3 && sj <= size * 0.3) return filt;
    return 0;
  }
  const carn = g[G.CARN];
  if (carn > 0.25 && sj >= size * 0.04 && sj <= size * (1.2 + 0.7 * carn)) {
    // can the prey get away, or defend itself?
    const esc = prey.t.speed / (prey.t.speed + pred.t.speed + 0.01);
    const defence = 1 + 2.2 * (pg[G.ARMOR] * 0.55 + pg[G.SHELL] * 0.65) + 0.9 * pg[G.VENOM] + 0.5 * pg[G.HORNS];
    return carn * (1 - 0.6 * pg[G.CAMO]) * (1 - 0.6 * esc) * (1 - 0.3 * pg[G.INTEL]) * (1 - 0.25 * pg[G.SOCIAL]) / defence;
  }
  return 0;
}
/** capture success from weaponry, venom, pack tactics and (in the dark) bioluminescent lures */
function huntBoost(g: Float32Array, dark: number): number { return 1 + 0.5 * g[G.JAWS] + 0.3 * g[G.VENOM] + 0.3 * g[G.SOCIAL] + 0.35 * g[G.BIOLUM] * dark; }
function darkness(cs: CoarseState, p: Float32Array): number { let l = 0; for (let k = 0; k < cs.samples.length; k++) l += p[k] * cs.samples[k].L; return 1 - Math.min(1, l * 1.2); }
/** foraging power: bigger, faster, sharper-sensed, cleverer animals find food faster */
function forage(t: Traits, g: Float32Array): number {
  const sp = (1.4 + 2.4 * Math.sqrt(t.size)) / (1.4 + 2.4 * Math.sqrt(0.12));
  const se = t.sense / 4;
  return clamp(Math.pow(sp, 0.6) * Math.pow(Math.max(0.3, se), 0.5) * (1 + 0.5 * g[G.INTEL]) * (1 + 0.2 * g[G.ENDOTHERM]), 0.5, 5);
}

/** per-capita birth rate (per tick) of a consumer with net energy surplus `net` — shared by the step and the payoff */
function consumerBirths(t: Traits, g: ArrayLike<number>, net: number): number {
  const strat = g[G.REPRO_STRAT];
  const childE = t.maxE * 0.9 * (0.32 + 0.3 * strat);
  const litter = Math.max(1, Math.min(2, Math.round((2.6 - 1.8 * strat) * (0.4 + g[G.REPRO_RATE] * 0.8))));
  const matureDelay = 1 / (1 + (t.life * 0.1) / 700);
  const b = Math.max(0, net - 0.0001 * t.maxE) / (childE * 1.2) * matureDelay * 0.8;
  return Math.min(b, litter / (300 + t.life * 0.45)); // maturity + gestation: big animals breed slowly
}
/** energy a predator gets from one prey of this kind (matches the individual model's carcass value) */
const preyVal = (t: Traits) => 2.5 * t.size * t.size + 0.24 * t.maxE;
const K_HALF = 300; // prey-biomass half-saturation of the predator functional response
/** species of similar size compete hardest; differing size opens a niche (drives size radiation) */
const simSize = (a: Traits, b: Traits) => { const d = Math.log(a.size / b.size); return Math.exp(-d * d / (2 * 0.75 * 0.75)); };
const PROD_GAIN = 0.02 * 3.2; // matches the individual model: gain ∝ size^1.15 (area-like), calibrated so size 0.12 is unchanged
const GAMMA = 1.6; // how strongly height wins the competition for light

/** per-capita net birth-rate model; returns growth rate per tick for a hypothetical species (used for selection). */
interface Flow { gain: number; supplyShare: number }

export function stepCoarse(w: World, ctx: Ctx, steps = 1) {
  const cs = ensureCoarse(w);
  for (let n = 0; n < steps; n++) stepOnce(w, ctx, cs);
}

function stepOnce(w: World, ctx: Ctx, cs: CoarseState) {
  const rng = w.rng, env = w.env, D = COARSE_STEP;
  cs.steps++; w.tick += D;
  for (const sm of cs.samples) sm.L = w.light[Math.max(0, Math.min(H - 1, sm.y | 0)) * W + Math.max(0, Math.min(W - 1, sm.x | 0))] / 255;
  const list: CoarseSp[] = []; for (const s of cs.sp.values()) if (s.pop > 0.2) list.push(s);
  const S = list.length; const K = cs.samples.length;
  if (!S || !K) { cs.nut = Math.min(4, cs.nut + 0.002 * env.nutrients); return; }
  const NB = CW * CH;
  const Nf = cs.nut / (cs.nut + 0.12);
  // --- profiles
  for (const s of list) { if (!s.p || s.p.length !== K) s.p = new Float32Array(K); s.stress = profile(w, cs, s.g, s.t, s.kind, s.p); }
  // --- producers: competition (strongest between similar sizes) + asymmetric competition for light
  const gain = new Map<CoarseSp, number>(); let prodSupply = 0;
  const supplies: CoarseSp[] = [];
  const prods = list.filter((s) => s.kind === K_PRODUCER);
  const xk: Float32Array[] = prods.map((s) => { const a = new Float32Array(K); for (let k = 0; k < K; k++) a[k] = s.pop * s.p[k] / (cs.samples[k].area * 0.1); return a; });
  for (let pi = 0; pi < prods.length; pi++) {
    const s = prods[pi]; let gsum = 0, cf = 0;
    for (let k = 0; k < K; k++) {
      const sm = cs.samples[k]; const pk = s.p[k]; if (pk < 1e-4) continue;
      let crowdK = 0, rest = 0;
      for (let oi = 0; oi < prods.length; oi++) { const o = prods[oi]; const x = xk[oi][k]; if (x <= 0) continue; crowdK += x * (0.5 + o.t.size) * 3 * (oi === pi ? 1 : simSize(s.t, o.t)); if (oi !== pi) rest += x * Math.pow(o.t.size, GAMMA); }
      const light = s.g[G.PHOTO] * sm.L * (0.3 + 0.7 * Nf) + s.g[G.CHEMO] * chemAt(w, sm) * (0.3 + 0.7 * Nf);
      const me = Math.pow(s.t.size, GAMMA);
      const lightShare = 1 / (1 + rest / (me + 0.02) * 0.5 * Math.min(1, crowdK));
      gsum += pk * light * (0.35 + 0.65 * lightShare); cf += pk * Math.max(0, 1 - crowdK);
    }
    const sg = Math.pow(s.t.size, 1.15);
    const gn = gsum * PROD_GAIN * sg * (0.55 + 0.45 * Math.min(1, cf + 0.3)) * Math.max(0.1, 1 - s.stress * 0.5);
    gain.set(s, gn); s.gain = gn; prodSupply += s.pop * gn * 0.6; supplies.push(s);
    s.r = 0; (s as any).crowdF = cf;
  }
  // --- consumer demands
  const demand = new Float32Array(S); const idx = new Map<CoarseSp, number>(); list.forEach((s, i) => idx.set(s, i));
  const intake = new Float32Array(S); // energy per capita per tick actually obtained
  const killed = new Float32Array(S); // individuals lost to predation per tick (whole species)
  // herbivores share the producers' non-seed energy; rivals of similar size compete hardest
  const imax = (s: CoarseSp) => 0.05 * Math.pow(s.t.size, 1.5) + 0.004;
  const herbs: number[] = [];
  for (let i = 0; i < S; i++) { const s = list[i]; if (s.kind === K_ANIMAL && s.g[G.HERB] > 0.3) { let ov = 0; for (const pr of supplies) if (edible(s, pr)) ov += overlap(s, pr, K); demand[i] = s.pop * imax(s) * Math.min(1, ov); herbs.push(i); } }
  for (const i of herbs) {
    const s = list[i]; let sup = 0;
    for (const pr of supplies) if (edible(s, pr)) sup += overlap(s, pr, K) * pr.pop * (pr.gain ?? 0) * 0.6;
    let rivals = 0; for (const j of herbs) if (j !== i) rivals += demand[j] * simSize(s.t, list[j].t);
    const fill = Math.min(1, sup / (demand[i] + rivals + 1e-9));
    intake[i] += (demand[i] / s.pop) * Math.min(1, fill * Math.sqrt(forage(s.t, s.g))) * 0.62;
    (s as any).herbFill = fill;
  }
  // predators: Holling type II on edible prey biomass
  for (let i = 0; i < S; i++) {
    const s = list[i]; if (s.kind !== K_ANIMAL || s.g[G.CARN] <= 0.25) continue;
    let F = 0; const w8: number[] = [];
    for (let j = 0; j < S; j++) { const pr = list[j]; if (pr.kind !== K_ANIMAL) { w8.push(0); continue; } const e = edible(s, pr); if (!e) { w8.push(0); continue; } const wt = e * overlap(s, pr, K) * pr.pop * preyVal(pr.t); w8.push(wt); F += wt; }
    const fe = forage(s.t, s.g);
    const fr = F * fe / (F * fe + K_HALF); // saturating functional response
    const Ibite = Math.min(imax(s) * 1.2 * fr * huntBoost(s.g, darkness(cs, s.p)), 2.6 * s.t.bmr * 1.6 * (1 + s.stress * 0.8) / 0.8 + 1e-6); s.F = F; s.ib = Ibite; // satiation: they stop eating when full
    intake[i] += Ibite * 0.8;
    if (F > 0) { // spread kills over prey species
      const consumedEnergy = s.pop * Ibite; for (let j = 0; j < S; j++) if (w8[j]) { const pr = list[j]; const share = w8[j] / F; killed[j] += consumedEnergy * share / preyVal(pr.t); }
    }
  }
  // saprotrophs / scavengers: detritus & carcass pools
  let sapDemand = 0; const sapIdx: number[] = [];
  for (let i = 0; i < S; i++) { const s = list[i]; if (s.kind === K_ANIMAL && s.g[G.SCAV] > 0.3 && s.t.size < 0.45) { sapIdx.push(i); sapDemand += s.pop * 0.012 * s.g[G.SCAV]; } }
  const detAvail = cs.det * NB * 0.35; // fraction accessible per tick
  const sapFill = sapDemand > 0 ? Math.min(1, detAvail / (sapDemand * 8)) : 0;
  let detUsed = 0;
  for (const i of sapIdx) { const s = list[i]; const perCap = 0.012 * (0.4 + s.t.size * 2) * s.g[G.SCAV] * sapFill; intake[i] += perCap * 5 * 0.55; detUsed += perCap * s.pop; }
  let carcDemand = 0; const scavIdx: number[] = [];
  for (let i = 0; i < S; i++) { const s = list[i]; if (s.kind === K_ANIMAL && s.t.size >= 0.45 && (s.g[G.SCAV] > 0.3 || s.g[G.CARN] > 0.45)) { scavIdx.push(i); carcDemand += s.pop * imax(s) * (s.g[G.SCAV] > 0.3 ? 1 : 0.3); } }
  const carcFill = carcDemand > 0 ? Math.min(1, cs.carc / (carcDemand * D)) : 0;
  let carcUsed = 0;
  for (const i of scavIdx) { const s = list[i]; const take = imax(s) * (s.g[G.SCAV] > 0.3 ? 1 : 0.3) * carcFill; intake[i] += take * 0.7; carcUsed += take * s.pop; }

  // --- integrate populations
  let totalPop = 0; for (const s of list) totalPop += s.pop;
  let nutUptake = 0, detIn = 0, macroDeath = 0;
  const speciesCrowd = Math.max(0, 1 - totalPop / WORLD_CAP);
  for (let i = 0; i < S; i++) {
    const s = list[i]; const t = s.t;
    let birthsPer = 0, deathsPer = 1 / t.life + (s.stress > 0.25 ? (s.stress - 0.25) * 0.0035 * 1.6 : 0);
    if (s.kind === K_PRODUCER) {
      const gn = gain.get(s)!; const net = gn * 0.4; // seed share
      const cost = s.g[G.REPRO_STRAT] * 0.1 + 0.1;
      const Erep = t.maxE * cost * 1.2;
      const cf = (s as any).crowdF as number;
      birthsPer = Math.max(0, net) / Erep * Math.min(1, cf * 1.2);
      const starve = gn * 0.6 < t.bmr * 0.5 ? (t.bmr * 0.5 - gn * 0.6) / (0.25 * t.maxE) : 0;
      deathsPer += starve * 0.5;
      nutUptake += s.pop * gn * 0.12;
    } else {
      const stressMult = 1 + s.stress * 0.8;
      const cost = t.bmr * (1 + 0.6) * stressMult; // basal + activity
      const net = intake[i] - cost;
      birthsPer = consumerBirths(t, s.g, net);
      if (net < 0) deathsPer += -net / (0.3 * t.maxE) * 0.6;
      deathsPer += killed[i] / Math.max(1, s.pop);
    }
    { const dflux = s.pop * deathsPer * D; const val = 2.5 * t.size * t.size + 0.3 * t.maxE; if (t.size < 0.45 || s.kind === K_PRODUCER) detIn += dflux * val * 0.12; else macroDeath += s.pop * deathsPer * val; }
    // crowding: within-species density cap similar to the individual model
    const capSp = Math.max(8, WORLD_CAP * 0.5 * (s.kind === K_PRODUCER ? 0.8 : 0.5) * Math.min(1, 1.2 / (0.3 + t.size) ** 0.5 / 2));
    const crowdSp = Math.max(0, 1 - s.pop / capSp) * speciesCrowd;
    birthsPer *= crowdSp; s.cf = crowdSp;
    const r = birthsPer - deathsPer; s.r = r; (s as any).dbg = { intake: intake[i], births: birthsPer, deaths: deathsPer, killed: killed[i] / Math.max(1, s.pop), stress: s.stress, herbFill: (s as any).herbFill ?? 0, sapFill, carcFill };
    let N = s.pop * Math.exp(r * D);
    // demographic noise for small populations
    if (N < 40) N *= 1 + rng.gauss() * 0.1 / Math.sqrt(Math.max(1, N));
    // refugia: a species that would grow if predators weren't eating it never quite disappears
    const viable = (birthsPer - (deathsPer - killed[i] / Math.max(1, s.pop))) > 0;
    if (viable && s.pop >= 0.5 && N < 2) N = 2;
    else if (N < 0.5 && s.pop >= 0.5) N = rng.next() < 0.5 ? 0 : 0.6;
    s.pop = Math.max(0, N);
  }
  // --- world pools (all in "mean per block" units, matching the individual model's fields)
  const steps8 = D / 8;
  cs.nut = clamp(cs.nut + env.nutrients * 0.0025 * meanNutFactor(w) * steps8 - nutUptake * D / NB + cs.det * 0.012 * steps8 * 0.9 + detUsed * D / NB * 0.6, 0, 4);
  cs.det = clamp(cs.det * (1 - 0.012 * steps8) + detIn / NB - detUsed * D / NB * 0.8 + (env.sunlight < 0.3 ? env.nutrients * 0.0007 * steps8 : 0), 0, 8);
  cs.carc = Math.max(0, cs.carc * Math.exp(-0.0011 * (0.4 + env.temp * 1.6) * D) + macroDeath * D * 0.8 - carcUsed * D);

  // --- registry counts & extinctions
  for (const s of list) syncCount(ctx, s, w.tick);
  // --- evolution (every 3rd step, with rates scaled up) and hard cap on species per world
  if (cs.steps % 3 === 0) { evolve(w, ctx, cs, list); radiate(w, ctx, 3, ctx.era?.reached ?? 0); maybeDisperse(w, ctx, 3); }
  if (cs.sp.size > MAX_SPECIES_PER_WORLD) {
    const arr = [...cs.sp.values()].sort((a, b) => a.pop - b.pop);
    for (let i = 0; i < arr.length - MAX_SPECIES_PER_WORLD; i++) { arr[i].pop = 0; syncCount(ctx, arr[i], w.tick); cs.sp.delete(arr[i].id); }
  }
}

const _avgNF = new WeakMap<World, number>();
function meanNutFactor(w: World): number { let v = _avgNF.get(w); if (v === undefined) { let t = 0; for (let b = 0; b < w.nutFactor.length; b++) t += w.nutFactor[b]; v = t / w.nutFactor.length; _avgNF.set(w, v); } return v; }

function overlap(a: CoarseSp, b: CoarseSp, K: number): number {
  let o = 0; const S = (a as any)._ws; void S;
  for (let k = 0; k < K; k++) o += a.p[k] * b.p[k];
  return o * K; // uniform overlap ~ 1
}

/** keep the registry's living-count in step with the coarse population */
export function syncCount(ctx: Ctx, s: CoarseSp, tick: number) {
  const now = Math.round(s.pop); const had = (s as any)._cnt ?? 0;
  if (now !== had) { ctx.sp.add(s.id, now - had, tick); (s as any)._cnt = now; }
  if (s.pop < 0.5 && had > 0) { ctx.sp.add(s.id, -( (s as any)._cnt ?? 0), tick); (s as any)._cnt = 0; }
}

// ------------------------------------------------------------------ evolution (selection + speciation)
const bump = (g: Float32Array, k: number, d: number) => { g[k] = clamp(g[k] + d); };
/**
 * Informed variation: "adaptive radiation into vacant niches". Proposes a coordinated change along an
 * ecological axis (get bigger, hunt, armour up, take to land, fly, warm blood, brains ...). Whether it
 * survives is decided entirely by the payoff function, exactly like a random mutation.
 */
function propose(g: Float32Array, s: CoarseSp, rng: { next(): number; int(n: number): number }) {
  const animal = s.kind === K_ANIMAL, j = () => 0.5 + rng.next();
  const roll = rng.int(animal ? 19 : 8);
  if (animal) switch (roll) {
    case 0: bump(g, G.SIZE, 0.03 * j()); break;
    case 1: bump(g, G.SIZE, -0.02 * j()); break;
    case 2: bump(g, G.CARN, 0.12 * j()); bump(g, G.HERB, -0.1 * j()); bump(g, G.JAWS, 0.06 * j()); bump(g, G.SMELL, 0.04); break;
    case 3: bump(g, G.HERB, 0.12 * j()); bump(g, G.CARN, -0.1 * j()); break;
    case 4: bump(g, rng.next() < 0.5 ? G.ARMOR : G.SHELL, 0.08 * j()); break;
    case 5: bump(g, G.SWIM, 0.08 * j()); bump(g, G.FINS, 0.07 * j()); bump(g, G.TAIL, 0.04); break;
    case 6: bump(g, G.LIMBS, 0.07 * j()); bump(g, G.WALK, 0.08 * j()); bump(g, G.CRAWL, 0.04); break;
    case 7: bump(g, G.LUNGS, 0.1 * j()); bump(g, G.CUTICLE, 0.07 * j()); bump(g, G.GILLS, -0.05 * j()); bump(g, G.HUMID_OPT, -0.04); break;
    case 8: bump(g, G.WINGS, 0.1 * j()); bump(g, G.FLY, 0.1 * j()); break;
    case 9: bump(g, G.ENDOTHERM, 0.08 * j()); break;
    case 10: bump(g, G.INTEL, 0.06 * j()); bump(g, G.EYES, 0.04); bump(g, G.VISION, 0.04); break;
    case 11: bump(g, G.SOCIAL, 0.1 * j()); break;
    case 12: bump(g, rng.next() < 0.5 ? G.VENOM : G.HORNS, 0.09 * j()); break;
    case 13: bump(g, G.BIOLUM, 0.1 * j()); break;
    case 14: bump(g, G.DEPTH_PREF, (rng.next() - 0.5) * 0.25); bump(g, G.PRESS_TOL, (rng.next() - 0.4) * 0.2); break;
    case 15: bump(g, G.TEMP_TOL, (rng.next() - 0.4) * 0.2); break;
    case 16: bump(g, G.BURROW, 0.1 * j()); break;
    case 17: bump(g, G.CAMO, 0.1 * j()); break;
    case 18: bump(g, G.REPRO_STRAT, (rng.next() - 0.5) * 0.25); bump(g, G.LIFESPAN, (rng.next() - 0.4) * 0.2); break;
  } else switch (roll) {
    case 0: bump(g, G.SIZE, 0.035 * j()); break;
    case 1: bump(g, G.SIZE, -0.02 * j()); break;
    case 2: bump(g, G.CUTICLE, 0.08 * j()); bump(g, G.GILLS, -0.08 * j()); bump(g, G.HUMID_OPT, -0.04); break;
    case 3: bump(g, G.DEPTH_PREF, (rng.next() - 0.5) * 0.2); break;
    case 4: bump(g, G.TEMP_TOL, (rng.next() - 0.4) * 0.2); bump(g, G.TEMP_OPT, (rng.next() - 0.5) * 0.08); break;
    case 5: bump(g, G.PHOTO, 0.08 * j()); bump(g, G.CHEMO, -0.06 * j()); break;
    case 6: bump(g, G.REPRO_STRAT, (rng.next() - 0.5) * 0.25); bump(g, G.LIFESPAN, (rng.next() - 0.4) * 0.2); break;
    case 7: bump(g, G.SWIM, (rng.next() - 0.5) * 0.2); break;
  }
}

// Genes tuned by hill-climbing on the payoff (physiology/tolerances). Body plans change by radiation instead.
const ADAPT = new Uint8Array(NG);
for (const k of [G.TEMP_OPT, G.TEMP_TOL, G.HUMID_OPT, G.SAL_OPT, G.SAL_TOL, G.DEPTH_PREF, G.O2_NEED, G.PRESS_TOL, G.TOXIN_RES, G.METAB, G.REPRO_RATE, G.LIFESPAN, G.CAMO, G.HUE, G.SAT, G.PATTERN, G.CUTICLE, G.GILLS, G.LUNGS, G.ENDOTHERM]) ADAPT[k] = 1;

function evolve(w: World, ctx: Ctx, cs: CoarseState, list: CoarseSp[]) {
  const rng = w.rng; const K = cs.samples.length;
  const mutRate = 1 + w.env.toxicity * 7;
  const tmpG = new Float32Array(NG); const tmpM = new Float32Array(NG); const tmpP = new Float32Array(K); const tmpP0 = new Float32Array(K);
  let crowdedWorld = list.length >= MAX_SPECIES_PER_WORLD;
  for (const s of list) {
    if (s.pop < 2) continue;
    // ---- adaptation: environment sliders steer tolerance genes through payoff-guided variation
    const births = Math.max(0.2, s.pop * Math.max(0, s.r + 1 / s.t.life) * COARSE_STEP);
    const trials = Math.min(3, Math.floor(births * 0.06 + rng.next() * 2.2));
    for (let tr = 0; tr < trials; tr++) {
      mutate(tmpM, 0, s.g, 0, rng, mutRate);
      tmpG.set(s.g); for (let i = 0; i < NG; i++) if (ADAPT[i]) tmpG[i] = tmpM[i];
      const tt = traitsOf(tmpG, 0, {} as Traits);
      const r0 = payoff(w, cs, list, s, s.g, s.t, s.kind, tmpP0), r1 = payoff(w, cs, list, s, tmpG, tt, tt.kind, tmpP);
      const adv = r1 - r0; const scale = Math.abs(r0) + 0.00015;
      if (adv > 0 && rng.next() < Math.min(1, 0.4 + adv / scale)) {
        const a = Math.min(0.35, 0.08 + 0.25 * adv / scale);
        for (let i = 0; i < NG; i++) if (ADAPT[i]) s.g[i] += (tmpG[i] - s.g[i]) * a;
        s.t = traitsOf(s.g, 0, {} as Traits); s.kind = s.t.kind;
      } else if (adv > -scale * 0.3 && rng.next() < 0.1) { // near-neutral drift
        for (let i = 0; i < NG; i++) if (ADAPT[i]) s.g[i] += (tmpG[i] - s.g[i]) * 0.05;
        s.t = traitsOf(s.g, 0, {} as Traits); s.kind = s.t.kind;
      }
    }
    // ---- radiation: a daughter lineage with a new body plan / niche; the dynamics decide whether it lives
    const rate = Math.min(0.0045, 0.00012 * Math.sqrt(s.pop)) * (crowdedWorld ? 0.15 : 1) * (ctx.sp.disabled ? 0 : 1);
    if (rng.next() < rate && s.pop > 12) {
      tmpG.set(s.g);
      mutate(tmpG, 0, tmpG, 0, rng, mutRate * 1.5);
      const n = 1 + rng.int(3); for (let q = 0; q < n; q++) propose(tmpG, s, rng);
      const f = ctx.sp.founders[s.id];
      const dChild = distance(tmpG, s.g, 0, 0);
      if (dChild > 0.012 && ctx.sp.list.length < 4090) {
        const child = Math.max(2.5, s.pop * 0.04);
        const id = ctx.sp.create(s.id, tmpG, 0, w.tick);
        if (id !== s.id) {
          const t = traitsOf(tmpG, 0, {} as Traits);
          cs.sp.set(id, { id, pop: child, g: new Float32Array(tmpG), t, kind: t.kind, p: new Float32Array(K), stress: 0, r: 0 });
          s.pop -= child; (cs.sp.get(id) as any)._cnt = 0;
          syncCount(ctx, cs.sp.get(id)!, w.tick); syncCount(ctx, s, w.tick);
          crowdedWorld = crowdedWorld || cs.sp.size >= MAX_SPECIES_PER_WORLD;
        }
      }
      void f;
    }
  }
  // drop extinct
  for (const [id, s] of cs.sp) if (s.pop < 0.2) { syncCount(ctx, s, w.tick); cs.sp.delete(id); }
}

/** per-capita growth rate of a hypothetical genome in the current community (selection signal) */
function payoff(w: World, cs: CoarseState, list: CoarseSp[], me: CoarseSp, g: Float32Array, t: Traits, kind: number, pbuf: Float32Array): number {
  const K = cs.samples.length;
  const stress = profile(w, cs, g, t, kind, pbuf);
  const tmp: CoarseSp = { id: -1, pop: me.pop, g, t, kind, p: pbuf, stress, r: 0 };
  const Nf = cs.nut / (cs.nut + 0.12);
  let deaths = 1 / t.life + (stress > 0.25 ? (stress - 0.25) * 0.0056 : 0);
  let births = 0;
  if (kind === K_PRODUCER) {
    let gsum = 0, cfs = 0;
    for (let k = 0; k < K; k++) {
      const sm = cs.samples[k]; const pk = pbuf[k]; if (pk < 1e-4) continue;
      const light = g[G.PHOTO] * sm.L * (0.3 + 0.7 * Nf) + g[G.CHEMO] * chemAt(w, sm) * (0.3 + 0.7 * Nf);
      let crowdK = 0, rest = 0;
      for (const o of list) if (o.kind === K_PRODUCER && o.id !== me.id) { const x = o.pop * o.p[k] / (sm.area * 0.1); crowdK += x * (0.5 + o.t.size) * 3 * simSize(t, o.t); rest += x * Math.pow(o.t.size, GAMMA); }
      const mine = me.pop * pk / (sm.area * 0.1); crowdK += mine * (0.5 + t.size) * 3;
      const meW = Math.pow(t.size, GAMMA);
      const lightShare = 1 / (1 + rest / (meW + 0.02) * 0.5 * Math.min(1, crowdK));
      gsum += pk * light * (0.35 + 0.65 * lightShare); cfs += pk * Math.max(0, 1 - crowdK);
    }
    const gn = gsum * PROD_GAIN * Math.pow(t.size, 1.15) * (0.55 + 0.45 * Math.min(1, cfs + 0.3)) * Math.max(0.1, 1 - stress * 0.5);
    const Erep = t.maxE * (g[G.REPRO_STRAT] * 0.1 + 0.1) * 1.2;
    births = Math.max(0, gn * 0.4) / Erep * Math.min(1, cfs * 1.2);
    if (gn * 0.6 < t.bmr * 0.5) deaths += (t.bmr * 0.5 - gn * 0.6) / (0.25 * t.maxE) * 0.5;
  } else {
    // intake from available prey / supply / pools
    let intake = 0;
    const imax = 0.05 * Math.pow(t.size, 1.5) + 0.004;
    if (g[G.HERB] > 0.3 || g[G.FILTER] > 0.3) {
      let avail = 0, supply = 0; for (const o of list) if (o.kind === K_PRODUCER && edible(tmp, o)) { const ov = overlapP(pbuf, o.p, K); avail += ov * o.pop; supply += ov * o.pop * (o.gain ?? 0.002) * 0.6; }
      // other herbivores compete for the same supply
      let rivals = 0; for (const o of list) if (o.id !== me.id && o.kind === K_ANIMAL && o.g[G.HERB] > 0.3) rivals += o.pop * (0.05 * Math.pow(o.t.size, 1.5) + 0.004) * overlapP(pbuf, o.p, K) * simSize(t, o.t);
      const demand = me.pop * imax;
      const fill = Math.min(1, supply / (demand + rivals + 1e-9));
      intake += imax * Math.min(1, fill * Math.sqrt(forage(t, g))) * Math.min(1, avail / 20) * 0.62;
    }
    if (g[G.CARN] > 0.25) {
      let F = 0;
      for (const o of list) if (o.kind === K_ANIMAL && o.id !== me.id) { const e = edible(tmp, o); if (e) F += e * overlapP(pbuf, o.p, K) * o.pop * preyVal(o.t); }
      const fe = forage(t, g);
      intake += Math.min(imax * 1.2 * (F * fe / (F * fe + K_HALF)) * huntBoost(g, darkness(cs, pbuf)), 2.6 * t.bmr * 1.6 * (1 + stress * 0.8) / 0.8 + 1e-6) * 0.8;
    }
    if (g[G.SCAV] > 0.3 && t.size < 0.45) { const aval = cs.det * CW * CH * 0.35; intake += 0.012 * (0.4 + t.size * 2) * g[G.SCAV] * Math.min(1, aval / 200) * 5 * 0.55; }
    if (g[G.SCAV] > 0.3 && t.size >= 0.45) { intake += imax * Math.min(1, cs.carc / 40) * 0.7; }
    const cost = t.bmr * 1.6 * (1 + stress * 0.8);
    const net = intake - cost; (lastIntake = intake);
    births = consumerBirths(t, g, net);
    if (net < 0) deaths += -net / (0.3 * t.maxE) * 0.6;
    deaths += predationMortality(list, me, tmp, K);
  }
  births *= me.cf ?? 1;
  lastPayoff = { births, deaths, kind };
  return births - deaths;
}
export let lastPayoff: any = null; let lastIntake = 0; export const dbgIntake = () => lastIntake;
/** per-capita mortality of `cand` (a hypothetical version of `me`) from every predator in the community */
function predationMortality(list: CoarseSp[], me: CoarseSp, cand: CoarseSp, K: number): number {
  let m = 0; const val = preyVal(cand.t);
  for (const o of list) {
    if (o.kind !== K_ANIMAL || o.g[G.CARN] <= 0.25 || o.id === me.id || o.F === undefined || o.ib === undefined) continue;
    const eNew = edible(o, cand); const eOld = edible(o, me);
    if (!eNew && !eOld) continue;
    const wOld = eOld ? eOld * overlapP(o.p, me.p, K) * me.pop * preyVal(me.t) : 0;
    const wNew = eNew ? eNew * overlapP(o.p, cand.p, K) * me.pop * preyVal(cand.t) : 0;
    const F = Math.max(1e-6, o.F - wOld + wNew);
    if (!wNew) continue;
    const fe = forage(o.t, o.g); const consumedEnergy = o.pop * o.ib * (F * fe / (F * fe + K_HALF)) / Math.max(1e-9, o.F * fe / (o.F * fe + K_HALF)); // response at the shifted availability
    m += consumedEnergy * (wNew / F) / val / Math.max(1, me.pop);
  }
  return Math.min(0.03, m);
}
function overlapP(a: Float32Array, b: Float32Array, K: number) { let o = 0; for (let k = 0; k < K; k++) o += a[k] * b[k]; return o * K; }

// ------------------------------------------------------------------ individuals <-> populations
/** Turn every individual in the world into coarse populations (silently releasing the entities). */
export function collapseWorld(w: World, ctx: Ctx) {
  const cs = ensureCoarse(w);
  if (!w.ents) return;
  const e = w.ents;
  const acc = new Map<number, { n: number; g: Float32Array }>();
  let nutSum = 0; for (let b = 0; b < w.nutrients.length; b++) nutSum += w.nutrients[b];
  cs.nut = nutSum / w.nutrients.length;
  let detSum = 0; for (let b = 0; b < w.detritus.length; b++) detSum += w.detritus[b]; cs.det = detSum / w.detritus.length;
  let carc = 0;
  for (let i = 0; i < e.hi; i++) {
    const k = e.kind[i]; if (k === 0) continue;
    if (k === 3) { carc += e.energy[i]; e.release(i); continue; }
    if (e.flags[i] & 4) { e.release(i); continue; } // cosmetic
    const id = e.species[i]; let a = acc.get(id); if (!a) { a = { n: 0, g: new Float32Array(NG) }; acc.set(id, a); }
    a.n++; const o = i * NG; for (let q = 0; q < NG; q++) a.g[q] += e.genome[o + q];
    e.release(i);
  }
  cs.carc = carc;
  const K = cs.samples.length;
  for (const [id, a] of acc) {
    for (let q = 0; q < NG; q++) a.g[q] /= a.n;
    const prev = cs.sp.get(id);
    const t = traitsOf(a.g, 0, {} as Traits);
    cs.sp.set(id, { id, pop: a.n, g: a.g, t, kind: t.kind, p: new Float32Array(K), stress: prev?.stress ?? 0, r: prev?.r ?? 0, ...(prev ? {} : {}) } as CoarseSp);
    (cs.sp.get(id) as any)._cnt = a.n;
  }
  // species that had no individuals left are gone from this world
  for (const [id, s] of cs.sp) if (!acc.has(id) && s.pop < 0.5) cs.sp.delete(id);
  w.mode = 'coarse';
}

/** Rebuild individuals from coarse populations. `cosmetic` entities don't touch the registry. */
export function expandWorld(w: World, ctx: Ctx, cosmetic = false, maxN = WORLD_CAP - 200) {
  const cs = ensureCoarse(w); w.allocEntities();
  const e = w.ents;
  // clear existing (cosmetic) individuals silently
  for (let i = 0; i < e.hi; i++) if (e.kind[i] !== 0) e.release(i);
  let total = 0; for (const s of cs.sp.values()) total += Math.round(s.pop);
  const scale = Math.min(1, maxN / Math.max(1, total));
  for (const s of cs.sp.values()) {
    const n = Math.round(s.pop * scale); if (n <= 0) continue;
    const had = (s as any)._cnt ?? n;
    if (!cosmetic) ctx.sp.count[s.id] -= had; // raw: spawn() re-counts each individual (must not look like an extinction)
    const tmp = new Float32Array(NG);
    let made = 0;
    for (let k = 0; k < n; k++) {
      // individuals vary around the mean genome
      mutate(tmp, 0, s.g, 0, w.rng, 0.35);
      const spot = randomSpot(w, tmp);
      if (!spot) continue;
      const i = spawn(w, ctx, s.id, tmp, 0, spot.x, spot.y, { grown: w.rng.next() < 0.6, age: w.rng.int(400), energyFrac: 0.45 + w.rng.next() * 0.25, noCount: cosmetic });
      if (i >= 0) { made++; if (cosmetic) e.flags[i] |= 4; }
    }
    if (!cosmetic) { if (made === 0) ctx.sp.count[s.id] += had; /* couldn't place anyone: keep the population as it was */ else { (s as any)._cnt = made; s.pop = made; } }
  }
  if (!cosmetic) { w.nutrients.fill(cs.nut); w.detritus.fill(cs.det); w.mode = 'full'; }
}

/** A believable place for an individual with this genome to live. */
export function randomSpot(w: World, g: ArrayLike<number>): { x: number; y: number } | null {
  const rng = w.rng, size = 0.12 * Math.pow(250, g[G.SIZE]);
  const tiny = size < 0.45;
  const aquatic = g[G.GILLS] > 0.45 || (g[G.SWIM] > g[G.WALK] + 0.2 && g[G.FLY] < 0.3 && g[G.LUNGS] < 0.5);
  const flier = g[G.FLY] > 0.3;
  const producer = Math.max(g[G.PHOTO], g[G.CHEMO]) >= Math.max(g[G.HERB], g[G.CARN], g[G.SCAV], g[G.FILTER], g[G.PARASITE]);
  for (let tries = 0; tries < 60; tries++) {
    const x = 1 + rng.next() * (W - 2);
    if (aquatic) {
      const wt = w.waterTop[x | 0]; if (wt < 0) continue;
      let fl = wt; while (fl < H - 1 && IS_WATER[w.medium[(fl + 1) * W + (x | 0)]]) fl++;
      if (fl - wt < 1) continue;
      const pref = Math.max(0, Math.min(1, g[G.DEPTH_PREF] + (rng.next() - 0.5) * 0.4));
      const y = wt + 0.6 + pref * Math.max(0.2, fl - wt - 1.2);
      if (producer && size >= 0.6 && g[G.SWIM] < 0.5) return { x, y: fl - 0.5 }; // benthic plants rooted on the floor
      return { x, y };
    }
    if (w.def.noFloor) { if (flier || tiny) return { x, y: 5 + rng.next() * (H - 30) }; continue; }
    const sy = w.surfaceY[x | 0]; if (sy >= H || w.waterTop[x | 0] >= 0) continue;
    if (flier) return { x, y: Math.max(2, sy - 4 - rng.next() * 25) };
    if (tiny) { // soil pores (or the surface film for light-seekers)
      const depth = g[G.PHOTO] > 0.3 ? 1 + rng.next() * 2.5 : 1 + rng.next() * 9;
      const y = sy + depth; if (y < H - 1 && !IS_SOLID[w.medium[(y | 0) * W + (x | 0)]]) continue; if (y < H - 1) return { x, y };
      continue;
    }
    if (g[G.BURROW] > 0.45 && !producer) return { x, y: sy + 2 + rng.next() * 6 };
    return { x, y: sy - 1.5 };
  }
  return null;
}
void cellM; void BLOCK;

/** Debug/analysis helper: per-capita growth rate of genome `g` as a variant of coarse species `me`. */
export function evalPayoff(w: World, me: CoarseSp, g: Float32Array): number {
  const cs = ensureCoarse(w); const list: CoarseSp[] = []; for (const s of cs.sp.values()) if (s.pop > 0.2) list.push(s);
  const t = traitsOf(g, 0, {} as Traits); return payoff(w, cs, list, me, g, t, t.kind, new Float32Array(cs.samples.length));
}

/** How well could this genome live in world `w`? (0 = not at all, ~1 = ideal). */
export function viability(w: World, g: Float32Array): number {
  const cs = ensureCoarse(w); const t = traitsOf(g, 0, {} as Traits);
  const st = profile(w, cs, g, t, t.kind, new Float32Array(cs.samples.length));
  return lastSuit * Math.exp(-0.8 * Math.max(0, st - 0.2));
}

/** Add `n` individuals of an existing species to a world (coarse population or real individuals). */
export function introduce(w: World, ctx: Ctx, id: number, g: Float32Array, n: number) {
  if (w.mode === 'coarse') {
    const cs = ensureCoarse(w);
    const cur = cs.sp.get(id);
    if (cur) { cur.pop += n; syncCount(ctx, cur, w.tick); return; }
    const t = traitsOf(g, 0, {} as Traits);
    const sp: CoarseSp = { id, pop: n, g: new Float32Array(g), t, kind: t.kind, p: new Float32Array(cs.samples.length), stress: 0, r: 0 };
    (sp as any)._cnt = 0; cs.sp.set(id, sp); syncCount(ctx, sp, w.tick);
  } else {
    w.allocEntities(); const tmp = new Float32Array(NG);
    for (let k = 0; k < n; k++) { const spot = randomSpot(w, g); if (!spot) continue; mutate(tmp, 0, g, 0, w.rng, 0.3); spawn(w, ctx, id, tmp, 0, spot.x, spot.y, { grown: w.rng.next() < 0.6, energyFrac: 0.6, age: w.rng.int(300) }); }
  }
}

/** Species spread between biomes: established populations occasionally colonise a viable neighbour. */
export function maybeDisperse(w: World, ctx: Ctx, rate = 1) {
  const worlds = ctx.worlds; if (!worlds || ctx.sp.disabled) return;
  const rng = w.rng; if (rng.next() > 0.01 * rate) return;
  const src = worlds[rng.int(worlds.length)]; if (src === w || !src.cs) return;
  const cand: CoarseSp[] = []; let tot = 0;
  for (const s of src.cs.sp.values()) if (s.pop >= 25) { cand.push(s); tot += s.pop; }
  if (!cand.length) return;
  let r = rng.next() * tot, pick = cand[0]; for (const s of cand) { r -= s.pop; if (r <= 0) { pick = s; break; } }
  // already living here?
  if (w.mode === 'coarse') { if (w.cs?.sp.has(pick.id)) return; }
  else if (w.ents) { const e = w.ents; for (let i = 0; i < e.hi; i++) if (e.kind[i] && e.species[i] === pick.id) return; }
  if (viability(w, pick.g) < 0.22) return;
  introduce(w, ctx, pick.id, pick.g, Math.max(3, Math.min(8, Math.round(pick.pop * 0.02))));
  ctx.events.push({ t: 'dispersal', id: pick.id, world: w.idx });
}
