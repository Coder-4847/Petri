// Player tools: spawning from the codex, god powers, random encounters, inspection and the food web.
import { W, H, NG, G, BLOCK, CW, CH, AIR, IS_SOLID, IS_WATER, K_FREE, K_PRODUCER, K_ANIMAL, K_CARCASS, SALT, BRACKISH, FRESH, clamp } from '../shared/constants';
import type { World } from './world';
import { spawn, die, addDet, addNut, type Ctx } from './ecology';
import { genome, mutate, describeGenome } from './genes';
import { TEMPLATE_BY_ID, TEMPLATES, type Template } from '../data/templates';
import { introduce, viability, edible, type CoarseSp } from './coarse';
import { livingIn } from './radiation';

// ------------------------------------------------------------------ spawning
const NEED: Record<string, string> = { sea: 'salt water', fresh: 'fresh water', land: 'open ground', sky: 'open air', any: 'a place to live' };

function habitatOk(t: Template, m: number): boolean {
  switch (t.habitat) {
    case 'sea': return m === SALT || m === BRACKISH;
    case 'fresh': return m === FRESH || m === BRACKISH || ((t.category === 'amphibian' || t.category === 'reptile') && m === AIR);
    case 'land': case 'sky': return m === AIR;
    default: return !IS_SOLID[m];
  }
}

/** Species id for a codex template, creating it on first use. Reuses a living species the player already spawned. */
export function speciesForTemplate(ctx: Ctx, tpl: Template, tick: number): { id: number; g: Float32Array } {
  ctx.spawned ??= {};
  const prev = ctx.spawned[tpl.id];
  if (prev !== undefined && ctx.sp.founders[prev] && !ctx.sp.list[prev].extinct) return { id: prev, g: ctx.sp.founders[prev] };
  const g = genome(tpl.genes);
  const id = ctx.sp.create(-1, g, 0, tick, tpl.tpl, tpl.sci);
  ctx.spawned[tpl.id] = id;
  return { id, g };
}

export interface SpawnResult { ok: boolean; msg: string; placed: number; species?: number }

/** Place `n` creatures of a codex template at (x, y) in the active world, respecting what each needs to live in. */
export function placeTemplate(w: World, ctx: Ctx, tplId: string, x: number, y: number, n: number): SpawnResult {
  const tpl = TEMPLATE_BY_ID[tplId]; if (!tpl) return { ok: false, msg: 'Unknown creature.', placed: 0 };
  let m = w.cellMedium(x, y);
  // clicking into solid ground puts land creatures on the surface above it
  if (IS_SOLID[m] && (tpl.habitat === 'land' || tpl.habitat === 'sky' || tpl.habitat === 'any')) {
    let yy = y | 0; while (yy > 0 && IS_SOLID[w.cellMedium(x, yy)]) yy--; y = yy - 0.5; m = w.cellMedium(x, y);
  }
  if (!habitatOk(tpl, m)) return { ok: false, msg: `${tpl.name} needs ${NEED[tpl.habitat]} — try somewhere else.`, placed: 0 };
  const { id, g } = speciesForTemplate(ctx, tpl, w.tick);
  if (w.mode === 'coarse') {
    if (viability(w, g) < 0.12) return { ok: false, msg: `${tpl.name} can't survive in this biome.`, placed: 0 };
    introduce(w, ctx, id, g, n * 4); return { ok: true, msg: `${tpl.name} released.`, placed: n * 4, species: id };
  }
  w.allocEntities();
  let placed = 0; const tmp = new Float32Array(NG);
  for (let k = 0; k < n; k++) {
    const px = clamp(x + (k === 0 ? 0 : (w.rng.next() - 0.5) * 6), 1, W - 2), py = y + (k === 0 ? 0 : (w.rng.next() - 0.5) * 3);
    if (!habitatOk(tpl, w.cellMedium(px, py))) continue;
    mutate(tmp, 0, g, 0, w.rng, k === 0 ? 0 : 0.2); for (let i = 0; i < NG; i++) if (k === 0) tmp[i] = g[i];
    if (spawn(w, ctx, id, tmp, 0, px, py, { grown: true, energyFrac: 0.85 }) >= 0) placed++;
  }
  if (!placed) return { ok: false, msg: 'No room for that here.', placed: 0 };
  const v = viability(w, g);
  return { ok: true, placed, species: id, msg: v < 0.25 ? `${tpl.name} placed — it may struggle in this biome.` : `${tpl.name} placed.` };
}

// ------------------------------------------------------------------ god powers
import { POWERS } from '../data/powers';

function inRange(w: World, x: number, y: number, r: number, fn: (i: number, d: number) => void) {
  const e = w.ents; if (!e) return; const r2 = r * r;
  for (let i = 0; i < e.hi; i++) {
    if (e.kind[i] === K_FREE) continue;
    const dx = e.x[i] - x, dy = e.y[i] - y, d2 = dx * dx + dy * dy;
    if (d2 <= r2) fn(i, Math.sqrt(d2) / r);
  }
}

function hurtEnt(w: World, ctx: Ctx, i: number, amt: number, cause: string) {
  const e = w.ents; if (e.kind[i] === K_CARCASS) { e.energy[i] *= 0.6; return; }
  e.health[i] -= amt; e.hurt[i] = 6;
  ctx.events.push({ t: 'hit', x: e.x[i], y: e.y[i], dx: Math.sign(e.vx[i]) || 1, size: e.size[i], sp: e.species[i], amt });
  if (e.health[i] <= 0) die(w, ctx, i, cause);
}

function carve(w: World, cx: number, cy: number, r: number) {
  for (let y = Math.max(0, (cy - r) | 0); y <= Math.min(H - 1, (cy + r) | 0); y++) for (let x = Math.max(0, (cx - r) | 0); x <= Math.min(W - 1, (cx + r) | 0); x++) {
    const dx = x - cx, dy = (y - cy) * 1.3; if (dx * dx + dy * dy > r * r) continue;
    const i = y * W + x; if (!IS_SOLID[w.medium[i]]) continue;
    const wt = w.waterTop[x]; w.medium[i] = wt >= 0 && y >= wt ? (w.medium[(Math.max(0, wt)) * W + x] || FRESH) : AIR;
  }
  w.edited = true;
  // re-derive surfaces for the touched columns
  for (let x = Math.max(0, (cx - r) | 0); x <= Math.min(W - 1, (cx + r) | 0); x++) { let s = 0; while (s < H && !IS_SOLID[w.medium[s * W + x]]) s++; w.surfaceY[x] = s; }
}

export function applyPower(w: World, ctx: Ctx, id: string, x: number, y: number): { ok: boolean; msg: string } {
  const p = POWERS.find((q) => q.id === id); if (!p) return { ok: false, msg: 'Unknown power.' };
  if (w.mode !== 'full' || !w.ents) return { ok: false, msg: 'Slow time down to use powers (1x–20x).' };
  const r = p.radius, e = w.ents;
  switch (id) {
    case 'meteor': {
      inRange(w, x, y, r * 2, (i, d) => { if (d < 0.5) { ctx.events.push({ t: 'hit', x: e.x[i], y: e.y[i], dx: Math.sign(e.x[i] - x) || 1, size: e.size[i], sp: e.species[i], amt: 1 }); die(w, ctx, i, 'impact'); } else hurtEnt(w, ctx, i, (1 - d) * 1.6, 'impact'); });
      carve(w, x, y + 2, 7); w.dust = Math.min(1, w.dust + 0.18); w.recomputeLight(); w.terrainVersion++;
      ctx.events.push({ t: 'boom', x, y, r: 10 }); addDet(w, x, y, 20); break;
    }
    case 'lightning': {
      ctx.events.push({ t: 'bolt', x, y });
      inRange(w, x, y, r, (i, d) => hurtEnt(w, ctx, i, 0.9 - d * 0.5, 'lightning')); addNut(w, x, y, 1.5); break;
    }
    case 'plague': inRange(w, x, y, r, (i) => { if (e.kind[i] !== K_CARCASS && w.rng.next() < 0.7) e.flags[i] |= 1; }); break;
    case 'heal': inRange(w, x, y, r, (i) => { if (e.kind[i] === K_CARCASS) return; e.health[i] = 1; e.energy[i] = Math.max(e.energy[i], e.maxE[i] * 0.9); e.flags[i] &= ~1; }); ctx.events.push({ t: 'glow', x, y, r }); break;
    case 'fertilize': { const cx = (x / BLOCK) | 0, cy = (y / BLOCK) | 0, rb = Math.ceil(r / BLOCK); for (let dy = -rb; dy <= rb; dy++) for (let dx = -rb; dx <= rb; dx++) { const bx = cx + dx, by = cy + dy; if (bx < 0 || by < 0 || bx >= CW || by >= CH || dx * dx + dy * dy > rb * rb) continue; w.nutrients[by * CW + bx] = Math.min(2, w.nutrients[by * CW + bx] + 0.6); w.detritus[by * CW + bx] += 0.3; } ctx.events.push({ t: 'glow', x, y, r }); break; }
    case 'mutagen': inRange(w, x, y, r, (i) => {
      if (e.kind[i] === K_CARCASS) return; const gi = i * NG; const tmp = new Float32Array(NG);
      mutate(tmp, 0, e.genome.subarray(gi, gi + NG), 0, w.rng, 9); for (let k = 0; k < NG; k++) e.genome[gi + k] = tmp[k];
      const ns = ctx.sp.classify(e.species[i], e.genome, gi, w.tick);
      if (ns !== e.species[i]) { ctx.sp.add(e.species[i], -1, w.tick); ctx.sp.add(ns, 1, w.tick); e.species[i] = ns; }
      e.hurt[i] = 6;
    }); ctx.events.push({ t: 'glow', x, y, r }); break;
  }
  return { ok: true, msg: p.name };
}

// ------------------------------------------------------------------ inspector
const STATE_NAMES = ['wandering', 'foraging', 'hunting', 'fleeing', 'resting', 'eating', 'fighting', 'dying'];
export const DIET = (g: ArrayLike<number>) => g[G.PHOTO] > 0.35 || g[G.CHEMO] > 0.35 ? 'makes its own food' : g[G.CARN] > 0.4 && g[G.HERB] > 0.3 ? 'omnivore' : g[G.CARN] > 0.4 ? 'hunter' : g[G.HERB] > 0.4 ? 'grazer' : g[G.SCAV] > 0.4 ? 'scavenger' : g[G.FILTER] > 0.4 ? 'filter feeder' : 'forager';

/** Nearest living individual to a world position (prefers bigger bodies when several overlap). */
export function pickEntity(w: World, x: number, y: number, zoom: number): { slot: number; uid: number } | null {
  const e = w.ents; if (!e || w.mode !== 'full') return null;
  let best = -1, bd = 1e9; const reach = Math.max(1.6, 14 / zoom);
  for (let i = 0; i < e.hi; i++) {
    const k = e.kind[i]; if (k === K_FREE) continue;
    const dx = e.x[i] - x, dy = e.y[i] - y, d = Math.hypot(dx, dy) - e.size[i] * 0.4;
    if (d < reach && d < bd) { bd = d; best = i; }
  }
  return best < 0 ? null : { slot: best, uid: e.uid[best] };
}

export function inspect(w: World, ctx: Ctx, slot: number, uid: number): any {
  const e = w.ents; if (!e || !e.valid(slot, uid)) return { gone: true };
  const gi = slot * NG, g = e.genome.subarray(gi, gi + NG), sp = ctx.sp.list[e.species[slot]];
  const lineage: string[] = []; for (let id = sp.parent, n = 0; id >= 0 && n < 6; id = ctx.sp.list[id].parent, n++) lineage.push(ctx.sp.list[id].name);
  const carcass = e.kind[slot] === K_CARCASS;
  return {
    slot, uid, x: e.x[slot], y: e.y[slot], species: e.species[slot], name: sp.name, carcass, kind: e.kind[slot],
    diet: DIET(g), state: carcass ? 'carcass' : e.flags[slot] & 1 ? 'infected' : STATE_NAMES[e.state[slot]] ?? '?',
    size: e.size[slot], maxSize: e.maxSize[slot], age: e.age[slot], life: e.life[slot], gen: e.gen[slot],
    energy: carcass ? 0 : e.energy[slot] / Math.max(0.01, e.maxE[slot]), health: e.health[slot], speed: Math.max(e.spSwim[slot], e.spWalk[slot], e.spFly[slot]),
    lineage, population: ctx.sp.count[e.species[slot]], traits: describeGenome(g), genome: Array.from(g), template: sp.template, color: sp.color,
  };
}

// ------------------------------------------------------------------ food web
export interface WebNode { id: number; name: string; pop: number; level: number; color: number; kind: number; size: number; diet: string }
export interface WebEdge { from: number; to: number; w: number } // from = eater, to = eaten

export function foodWeb(w: World, ctx: Ctx) {
  const list = livingIn(w, ctx).filter((l) => l.pop >= 2).sort((a, b) => b.pop - a.pop).slice(0, 28);
  const cs: CoarseSp[] = list.map((l) => ({ id: l.id, pop: l.pop, g: l.g as Float32Array, t: l.t, kind: l.t.kind, p: new Float32Array(0), stress: 0, r: 0 }));
  const edges: WebEdge[] = [];
  for (const a of cs) for (const b of cs) { if (a === b) continue; const v = a.kind === K_ANIMAL ? edible(a, b) : 0; if (v > 0.05) edges.push({ from: a.id, to: b.id, w: Math.min(1, v) }); }
  // trophic level: producers 0, then 1 + mean level of what a species eats
  const level = new Map<number, number>(); for (const s of cs) level.set(s.id, s.kind === K_PRODUCER ? 0 : 1);
  for (let it = 0; it < 4; it++) for (const s of cs) {
    if (s.kind === K_PRODUCER) continue; const prey = edges.filter((e) => e.from === s.id); if (!prey.length) { if (s.g[G.SCAV] > 0.4 || s.g[G.HERB] < 0.2) level.set(s.id, 1); continue; }
    let sw = 0, sl = 0; for (const e of prey) { sw += e.w; sl += e.w * (level.get(e.to) ?? 0); } level.set(s.id, 1 + sl / sw);
  }
  const nodes: WebNode[] = cs.map((s) => ({ id: s.id, name: ctx.sp.list[s.id].name, pop: Math.round(s.pop), level: level.get(s.id) ?? 1, color: ctx.sp.list[s.id].color, kind: s.kind, size: s.t.size, diet: DIET(s.g) }));
  return { nodes, edges };
}

// ------------------------------------------------------------------ unlocks
/** Minimum era (index) at which common templates of a category appear in the codex without being discovered. */
const CATEGORY_ERA: Record<string, number> = { microbe: 0, plant: 1, invertebrate: 2, fish: 3, insect: 4, amphibian: 5, reptile: 5, dinosaur: 6, bird: 7, mammal: 7, extinct: 99, myth: 99, scifi: 99 };

/** Templates the player may spawn: common ones by era, rarer ones once something like them has evolved or turned up. */
export function unlockedTemplates(ctx: Ctx, era: number, found: Set<string>): string[] {
  const out: string[] = [];
  for (const t of TEMPLATES) {
    if (found.has(t.id) || (t.rarity <= 2 && era >= (CATEGORY_ERA[t.category] ?? 99))) out.push(t.id);
  }
  return out;
}

/** Mark templates as discovered when a living species is genetically close to them. */
export function scanDiscoveries(ctx: Ctx, found: Set<string>): string[] {
  const fresh: string[] = [];
  const sp = ctx.sp;
  for (let id = 0; id < sp.list.length; id++) {
    const info = sp.list[id]; if (info.peak < 6) continue;
    for (const t of TEMPLATES) {
      if (found.has(t.id)) continue;
      const g = genome(t.genes); let d = 0; const f = sp.founders[id];
      for (const k of DISCOVER_GENES) d += Math.abs(g[k] - f[k]);
      if (d / DISCOVER_GENES.length < 0.1) { found.add(t.id); fresh.push(t.id); }
    }
  }
  return fresh;
}
const DISCOVER_GENES = [G.SIZE, G.PHOTO, G.CHEMO, G.CARN, G.HERB, G.SCAV, G.FILTER, G.SWIM, G.WALK, G.FLY, G.LIMBS, G.WINGS, G.JAWS, G.ARMOR, G.SHELL, G.CUTICLE, G.ENDOTHERM, G.INTEL];

