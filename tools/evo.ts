// Deep-time evolution experiment: seed microbes, run the coarse model, watch species and eras.
//   npx tsx tools/evo.ts [biome] [coarseSteps] [seed] [--env key=value@step ...]
import { G, K_ANIMAL } from '../src/shared/constants';
import { BIOME_INDEX } from '../src/data/biomes';
import { ERAS } from '../src/data/eras';
import { World } from '../src/sim/world';
import { type Ctx } from '../src/sim/ecology';
import { SpeciesRegistry } from '../src/sim/species';
import { RNG } from '../src/shared/rng';
import { seedMicrobes } from '../src/sim/seed';
import { stepCoarse, ensureCoarse, COARSE_STEP } from '../src/sim/coarse';
import { newEraState, evaluateEras } from '../src/sim/eras';
import { traitsOf, sizeOf, describeGenome } from '../src/sim/genes';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [biome = 'reef', stepsArg = '20000', seedArg = '5'] = args;
const steps = +stepsArg, seed = +seedArg;
const rng = new RNG(seed); const ctx: Ctx = { sp: new SpeciesRegistry(rng), events: [] };
const w = new World(BIOME_INDEX[biome], seed); w.ctxRef = ctx; w.allocEntities();
const envChanges = process.argv.filter((a) => a.startsWith('--env=')).map((a) => { const m = a.slice(6).match(/(\w+)=([\d.]+)@(\d+)/)!; return { key: m[1], v: +m[2], at: +m[3] }; });
seedMicrobes(w, ctx, false);
const era = newEraState(); ctx.era = era;
const cs = ensureCoarse(w);
const t0 = Date.now();
const every = Math.max(1, Math.floor(steps / 25));
function report(step: number) {
  const alive = [...cs.sp.values()].filter((s) => s.pop >= 1);
  const tot = alive.reduce((a, s) => a + s.pop, 0);
  alive.sort((a, b) => b.pop - a.pop);
  const top = alive.slice(0, 4).map((s) => `${ctx.sp.list[s.id].name.split(' ')[0].slice(0, 9)}(${Math.round(s.pop)} sz${s.t.size.toFixed(1)}${s.g[G.CARN] > 0.3 ? 'C' : s.g[G.HERB] > 0.3 ? 'H' : s.g[G.PHOTO] > 0.3 ? 'P' : s.g[G.SCAV] > 0.3 ? 'D' : s.g[G.CHEMO] > 0.3 ? 'X' : '?'})`).join(' ');
  const maxSize = alive.reduce((m, s) => Math.max(m, s.t.size), 0);
  console.log(`s${String(step).padStart(6)} (${(step * COARSE_STEP / 20 / 3600).toFixed(1)}h) pop:${String(Math.round(tot)).padStart(5)} sp:${String(alive.length).padStart(3)}/${ctx.sp.list.length} max sz:${maxSize.toFixed(1)} nut:${cs.nut.toFixed(2)} det:${cs.det.toFixed(2)} era:${era.reached}${ERAS[era.reached].name.slice(0, 10)} ${(era.progress * 100) | 0}% | ${top}`);
}
report(0);
for (let s = 1; s <= steps; s++) {
  for (const c of envChanges) if (c.at === s) { (w.env as any)[c.key] = c.v; w.recomputeLight(); console.log(`   -- env ${c.key} -> ${c.v}`); }
  stepCoarse(w, ctx, 1);
  if (s % 20 === 0) evaluateEras(era, ctx.sp, w.tick);
  if (s % every === 0) report(s);
}
const ms = Date.now() - t0;
console.log(`-- ${steps} coarse steps (${(steps * COARSE_STEP / 20 / 3600).toFixed(1)} sim hours) in ${ms} ms; species ever ${ctx.sp.list.length}, extinct ${ctx.sp.list.filter((s) => s.extinct).length}`);
const alive = [...cs.sp.values()].filter((s) => s.pop >= 1).sort((a, b) => b.t.size - a.t.size).slice(0, 8);
for (const s of alive) console.log(`   ${ctx.sp.list[s.id].name.padEnd(26)} pop ${String(Math.round(s.pop)).padStart(5)} size ${sizeOf(s.g).toFixed(2)} ${describeGenome(s.g).join(', ')}`);
{ // population-weighted mean of the traits sliders are supposed to steer
  let tot = 0; const m = { TEMP_OPT: 0, HUMID_OPT: 0, CUTICLE: 0, ENDOTHERM: 0, PHOTO: 0, CHEMO: 0, SCAV: 0, TOXIN_RES: 0, SAL_OPT: 0 } as Record<string, number>;
  for (const s of cs.sp.values()) { tot += s.pop; for (const k in m) m[k] += s.pop * s.g[(G as any)[k]]; }
  console.log('MEANS ' + Object.entries(m).map(([k, v]) => `${k}=${(v / Math.max(1, tot)).toFixed(2)}`).join(' ') + ` pop=${Math.round(tot)} species=${cs.sp.size}`);
}
void K_ANIMAL; void traitsOf;
