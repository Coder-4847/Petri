import { AIR, FRESH, SALT, BRACKISH, SOIL, ROCK, SAND, MUD, ICE, SNOW, BASALT } from '../shared/constants';

/** Environment values, all normalised 0..1. */
export interface Env {
  temp: number; // 0 = frozen (-30C) .. 1 = scorching (+50C)
  humidity: number;
  sunlight: number;
  oxygen: number;
  salinity: number;
  nutrients: number;
  toxicity: number; // toxins / radiation
  gravity: number; // 0.5 = normal
}
export const ENV_KEYS: (keyof Env)[] = ['temp', 'humidity', 'sunlight', 'oxygen', 'salinity', 'nutrients', 'toxicity', 'gravity'];

export interface TerrainSpec {
  base: number; // average ground surface height (fraction of H, 0 = top)
  amp: number; // hill amplitude (cells)
  freq: number; // noise frequency
  water: number; // water surface (fraction of H); 0 = no water
  waterType: number;
  top: number; topDepth: number; sub: number; deep: number;
  features: string[];
}

export interface ParallaxLayer {
  kind: 'hills' | 'mountains' | 'dunes' | 'kelp' | 'coral' | 'trees' | 'clouds' | 'stars' | 'rays' | 'rocks' | 'volcano' | 'reeds' | 'canopy' | 'cave' | 'bubbles';
  color: number; // silhouette colour (will be blended with fog)
  y: number; // vertical position (fraction of viewport height)
  amp: number; // size (fraction of viewport height)
  speed: number; // parallax factor (0 = fixed to screen, 1 = moves with world)
  seed: number;
  alpha?: number;
}

export interface AmbientSpec { kind: 'bubbles' | 'spores' | 'dust' | 'rain' | 'snow' | 'embers' | 'motes' | 'pollen' | 'ash' | 'fireflies' | 'plankton' | 'leaves' | 'sparks' | 'mist'; n: number; }

export interface MediumPal { hi: number; base: number; lo: number; cap?: number; }

export interface BiomeDef {
  id: string; name: string; blurb: string;
  group: 'sea' | 'fresh' | 'land' | 'sky';
  env: Env;
  terrain: TerrainSpec;
  sky: [number, number]; // top, bottom
  water: [number, number]; // shallow, deep
  fog: number;
  light: number; // ambient light multiplier colour (multiply layer), 0xffffff = none
  pal: Partial<Record<number, MediumPal>>;
  ambient: AmbientSpec[];
  parallax: ParallaxLayer[];
  /** world gravity in air relative to normal; sky has no floor */
  noFloor?: boolean;
  enabled?: boolean;
}

const E = (temp: number, humidity: number, sunlight: number, oxygen: number, salinity: number, nutrients: number, toxicity = 0.05, gravity = 0.5): Env =>
  ({ temp, humidity, sunlight, oxygen, salinity, nutrients, toxicity, gravity });

const sandPal: MediumPal = { hi: 0xf3e6b8, base: 0xe2c98d, lo: 0xb99a63 };
const rockPal: MediumPal = { hi: 0x8b97a6, base: 0x68758a, lo: 0x434c5e };
const soilPal: MediumPal = { hi: 0x9a6a46, base: 0x7a4f33, lo: 0x56372a, cap: 0x62c24d };

export const BIOMES: BiomeDef[] = [
  {
    id: 'reef', name: 'Coral Reef', blurb: 'Warm, sunlit shallows crowded with life.', group: 'sea', enabled: true,
    env: E(0.62, 0.9, 0.9, 0.7, 0.36, 0.55),
    terrain: { base: 0.8, amp: 7, freq: 1.2, water: 0.1, waterType: SALT, top: SAND, topDepth: 4, sub: ROCK, deep: ROCK, features: ['reef'] },
    sky: [0x7fd6f5, 0xd6f5f0], water: [0x39cfd0, 0x0a4a7c], fog: 0x1f8fb5, light: 0xffffff,
    pal: { [SAND]: sandPal, [ROCK]: { hi: 0x7d8da0, base: 0x5b6b82, lo: 0x3b4658 } },
    ambient: [{ kind: 'bubbles', n: 40 }, { kind: 'plankton', n: 70 }, { kind: 'motes', n: 30 }],
    parallax: [
      { kind: 'rays', color: 0xbff7ff, y: 0.0, amp: 1, speed: 0.05, seed: 1, alpha: 0.22 },
      { kind: 'coral', color: 0x2a86a8, y: 0.8, amp: 0.3, speed: 0.25, seed: 2, alpha: 0.5 },
      { kind: 'coral', color: 0x1d6c92, y: 0.88, amp: 0.25, speed: 0.4, seed: 3, alpha: 0.55 },
    ],
  },
  {
    id: 'kelp', name: 'Kelp Forest', blurb: 'Cool green waters under swaying golden canopies.', group: 'sea', enabled: true,
    env: E(0.42, 0.9, 0.75, 0.75, 0.35, 0.7),
    terrain: { base: 0.82, amp: 6, freq: 1, water: 0.1, waterType: SALT, top: SAND, topDepth: 3, sub: ROCK, deep: ROCK, features: ['rocks'] },
    sky: [0x9fc7d8, 0xe2eef0], water: [0x4fb39a, 0x0a3a4c], fog: 0x1b6a6a, light: 0xf2ffe8,
    pal: { [SAND]: { hi: 0xcfd0a3, base: 0xa9ad7e, lo: 0x7c8159 }, [ROCK]: { hi: 0x6c8090, base: 0x4a5e6e, lo: 0x2f404f } },
    ambient: [{ kind: 'bubbles', n: 25 }, { kind: 'plankton', n: 60 }, { kind: 'motes', n: 30 }],
    parallax: [
      { kind: 'rays', color: 0xd8ffd0, y: 0, amp: 1, speed: 0.05, seed: 5, alpha: 0.2 },
      { kind: 'kelp', color: 0x1f6d5a, y: 0.85, amp: 0.7, speed: 0.3, seed: 6, alpha: 0.5 },
      { kind: 'kelp', color: 0x185a4c, y: 0.9, amp: 0.55, speed: 0.45, seed: 7, alpha: 0.6 },
    ],
  },
  {
    id: 'ocean', name: 'Open Ocean', blurb: 'Endless blue. Life drifts, hunts and migrates.', group: 'sea', enabled: true,
    env: E(0.5, 0.9, 0.85, 0.72, 0.35, 0.3),
    terrain: { base: 0.93, amp: 4, freq: 0.7, water: 0.08, waterType: SALT, top: SAND, topDepth: 3, sub: ROCK, deep: ROCK, features: [] },
    sky: [0x6aa8e0, 0xcfe6f7], water: [0x2f86c8, 0x061a40], fog: 0x0e4a8a, light: 0xf4fbff,
    pal: { [SAND]: { hi: 0xc9c7b0, base: 0xa5a48e, lo: 0x7c7b6a }, [ROCK]: rockPal },
    ambient: [{ kind: 'bubbles', n: 15 }, { kind: 'plankton', n: 90 }, { kind: 'motes', n: 20 }],
    parallax: [
      { kind: 'rays', color: 0xaee0ff, y: 0, amp: 1, speed: 0.04, seed: 11, alpha: 0.2 },
      { kind: 'rocks', color: 0x0e3b78, y: 0.95, amp: 0.12, speed: 0.3, seed: 12, alpha: 0.45 },
    ],
  },
  {
    id: 'deep', name: 'Deep Ocean', blurb: 'Crushing dark. Glowing things hunt in the black.', group: 'sea',
    env: E(0.2, 0.9, 0.22, 0.6, 0.35, 0.25),
    terrain: { base: 0.93, amp: 5, freq: 0.9, water: 0.02, waterType: SALT, top: MUD, topDepth: 4, sub: ROCK, deep: ROCK, features: ['rocks'] },
    sky: [0x20304a, 0x405a78], water: [0x14487f, 0x030a1c], fog: 0x020610, light: 0xc8d4ff,
    pal: { [MUD]: { hi: 0x4a4c58, base: 0x35363f, lo: 0x22232b }, [ROCK]: { hi: 0x40475a, base: 0x2b3142, lo: 0x181c28 } },
    ambient: [{ kind: 'plankton', n: 80 }, { kind: 'motes', n: 30 }],
    parallax: [
      { kind: 'rocks', color: 0x05080f, y: 0.95, amp: 0.2, speed: 0.3, seed: 21, alpha: 0.7 },
    ],
  },
  {
    id: 'vents', name: 'Hydrothermal Vents', blurb: 'Superheated chimneys feeding life without sunlight.', group: 'sea',
    env: E(0.35, 0.9, 0.05, 0.4, 0.37, 0.8, 0.25),
    terrain: { base: 0.9, amp: 5, freq: 1, water: 0.02, waterType: SALT, top: BASALT, topDepth: 3, sub: ROCK, deep: ROCK, features: ['vents'] },
    sky: [0x101820, 0x1a2430], water: [0x0b2a48, 0x010103], fog: 0x010308, light: 0xd0d8ff,
    pal: { [BASALT]: { hi: 0x4b4650, base: 0x353039, lo: 0x201c24 }, [ROCK]: { hi: 0x453f4c, base: 0x2e2a35, lo: 0x1a171f } },
    ambient: [{ kind: 'plankton', n: 40 }, { kind: 'ash', n: 40 }, { kind: 'bubbles', n: 25 }],
    parallax: [{ kind: 'rocks', color: 0x07050a, y: 0.95, amp: 0.25, speed: 0.3, seed: 31, alpha: 0.7 }],
  },
  {
    id: 'river', name: 'River & Lake', blurb: 'Freshwater shallows, reedy banks and muddy beds.', group: 'fresh',
    env: E(0.5, 0.85, 0.8, 0.8, 0.02, 0.6),
    terrain: { base: 0.46, amp: 6, freq: 0.9, water: 0.5, waterType: FRESH, top: SOIL, topDepth: 5, sub: ROCK, deep: ROCK, features: ['valley'] },
    sky: [0x78c0ee, 0xeaf6ff], water: [0x59b3b0, 0x1b5260], fog: 0x2b7d85, light: 0xffffff,
    pal: { [MUD]: { hi: 0x7a6548, base: 0x5f4d38, lo: 0x403325 }, [SOIL]: { ...soilPal, cap: 0x5fb04a } },
    ambient: [{ kind: 'bubbles', n: 12 }, { kind: 'pollen', n: 25 }, { kind: 'motes', n: 20 }],
    parallax: [
      { kind: 'hills', color: 0x7ab88a, y: 0.45, amp: 0.2, speed: 0.1, seed: 41, alpha: 0.7 },
      { kind: 'reeds', color: 0x3a7a4a, y: 0.5, amp: 0.1, speed: 0.4, seed: 42, alpha: 0.5 },
      { kind: 'clouds', color: 0xffffff, y: 0.15, amp: 0.12, speed: 0.05, seed: 43, alpha: 0.8 },
    ],
  },
  {
    id: 'swamp', name: 'Swamp', blurb: 'Murky, humid, thick with decay and hidden teeth.', group: 'fresh',
    env: E(0.62, 0.95, 0.5, 0.55, 0.05, 0.9),
    terrain: { base: 0.5, amp: 3, freq: 1.4, water: 0.5, waterType: FRESH, top: MUD, topDepth: 6, sub: SOIL, deep: ROCK, features: [] },
    sky: [0x8aa86a, 0xc4d6a2], water: [0x6b7f3c, 0x26331a], fog: 0x3d4a22, light: 0xe0f0c0,
    pal: { [MUD]: { hi: 0x6b5a36, base: 0x4f4228, lo: 0x33291a, cap: 0x5a7a30 }, [SOIL]: { hi: 0x6a5a38, base: 0x4c3f27, lo: 0x32281a, cap: 0x587a2c } },
    ambient: [{ kind: 'fireflies', n: 25 }, { kind: 'mist', n: 18 }, { kind: 'spores', n: 30 }, { kind: 'bubbles', n: 10 }],
    parallax: [
      { kind: 'trees', color: 0x40552a, y: 0.45, amp: 0.4, speed: 0.15, seed: 51, alpha: 0.6 },
      { kind: 'trees', color: 0x2f4220, y: 0.5, amp: 0.3, speed: 0.35, seed: 52, alpha: 0.6 },
    ],
  },
  {
    id: 'mangrove', name: 'Mangrove', blurb: 'Tangled roots where river meets sea.', group: 'fresh',
    env: E(0.7, 0.9, 0.75, 0.7, 0.18, 0.75),
    terrain: { base: 0.5, amp: 3, freq: 1.2, water: 0.5, waterType: BRACKISH, top: MUD, topDepth: 5, sub: SOIL, deep: ROCK, features: ['coast'] },
    sky: [0x7fc6ea, 0xe4f3ee], water: [0x5aa890, 0x1c4b48], fog: 0x276662, light: 0xffffff,
    pal: { [MUD]: { hi: 0x7a6a4a, base: 0x5d4e36, lo: 0x403525, cap: 0x4f8a3a }, [SAND]: sandPal },
    ambient: [{ kind: 'bubbles', n: 12 }, { kind: 'fireflies', n: 10 }, { kind: 'motes', n: 20 }],
    parallax: [
      { kind: 'trees', color: 0x3f7a4a, y: 0.5, amp: 0.35, speed: 0.2, seed: 61, alpha: 0.55 },
      { kind: 'clouds', color: 0xffffff, y: 0.12, amp: 0.1, speed: 0.05, seed: 62, alpha: 0.7 },
    ],
  },
  {
    id: 'grassland', name: 'Grassland', blurb: 'Rolling green hills under a wide sky.', group: 'land', enabled: true,
    env: E(0.52, 0.55, 0.85, 0.75, 0.02, 0.6),
    terrain: { base: 0.5, amp: 9, freq: 0.9, water: 0, waterType: FRESH, top: SOIL, topDepth: 8, sub: SOIL, deep: ROCK, features: ['pond'] },
    sky: [0x62b6ec, 0xeaf7ff], water: [0x4aa8c0, 0x1b5a78], fog: 0xbfe0f5, light: 0xffffff,
    pal: { [SOIL]: { hi: 0x9a6a46, base: 0x7a4f33, lo: 0x563827, cap: 0x68c850 } },
    ambient: [{ kind: 'pollen', n: 35 }, { kind: 'motes', n: 20 }, { kind: 'leaves', n: 8 }],
    parallax: [
      { kind: 'clouds', color: 0xffffff, y: 0.2, amp: 0.14, speed: 0.04, seed: 71, alpha: 0.9 },
      { kind: 'mountains', color: 0x8fb2d4, y: 0.5, amp: 0.3, speed: 0.08, seed: 72, alpha: 0.7 },
      { kind: 'hills', color: 0x7cc176, y: 0.5, amp: 0.15, speed: 0.2, seed: 73, alpha: 0.8 },
      { kind: 'hills', color: 0x5aa85a, y: 0.52, amp: 0.1, speed: 0.4, seed: 74, alpha: 0.9 },
    ],
  },
  {
    id: 'savanna', name: 'Savanna', blurb: 'Golden grass, lone acacias, great herds.', group: 'land',
    env: E(0.7, 0.35, 0.95, 0.75, 0.02, 0.45),
    terrain: { base: 0.52, amp: 5, freq: 0.7, water: 0, waterType: FRESH, top: SOIL, topDepth: 8, sub: SOIL, deep: ROCK, features: ['pond'] },
    sky: [0xf0a05a, 0xfde8b8], water: [0x5fa8a0, 0x24585e], fog: 0xf5d9a0, light: 0xfff0d8,
    pal: { [SOIL]: { hi: 0xb98a52, base: 0x956a3c, lo: 0x6b4a2a, cap: 0xc8b04a } },
    ambient: [{ kind: 'dust', n: 35 }, { kind: 'pollen', n: 15 }, { kind: 'motes', n: 15 }],
    parallax: [
      { kind: 'clouds', color: 0xfff2dc, y: 0.22, amp: 0.1, speed: 0.04, seed: 81, alpha: 0.8 },
      { kind: 'mountains', color: 0xd09a6a, y: 0.52, amp: 0.2, speed: 0.08, seed: 82, alpha: 0.6 },
      { kind: 'trees', color: 0x8a6a30, y: 0.54, amp: 0.15, speed: 0.25, seed: 83, alpha: 0.7 },
    ],
  },
  {
    id: 'plains', name: 'Plains', blurb: 'Windswept, flat and cool. Nowhere to hide.', group: 'land',
    env: E(0.4, 0.45, 0.8, 0.75, 0.02, 0.5),
    terrain: { base: 0.55, amp: 3, freq: 0.6, water: 0, waterType: FRESH, top: SOIL, topDepth: 8, sub: SOIL, deep: ROCK, features: [] },
    sky: [0x7fb0d8, 0xe6edf2], water: [0x6aa8c0, 0x2a5a74], fog: 0xd8e4ea, light: 0xf4f8ff,
    pal: { [SOIL]: { hi: 0x8a6a48, base: 0x6e5238, lo: 0x4c3828, cap: 0x9ab85a } },
    ambient: [{ kind: 'dust', n: 25 }, { kind: 'pollen', n: 20 }, { kind: 'leaves', n: 8 }],
    parallax: [
      { kind: 'clouds', color: 0xf8fbff, y: 0.2, amp: 0.15, speed: 0.06, seed: 91, alpha: 0.85 },
      { kind: 'hills', color: 0xa8b8a0, y: 0.55, amp: 0.08, speed: 0.1, seed: 92, alpha: 0.8 },
    ],
  },
  {
    id: 'forest', name: 'Temperate Forest', blurb: 'Dappled light, falling leaves, quiet shadows.', group: 'land',
    env: E(0.45, 0.7, 0.55, 0.78, 0.02, 0.7),
    terrain: { base: 0.52, amp: 7, freq: 1, water: 0, waterType: FRESH, top: SOIL, topDepth: 10, sub: SOIL, deep: ROCK, features: ['pond'] },
    sky: [0x6aa2c0, 0xc8e0d8], water: [0x4a8a8a, 0x1b4a54], fog: 0x9cc0a8, light: 0xe6f4dc,
    pal: { [SOIL]: { hi: 0x7a5a3a, base: 0x5d442e, lo: 0x40301f, cap: 0x4a9a3c } },
    ambient: [{ kind: 'leaves', n: 25 }, { kind: 'motes', n: 25 }, { kind: 'spores', n: 15 }],
    parallax: [
      { kind: 'mountains', color: 0x7a9a96, y: 0.5, amp: 0.3, speed: 0.07, seed: 101, alpha: 0.55 },
      { kind: 'trees', color: 0x3d6a46, y: 0.55, amp: 0.45, speed: 0.2, seed: 102, alpha: 0.6 },
      { kind: 'trees', color: 0x2c5236, y: 0.58, amp: 0.4, speed: 0.4, seed: 103, alpha: 0.65 },
    ],
  },
  {
    id: 'rainforest', name: 'Rainforest', blurb: 'Dense, dripping, loud. The richest life on land.', group: 'land',
    env: E(0.75, 0.95, 0.4, 0.8, 0.02, 0.85),
    terrain: { base: 0.55, amp: 5, freq: 1.1, water: 0, waterType: FRESH, top: SOIL, topDepth: 8, sub: SOIL, deep: ROCK, features: ['pond'] },
    sky: [0x4a8a7a, 0x9ccab0], water: [0x3a8a7a, 0x12403f], fog: 0x6ca88a, light: 0xd8f5d0,
    pal: { [SOIL]: { hi: 0x6a4a32, base: 0x4f3626, lo: 0x35241a, cap: 0x2f8a3a } },
    ambient: [{ kind: 'rain', n: 60 }, { kind: 'mist', n: 18 }, { kind: 'fireflies', n: 18 }, { kind: 'leaves', n: 10 }],
    parallax: [
      { kind: 'canopy', color: 0x2b6a44, y: 0.5, amp: 0.55, speed: 0.15, seed: 111, alpha: 0.55 },
      { kind: 'canopy', color: 0x1f5236, y: 0.55, amp: 0.5, speed: 0.35, seed: 112, alpha: 0.6 },
    ],
  },
  {
    id: 'desert', name: 'Desert', blurb: 'Scorched dunes and cold, clear nights.', group: 'land',
    env: E(0.82, 0.08, 1.0, 0.75, 0.04, 0.12),
    terrain: { base: 0.58, amp: 8, freq: 0.6, water: 0, waterType: FRESH, top: SAND, topDepth: 12, sub: SAND, deep: ROCK, features: ['dunes'] },
    sky: [0x58a8e0, 0xfbe6b4], water: [0x5aa8a0, 0x24585e], fog: 0xf8dca0, light: 0xfff2d0,
    pal: { [SAND]: { hi: 0xf6d88e, base: 0xe8b866, lo: 0xbd8a46 }, [ROCK]: { hi: 0xa87a5a, base: 0x865a40, lo: 0x5a3c2c } },
    ambient: [{ kind: 'dust', n: 40 }, { kind: 'motes', n: 10 }],
    parallax: [
      { kind: 'clouds', color: 0xffffff, y: 0.18, amp: 0.08, speed: 0.04, seed: 121, alpha: 0.55 },
      { kind: 'mountains', color: 0xd8a070, y: 0.58, amp: 0.25, speed: 0.08, seed: 122, alpha: 0.6 },
      { kind: 'dunes', color: 0xe0ac6a, y: 0.6, amp: 0.12, speed: 0.25, seed: 123, alpha: 0.8 },
    ],
  },
  {
    id: 'tundra', name: 'Tundra', blurb: 'Frozen ground, bitter wind, aurora in the dark.', group: 'land',
    env: E(0.12, 0.4, 0.4, 0.8, 0.02, 0.3),
    terrain: { base: 0.55, amp: 5, freq: 0.8, water: 0, waterType: FRESH, top: SNOW, topDepth: 6, sub: SOIL, deep: ROCK, features: ['pond'] },
    sky: [0x34507a, 0xc4d8ec], water: [0x6a9ac0, 0x234a6a], fog: 0xdbe8f4, light: 0xe0ecff,
    pal: { [SNOW]: { hi: 0xffffff, base: 0xe4eefa, lo: 0xb4c6dc }, [SOIL]: { hi: 0x6f6458, base: 0x544b42, lo: 0x383029, cap: 0xdfe9f2 }, [ICE]: { hi: 0xd8f4ff, base: 0xa8d8f0, lo: 0x78b0d4 } },
    ambient: [{ kind: 'snow', n: 80 }, { kind: 'motes', n: 8 }],
    parallax: [
      { kind: 'stars', color: 0xffffff, y: 0.1, amp: 0.3, speed: 0.02, seed: 131, alpha: 0.5 },
      { kind: 'mountains', color: 0xb8cce4, y: 0.55, amp: 0.3, speed: 0.08, seed: 132, alpha: 0.75 },
      { kind: 'hills', color: 0xd6e2f0, y: 0.57, amp: 0.1, speed: 0.25, seed: 133, alpha: 0.85 },
    ],
  },
  {
    id: 'mountains', name: 'Mountains & Caves', blurb: 'Thin air, jagged peaks, and dark hollow caverns.', group: 'land',
    env: E(0.25, 0.5, 0.75, 0.6, 0.02, 0.3),
    terrain: { base: 0.52, amp: 34, freq: 0.7, water: 0, waterType: FRESH, top: ROCK, topDepth: 3, sub: ROCK, deep: ROCK, features: ['peaks', 'caves', 'pond'] },
    sky: [0x4a86c8, 0xcfe0f2], water: [0x5a9ac0, 0x234a6a], fog: 0xc0d2e4, light: 0xf4f8ff,
    pal: { [ROCK]: { hi: 0x9aa4b2, base: 0x727d8e, lo: 0x4a5262, cap: 0xf4f8ff }, [SNOW]: { hi: 0xffffff, base: 0xe4eefa, lo: 0xb4c6dc } },
    ambient: [{ kind: 'snow', n: 30 }, { kind: 'dust', n: 12 }, { kind: 'mist', n: 10 }],
    parallax: [
      { kind: 'clouds', color: 0xffffff, y: 0.22, amp: 0.13, speed: 0.04, seed: 141, alpha: 0.85 },
      { kind: 'mountains', color: 0x9cb4d0, y: 0.5, amp: 0.45, speed: 0.07, seed: 142, alpha: 0.6 },
      { kind: 'mountains', color: 0x7890b0, y: 0.54, amp: 0.4, speed: 0.15, seed: 143, alpha: 0.7 },
    ],
  },
  {
    id: 'volcanic', name: 'Volcanic Land', blurb: 'Black rock, rivers of fire and ash-choked skies.', group: 'land',
    env: E(0.88, 0.2, 0.55, 0.65, 0.03, 0.35, 0.3),
    terrain: { base: 0.55, amp: 10, freq: 0.9, water: 0, waterType: FRESH, top: BASALT, topDepth: 5, sub: BASALT, deep: ROCK, features: ['lavapools', 'cone'] },
    sky: [0x3a1a24, 0xc8602a], water: [0x5a8a9a, 0x1b4050], fog: 0x6a2a1a, light: 0xffd8b8,
    pal: { [BASALT]: { hi: 0x58505a, base: 0x3a343f, lo: 0x221e27, cap: 0x2c2730 }, [ROCK]: { hi: 0x4a424c, base: 0x322d37, lo: 0x1f1b24 } },
    ambient: [{ kind: 'embers', n: 50 }, { kind: 'ash', n: 50 }, { kind: 'sparks', n: 10 }],
    parallax: [
      { kind: 'volcano', color: 0x2a1a22, y: 0.55, amp: 0.45, speed: 0.07, seed: 151, alpha: 0.85 },
      { kind: 'mountains', color: 0x3a2228, y: 0.56, amp: 0.25, speed: 0.15, seed: 152, alpha: 0.8 },
      { kind: 'clouds', color: 0x5a3a3a, y: 0.15, amp: 0.15, speed: 0.04, seed: 153, alpha: 0.7 },
    ],
  },
  {
    id: 'sky', name: 'The Sky', blurb: 'High over the clouds. Only the airborne belong here.', group: 'sky', noFloor: true,
    env: E(0.3, 0.5, 1.0, 0.55, 0.0, 0.15),
    terrain: { base: 2, amp: 0, freq: 1, water: 0, waterType: FRESH, top: ROCK, topDepth: 3, sub: ROCK, deep: ROCK, features: ['skyislands'] },
    sky: [0x2a68c8, 0xcfeaff], water: [0x5a9ac0, 0x234a6a], fog: 0xdcefff, light: 0xffffff,
    pal: { [ROCK]: { hi: 0xb4c0cc, base: 0x8a98a8, lo: 0x5a6676, cap: 0x7ad06a } },
    ambient: [{ kind: 'mist', n: 14 }, { kind: 'motes', n: 30 }, { kind: 'pollen', n: 25 }],
    parallax: [
      { kind: 'clouds', color: 0xffffff, y: 0.25, amp: 0.2, speed: 0.1, seed: 161, alpha: 0.7 },
      { kind: 'clouds', color: 0xffffff, y: 0.55, amp: 0.25, speed: 0.25, seed: 162, alpha: 0.7 },
      { kind: 'clouds', color: 0xf2f8ff, y: 0.85, amp: 0.3, speed: 0.5, seed: 163, alpha: 0.8 },
    ],
  },
];

export const BIOME_BY_ID: Record<string, BiomeDef> = Object.fromEntries(BIOMES.map((b) => [b.id, b]));
export const BIOME_INDEX: Record<string, number> = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));

/** Default colours for solids if a biome does not override them. */
export const DEFAULT_PAL: Record<number, MediumPal> = {
  [SOIL]: soilPal, [ROCK]: rockPal, [SAND]: sandPal,
  [MUD]: { hi: 0x7a6548, base: 0x5f4d38, lo: 0x403325 },
  [ICE]: { hi: 0xd8f4ff, base: 0xa8d8f0, lo: 0x78b0d4 },
  [SNOW]: { hi: 0xffffff, base: 0xe4eefa, lo: 0xb4c6dc },
  [BASALT]: { hi: 0x58505a, base: 0x3a343f, lo: 0x221e27 },
};
export { AIR };
