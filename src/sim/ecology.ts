import {
  W, H, NG, G, BLOCK, CW, CH, TICK_RATE, ENT_CAP,
  AIR, LAVA, IS_SOLID, IS_WATER, IS_PORE,
  K_FREE, K_PRODUCER, K_ANIMAL, K_CARCASS,
  S_WANDER, S_FORAGE, S_HUNT, S_FLEE, S_REST, S_EAT, S_FIGHT, clamp,
} from '../shared/constants';
import type { World } from './world';
import type { SpeciesRegistry } from './species';
import { crossover, mutate, traitsOf, speedCap, type Traits } from './genes';

export interface Ctx { sp: SpeciesRegistry; events: any[]; }

const DT = 1 / TICK_RATE;
const scratch: Traits = {} as Traits;
const MAX_EVENTS = 500;
export const dbg = { eat: 0, bite: 0, hunt: 0, targets: 0, perceive: 0, noTarget: 0 };

// ------------------------------------------------------------------ helpers
function cellM(w: World, x: number, y: number): number {
  const cx = x | 0, cy = y | 0;
  if (cx < 0 || cx >= W) return 5;
  if (y < 0) return AIR;
  if (cy >= H) return w.def.noFloor ? AIR : 5;
  return w.medium[cy * W + cx];
}
/** Is this cell an obstacle for a creature? Tiny ones can squeeze through soil pores. */
function blocked(w: World, x: number, y: number, pore: boolean): boolean {
  const m = cellM(w, x, y);
  return IS_SOLID[m] === 1 && !(pore && IS_PORE[m] === 1);
}
function groundBelow(w: World, x: number, y: number): number {
  const cx = Math.max(0, Math.min(W - 1, x | 0));
  for (let cy = Math.max(0, y | 0); cy < H; cy++) if (IS_SOLID[w.medium[cy * W + cx]]) return cy;
  return -1;
}
const blockIdx = (x: number, y: number) => Math.max(0, Math.min(CH - 1, (y / BLOCK) | 0)) * CW + Math.max(0, Math.min(CW - 1, (x / BLOCK) | 0));
function addNut(w: World, x: number, y: number, v: number) { const b = blockIdx(x, y); w.nutrients[b] = Math.min(4, w.nutrients[b] + v); }

function localTemp(w: World, x: number, y: number, m: number): number {
  const env = w.env;
  if (IS_WATER[m]) {
    const wt = w.waterTop[Math.max(0, Math.min(W - 1, x | 0))]; const depth = wt >= 0 ? y - wt : 0;
    let t = env.temp * 0.8 + 0.1 - Math.min(0.3, depth * 0.0032);
    const c = w.chem[blockIdx(x, y)]; if (c > 0) t += c * 0.55;
    return t;
  }
  if (m === AIR) {
    const sy = w.surfaceY[Math.max(0, Math.min(W - 1, x | 0))];
    const alt = w.def.noFloor ? (H - y) * 0.7 : Math.max(0, sy - y);
    return env.temp - alt * 0.0016;
  }
  return env.temp * 0.7 + 0.15; // underground is moderated
}

// ------------------------------------------------------------------ spawning & death
export interface SpawnOpts { energyFrac?: number; age?: number; parent?: number; gen?: number; grown?: boolean; }

export function spawn(w: World, ctx: Ctx, species: number, g: ArrayLike<number>, go: number, x: number, y: number, o: SpawnOpts = {}): number {
  w.allocEntities();
  const e = w.ents;
  if (e.alive >= ENT_CAP - 8) return -1;
  const i = e.alloc(); if (i < 0) return -1;
  const gi = i * NG;
  for (let k = 0; k < NG; k++) e.genome[gi + k] = g[go + k];
  const t = traitsOf(e.genome, gi, scratch);
  e.kind[i] = t.kind; e.species[i] = species;
  e.maxSize[i] = t.size; e.maxE[i] = t.maxE; e.bmr[i] = t.bmr; e.spSwim[i] = t.spSwim; e.spWalk[i] = t.spWalk; e.spFly[i] = t.spFly;
  e.sense[i] = t.sense; e.atk[i] = t.atk; e.def[i] = t.def; e.life[i] = t.life; e.mature[i] = t.life * 0.1;
  e.carn[i] = e.genome[gi + G.CARN]; e.herb[i] = e.genome[gi + G.HERB]; e.scav[i] = e.genome[gi + G.SCAV]; e.filt[i] = e.genome[gi + G.FILTER]; e.camo[i] = e.genome[gi + G.CAMO];
  e.age[i] = o.age ?? (o.grown ? e.mature[i] : 0);
  const grow = Math.min(1, e.age[i] / e.mature[i]);
  e.size[i] = t.size * (0.32 + 0.68 * grow);
  e.energy[i] = t.maxE * (o.energyFrac ?? 0.5); e.health[i] = 1; e.breath[i] = 1; e.stress[i] = 0; e.hurt[i] = 0; e.cd[i] = (w.rng.next() * 10) | 0; e.rcd[i] = (w.rng.next() * 60) | 0;
  e.vx[i] = 0; e.vy[i] = 0; e.facing[i] = w.rng.next() < 0.5 ? -1 : 1; e.state[i] = S_WANDER; e.anim[i] = w.rng.next() * 4;
  e.parent[i] = o.parent ?? 0; e.gen[i] = o.gen ?? 0;
  const a = w.rng.next() * 6.283; e.dx[i] = Math.cos(a); e.dy[i] = Math.sin(a) * 0.5;
  // sessile producers root themselves in the ground
  if (e.kind[i] === K_PRODUCER && isSessile(e, i) && t.size >= 0.6) {
    const gy = groundBelow(w, x, y - 3);
    if (gy < 0) { e.kind[i] = K_FREE; e.alive--; (e as any).free.push(i); return -1; }
    e.y[i] = gy - e.size[i] * 0.5; e.flags[i] |= 2; // flag 2 = anchored
  } else e.y[i] = y;
  e.x[i] = x; e.memX[i] = x; e.memY[i] = e.y[i];
  ctx.sp.add(species, 1, w.tick);
  return i;
}

/** how many same-species neighbours (within 6 cells) a habitat of this kind can hold */
function animalCap(e: World['ents'], i: number): number {
  const size = e.size[i];
  const walker = e.spWalk[i] > e.spSwim[i] && e.spFly[i] === 0 && e.maxSize[i] >= 0.5;
  return walker ? 12 / (size * 1.2 + 1) : 3 + 30 / (size + 0.6);
}

function isSessile(e: World['ents'], i: number) { return e.spSwim[i] < 0.5 && e.spWalk[i] < 0.3 && e.spFly[i] === 0; }

function pushEvent(ctx: Ctx, ev: any) { if (ctx.events.length < MAX_EVENTS) ctx.events.push(ev); }

/** Kill entity i. Larger animals leave a carcass (converted in place so (slot,uid) handles stay valid). */
export function die(w: World, ctx: Ctx, i: number, cause: string, killer = -1) {
  const e = w.ents;
  const k = e.kind[i]; if (k === K_FREE || k === K_CARCASS) return;
  ctx.sp.add(e.species[i], -1, w.tick);
  const size = e.size[i];
  pushEvent(ctx, { t: 'death', x: e.x[i], y: e.y[i], size, sp: e.species[i], cause, kind: k });
  if (k === K_ANIMAL && size >= 0.45 && cause !== 'lava' && cause !== 'fell') {
    // body value is mostly stored energy, so juveniles that grew 'for free' aren't an energy source
    const body = (2.5 * size * size + 0.8 * Math.max(0, e.energy[i])) * (0.6 + 0.4 * e.health[i]);
    e.kind[i] = K_CARCASS; e.energy[i] = body; e.maxE[i] = body; e.age[i] = 0; e.cd[i] = 0; e.state[i] = 0; e.vx[i] = 0; e.hurt[i] = 0; e.flags[i] &= ~1;
    e.thr[i] = -1; e.target[i] = -1;
    return;
  }
  addNut(w, e.x[i], e.y[i], (e.energy[i] + 2.5 * size * size) * 0.02);
  e.release(i);
  void killer;
}

// ------------------------------------------------------------------ main step
export function stepWorld(w: World, ctx: Ctx) {
  w.tick++;
  if (!w.ents) return;
  const e = w.ents;
  w.hash.rebuild(e);
  if (w.tick % 8 === 0) updateFields(w);
  const n = e.hi;
  for (let i = 0; i < n; i++) {
    switch (e.kind[i]) {
      case K_PRODUCER: stepProducer(w, ctx, i); break;
      case K_ANIMAL: stepAnimal(w, ctx, i); break;
      case K_CARCASS: stepCarcass(w, ctx, i); break;
    }
  }
}

function updateFields(w: World) {
  const nut = w.nutrients, env = w.env;
  const inflow = env.nutrients * 0.0025;
  for (let b = 0; b < nut.length; b++) nut[b] += inflow * w.nutFactor[b];
  // diffusion (conserving) toward neighbours
  const tmp = w.nutTmp ?? (w.nutTmp = new Float32Array(nut.length));
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const b = y * CW + x, v = nut[b];
    let s = 0, c = 0;
    if (x > 0) { s += nut[b - 1]; c++; } if (x < CW - 1) { s += nut[b + 1]; c++; } if (y > 0) { s += nut[b - CW]; c++; } if (y < CH - 1) { s += nut[b + CW]; c++; }
    tmp[b] = v + (s / c - v) * 0.12;
  }
  for (let b = 0; b < nut.length; b++) nut[b] = Math.min(4, tmp[b]);
  if (w.dust > 0) { w.dust = Math.max(0, w.dust - 0.0004); if (w.tick % 40 === 0) { w.recomputeLight(); w.terrainVersion++; } }
}

// ------------------------------------------------------------------ stress / environment fit
function computeStress(w: World, i: number, m: number): number {
  const e = w.ents, env = w.env, g = e.genome, o = i * NG;
  const x = e.x[i], y = e.y[i];
  const inWater = IS_WATER[m] === 1, inAir = m === AIR;
  const T = localTemp(w, x, y, m);
  const tol = 0.07 + 0.35 * g[o + G.TEMP_TOL];
  const dT = Math.abs(T - g[o + G.TEMP_OPT]) * (1 - 0.65 * g[o + G.ENDOTHERM]);
  let s = Math.max(0, dT - tol) / 0.22;
  let depthN = 0;
  if (inWater) {
    const wt = w.waterTop[Math.max(0, Math.min(W - 1, x | 0))]; depthN = Math.max(0, (y - wt) / (H * 0.8));
    s += Math.max(0, Math.abs(env.salinity - g[o + G.SAL_OPT]) - (0.04 + 0.4 * g[o + G.SAL_TOL])) / 0.25;
    s += Math.max(0, depthN - (0.2 + 0.9 * g[o + G.PRESS_TOL])) / 0.3;
  } else {
    const dry = Math.max(0, g[o + G.HUMID_OPT] - env.humidity - 0.1) * (1.8 - 1.6 * g[o + G.CUTICLE]);
    s += (inAir ? dry : dry * 0.4) * 1.3;
  }
  let tox = env.toxicity; const c = w.chem[blockIdx(x, y)]; if (c > 0.05) tox += c * 0.5 * (1 - g[o + G.CHEMO]);
  s += Math.max(0, tox - 0.6 * g[o + G.TOXIN_RES] - 0.06) / 0.35;
  const o2 = (inWater ? env.oxygen * (1 - 0.35 * depthN) : inAir ? env.oxygen : env.oxygen * 0.5);
  s += Math.max(0, g[o + G.O2_NEED] - o2) / 0.35;
  return s;
}

// ------------------------------------------------------------------ producers
function stepProducer(w: World, ctx: Ctx, i: number) {
  const e = w.ents, tick = w.tick, g = e.genome, o = i * NG;
  e.age[i]++;
  const m = cellM(w, e.x[i], e.y[i]);
  if (m === LAVA) { die(w, ctx, i, 'lava'); return; }
  const grow = Math.min(1, e.age[i] / e.mature[i]);
  if (((i + tick) & 3) === 0) {
    e.stress[i] = computeStress(w, i, m);
    // habitat mismatch for plants: drowning in air-only species, wilting out of water
    const inWater = IS_WATER[m] === 1;
    if (inWater) e.stress[i] += Math.max(0, 0.45 - g[o + G.GILLS]) * 1.6; else if (m === AIR) e.stress[i] += Math.max(0, 0.45 - g[o + G.CUTICLE] - g[o + G.LUNGS] * 0.4) * 1.6;
  }
  const st = e.stress[i];
  // crowding (competition for space & light), sampled every 8 ticks
  if (((i + tick) & 7) === 0) {
    const r = 3 + e.maxSize[i] * 2; const h = w.hash; let c = 0;
    const x = e.x[i], y = e.y[i];
    const cx0 = Math.max(0, ((x - r) / BLOCK) | 0), cx1 = Math.min(h.gw - 1, ((x + r) / BLOCK) | 0), cy0 = Math.max(0, ((y - r) / BLOCK) | 0), cy1 = Math.min(h.gh - 1, ((y + r) / BLOCK) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (let j = h.head[cy * h.gw + cx]; j >= 0; j = h.next[j]) {
      if (j !== i && e.kind[j] === K_PRODUCER) { const dx = e.x[j] - x, dy = e.y[j] - y; if (dx * dx + dy * dy < r * r) c += 1 + e.size[j] * 0.4; }
    }
    e.crowd[i] = c;
  }
  // space/light competition: carrying density falls with body size
  const rr = 3 + e.maxSize[i] * 2;
  // rooted plants share a 1-D strip of ground; floating ones share 2-D water
  const cap = (e.flags[i] & 2) ? 2 * rr / (0.7 * e.maxSize[i] + 0.5) * 0.9 : 0.15 / Math.pow(1 + e.maxSize[i], 1.6) * Math.PI * rr * rr;
  const crowdF = 1 - 0.45 * Math.min(1, e.crowd[i] / cap); // crowding mostly limits seeding, only mildly slows growth
  const cell = Math.max(0, Math.min(H - 1, e.y[i] | 0)) * W + Math.max(0, Math.min(W - 1, e.x[i] | 0));
  const L = w.light[cell] / 255;
  const b = blockIdx(e.x[i], e.y[i]);
  const N = w.nutrients[b]; const Nf = N / (N + 0.12);
  const sz = e.size[i];
  const sg = Math.pow(sz, 0.6) * (0.35 + 0.65 * grow);
  let gain = 0;
  const photo = g[o + G.PHOTO], chemo = g[o + G.CHEMO];
  if (photo > 0.2) gain += photo * L * (0.3 + 0.7 * Nf) * 0.02;
  if (chemo > 0.2) gain += chemo * Math.min(1.2, w.chem[b] * 1.4) * (0.3 + 0.7 * Nf) * 0.02;
  gain *= sg * crowdF * Math.max(0.1, 1 - st * 0.5);
  if (gain > 0) { const toSeed = grow >= 1 ? gain * 0.4 : 0; e.seed[i] += toSeed; e.energy[i] += gain - toSeed; w.nutrients[b] = Math.max(0, N - gain * 0.12); }
  e.energy[i] -= e.bmr[i] * 0.5 * (0.6 + 0.4 * grow) * (1 + st * 0.8);
  // size follows maturity and reserves (grazed plants look smaller)
  const ef = clamp(e.energy[i] / e.maxE[i], 0, 1);
  e.size[i] = e.maxSize[i] * (0.32 + 0.68 * grow) * (0.7 + 0.3 * ef);
  if (e.flags[i] & 2) { const gy = groundBelow(w, e.x[i], e.y[i] - 2); if (gy >= 0) e.y[i] = gy - e.size[i] * 0.5; }
  // mobile producers (plankton / algae) drift and chase light
  if (!(e.flags[i] & 2)) moveProducer(w, i, m);
  // health
  if (st > 0.25) e.health[i] -= (st - 0.25) * 0.0035;
  else if (e.health[i] < 1) e.health[i] = Math.min(1, e.health[i] + 0.001);
  if (e.energy[i] <= 0) e.health[i] -= 0.012;
  if (e.age[i] > e.life[i]) e.health[i] -= 0.008;
  if (e.hurt[i] > 0) e.hurt[i]--;
  if (e.health[i] <= 0) { die(w, ctx, i, e.energy[i] <= 0 ? 'starved' : e.age[i] > e.life[i] ? 'age' : 'stress'); return; }
  // seeding
  if (e.rcd[i] > 0) e.rcd[i]--;
  else if (grow >= 1 && e.seed[i] > e.maxE[i] * (0.1 + 0.1 * g[o + G.REPRO_STRAT]) * 1.3 && st < 0.5 && e.crowd[i] < cap * 1.3) reproduce(w, ctx, i);
}

function moveProducer(w: World, i: number, m: number) {
  const e = w.ents, rng = w.rng;
  // random drift + slow phototaxis (swim up to light)
  if ((w.tick + i) % 30 === 0) { const a = rng.next() * 6.283; e.dx[i] = Math.cos(a); e.dy[i] = Math.sin(a) * 0.6 - (IS_WATER[m] ? 0.25 : 0); }
  const sp = (IS_WATER[m] ? e.spSwim[i] : m === AIR ? 0.4 : IS_PORE[m] ? e.spSwim[i] * 0.4 : 0.1) * 0.5 + 0.05;
  e.vx[i] += (e.dx[i] * sp - e.vx[i]) * 0.08; e.vy[i] += (e.dy[i] * sp - e.vy[i]) * 0.08;
  if (m === AIR) e.vy[i] += 0.5 * DT; // spores sink slowly
  const nx = e.x[i] + e.vx[i] * DT, ny = e.y[i] + e.vy[i] * DT;
  const pore = e.maxSize[i] < 0.5;
  if (nx < 0.5 || nx > W - 0.5 || blocked(w, nx, e.y[i], pore)) { e.vx[i] = -e.vx[i]; e.dx[i] = -e.dx[i]; } else e.x[i] = nx;
  if (ny < 0.2 || blocked(w, e.x[i], ny, pore) || (IS_WATER[m] && cellM(w, e.x[i], ny) === AIR)) { e.vy[i] = -e.vy[i]; e.dy[i] = -e.dy[i]; } else e.y[i] = ny;
  if (e.y[i] > H - 0.5) { e.y[i] = H - 0.5; e.vy[i] = 0; }
}

// ------------------------------------------------------------------ reproduction
function reproduce(w: World, ctx: Ctx, i: number) {
  const e = w.ents, g = e.genome, o = i * NG, rng = w.rng;
  const strat = g[o + G.REPRO_STRAT];
  let litter = Math.max(1, Math.round((2.6 - 1.8 * strat) * (0.4 + g[o + G.REPRO_RATE] * 0.8)));
  if (e.kind[i] === K_ANIMAL) litter = Math.min(litter, 2);
  if (e.kind[i] === K_PRODUCER && e.maxSize[i] < 0.6) litter = Math.max(1, litter - 1);
  const childFrac = 0.32 + 0.3 * strat;
  const prod = e.kind[i] === K_PRODUCER;
  const childE = prod ? e.maxE[i] * (0.1 + 0.1 * strat) : e.maxE[i] * 0.9 * childFrac; // rough: child maxE ~ parent's
  const mutRate = 1 + w.env.toxicity * 7;
  // never spend the parent into starvation: shrink the litter to what it can afford
  if (!prod) { const afford = Math.floor((e.energy[i] - e.maxE[i] * 0.25) / (childE * 1.2)); litter = Math.min(litter, afford); if (litter < 1) { e.rcd[i] = 40; return; } }
  // look for a mate of the same species within a few cells (sexual mixing)
  let mate = -1;
  if (e.kind[i] === K_ANIMAL || e.maxSize[i] >= 0.6) {
    const h = w.hash, x = e.x[i], y = e.y[i], r = 4;
    outer: for (let cy = Math.max(0, ((y - r) / BLOCK) | 0); cy <= Math.min(h.gh - 1, ((y + r) / BLOCK) | 0); cy++) for (let cx = Math.max(0, ((x - r) / BLOCK) | 0); cx <= Math.min(h.gw - 1, ((x + r) / BLOCK) | 0); cx++)
      for (let j = h.head[cy * h.gw + cx]; j >= 0; j = h.next[j]) if (j !== i && e.species[j] === e.species[i] && e.kind[j] === e.kind[i] && e.age[j] >= e.mature[j]) { mate = j; break outer; }
  }
  const child = new Float32Array(NG);
  let made = 0;
  for (let n = 0; n < litter; n++) {
    if (mate >= 0 && rng.next() < 0.7) { const tmp = new Float32Array(NG); crossover(tmp, 0, g, o, g, mate * NG, rng); mutate(child, 0, tmp, 0, rng, mutRate); }
    else mutate(child, 0, g, o, rng, mutRate);
    const sp = ctx.sp.classify(e.species[i], child, 0, w.tick);
    if (e.flags[i] & 2) { // rooted plants must stay in the same kind of habitat (no grass on the pond bed)
      const px = e.x[i] + (rng.next() - 0.5) * 2 * (2 + e.size[i] * 2.5);
      const gy = groundBelow(w, px, e.y[i] - 3);
      if (gy < 1 || IS_WATER[cellM(w, px, gy - 1)] !== IS_WATER[cellM(w, e.x[i], e.y[i])]) continue;
      const c2 = spawn(w, ctx, sp, child, 0, Math.max(1, Math.min(W - 1, px)), gy - 1, { energyFrac: 0, parent: e.uid[i], gen: e.gen[i] + 1 });
      if (c2 < 0) break;
      e.energy[c2] = childE; made++; e.seed[i] -= childE * 1.2; continue;
    }
    const ang = rng.next() * 6.283, d = e.kind[i] === K_PRODUCER ? 1.2 + rng.next() * (2 + e.size[i] * 2.5) : e.size[i] * 0.6;
    let cx = e.x[i] + Math.cos(ang) * d, cy = e.y[i] + Math.sin(ang) * d * (e.kind[i] === K_PRODUCER ? 0.5 : 0.7);
    cx = Math.max(1, Math.min(W - 1, cx)); cy = Math.max(0.5, Math.min(H - 0.5, cy));
    const pore = traitsOf(child, 0, scratch).size < 0.5;
    if (blocked(w, cx, cy, pore) && !(e.flags[i] & 2)) { cx = e.x[i]; cy = e.y[i]; }
    // keep newborns in their parent's medium (no plankton in the air, no fish on the shore)
    else if (IS_WATER[cellM(w, e.x[i], e.y[i])] !== IS_WATER[cellM(w, cx, cy)] && !(e.flags[i] & 2)) { cx = e.x[i]; cy = e.y[i]; }
    const c = spawn(w, ctx, sp, child, 0, cx, cy, { energyFrac: 0, parent: e.uid[i], gen: e.gen[i] + 1 });
    if (c < 0) break;
    e.energy[c] = childE; made++;
    if (prod) e.seed[i] -= childE * 1.2; else e.energy[i] -= childE * 1.2;
  }
  e.rcd[i] = (e.kind[i] === K_PRODUCER ? 30 : 200) + (e.mature[i] * 0.8) | 0;
  if (!made) e.rcd[i] = 60;
}

// ------------------------------------------------------------------ carcasses
function stepCarcass(w: World, ctx: Ctx, i: number) {
  const e = w.ents, env = w.env;
  e.age[i]++;
  const m = cellM(w, e.x[i], e.y[i]);
  // fall / sink until resting on the ground
  const size = e.size[i], hb = Math.min(size * 0.2, 1.4);
  if (m === LAVA) { e.release(i); return; }
  const sinkV = IS_WATER[m] ? 0.9 : m === AIR ? Math.min(25, e.vy[i] + 14 * DT * 2 * env.gravity) : 0;
  if (!blocked(w, e.x[i], e.y[i] + hb + 0.2, false)) { e.vy[i] = IS_WATER[m] ? sinkV : sinkV; e.y[i] += e.vy[i] * DT; if (e.y[i] > H - 1 && w.def.noFloor) { e.release(i); return; } }
  else { e.vy[i] = 0; const gy = groundBelow(w, e.x[i], e.y[i]); if (gy >= 0 && e.y[i] + hb > gy) e.y[i] = gy - hb; }
  if (e.state[i] === 0) {
    const rate = 0.0011 * (0.4 + env.temp * 1.6) * (IS_WATER[m] ? 0.8 : 1);
    const lost = e.energy[i] * rate; e.energy[i] -= lost; addNut(w, e.x[i], e.y[i], lost * 0.025);
    if (e.energy[i] < e.maxE[i] * 0.07 || e.energy[i] < 0.3) { e.state[i] = 1; e.energy[i] = 0; } // bones
  } else if (e.age[i] > 5200) e.release(i);
}

// ------------------------------------------------------------------ animals
let _grounded = false;

function stepAnimal(w: World, ctx: Ctx, i: number) {
  const e = w.ents, tick = w.tick, g = e.genome, o = i * NG, rng = w.rng;
  e.age[i]++;
  const m = cellM(w, e.x[i], e.y[i]);
  if (m === LAVA) { die(w, ctx, i, 'lava'); return; }
  const inWater = IS_WATER[m] === 1;
  const size = e.size[i], grow = Math.min(1, e.age[i] / e.mature[i]);
  e.size[i] = e.maxSize[i] * (0.32 + 0.68 * grow);

  if (((i + tick) & 3) === 0) { e.stress[i] = computeStress(w, i, m); perceive(w, ctx, i, m); }
  if (e.cd[i] > 0) e.cd[i]--;
  const st = e.stress[i];

  // ---- breathing
  const tiny = size < 0.45;
  if (!tiny) {
    if (inWater) { const gills = g[o + G.GILLS]; if (gills < 0.5) { e.breath[i] -= (0.5 - gills) * 2 * 0.004 / (1 + size * 0.08); } else e.breath[i] = Math.min(1, e.breath[i] + 0.03); }
    else if (m === AIR) { const air = Math.max(g[o + G.LUNGS], size < 1.6 ? g[o + G.CUTICLE] * 0.8 : 0); if (air < 0.5) e.breath[i] -= (0.5 - air) * 2 * 0.009; else e.breath[i] = Math.min(1, e.breath[i] + 0.03); }
    if (e.breath[i] <= 0) { e.breath[i] = 0; e.health[i] -= 0.02; }
  }

  // ---- behaviour -> desired heading
  const behavior = chooseBehavior(w, i, m);
  const urgency = behavior;

  // ---- locomotion & physics
  const speed = locomote(w, i, m, urgency);

  // ---- energy
  const grow15 = grow * Math.sqrt(grow) * 0.68 + 0.32;
  const cap = speedCap(e.size[i]);
  let cost = e.bmr[i] * grow15 * (1 + 1.4 * speed / cap) * (1 + st * 0.8);
  if (_grounded === false && m === AIR && e.spFly[i] > 0) cost *= 1.5; // flapping
  e.energy[i] -= cost;

  // ---- feeding / fighting
  if (e.cd[i] <= 0) interact(w, ctx, i);

  // ---- health
  if (st > 0.25) e.health[i] -= (st - 0.25) * 0.0035;
  else if (e.health[i] < 1 && e.energy[i] > e.maxE[i] * 0.4) e.health[i] = Math.min(1, e.health[i] + 0.0012);
  if (e.energy[i] <= 0) { e.energy[i] = 0; e.health[i] -= 0.012; }
  if (e.age[i] > e.life[i]) e.health[i] -= 0.006;
  if (e.flags[i] & 1) { e.health[i] -= 0.0012; if (((i + tick) & 7) === 0 && rng.next() < 0.1 + 0.15 * g[o + G.INTEL]) e.flags[i] &= ~1; }
  if (e.hurt[i] > 0) e.hurt[i]--;
  if (e.health[i] <= 0) { const cause = e.breath[i] <= 0 ? (inWater ? 'drowned' : 'suffocated') : e.energy[i] <= 0 ? 'starved' : e.age[i] > e.life[i] ? 'age' : e.flags[i] & 1 ? 'disease' : st > 0.25 ? 'stress' : 'injury'; die(w, ctx, i, cause); return; }

  // ---- anim
  e.anim[i] += 0.1 + speed * 0.12; if (e.anim[i] >= 4) e.anim[i] -= 4;

  // ---- reproduction
  if (e.rcd[i] > 0) e.rcd[i]--;
  else if (e.age[i] >= e.mature[i] && e.energy[i] > e.maxE[i] * (0.5 + 0.3 * g[o + G.REPRO_STRAT]) && st < 0.4 && e.crowd[i] < animalCap(e, i) && e.foodN[i] >= (e.maxSize[i] < 1 ? 3 : 1) && e.health[i] > 0.6 && w.ents.alive < ENT_CAP * 0.92) reproduce(w, ctx, i);
}

// -------------------------------------------------- perception
function perceive(w: World, ctx: Ctx, i: number, m: number) {
  const e = w.ents, h = w.hash, rng = w.rng;
  const r = Math.min(e.sense[i], 24), r2 = r * r;
  const x = e.x[i], y = e.y[i], sp = e.species[i], size = e.size[i];
  const carn = e.carn[i], herb = e.herb[i], scav = e.scav[i], filt = e.filt[i];
  const swimmer = e.spSwim[i] >= 0.45 * speedCap(size) * 0.7, flier = e.spFly[i] > 0, pore = e.maxSize[i] < 0.5;
  const pred = carn > 0.25, parasite = e.genome[i * NG + G.PARASITE] > 0.4;
  let bestD = 1e9, best = -1, thrD = 1e9, thr = -1;
  let same = 0, near = 0, cohX = 0, cohY = 0, sepX = 0, sepY = 0, fx = 0, fy = 0, nfood = 0;
  const sizeLo = size * 0.04, sizeHi = size * (1.2 + 0.7 * carn);
  const cx0 = Math.max(0, ((x - r) / BLOCK) | 0), cx1 = Math.min(h.gw - 1, ((x + r) / BLOCK) | 0), cy0 = Math.max(0, ((y - r) / BLOCK) | 0), cy1 = Math.min(h.gh - 1, ((y + r) / BLOCK) | 0);
  const soc = e.genome[i * NG + G.SOCIAL];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (let j = h.head[cy * h.gw + cx]; j >= 0; j = h.next[j]) {
    if (j === i) continue;
    const dx = e.x[j] - x, dy = e.y[j] - y, d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const kj = e.kind[j];
    if (kj === K_CARCASS) {
      if ((scav > 0.3 || carn > 0.45) && e.state[j] === 0 && e.energy[j] > 0.6) nfood += 3;
      if ((scav > 0.3 || carn > 0.45) && e.state[j] === 0 && e.energy[j] > 0.6 && d2 * 0.6 < bestD && reachable(w, e.x[j], e.y[j], swimmer, flier, pore, i)) { bestD = d2 * 0.6; best = j; }
      continue;
    }
    const sj = e.species[j], sizeJ = e.size[j];
    if (kj === K_PRODUCER) {
      if (e.energy[j] < e.maxE[j] * 0.2) continue;
      if ((herb > 0.3 && sizeJ <= size * 10) || (filt > 0.3 && sizeJ <= size * 0.3)) { const wgt = 1 / (1 + d2); fx += dx * wgt; fy += dy * wgt; nfood++; }
      if (((herb > 0.3 && sizeJ <= size * 10) || (filt > 0.3 && sizeJ <= size * 0.3)) && d2 < bestD && e.camo[j] * 0.5 < rng.next() && reachable(w, e.x[j], e.y[j], swimmer, flier, pore, i)) { bestD = d2; best = j; }
      continue;
    }
    // animal
    if (sj === sp) {
      same++; cohX += dx; cohY += dy; if (d2 < 36) near++;
      const rr = size * 1.6 + 0.6; if (d2 < rr * rr && d2 > 0.0001) { const inv = 1 / d2; sepX -= dx * inv; sepY -= dy * inv; }
      if ((e.flags[j] & 1) && d2 < 2.5 && rng.next() < 0.04) e.flags[i] |= 1;
      continue;
    }
    // prey?
    if (pred && sizeJ >= sizeLo && sizeJ <= sizeHi) nfood++;
    if ((pred || parasite) && sizeJ >= sizeLo && (sizeJ <= sizeHi || parasite) && d2 < bestD && reachable(w, e.x[j], e.y[j], swimmer, flier, pore, i)) {
      if (e.camo[j] > 0.3 && d2 > r2 * 0.12 && rng.next() < e.camo[j] * 0.7) { /* hidden */ } else { bestD = d2; best = j; }
    }
    // threat? a carnivore that could eat me
    if (e.carn[j] > 0.3 && size <= sizeJ * (1.2 + 0.7 * e.carn[j]) && size >= sizeJ * 0.04 && d2 < thrD) { thrD = d2; thr = j; }
  }
  // targets
  dbg.perceive++; if (best >= 0) dbg.targets++;
  if (best >= 0) { e.target[i] = best; e.targetUid[i] = e.uid[best]; } else if (!(e.target[i] >= 0 && e.valid(e.target[i], e.targetUid[i]))) e.target[i] = -1;
  if (thr >= 0) { e.thr[i] = thr; e.thrUid[i] = e.uid[thr]; } else e.thr[i] = -1;
  e.fx[i] = fx; e.fy[i] = fy; e.foodN[i] = nfood;
  // herd steering vector
  if (same > 0 && soc > 0.25) { e.gx[i] = (cohX / same) * 0.15 * soc + sepX * 1.6; e.gy[i] = (cohY / same) * 0.15 * soc + sepY * 1.6; } else { e.gx[i] = sepX * 1.2; e.gy[i] = sepY * 1.2; }
  // density-dependent disease
  e.crowd[i] = near;
  const capN = animalCap(e, i);
  if (near > capN * (1.5 + soc * 0.8) && !(e.flags[i] & 1) && rng.next() < 0.004 * (near - capN)) e.flags[i] |= 1;
  void m;
}

/** Can a creature with these abilities physically get to this spot? */
function reachable(w: World, x: number, y: number, swimmer: boolean, flier: boolean, pore: boolean, i: number): boolean {
  const m = cellM(w, x, y);
  if (IS_WATER[m]) return swimmer || pore || w.ents.spWalk[i] > 0.5;
  if (m === AIR) return flier || !swimmer || w.ents.spWalk[i] > 0.5;
  if (IS_PORE[m]) return pore || w.ents.genome[i * NG + G.BURROW] > 0.3;
  return false;
}

// -------------------------------------------------- behaviour
/** Sets e.dx/e.dy (unit-ish heading), e.state. Returns urgency multiplier on max speed. */
function chooseBehavior(w: World, i: number, m: number): number {
  const e = w.ents, rng = w.rng, g = e.genome, o = i * NG;
  const x = e.x[i], y = e.y[i], size = e.size[i];
  const hunger = e.energy[i] / e.maxE[i];
  let urgency = 0.55, state = S_WANDER;
  let tx = 0, ty = 0, have = false;
  // threat
  const thr = e.thr[i];
  if (thr >= 0 && e.valid(thr, e.thrUid[i])) {
    const dx = x - e.x[thr], dy = y - e.y[thr], d = Math.hypot(dx, dy) || 1;
    if (d < e.sense[i] * 0.6) { tx = dx / d + (rng.next() - 0.5) * 0.5; ty = dy / d + (rng.next() - 0.5) * 0.5; have = true; state = S_FLEE; urgency = 1.5 + 0.2 * g[o + G.INTEL]; }
  } else if (thr >= 0) e.thr[i] = -1;
  if (!have) {
    const t = e.target[i];
    if (t >= 0 && e.valid(t, e.targetUid[i])) {
      const hungry = e.kind[t] === K_CARCASS ? hunger < 0.9 : e.carn[i] > 0.25 ? hunger < 0.78 : hunger < 0.92;
      if (hungry) {
        let px = e.x[t], py = e.y[t];
        if (e.kind[t] === K_ANIMAL) { const lead = (g[o + G.INTEL] * 6 + 2); px += e.vx[t] * DT * lead; py += e.vy[t] * DT * lead; } // clever hunters lead their target
        const dx = px - x, dy = py - y, d = Math.hypot(dx, dy) || 1;
        tx = dx / d; ty = dy / d; have = true; state = e.kind[t] === K_ANIMAL ? S_HUNT : S_FORAGE;
        urgency = e.kind[t] === K_ANIMAL ? 1.5 : 0.9;
        if (d < 1.2 + size) urgency = 0.3 + 0.4 * (d / (1.2 + size)); // slow down for the bite
      }
    } else if (t >= 0) e.target[i] = -1;
  }
  if (!have) {
    // wander with persistence, herd steering, habitat preferences
    // hungry animals travel in long straight runs to find food; fed ones potter about
    const starving = hunger < 0.6;
    if ((w.tick + i) % (starving ? 150 : 60) === 0 && rng.next() < 0.75) { const a = rng.next() * 6.283; e.dx[i] = Math.cos(a); e.dy[i] = Math.sin(a) * 0.55; }
    tx = e.dx[i] + e.gx[i]; ty = e.dy[i] + e.gy[i];
    if (starving) urgency = 0.95;
    const fl = Math.hypot(e.fx[i], e.fy[i]); if (fl > 0.001) { tx += (e.fx[i] / fl) * 0.7; ty += (e.fy[i] / fl) * 0.7; }
    if (hunger > 0.93) { urgency = 0.25; state = S_REST; }
    // depth / altitude preference, pulled toward wherever food was last found
    const inWater = IS_WATER[m] === 1;
    if (hunger > 0.3 && (e.herb[i] > 0.3 || e.filt[i] > 0.3)) {
      tx += clamp((e.memX[i] - x) * 0.03, -0.45, 0.45);
      if (inWater || m === AIR && e.spFly[i] > 0) ty += clamp((e.memY[i] - y) * 0.08, -0.7, 0.7);
    } else if (inWater && e.spSwim[i] > e.spWalk[i]) {
      const wt = w.waterTop[Math.max(0, Math.min(W - 1, x | 0))], fl = groundBelow(w, x, y);
      if (wt >= 0 && fl > wt) { const want = wt + g[o + G.DEPTH_PREF] * (fl - wt - 2); ty += clamp((want - y) * 0.06, -0.6, 0.6); }
    } else if (m === AIR && e.spFly[i] > 0 && state !== S_REST) {
      const gy = groundBelow(w, x, y); const sy = gy >= 0 ? gy : H; const want = sy - (4 + size * 2 + g[o + G.DEPTH_PREF] * 22);
      ty += clamp((want - y) * 0.05, -0.7, 0.7);
    } else if (m === AIR && e.spFly[i] > 0 && state === S_REST) ty += 0.5;
  }
  // habitat lookahead: avoid stepping into hostile medium / lava / walls
  // habitat lookahead: steer around lava, water (for non-swimmers) and, when idle, out-of-water (for fish)
  let look = 3;
  if (state === S_FORAGE || state === S_HUNT) { const tt = e.target[i]; if (tt >= 0) look = Math.min(3, Math.hypot(e.x[tt] - x, e.y[tt] - y)); }
  const aquatic = e.spSwim[i] > e.spWalk[i] && e.spFly[i] === 0;
  const nonSwimmer = !aquatic && e.spSwim[i] < speedCap(size) * 0.35 && e.spFly[i] === 0;
  const idle = state === S_WANDER || state === S_REST;
  const hazard = (hx: number, hy: number) => {
    const lm = cellM(w, x + hx * look, y + hy * look);
    if (lm === LAVA) return true;
    if (nonSwimmer && IS_WATER[lm] && !IS_WATER[m]) return true;
    if (aquatic && idle && !IS_WATER[lm] && !IS_PORE[lm]) return true;
    return false;
  };
  if (hazard(tx, ty)) {
    if (!hazard(-ty, tx)) { const a = tx; tx = -ty; ty = a; }
    else if (!hazard(ty, -tx)) { const a = tx; tx = ty; ty = -a; }
    else { tx = -tx; ty = -ty; }
    e.dx[i] = tx; e.dy[i] = ty;
  }
  // dive a little away from the surface/air for swimmers heading up
  const len = Math.hypot(tx, ty);
  if (len > 0.001) { e.dx[i] = e.dx[i] * 0.6 + (tx / len) * 0.4; e.dy[i] = e.dy[i] * 0.6 + (ty / len) * 0.4; if (state !== S_WANDER && state !== S_REST) { e.dx[i] = tx / len; e.dy[i] = ty / len; } }
  e.state[i] = state;
  return urgency;
}

// -------------------------------------------------- locomotion & physics
function locomote(w: World, i: number, m: number, urgency: number): number {
  const e = w.ents, env = w.env;
  const size = e.size[i], hb = Math.min(size * 0.22, 1.6), cap = speedCap(size);
  const g = e.genome, o = i * NG;
  const pore = e.maxSize[i] < 0.5;
  let x = e.x[i], y = e.y[i], vx = e.vx[i], vy = e.vy[i];
  const dx = e.dx[i], dy = e.dy[i];
  const inWater = IS_WATER[m] === 1, inPore = IS_PORE[m] === 1 && IS_SOLID[m] === 1;
  const gscale = env.gravity * 2;
  const onGround = blocked(w, x, y + hb + 0.2, pore) || (y + hb >= H - 0.2 && !w.def.noFloor);
  _grounded = onGround;
  let sp = 0, accel = 0.2, flying = false;
  const wasFlying = e.spFly[i] > 0;
  const resting = e.state[i] === S_REST;
  if (inWater) {
    sp = Math.max(e.spSwim[i], onGround ? e.spWalk[i] * 0.6 : 0);
    accel = 0.12;
    const dens = 1 + 0.22 * (1 - g[o + G.SWIM]) * (1 - g[o + G.SWIM]) + 0.12 * (g[o + G.SHELL] + g[o + G.ARMOR]) - 0.1 * g[o + G.FINS];
    vy += (dens - 1) * 5 * DT * gscale;
    vx *= 0.985; vy *= 0.985;
  } else if (inPore) {
    sp = Math.max(g[o + G.BURROW] * cap * 0.45, pore ? cap * 0.4 : 0); accel = 0.15; vx *= 0.9; vy *= 0.9;
  } else if (m === AIR) {
    if (wasFlying && e.energy[i] > e.maxE[i] * 0.05 && !(resting && onGround)) {
      flying = true; sp = e.spFly[i]; accel = 0.1; vy *= 0.97; vx *= 0.985;
    } else if (onGround) {
      sp = Math.max(e.spWalk[i], e.spSwim[i] * 0.18, wasFlying ? e.spFly[i] * 0.25 : 0); accel = 0.35;
    } else {
      // free fall (gliders slow the descent)
      const vt = Math.min(60, 1.5 + 6 * Math.pow(size, 0.9)) * (1 - 0.8 * g[o + G.GLIDE]);
      vy = Math.min(vt, vy + 14 * gscale * DT);
      sp = g[o + G.GLIDE] > 0.3 ? e.spFly[i] * 0.5 + cap * 0.3 : 0; accel = 0.03;
      vx *= 0.995;
    }
  }
  const desVx = dx * sp * urgency, desVy = dy * sp * urgency;
  if (m === AIR && !flying && !onGround) vx += (desVx - vx) * accel; // limited air control
  else if (onGround && m !== undefined && !inWater && !inPore) vx += (desVx - vx) * accel;
  else { vx += (desVx - vx) * accel; vy += (desVy - vy) * accel; }
  if (onGround && vy > 0 && !inWater) {
    const impact = vy; vy = 0;
    if (impact > 12 + size * 0.5) { const dmg = (impact - 12 - size * 0.5) * 0.03 / (0.4 + size * 0.08); e.health[i] -= dmg; e.hurt[i] = 6; }
  } else if (onGround && inWater && vy > 0) vy = Math.min(vy, 0.2);

  // ---- integrate with collisions
  let nx = x + vx * DT;
  const yf = y + hb * 0.6;
  if (nx < 0.5) { nx = 0.5; vx = Math.abs(vx); e.dx[i] = Math.abs(e.dx[i]); } else if (nx > W - 0.5) { nx = W - 0.5; vx = -Math.abs(vx); e.dx[i] = -Math.abs(e.dx[i]); }
  if (blocked(w, nx, yf, pore)) {
    // try to climb a small step
    const maxStep = Math.max(1.2, size * 0.55); let climbed = false;
    for (let s = 1; s <= maxStep; s += 1) if (!blocked(w, nx, yf - s, pore) && !blocked(w, nx, y - s - hb * 0.4, pore)) { y -= s; climbed = true; break; }
    if (!climbed) { nx = x; vx = 0; e.dx[i] = -e.dx[i]; if (e.state[i] === S_WANDER) e.dy[i] = (w.rng.next() - 0.5); }
  }
  let ny = y + vy * DT;
  if (vy > 0) {
    if (blocked(w, nx, ny + hb, pore)) { ny = Math.floor(ny + hb) - hb - 0.01; if (vy > 6 && !inWater && !flying) { const impact = vy; if (impact > 12 + size * 0.5) { e.health[i] -= (impact - 12 - size * 0.5) * 0.03 / (0.4 + size * 0.08); e.hurt[i] = 6; } } vy = 0; }
    else if (ny + hb >= H && !w.def.noFloor) { ny = H - hb - 0.01; vy = 0; }
  } else if (vy < 0) {
    if (blocked(w, nx, ny - hb, pore)) { ny = y; vy = 0; e.dy[i] = Math.abs(e.dy[i]); }
    else if (inWater && !flying && cellM(w, nx, ny - hb) === AIR && e.spFly[i] === 0) { ny = y; vy = 0; e.dy[i] = Math.abs(e.dy[i]) * 0.5 + 0.2; }
    else if (ny < 0.5) { ny = 0.5; vy = 0; }
  }
  if (w.def.noFloor && ny > H + 4) { e.x[i] = nx; e.y[i] = ny; e.vx[i] = vx; e.vy[i] = vy; die(w, w.ctxRef!, i, 'fell'); return 0; }
  e.x[i] = nx; e.y[i] = ny; e.vx[i] = vx; e.vy[i] = vy;
  if (vx > 0.15) e.facing[i] = 1; else if (vx < -0.15) e.facing[i] = -1;
  return Math.hypot(vx, vy);
}

// -------------------------------------------------- feeding & fighting
function interact(w: World, ctx: Ctx, i: number) {
  const e = w.ents, rng = w.rng, g = e.genome, o = i * NG;
  const t = e.target[i]; if (t < 0 || !e.valid(t, e.targetUid[i])) return;
  const size = e.size[i], kt = e.kind[t];
  const dx = e.x[t] - e.x[i], dy = e.y[t] - e.y[i];
  const reach = (size + e.size[t]) * 0.5 + 0.35 + (e.filt[i] > 0.3 ? size * 0.6 : 0);
  if (dx * dx + dy * dy > reach * reach) return;
  const maxE = e.maxE[i];
  if (kt === K_CARCASS || kt === K_PRODUCER) {
    if (e.energy[i] >= maxE * 0.98) return;
    const eff = kt === K_CARCASS ? 0.7 : 0.5 + 0.12 * g[o + G.HERB];
    const sg = size * Math.sqrt(size);
    // grazing depletes a producer's reserves but leaves a residual, so plants regrow instead of vanishing
    const floor = kt === K_PRODUCER ? e.maxE[t] * 0.12 : 0;
    const avail = e.energy[t] - floor;
    if (avail <= 0.01) { e.target[i] = -1; e.cd[i] = 4; return; }
    const bite = Math.min(avail, 0.2 * sg + 0.03);
    e.energy[i] = Math.min(maxE, e.energy[i] + bite * eff);
    e.energy[t] -= bite;
    if (kt === K_PRODUCER) e.hurt[t] = 4; else if (e.energy[t] <= 0.3) e.state[t] = 1;
    e.state[i] = S_EAT; e.cd[i] = 5 + ((size * 0.3) | 0); dbg.eat++;
    e.memX[i] += (e.x[i] - e.memX[i]) * 0.25; e.memY[i] += (e.y[i] - e.memY[i]) * 0.25;
    return;
  }
  // animal target: parasite or predator
  if (g[o + G.PARASITE] > 0.4 && e.carn[i] < 0.25) {
    const take = Math.min(e.energy[t], 0.05 * size * Math.sqrt(size) + 0.01); e.energy[t] -= take; e.energy[i] = Math.min(maxE, e.energy[i] + take * 0.8);
    if (rng.next() < 0.03) e.flags[t] |= 1; e.cd[i] = 8; e.state[i] = S_EAT; return;
  }
  if (e.energy[i] >= maxE * 0.95) return;
  const hp = 3 * Math.pow(e.size[t] * e.size[t], 0.6) * e.def[t];
  let dmg = e.atk[i] / hp * (0.8 + rng.next() * 0.4);
  // intelligence & surprise: camouflaged / ambush attackers hit harder
  dmg *= 1 + 0.4 * g[o + G.INTEL] + 0.3 * g[o + G.CAMO];
  e.health[t] -= dmg; e.hurt[t] = 6;
  if (e.genome[t * NG + G.VENOM] > 0 || g[o + G.VENOM] > 0.3) e.health[t] -= g[o + G.VENOM] * 0.04;
  e.state[i] = S_FIGHT; e.cd[i] = 6;
  e.target[t] = e.target[t] >= 0 ? e.target[t] : -1;
  pushEvent(ctx, { t: 'hit', x: e.x[t], y: e.y[t], dx: Math.sign(dx), size: e.size[t], sp: e.species[t], amt: dmg });
  // counter-attack: the target fights back
  const ret = e.atk[t] * (0.3 + 0.7 * e.genome[t * NG + G.AGGR]);
  if (ret > 0.01) { const hpI = 3 * Math.pow(size * size, 0.6) * e.def[i]; e.health[i] -= ret / hpI * 0.5; if (e.health[i] <= 0) { die(w, ctx, i, 'injury'); return; } }
  if (e.health[t] <= 0) {
    // kill: small prey are swallowed whole, big prey leave a carcass the killer then feeds on
    const body = (2.5 * e.size[t] * e.size[t] + 0.8 * Math.max(0, e.energy[t])) * 0.8;
    if (e.size[t] <= size * 0.28) { e.energy[i] = Math.min(maxE, e.energy[i] + body * 0.7); pushEvent(ctx, { t: 'eat', x: e.x[t], y: e.y[t], size: e.size[t] }); const sp = e.species[t]; ctx.sp.add(sp, -1, w.tick); addNut(w, e.x[t], e.y[t], body * 0.01); e.release(t); e.target[i] = -1; }
    else { die(w, ctx, t, 'predation', i); /* t is now a carcass; keep targeting it */ }
  } else if (e.health[t] < 0.35 && rng.next() < 0.5) { e.thr[t] = i; e.thrUid[t] = e.uid[i]; }
}
void S_FORAGE; void S_HUNT; void S_FLEE;
