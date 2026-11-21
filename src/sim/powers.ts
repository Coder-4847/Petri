// God powers. Each has a small (local) and a large (biome-wide or planet-wide) version.
import { W, H, NG, BLOCK, CW, CH, AIR, FRESH, LAVA, BASALT, CRYSTAL, IS_SOLID, IS_WATER, K_CARCASS, K_FREE } from '../shared/constants';
import type { Sim } from './sim';
import type { World } from './world';
import { die, addDet, addNut } from './ecology';
import { mutate } from './genes';
import { inRange, hurtEnt, carve } from './tools';
import { massKill } from './civfx';
import { POWER_BY_ID } from '../data/powers';
import { TEMPLATES } from '../data/templates';
import { livingIn } from './radiation';

export interface PowerResult { ok: boolean; msg: string }

function surfaceAt(w: World, x: number): number { const cx = Math.max(0, Math.min(W - 1, x | 0)); let y = 0; while (y < H - 1 && !IS_SOLID[w.medium[y * W + cx]]) y++; return y; }
function terrainChanged(w: World) {
  w.edited = true;
  for (let x = 0; x < W; x++) { let s = 0; while (s < H && !IS_SOLID[w.medium[s * W + x]]) s++; w.surfaceY[x] = s; let t = -1; for (let y = 0; y < H; y++) { if (IS_WATER[w.medium[y * W + x]]) { t = y; break; } if (IS_SOLID[w.medium[y * W + x]]) break; } w.waterTop[x] = t; }
  w.recomputeLight(); w.terrainVersion++;
}

function meteor(sim: Sim, w: World, x: number, y: number, r: number, kill = 1) {
  const e = w.ents; const ctx = sim.ctx;
  if (e) inRange(w, x, y, r * 2, (i, d) => { if (e.kind[i] === K_FREE) return; if (d < 0.5 && kill >= 1) { ctx.events.push({ t: 'hit', x: e.x[i], y: e.y[i], dx: Math.sign(e.x[i] - x) || 1, size: e.size[i], sp: e.species[i], amt: 1 }); die(w, ctx, i, 'impact'); } else hurtEnt(w, ctx, i, (1 - d) * 1.6 * kill, 'impact'); });
  carve(w, x, y + 2, Math.max(3, r * 0.5)); w.dust = Math.min(1, w.dust + 0.04 * r / 7);
  ctx.events.push({ t: 'boom', x, y, r }); addDet(w, x, y, r * 1.5);
}

function bolt(sim: Sim, w: World, x: number, y: number, r: number) {
  const e = w.ents; sim.ctx.events.push({ t: 'bolt', x, y });
  if (e) inRange(w, x, y, r, (i, d) => hurtEnt(w, sim.ctx, i, 0.9 - d * 0.5, 'lightning')); addNut(w, x, y, 1.5);
}

function mutateEnt(sim: Sim, w: World, i: number, strength: number) {
  const e = w.ents, ctx = sim.ctx; if (e.kind[i] === K_CARCASS || e.kind[i] === K_FREE) return;
  const gi = i * NG, tmp = new Float32Array(NG);
  mutate(tmp, 0, e.genome.subarray(gi, gi + NG), 0, w.rng, strength); for (let k = 0; k < NG; k++) e.genome[gi + k] = tmp[k];
  const ns = ctx.sp.classify(e.species[i], e.genome, gi, w.tick);
  if (ns !== e.species[i]) { ctx.sp.add(e.species[i], -1, w.tick); ctx.sp.add(ns, 1, w.tick); e.species[i] = ns; }
  e.hurt[i] = 6;
}

function unlockStranger(sim: Sim, pool: 'scifi' | 'myth'): string | null {
  const cands = TEMPLATES.filter((t) => t.category === pool && !sim.found.has(t.id)); if (!cands.length) return null;
  const t = cands[sim.rng.int(cands.length)]; sim.found.add(t.id); sim.codexDirty = true; return t.name;
}

export function applyPower(sim: Sim, id: string, x: number, y: number, large: boolean): PowerResult {
  const p = POWER_BY_ID[id]; if (!p) return { ok: false, msg: 'Unknown power.' };
  const w = sim.world, ctx = sim.ctx, e = w.ents;
  if (p.live && (w.mode !== 'full' || !e)) return { ok: false, msg: 'Slow time to 1x–20x to use this power.' };
  const R = p.radius * (large ? 2.2 : 1);
  switch (id) {
    case 'meteor': meteor(sim, w, x, y, large ? 20 : 14); break;
    case 'shower': {
      const v = sim.view, n = large ? 10 : 4;
      for (let k = 0; k < n; k++) { const mx = v.x0 + (v.x1 - v.x0) * w.rng.next(); meteor(sim, w, mx, surfaceAt(w, mx) - 1, large ? 9 : 6, 0.8); }
      break;
    }
    case 'asteroid': {
      if (w.mode === 'full' && e) meteor(sim, w, x, y, 26, 1.5);
      if (large) { massKill(sim, 0.88); for (const wd of sim.worlds) wd.dust = Math.max(wd.dust, 0.85); sim.post({ t: 'toast', kind: 'era', text: 'Mass extinction', sub: 'An asteroid strike darkens every sky on the planet.' }); }
      else { w.dust = Math.min(1, w.dust + 0.5); if (w.mode === 'coarse') massKill(sim, 0.4); }
      w.recomputeLight(); w.terrainVersion++;
      break;
    }
    case 'mineral': {
      meteor(sim, w, x, y, 8, 0.7);
      const cy = surfaceAt(w, x);
      for (let yy = cy; yy < Math.min(H, cy + 6); yy++) for (let xx = Math.max(0, x - 6); xx < Math.min(W, x + 6); xx++) { const i = yy * W + (xx | 0); if (IS_SOLID[w.medium[i]] && w.rng.next() < 0.55 - (yy - cy) * 0.07) w.medium[i] = CRYSTAL; }
      const cx = (x / BLOCK) | 0, cby = (y / BLOCK) | 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const bx = cx + dx, by = cby + dy; if (bx >= 0 && by >= 0 && bx < CW && by < CH) w.nutrients[by * CW + bx] = Math.min(2.5, w.nutrients[by * CW + bx] + 1); }
      terrainChanged(w);
      if (w.rng.next() < (large ? 0.6 : 0.25)) { const n = unlockStranger(sim, 'scifi'); if (n) sim.post({ t: 'toast', kind: 'codex', text: `Something hitched a ride: ${n}`, sub: 'A new stranger is in your codex.' }); }
      break;
    }
    case 'lightning': if (large) { for (let k = 0; k < 7; k++) { const bx = x + (w.rng.next() - 0.5) * 120; bolt(sim, w, bx, surfaceAt(w, bx), 5); } } else bolt(sim, w, x, y, 5); break;
    case 'volcano': {
      const gx = Math.round(x), gy = surfaceAt(w, gx), hgt = large ? 18 : 10, base = large ? 26 : 15;
      for (let dx = -base; dx <= base; dx++) {
        const cx = gx + dx; if (cx < 0 || cx >= W) continue;
        const top = Math.round(gy - hgt * Math.max(0, 1 - Math.abs(dx) / base)); const sy = surfaceAt(w, cx);
        for (let yy = Math.max(1, top); yy < sy; yy++) w.medium[yy * W + cx] = Math.abs(dx) < 3 && yy < top + 3 ? LAVA : BASALT;
        if (Math.abs(dx) < 3) for (let yy = top; yy < top + 3 && yy < H; yy++) if (yy >= 0) w.medium[yy * W + cx] = LAVA;
      }
      // lava rivulets down both flanks
      for (const side of [-1, 1]) { let cx = gx + side * 2; for (let k = 0; k < base; k++) { cx += side; if (cx < 0 || cx >= W) break; const sy = surfaceAt(w, cx); if (sy > 0 && sy < H) w.medium[sy * W + cx] = LAVA; } }
      if (e) inRange(w, gx, gy - hgt / 2, base, (i, d) => hurtEnt(w, ctx, i, (1 - d) * 1.2, 'lava'));
      for (const wd of large ? sim.worlds : [w]) wd.dust = Math.min(1, wd.dust + (large ? 0.45 : 0.25));
      terrainChanged(w); ctx.events.push({ t: 'boom', x: gx, y: gy - hgt, r: hgt });
      break;
    }
    case 'flood': {
      const rise = large ? 14 : 8, x0 = large ? 0 : Math.max(0, Math.round(x - R)), x1 = large ? W - 1 : Math.min(W - 1, Math.round(x + R));
      let lvl = H; for (let cx = x0; cx <= x1; cx++) lvl = Math.min(lvl, surfaceAt(w, cx) + (w.waterTop[cx] >= 0 ? 0 : 0));
      const ys: number[] = []; for (let cx = x0; cx <= x1; cx++) ys.push(w.waterTop[cx] >= 0 ? w.waterTop[cx] : surfaceAt(w, cx)); ys.sort((a, b) => a - b);
      const level = ys[ys.length >> 1] - rise;
      const cells: number[] = [];
      for (let cx = x0; cx <= x1; cx++) for (let yy = Math.max(1, level); yy < H; yy++) { const i = yy * W + cx; if (IS_SOLID[w.medium[i]]) break; if (w.medium[i] === AIR) { w.medium[i] = FRESH; cells.push(i); } }
      if (!cells.length) return { ok: false, msg: 'Nothing here to flood.' };
      terrainChanged(w); sim.timed.push({ tick: w.tick + (large ? 3600 : 1800), world: w.idx, key: 'flood', delta: 0, cells });
      void lvl; break;
    }
    case 'iceage': for (const wd of large ? sim.worlds : [w]) sim.timedEnv('temp', large ? -0.35 : -0.22, large ? 9000 : 5000, wd.idx); break;
    case 'drought': for (const wd of large ? sim.worlds : [w]) { sim.timedEnv('humidity', large ? -0.4 : -0.28, large ? 7000 : 4000, wd.idx); sim.timedEnv('temp', 0.08, large ? 7000 : 4000, wd.idx); } break;
    case 'plague': {
      if (large) {
        const rows = livingIn(w, ctx).filter((l) => l.pop >= 10 && l.t.kind === 2); if (!rows.length) return { ok: false, msg: 'Nothing here to infect.' };
        const pick = rows.sort((a, b) => b.pop - a.pop)[0]; for (let i = 0; i < e.hi; i++) if (e.kind[i] && e.species[i] === pick.id && w.rng.next() < 0.7) e.flags[i] |= 1;
        sim.post({ t: 'toast', kind: 'event', text: `A pandemic sweeps through ${ctx.sp.list[pick.id].name}` });
      } else inRange(w, x, y, R, (i) => { if (e.kind[i] !== K_CARCASS && w.rng.next() < 0.7) e.flags[i] |= 1; });
      break;
    }
    case 'heal': { const f = (i: number) => { if (e.kind[i] === K_CARCASS || e.kind[i] === K_FREE) return; e.health[i] = 1; e.energy[i] = Math.max(e.energy[i], e.maxE[i] * 0.9); e.flags[i] &= ~1; }; if (large) for (let i = 0; i < e.hi; i++) f(i); else inRange(w, x, y, R, f); ctx.events.push({ t: 'glow', x, y, r: R }); break; }
    case 'fertilize': {
      const cx = (x / BLOCK) | 0, cy = (y / BLOCK) | 0, rb = large ? 999 : Math.ceil(R / BLOCK);
      for (let by = 0; by < CH; by++) for (let bx = 0; bx < CW; bx++) { const dx = bx - cx, dy = by - cy; if (dx * dx + dy * dy > rb * rb) continue; w.nutrients[by * CW + bx] = Math.min(2, w.nutrients[by * CW + bx] + 0.6); w.detritus[by * CW + bx] += 0.3; }
      ctx.events.push({ t: 'glow', x, y, r: R }); break;
    }
    case 'mutagen': {
      if (large) { for (let i = 0; i < e.hi; i++) if (w.rng.next() < 0.6) mutateEnt(sim, w, i, 5); } else inRange(w, x, y, R, (i) => mutateEnt(sim, w, i, 9));
      ctx.events.push({ t: 'glow', x, y, r: R });
      if (w.rng.next() < (large ? 0.3 : 0.08)) { const n = unlockStranger(sim, 'scifi'); if (n) sim.post({ t: 'toast', kind: 'codex', text: `Radiation-born: ${n}`, sub: 'The mutagen produced something no one expected.' }); }
      break;
    }
  }
  return { ok: true, msg: `${p.name}${large ? ' (large)' : ''}` };
}
