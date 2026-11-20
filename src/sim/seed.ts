import { W, H, IS_WATER } from '../shared/constants';
import type { World } from './world';
import { spawn, type Ctx } from './ecology';
import { genome } from './genes';

/**
 * Phase-2 preview communities: a producer, a grazer and a predator per habitat type, so the
 * simulation core is visible and testable. Phase 3 replaces this with the microbial start.
 */
const SEA = {
  phyto: genome({ SIZE: 0.18, PHOTO: 0.95, SWIM: 0.12, GILLS: 1, METAB: 0.35, HUE: 0.33, REPRO_RATE: 0.8, LIFESPAN: 0.3, DEPTH_PREF: 0.05 }),
  kelp: genome({ SIZE: 0.48, PHOTO: 0.95, SWIM: 0, GILLS: 1, METAB: 0.3, HUE: 0.12, REPRO_RATE: 0.6, LIFESPAN: 0.7, TAIL: 0.3 }),
  grazer: genome({ DEPTH_PREF: 0.08, SIZE: 0.34, HERB: 0.9, FILTER: 0.3, SWIM: 0.55, FINS: 0.3, VISION: 0.4, SMELL: 0.4, GILLS: 1, EYES: 0.4, HUE: 0.55, REPRO_RATE: 0.7, LIFESPAN: 0.4 }),
  fish: genome({ REPRO_STRAT: 0.45, SIZE: 0.5, CARN: 0.9, SWIM: 0.8, FINS: 0.6, JAWS: 0.5, VISION: 0.6, SMELL: 0.4, EYES: 0.6, GILLS: 1, HUE: 0.02, REPRO_RATE: 0.6, LIFESPAN: 0.5, TAIL: 0.5, SOCIAL: 0.1 }),
};
const LAND = {
  grass: genome({ SIZE: 0.4, PHOTO: 0.95, GILLS: 0, CUTICLE: 0.8, LUNGS: 0.8, HUMID_OPT: 0.4, METAB: 0.3, HUE: 0.28, TEMP_OPT: 0.5, TEMP_TOL: 0.6, REPRO_RATE: 0.8, LIFESPAN: 0.4 }),
  hare: genome({ SIZE: 0.5, HERB: 0.9, WALK: 0.8, LIMBS: 0.8, VISION: 0.6, SMELL: 0.5, EYES: 0.6, GILLS: 0, LUNGS: 0.9, CUTICLE: 0.5, HUMID_OPT: 0.4, HUE: 0.08, REPRO_RATE: 0.8, LIFESPAN: 0.4, TEMP_OPT: 0.5, TEMP_TOL: 0.6, ENDOTHERM: 0.4 }),
  fox: genome({ SIZE: 0.62, CARN: 0.9, WALK: 0.85, LIMBS: 0.8, VISION: 0.7, SMELL: 0.7, JAWS: 0.6, EYES: 0.6, GILLS: 0, LUNGS: 0.9, CUTICLE: 0.5, HUMID_OPT: 0.4, HUE: 0.04, REPRO_RATE: 0.5, LIFESPAN: 0.5, TEMP_OPT: 0.5, TEMP_TOL: 0.6, ENDOTHERM: 0.4, REPRO_STRAT: 0.4 }),
};

export function seedPreview(w: World, ctx: Ctx) {
  w.allocEntities();
  const sp = ctx.sp, rng = w.rng;
  const water = w.def.terrain.water > 0 && w.def.group !== 'land';
  const put = (id: number, g: Float32Array, n: number, inWater: boolean) => {
    for (let k = 0; k < n; k++) for (let tries = 0; tries < 80; tries++) {
      const x = rng.range(4, W - 4);
      const y = inWater ? rng.range(w.def.terrain.water * H + 3, H - 8) : w.surfaceY[x | 0] - 2 - rng.next() * 2;
      if (!inWater && w.waterTop[x | 0] >= 0) continue;
      const c = w.medium[(y | 0) * W + (x | 0)];
      if (inWater ? !IS_WATER[c] : c !== 0) continue;
      spawn(w, ctx, id, g, 0, x, y, { grown: true, energyFrac: 0.6, age: rng.int(300) }); break;
    }
  };
  if (water) {
    const ids = Object.entries(SEA).map(([k, g]) => sp.create(-1, g, 0, 0, k, ({ phyto: 'Algae minima', kelp: 'Fronda dorada', grazer: 'Copepoda tenuis', fish: 'Rapax piscis' } as any)[k]));
    put(ids[0], SEA.phyto, 900, true); put(ids[1], SEA.kelp, 40, true); put(ids[2], SEA.grazer, 300, true); put(ids[3], SEA.fish, 10, true);
  } else if (w.def.group !== 'sky') {
    const ids = Object.entries(LAND).map(([k, g]) => sp.create(-1, g, 0, 0, k, ({ grass: 'Gramen viride', hare: 'Lepus agilis', fox: 'Vulpes rufa' } as any)[k]));
    put(ids[0], LAND.grass, 320, false); put(ids[1], LAND.hare, 40, false); put(ids[2], LAND.fox, 4, false);
  }
  w.seeded = true;
}
