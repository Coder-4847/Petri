// Whole-planet deep-time run: all 18 biomes step together with dispersal between them.
//   npx tsx tools/planet.ts [steps] [seed]
import { K_ANIMAL, G } from '../src/shared/constants';
import { BIOMES } from '../src/data/biomes';
import { ERAS } from '../src/data/eras';
import { World } from '../src/sim/world';
import { type Ctx } from '../src/sim/ecology';
import { SpeciesRegistry } from '../src/sim/species';
import { RNG } from '../src/shared/rng';
import { seedMicrobes } from '../src/sim/seed';
import { stepCoarse, ensureCoarse } from '../src/sim/coarse';
import { newEraState, evaluateEras } from '../src/sim/eras';
import { describeGenome } from '../src/sim/genes';

const steps = +(process.argv[2] ?? 15000), seed = +(process.argv[3] ?? 5);
const rng = new RNG(seed); const ctx: Ctx = { sp: new SpeciesRegistry(rng), events: [] };
const era = newEraState(); ctx.era = era;
const worlds = BIOMES.map((_, i) => { const w = new World(i, seed); w.ctxRef = ctx; w.allocEntities(); return w; });
ctx.worlds = worlds;
for (const w of worlds) seedMicrobes(w, ctx, false);
const t0 = Date.now();
const report = (final = false) => {
  console.log(`--- step ${steps && ctx.events.length ? '' : ''}era=${era.reached} ${ERAS[era.reached].name} (${(era.progress * 100) | 0}%) species-ever=${ctx.sp.list.length}`);
  for (const w of worlds) {
    const cs = ensureCoarse(w); const all = [...cs.sp.values()].filter((x) => x.pop >= 1);
    const cons = all.filter((x) => x.kind === K_ANIMAL), big = [...cons].sort((a, b) => b.t.size - a.t.size)[0];
    console.log(`${w.def.id.padEnd(10)} sp=${String(all.length).padStart(2)} cons=${String(cons.length).padStart(2)}(${String(Math.round(cons.reduce((a, x) => a + x.pop, 0))).padStart(4)}) herb=${cons.filter((x) => x.g[G.HERB] > 0.4).length} pred=${cons.filter((x) => x.g[G.CARN] > 0.4).length} biggest=${big ? big.t.size.toFixed(1).padStart(5) + ' ' + describeGenome(big.g).slice(0, 5).join('/') : '-'}`);
  }
  void final;
};
for (let s = 1; s <= steps; s++) {
  for (const w of worlds) stepCoarse(w, ctx, 1);
  if (s % 25 === 0) evaluateEras(era, ctx.sp, s * 50);
  ctx.events.length = 0;
  if (s % Math.floor(steps / 3) === 0) { console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] step ${s}`); report(); }
}
