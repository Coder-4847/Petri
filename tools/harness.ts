// Headless ecology harness: run the real sim in Node and print population curves.
//   npx tsx tools/harness.ts [scenario] [ticks] [biome] [seed]
import { W, H, K_PRODUCER, K_ANIMAL, K_CARCASS, NG, G, TICK_RATE } from '../src/shared/constants';
import { BIOME_INDEX } from '../src/data/biomes';
import { World } from '../src/sim/world';
import { stepWorld, spawn, dbg, type Ctx } from '../src/sim/ecology';
import { SpeciesRegistry } from '../src/sim/species';
import { RNG } from '../src/shared/rng';
import { genome, sizeOf } from '../src/sim/genes';

const [scenario = 'reef3', ticksArg = '20000', biomeArg, seedArg = '7'] = process.argv.slice(2);
const ticks = +ticksArg, seed = +seedArg;

const rng = new RNG(seed);
const ctx: Ctx = { sp: new SpeciesRegistry(rng), events: [] };
const biome = biomeArg ?? (scenario.startsWith('land') ? 'grassland' : 'reef');
const w = new World(BIOME_INDEX[biome], seed); w.ctxRef = ctx; w.allocEntities();
ctx.sp.disabled = !process.argv.includes('--evo');

const T = {
  phyto: genome({ SIZE: 0.18, PHOTO: 0.95, SWIM: 0.12, GILLS: 1, METAB: 0.35, HUE: 0.33, REPRO_RATE: 0.8, LIFESPAN: 0.3 }),
  kelp: genome({ SIZE: 0.48, PHOTO: 0.95, SWIM: 0, GILLS: 1, METAB: 0.3, HUE: 0.12, REPRO_RATE: 0.6, LIFESPAN: 0.7, TAIL: 0.3 }),
  grazer: genome({ DEPTH_PREF: 0.12, SIZE: 0.34, HERB: 0.9, FILTER: 0.3, SWIM: 0.55, FINS: 0.3, VISION: 0.4, SMELL: 0.4, GILLS: 1, EYES: 0.4, HUE: 0.55, REPRO_RATE: 0.7, LIFESPAN: 0.4 }),
  fish: genome({ REPRO_STRAT: 0.45, SIZE: 0.5, CARN: 0.9, SWIM: 0.8, FINS: 0.6, JAWS: 0.5, VISION: 0.6, SMELL: 0.4, EYES: 0.6, GILLS: 1, HUE: 0.02, REPRO_RATE: 0.6, LIFESPAN: 0.5, TAIL: 0.5, SOCIAL: 0.1 }),
  grass: genome({ SIZE: 0.4, PHOTO: 0.95, GILLS: 0, CUTICLE: 0.8, LUNGS: 0.8, HUMID_OPT: 0.4, METAB: 0.3, HUE: 0.28, TEMP_OPT: 0.5, TEMP_TOL: 0.6, REPRO_RATE: 0.8, LIFESPAN: 0.4 }),
  hare: genome({ SIZE: 0.5, HERB: 0.9, WALK: 0.8, LIMBS: 0.8, VISION: 0.6, SMELL: 0.5, EYES: 0.6, GILLS: 0, LUNGS: 0.9, CUTICLE: 0.5, HUMID_OPT: 0.4, HUE: 0.08, REPRO_RATE: 0.8, LIFESPAN: 0.4, TEMP_OPT: 0.5, TEMP_TOL: 0.6, ENDOTHERM: 0.4 }),
  fox: genome({ SIZE: 0.62, CARN: 0.9, WALK: 0.85, LIMBS: 0.8, VISION: 0.7, SMELL: 0.7, JAWS: 0.6, EYES: 0.6, GILLS: 0, LUNGS: 0.9, CUTICLE: 0.5, HUMID_OPT: 0.4, HUE: 0.04, REPRO_RATE: 0.5, LIFESPAN: 0.5, TEMP_OPT: 0.5, TEMP_TOL: 0.6, ENDOTHERM: 0.4, REPRO_STRAT: 0.4 }),
};
const ids: Record<string, number> = {};
for (const [k, g] of Object.entries(T)) ids[k] = ctx.sp.create(-1, g, 0, 0, k, k);

function scatter(name: string, n: number, water: boolean) {
  const g = (T as any)[name];
  for (let k = 0; k < n; k++) {
    for (let tries = 0; tries < 200; tries++) {
      const x = w.rng.range(4, W - 4), y = water ? w.rng.range(w.def.terrain.water * H + 2, H - 8) : w.surfaceY[x | 0] - 2 - w.rng.next() * 2;
      if (!water && w.waterTop[x | 0] >= 0) continue;
      const c = w.medium[(y | 0) * W + (x | 0)];
      if (water ? c >= 1 && c <= 3 : c === 0) { if (spawn(w, ctx, ids[name], g, 0, x, y, { grown: true, energyFrac: 0.6, age: w.rng.int(300) }) >= 0 || true) break; }
    }
  }
}
function diag() {
  const e = w.ents; const acc: Record<string, { n: number; st: number; en: number; hp: number }> = {};
  for (let i = 0; i < e.hi; i++) { if (e.kind[i] === 0 || e.kind[i] === K_CARCASS) continue; const k = ctx.sp.list[e.species[i]].template ?? '?'; const a = (acc[k] ??= { n: 0, st: 0, en: 0, hp: 0 }); a.n++; a.st += e.stress[i]; a.en += e.energy[i] / e.maxE[i]; a.hp += e.health[i]; }
  console.log('   dbg', JSON.stringify(dbg)); for (const k in dbg) (dbg as any)[k] = 0;
  console.log('   ' + Object.entries(acc).map(([k, a]) => `${k}[n=${a.n} stress=${(a.st / a.n).toFixed(2)} E=${(a.en / a.n).toFixed(2)} hp=${(a.hp / a.n).toFixed(2)}]`).join(' '));
}
function report(t: number) {
  const e = w.ents; const cnt: Record<string, number> = {}; let eSum = 0, n = 0;
  for (const k of Object.keys(ids)) cnt[k] = ctx.sp.count[ids[k]];
  let car = 0, other = 0;
  for (let i = 0; i < e.hi; i++) { if (e.kind[i] === K_CARCASS) car++; if (e.kind[i] === K_ANIMAL) { eSum += e.energy[i] / e.maxE[i]; n++; } }
  other = e.alive - Object.values(cnt).reduce((a, b) => a + b, 0) - car;
  const spCount = ctx.sp.list.filter((s) => !s.extinct).length;
  const cols = Object.entries(cnt).filter(([k]) => scenario.startsWith('reef') ? ['phyto', 'kelp', 'grazer', 'fish'].includes(k) : ['grass', 'hare', 'fox'].includes(k)).map(([k, v]) => `${k}:${String(v).padStart(4)}`).join(' ');
  console.log(`t=${String(t).padStart(6)} (${(t / TICK_RATE / 60).toFixed(1)}m) ${cols}  carc:${String(car).padStart(3)} other:${String(Math.max(0, other)).padStart(4)} sp:${spCount} nut:${(w.nutrients.reduce((a, b) => a + b, 0) / w.nutrients.length).toFixed(2)} avgE:${n ? (eSum / n).toFixed(2) : '-'}`);
}

if (scenario === 'reef3') { scatter('phyto', 500, true); scatter('kelp', 60, true); scatter('grazer', 120, true); scatter('fish', 14, true); }
else if (scenario === 'reef4') { scatter('phyto', 700, true); scatter('grazer', +(process.env.NG ?? 300), true); scatter('fish', +(process.env.NFISH ?? 10), true); }
else if (scenario === 'reef2') { scatter('phyto', 700, true); scatter('grazer', +(process.env.NG ?? 100), true); }
else if (scenario === 'land3') { scatter('grass', 300, false); scatter('hare', +(process.env.NH ?? 16), false); scatter('fox', +(process.env.NF ?? 2), false); }
else if (scenario === 'land2') { scatter('grass', 300, false); scatter('hare', +(process.env.NH ?? 16), false); }
else if (scenario === 'plants') { scatter('phyto', 300, true); }

const t0 = Date.now();
const every = Math.max(1, Math.floor(ticks / 40));
report(0);
const causes: Record<string, number> = {};
for (let t = 1; t <= ticks; t++) { stepWorld(w, ctx); for (const ev of ctx.events) if (ev.t === 'death') { const k = (ctx.sp.list[ev.sp].template ?? '?') + ':' + ev.cause; causes[k] = (causes[k] ?? 0) + 1; } ctx.events.length = 0; if (t % every === 0) { report(t); if (process.argv.includes('--diag')) diag(); } }
const ms = Date.now() - t0;
console.log('deaths:', JSON.stringify(causes));
console.log(`-- ${ticks} ticks in ${ms} ms (${(ms / ticks).toFixed(2)} ms/tick), entities=${w.ents.alive}`);
const ext = ctx.sp.extinctions.slice(-5).map((x) => x.name + '@' + x.tick).join(', ');
if (ext) console.log('extinctions:', ext);
void G; void NG; void K_PRODUCER; void sizeOf;
