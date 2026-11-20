import { W, H, CW, CH, BLOCK, ENT_CAP, IS_WATER, IS_SOLID, AIR } from '../shared/constants';
import { RNG } from '../shared/rng';
import { BIOMES, type BiomeDef, type Env } from '../data/biomes';
import { generateTerrain } from './terrain';
import { EntityStore, SpatialHash } from './entities';

/** One biome's cross-section world: grid, environment, fields and entities. */
export class World {
  readonly idx: number;
  readonly def: BiomeDef;
  medium!: Uint8Array;
  surfaceY!: Int16Array;
  waterTop!: Int16Array;
  vents!: { x: number; y: number }[];
  light = new Uint8Array(W * H);
  /** 0 = open sky/water column, >0 = enclosed (cave) */
  roof = new Uint8Array(W * H);
  env: Env;
  nutrients = new Float32Array(CW * CH);
  chem = new Float32Array(CW * CH);
  /** how much of each coarse block is non-air (nutrient influx weight) */
  nutFactor = new Float32Array(CW * CH);
  ents!: EntityStore;
  hash!: SpatialHash;
  terrainVersion = 0;
  tick = 0;
  seeded = false;
  rng: RNG;
  seed: number;
  /** transient atmospheric dimming from asteroid dust / ash (0 = clear) */
  dust = 0;
  nutTmp?: Float32Array;
  /** set by the sim host so low-level code can emit events */
  ctxRef?: import('./ecology').Ctx;

  constructor(idx: number, seed: number) {
    this.idx = idx; this.def = BIOMES[idx]; this.seed = seed;
    this.rng = new RNG(seed + idx * 7919);
    this.env = { ...this.def.env };
    this.regenTerrain();
    this.nutrients.fill(this.env.nutrients * 0.5);
  }

  allocEntities() {
    if (!this.ents) { this.ents = new EntityStore(ENT_CAP); this.hash = new SpatialHash(W, H, BLOCK, ENT_CAP); }
  }

  regenTerrain() {
    const t = generateTerrain(this.def, this.seed + this.idx * 131);
    this.medium = t.medium; this.surfaceY = t.surfaceY; this.waterTop = t.waterTop; this.vents = t.vents;
    this.chem.fill(0);
    for (const v of this.vents) {
      const cx = (v.x / BLOCK) | 0, cy = (v.y / BLOCK) | 0;
      for (let dy = -3; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < CW && y >= 0 && y < CH) this.chem[y * CW + x] = Math.max(this.chem[y * CW + x], 1 / (1 + dx * dx + dy * dy * 0.7));
      }
    }
    this.nutFactor.fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.medium[y * W + x] !== AIR) this.nutFactor[((y / BLOCK) | 0) * CW + ((x / BLOCK) | 0)] += 1 / (BLOCK * BLOCK);
    for (let i = 0; i < this.nutFactor.length; i++) this.nutFactor[i] = Math.max(this.def.noFloor ? 0.25 : 0.04, this.nutFactor[i]);
    this.recomputeLight();
    this.terrainVersion++;
  }

  /** Light attenuates with water depth and is blocked by solid ground. */
  recomputeLight() {
    const sun = this.env.sunlight * (1 - this.dust * 0.9);
    const k = 0.034 * (1 + this.env.nutrients * 0.6);
    const m = this.medium;
    for (let x = 0; x < W; x++) {
      let L = sun, roofed = 0;
      for (let y = 0; y < H; y++) {
        const i = y * W + x, c = m[i];
        if (IS_SOLID[c]) { L = 0; roofed = 1; this.light[i] = 0; this.roof[i] = 1; continue; }
        if (IS_WATER[c]) L *= 1 - k;
        else if (c === AIR && roofed) { this.light[i] = 6; this.roof[i] = 1; continue; }
        this.light[i] = (L * 255) | 0; this.roof[i] = roofed;
      }
    }
  }

  cellMedium(x: number, y: number): number {
    const cx = x | 0, cy = y | 0;
    if (cx < 0 || cx >= W) return 5; // world edges behave like rock walls
    if (cy < 0) return AIR;
    if (cy >= H) return 5;
    return this.medium[cy * W + cx];
  }
}
