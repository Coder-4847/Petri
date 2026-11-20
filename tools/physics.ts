// Medium-physics checks: drowning, suffocation, falling, carcass sinking.
import { W, K_CARCASS } from '../src/shared/constants';
import { BIOME_INDEX } from '../src/data/biomes';
import { World } from '../src/sim/world';
import { stepWorld, spawn, type Ctx } from '../src/sim/ecology';
import { SpeciesRegistry } from '../src/sim/species';
import { RNG } from '../src/shared/rng';
import { genome } from '../src/sim/genes';

function setup(biome: string) {
  const rng = new RNG(5); const ctx: Ctx = { sp: new SpeciesRegistry(rng), events: [] }; ctx.sp.disabled = true;
  const w = new World(BIOME_INDEX[biome], 5); w.ctxRef = ctx; w.allocEntities(); return { w, ctx };
}
const lion = genome({ SIZE: 0.72, CARN: 0.9, WALK: 0.9, LIMBS: 0.9, JAWS: 0.7, GILLS: 0, LUNGS: 0.95, CUTICLE: 0.5, HUMID_OPT: 0.4, TEMP_TOL: 0.6, ENDOTHERM: 0.6, VISION: 0.7, EYES: 0.6 });
const fish = genome({ SIZE: 0.5, CARN: 0.5, SWIM: 0.8, FINS: 0.6, GILLS: 1, VISION: 0.5, EYES: 0.5 });
const scav = genome({ SIZE: 0.3, SCAV: 0.9, SWIM: 0.6, GILLS: 1, SMELL: 0.8 });

function run(name: string, biome: string, g: Float32Array, x: number, y: number, ticks: number, extra?: (w: World, ctx: Ctx) => void) {
  const { w, ctx } = setup(biome);
  const id = ctx.sp.create(-1, g, 0, 0, 'test'), sid = ctx.sp.create(-1, scav, 0, 0, 'scav');
  const i = spawn(w, ctx, id, g, 0, x, y, { grown: true, energyFrac: 0.8 }); const uid = w.ents.uid[i];
  extra?.(w, ctx); void sid;
  const log: string[] = []; let causeOf = '';
  for (let t = 0; t < ticks; t++) {
    stepWorld(w, ctx);
    for (const ev of ctx.events) if (ev.t === 'death' && ev.sp === id) causeOf = ev.cause + '@t' + t;
    ctx.events.length = 0;
    if (t % Math.floor(ticks / 6) === 0 && w.ents.valid(i, uid)) log.push(`t${t}: y=${w.ents.y[i].toFixed(1)} hp=${w.ents.health[i].toFixed(2)} breath=${w.ents.breath[i].toFixed(2)} kind=${w.ents.kind[i]}`);
  }
  console.log(`${name}: ${causeOf || 'survived'}\n   ${log.join('\n   ')}`);
}
console.log('--- physics checks');
run('lion dropped in the open ocean', 'ocean', lion, 190, 30, 900);
run('fish stranded on grassland', 'grassland', fish, 100, 60, 900);
run('lion falls from the sky (grassland)', 'grassland', lion, 100, 2, 300);
run('lion in the sky biome', 'sky', lion, 190, 20, 300);
run('fish in river', 'river', fish, 190, 100, 300);
void K_CARCASS; void W;
