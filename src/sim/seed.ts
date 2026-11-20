import { NG, G, K_ANIMAL, clamp } from '../shared/constants';
import type { World } from './world';
import type { Ctx } from './ecology';
import { genome, traitsOf, type GeneSpec, type Traits } from './genes';
import { ensureCoarse, expandWorld, type CoarseSp } from './coarse';

/**
 * Every biome starts microbial. Founders are tuned to what that biome offers: sunlit plankton and mats in
 * water, chemosynthesisers at vents, soil crust/bacteria on land, spore drifters in the sky, and
 * detritus-feeders everywhere. Evolution does the rest.
 */
export function seedMicrobes(w: World, ctx: Ctx, activate: boolean) {
  const env = w.env, def = w.def;
  const cs = ensureCoarse(w);
  const rng = w.rng;
  const water = w.def.terrain.water > 0 && def.group !== 'land';
  const dark = env.sunlight < 0.3;
  const vents = def.id === 'vents';
  const sky = !!def.noFloor;
  const clampG = (v: number) => clamp(v, 0, 1);
  // shared tolerances
  const aq = (): GeneSpec => ({
    GILLS: 1, HUMID_OPT: 0.95, SAL_OPT: clampG(env.salinity), SAL_TOL: 0.5, TEMP_OPT: clampG(env.temp * 0.8 + 0.1 + (rng.next() - 0.5) * 0.12), TEMP_TOL: 0.5,
    PRESS_TOL: dark ? 0.9 : 0.55, O2_NEED: clampG(Math.min(0.2, env.oxygen * 0.4)), TOXIN_RES: 0.25 + env.toxicity * 0.5,
  });
  const land = (): GeneSpec => ({
    GILLS: 0.1, CUTICLE: 0.55, HUMID_OPT: clampG(env.humidity - 0.08), TEMP_OPT: clampG(env.temp * 0.7 + 0.15 + (rng.next() - 0.5) * 0.1), TEMP_TOL: 0.5,
    SAL_OPT: 0.1, SAL_TOL: 0.5, O2_NEED: 0.15, TOXIN_RES: 0.25 + env.toxicity * 0.5, PRESS_TOL: 0.5,
  });
  const base = water ? aq() : land();
  const founders: { name: string; g: GeneSpec; n: number; tpl: string }[] = [];
  if (sky) {
    const s = { ...base, GILLS: 0.1, CUTICLE: 0.85, HUMID_OPT: 0.3, TEMP_OPT: clampG(env.temp - 0.05), TEMP_TOL: 0.55 };
    founders.push({ name: 'Aerophyta minima', tpl: 'cyano', n: 300, g: { ...s, SIZE: 0.03, PHOTO: 0.9, SWIM: 0, HUE: 0.42, METAB: 0.3, LIFESPAN: 0.3 } });
    founders.push({ name: 'Nubicola verdis', tpl: 'algae', n: 200, g: { ...s, SIZE: 0.08, PHOTO: 0.85, SWIM: 0, HUE: 0.3, METAB: 0.3, LIFESPAN: 0.3 } });
    founders.push({ name: 'Aeromyces lentus', tpl: 'bacteria', n: 160, g: { ...s, SIZE: 0.02, SCAV: 0.85, FLY: 0.3, SMELL: 0.5, HUE: 0.08 } });
    founders.push({ name: 'Cirrus vagans', tpl: 'protist', n: 60, g: { ...s, SIZE: 0.11, HERB: 0.8, FILTER: 0.4, FLY: 0.3, SMELL: 0.4, HUE: 0.6 } });
  } else if (dark || vents) {
    founders.push({ name: vents ? 'Thermobacter ardens' : 'Abyssococcus niger', tpl: 'chemo', n: 320, g: { ...base, SIZE: 0.03, CHEMO: 0.9, SWIM: 0.1, HUE: 0.05, TEMP_OPT: clampG(env.temp + 0.05), TEMP_TOL: 0.6, METAB: 0.4, DEPTH_PREF: 0.9 } });
    founders.push({ name: 'Sulfovibrio rubra', tpl: 'chemo', n: 200, g: { ...base, SIZE: 0.05, CHEMO: 0.85, SWIM: 0.2, HUE: 0.9, TEMP_OPT: clampG(env.temp + 0.15), DEPTH_PREF: 0.9, TOXIN_RES: 0.6 } });
    founders.push({ name: 'Detritibacter profundus', tpl: 'bacteria', n: 240, g: { ...base, SIZE: 0.02, SCAV: 0.85, SWIM: 0.3, SMELL: 0.5, HUE: 0.12, DEPTH_PREF: 0.9 } });
    founders.push({ name: 'Bacterivora vorax', tpl: 'protist', n: 50, g: { ...base, SIZE: 0.11, CARN: 0.7, SWIM: 0.5, SMELL: 0.5, HUE: 0.75, DEPTH_PREF: 0.8 } });
  } else {
    const dp = water ? 0.04 : 0;
    founders.push({ name: 'Cyanophyta lucida', tpl: 'cyano', n: 300, g: { ...base, SIZE: 0.03, PHOTO: 0.9, SWIM: 0.08, HUE: 0.45, METAB: 0.35, DEPTH_PREF: dp, LIFESPAN: 0.3, REPRO_RATE: 0.8 } });
    founders.push({ name: 'Chlorella verdis', tpl: 'algae', n: 220, g: { ...base, SIZE: 0.09, PHOTO: 0.85, SWIM: 0.2, HUE: 0.3, METAB: 0.35, DEPTH_PREF: dp, LIFESPAN: 0.3, REPRO_RATE: 0.8, TEMP_OPT: clampG((base.TEMP_OPT ?? 0.5) + 0.06) } });
    founders.push({ name: 'Saprobacter minor', tpl: 'bacteria', n: 220, g: { ...base, SIZE: 0.02, SCAV: 0.85, SWIM: 0.3, SMELL: 0.5, HUE: 0.1, DEPTH_PREF: water ? 0.25 : 0 } });
    founders.push({ name: 'Flagellata pascens', tpl: 'protist', n: 70, g: { ...base, SIZE: 0.12, HERB: 0.8, FILTER: 0.4, SWIM: 0.5, SMELL: 0.4, VISION: 0.1, HUE: 0.6, DEPTH_PREF: water ? 0.05 : 0, LIFESPAN: 0.4, REPRO_STRAT: 0.15 } });
  }
  cs.nut = env.nutrients * 0.5; cs.det = 0.25;
  for (const f of founders) {
    const g = genome(f.g);
    const id = ctx.sp.create(-1, g, 0, 0, f.tpl, f.name);
    const t = traitsOf(g, 0, {} as Traits);
    const sp: CoarseSp = { id, pop: f.n * (0.8 + rng.next() * 0.4), g: new Float32Array(g), t, kind: t.kind, p: new Float32Array(cs.samples.length), stress: 0, r: 0 };
    (sp as any)._cnt = 0;
    cs.sp.set(id, sp);
    ctx.sp.add(id, Math.round(sp.pop), 0); (sp as any)._cnt = Math.round(sp.pop);
  }
  w.seeded = true; w.mode = 'coarse';
  if (activate) expandWorld(w, ctx, false);
  void NG; void G; void K_ANIMAL;
}
