// Random encounters: small surprises that make a long-running world feel alive.
import { W, G, K_ANIMAL, IS_SOLID, AIR } from '../shared/constants';
import type { Sim } from './sim';
import { placeTemplate } from './tools';
import { applyPower } from './powers';
import { TEMPLATES } from '../data/templates';
import { introduce } from './coarse';
import { livingIn } from './radiation';

interface Encounter { id: string; weight: (s: Sim) => number; run: (s: Sim) => boolean }

const toast = (s: Sim, text: string, sub?: string) => s.post({ t: 'toast', kind: 'event', text, sub });
const randX = (s: Sim) => 12 + s.world.rng.next() * (W - 24);
const surfaceAt = (s: Sim, x: number) => { const w = s.world; let y = 0; while (y < 190 && !IS_SOLID[w.cellMedium(x, y)] && w.waterTop[x | 0] !== y) y++; return Math.max(1, y - 1); };

const LIST: Encounter[] = [
  { id: 'bloom', weight: () => 1.4, run: (s) => {
    const w = s.world, x = randX(s); if (!w.ents) return false;
    applyPower(s, 'fertilize', x, surfaceAt(s, x) + 6, false); toast(s, 'A nutrient upwelling', 'Minerals wash in. Expect a bloom of growth.'); return true;
  } },
  { id: 'storm', weight: (s) => (s.world.def.noFloor || s.world.def.terrain.water > 0.6 ? 0.3 : 1), run: (s) => {
    const w = s.world; if (!w.ents) return false;
    for (let k = 0; k < 4; k++) { const x = randX(s); applyPower(s, 'lightning', x, surfaceAt(s, x), false); }
    toast(s, 'A thunderstorm rolls through', 'Lightning scars the land.'); return true;
  } },
  { id: 'shower', weight: (s) => (s.era.reached >= 2 ? 0.5 : 0), run: (s) => {
    const w = s.world; if (!w.ents) return false;
    for (let k = 0; k < 3; k++) { const x = randX(s); applyPower(s, 'meteor', x, surfaceAt(s, x), false); }
    toast(s, 'Meteor shower', 'Debris falls from the sky.'); return true;
  } },
  { id: 'outbreak', weight: () => 0.9, run: (s) => {
    const w = s.world, rows = livingIn(w, s.ctx).filter((l) => l.t.kind === K_ANIMAL && l.pop >= 25); if (!rows.length || !w.ents) return false;
    const pick = rows[w.rng.int(rows.length)], e = w.ents; let n = 0;
    for (let i = 0; i < e.hi; i++) if (e.kind[i] && e.species[i] === pick.id && w.rng.next() < 0.25) { e.flags[i] |= 1; n++; }
    if (!n) return false; toast(s, `Outbreak among ${s.ctx.sp.list[pick.id].name}`, 'A disease is spreading through the population.'); return true;
  } },
  { id: 'heat', weight: () => 0.7, run: (s) => { const w = s.world; s.timedEnv('temp', 0.12, 2400); toast(s, 'A heatwave', 'Temperatures climb for a while.'); void w; return true; } },
  { id: 'cold', weight: () => 0.7, run: (s) => { s.timedEnv('temp', -0.12, 2400); toast(s, 'A cold snap', 'Frost grips the world for a while.'); return true; } },
  { id: 'migration', weight: () => 0.9, run: (s) => {
    const w = s.world, rows = livingIn(w, s.ctx).filter((l) => l.t.kind === K_ANIMAL && l.pop >= 8 && l.t.size >= 0.8); if (!rows.length) return false;
    const pick = rows[w.rng.int(rows.length)]; introduce(w, s.ctx, pick.id, pick.g as Float32Array, 6);
    toast(s, `A group of ${s.ctx.sp.list[pick.id].name} arrives`, 'Migrating from somewhere nearby.'); return true;
  } },
  { id: 'visitor', weight: (s) => (s.era.reached >= 2 ? 0.8 : 0.15), run: (s) => {
    const w = s.world, age = s.era.reached;
    const pool = TEMPLATES.filter((t) => t.rarity >= 2 && !s.found.has(t.id) && (t.category === 'scifi' || t.category === 'myth' ? age >= 3 : age >= ({ fish: 2, insect: 3, amphibian: 4, reptile: 4, dinosaur: 5, bird: 5, mammal: 5, extinct: 5 } as Record<string, number>)[t.category]!));
    if (!pool.length) return false;
    const t = pool[w.rng.int(pool.length)]; const x = randX(s);
    // find a spot of the right kind
    let ok = false;
    for (let k = 0; k < 40 && !ok; k++) { const xx = randX(s), yy = t.habitat === 'land' ? surfaceAt(s, xx) : 4 + w.rng.next() * 150; if (w.cellMedium(xx, yy) !== AIR && t.habitat === 'land') continue; ok = placeTemplate(w, s.ctx, t.id, xx, yy, 1).ok; }
    if (!ok) return false; s.found.add(t.id); s.codexDirty = true;
    toast(s, `A stranger appears: ${t.name}`, t.blurb); void x; return true;
  } },
];

export function runEncounter(s: Sim): boolean {
  const w = s.world; if (w.mode !== 'full' || !w.ents) return false;
  const opts = LIST.map((e) => ({ e, wt: e.weight(s) })).filter((o) => o.wt > 0);
  let tot = 0; for (const o of opts) tot += o.wt; let r = s.rng.next() * tot;
  for (const o of opts) { r -= o.wt; if (r <= 0) return o.e.run(s); }
  void G; return false;
}
