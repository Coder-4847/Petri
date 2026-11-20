// Shared constants used by both the simulation worker and the renderer.

export const W = 384; // world width in cells
export const H = 192; // world height in cells
export const TICK_RATE = 20; // simulation ticks per simulated second
export const BLOCK = 8; // coarse field block size (cells)
export const CW = W / BLOCK;
export const CH = H / BLOCK;
export const ENT_CAP = 9000; // entity slots per world

// ---- Mediums -------------------------------------------------------------
export const AIR = 0;
export const FRESH = 1;
export const SALT = 2;
export const BRACKISH = 3;
export const SOIL = 4;
export const ROCK = 5;
export const SAND = 6;
export const MUD = 7;
export const ICE = 8;
export const LAVA = 9;
export const SNOW = 10;
export const BASALT = 11;
export const CRYSTAL = 12;

export const IS_SOLID = new Uint8Array(16);
export const IS_LIQUID = new Uint8Array(16);
export const IS_WATER = new Uint8Array(16);
for (const m of [SOIL, ROCK, SAND, MUD, ICE, SNOW, BASALT, CRYSTAL]) IS_SOLID[m] = 1;
for (const m of [FRESH, SALT, BRACKISH, LAVA]) IS_LIQUID[m] = 1;
for (const m of [FRESH, SALT, BRACKISH]) IS_WATER[m] = 1;
/** Mediums that tiny creatures can live inside (soil pores / mud / sand). */
export const IS_PORE = new Uint8Array(16);
for (const m of [SOIL, SAND, MUD, SNOW]) IS_PORE[m] = 1;

// ---- Entity kinds --------------------------------------------------------
export const K_FREE = 0;
export const K_PRODUCER = 1; // photosynthetic / chemosynthetic, mostly sessile or drifting
export const K_ANIMAL = 2; // consumers (everything that eats)
export const K_CARCASS = 3;

// ---- Behaviour states ----------------------------------------------------
export const S_WANDER = 0;
export const S_FORAGE = 1;
export const S_HUNT = 2;
export const S_FLEE = 3;
export const S_REST = 4;
export const S_EAT = 5;
export const S_FIGHT = 6;
export const S_MATE = 7;
export const S_DYING = 8;

// ---- Genes ---------------------------------------------------------------
// Every gene is a float in [0,1]. Meaning is described in genes.ts.
let _g = 0;
const g = () => _g++;
export const G = {
  SIZE: g(), SEGMENTS: g(), LIMBS: g(), FINS: g(), WINGS: g(), TAIL: g(), HEAD: g(), JAWS: g(),
  HORNS: g(), SHELL: g(), ARMOR: g(), EYES: g(),
  SWIM: g(), WALK: g(), CRAWL: g(), BURROW: g(), GLIDE: g(), FLY: g(),
  PHOTO: g(), CHEMO: g(), FILTER: g(), HERB: g(), CARN: g(), SCAV: g(), PARASITE: g(),
  VISION: g(), SMELL: g(), VIBRATION: g(), ELECTRO: g(),
  METAB: g(), TEMP_OPT: g(), TEMP_TOL: g(), HUMID_OPT: g(), SAL_OPT: g(), SAL_TOL: g(),
  DEPTH_PREF: g(), O2_NEED: g(), PRESS_TOL: g(), TOXIN_RES: g(), CUTICLE: g(),
  GILLS: g(), LUNGS: g(), ENDOTHERM: g(),
  CAMO: g(), HUE: g(), SAT: g(), PATTERN: g(),
  REPRO_RATE: g(), REPRO_STRAT: g(), LIFESPAN: g(), INTEL: g(), SOCIAL: g(), AGGR: g(),
  VENOM: g(), BIOLUM: g(), MULTICELL: g(), WOODY: g(), MUT: g(),
} as const;
export const NG = _g;

export const GENE_NAMES: string[] = [];
for (const [k, v] of Object.entries(G)) GENE_NAMES[v] = k;

// ---- Misc helpers --------------------------------------------------------
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
