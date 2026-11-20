import { W, H, AIR, SOIL, ROCK, SAND, LAVA, BASALT, MUD, FRESH, IS_SOLID, IS_WATER } from '../shared/constants';
import { RNG } from '../shared/rng';
import { Noise } from './noise';
import type { BiomeDef } from '../data/biomes';

export interface Terrain {
  medium: Uint8Array;
  surfaceY: Int16Array; // y of first solid cell per column (H if none)
  waterTop: Int16Array; // y of topmost water cell per column (-1 if none)
  vents: { x: number; y: number }[];
}

/** Build the side-view cross-section for a biome. Deterministic from (biome, seed). */
export function generateTerrain(b: BiomeDef, seed: number): Terrain {
  const rng = new RNG(seed ^ 0x51ed);
  const nz = new Noise(seed ^ 0xa11ce);
  const nz2 = new Noise(seed ^ 0xcafe);
  const T = b.terrain;
  const f = new Set(T.features);
  const medium = new Uint8Array(W * H);
  const height = new Float32Array(W);
  const vents: { x: number; y: number }[] = [];
  const ponds: { x0: number; x1: number; y: number }[] = [];

  // 1. base height profile
  for (let x = 0; x < W; x++) {
    let h = T.base * H + (nz.fbm1(x * 0.018 * T.freq, 4) - 0.5) * 2 * T.amp;
    if (f.has('peaks')) {
      const r = 1 - Math.abs(nz2.fbm1(x * 0.012, 3) * 2 - 1);
      h -= r * r * 70 - 20;
    }
    if (f.has('dunes')) h += Math.sin(x * 0.045 + nz.n1(x * 0.01) * 6) * 5 - Math.abs(Math.sin(x * 0.02)) * 4;
    if (f.has('valley')) { const d = (x - W * 0.5) / (W * 0.17); h += 0.22 * H * Math.exp(-d * d); }
    if (f.has('coast')) { const s = Math.min(1, Math.max(0, (x - W * 0.3) / (W * 0.4))); h += s * s * (3 - 2 * s) * 34 - 12; }
    height[x] = h;
  }
  if (f.has('reef')) {
    for (let i = 0; i < 16; i++) {
      const cx = rng.range(10, W - 10), w = rng.range(6, 16), hh = rng.range(4, 13);
      for (let x = Math.max(0, cx - w * 2) | 0; x < Math.min(W, cx + w * 2); x++) { const d = (x - cx) / w; height[x] -= hh * Math.exp(-d * d); }
    }
  }
  if (f.has('cone')) {
    const cx = W * 0.7;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - cx) / 46;
      if (d < 1) height[x] -= 44 * (1 - d) * (1 - d * 0.2);
      if (Math.abs(x - cx) < 7) height[x] += 14;
    }
  }
  if (f.has('pond')) {
    const cx = rng.range(W * 0.25, W * 0.8), w = rng.range(26, 42);
    let sum = 0, n = 0;
    for (let x = cx - w; x < cx + w; x++) { sum += height[Math.min(W - 1, Math.max(0, x | 0))]; n++; }
    const lvl = sum / n;
    for (let x = Math.max(0, cx - w) | 0; x < Math.min(W, cx + w); x++) {
      const d = (x - cx) / w; const dip = 9 * Math.max(0, 1 - d * d);
      height[x] = Math.max(height[x], lvl) + dip; // flatten then dig
    }
    ponds.push({ x0: Math.max(0, cx - w) | 0, x1: Math.min(W, cx + w) | 0, y: Math.round(lvl + 0.5) });
  }
  if (f.has('skyislands') || b.noFloor) for (let x = 0; x < W; x++) height[x] = H + 20;

  // 2. fill layers
  for (let x = 0; x < W; x++) {
    const hy = Math.round(height[x]);
    for (let y = Math.max(0, hy); y < H; y++) {
      const d = y - hy;
      let m: number;
      const topD = T.topDepth + ((nz.n2(x * 0.2, 3.3) * 3) | 0);
      if (d < topD) m = T.top; else if (d < 22 + nz.n1(x * 0.05) * 6) m = T.sub; else m = T.deep;
      if (T.top === SOIL && d >= 1 && d < topD && nz.n2(x * 0.3, y * 0.3) > 0.82) m = ROCK;
      medium[y * W + x] = m;
    }
  }
  // 3. features that add or carve cells
  const put = (x: number, y: number, m: number) => { if (x >= 0 && x < W && y >= 0 && y < H) medium[(y | 0) * W + (x | 0)] = m; };
  if (f.has('rocks')) {
    for (let i = 0; i < 14; i++) {
      const cx = rng.range(4, W - 4), r = rng.range(2, 6), hy = height[Math.round(cx)];
      for (let dx = -r; dx <= r; dx++) for (let dy = 0; dy < r * 0.9; dy++) if ((dx * dx) / (r * r) + (dy * dy) / (r * r * 0.7) < 1) put(cx + dx, hy - dy, ROCK);
    }
  }
  if (f.has('vents')) {
    const n = 4 + rng.int(3);
    for (let i = 0; i < n; i++) {
      const cx = Math.round(rng.range(16, W - 16)), hy = Math.round(height[cx]), ht = 6 + rng.int(9);
      for (let dy = 0; dy < ht; dy++) { const w = 3 - Math.floor((dy / ht) * 2); for (let dx = -w; dx <= w; dx++) put(cx + dx, hy - dy, BASALT); }
      for (let dy = 0; dy < ht; dy++) { put(cx, hy - dy, AIR); }
      vents.push({ x: cx, y: hy - ht });
    }
  }
  if (f.has('caves')) {
    for (let x = 0; x < W; x++) {
      const top = Math.round(height[x]) + 7;
      for (let y = top; y < Math.min(H - 6, top + 70); y++) {
        const n = nz2.fbm2(x * 0.035, y * 0.06, 3);
        if (n > 0.6 || Math.abs(nz.fbm2(x * 0.02 + 40, y * 0.045, 2) - 0.5) < 0.018) medium[y * W + x] = AIR;
      }
    }
  }
  if (f.has('lavapools')) {
    for (let i = 0; i < 3; i++) {
      const cx = Math.round(rng.range(20, W - 20)), w = rng.range(7, 13);
      for (let x = Math.max(0, cx - w) | 0; x < Math.min(W, cx + w); x++) {
        const d = (x - cx) / w, hy = Math.round(height[x]), depth = Math.round(5 * (1 - d * d)) + 1;
        for (let y = hy - 1; y < hy + depth; y++) put(x, y, y > hy ? LAVA : AIR);
        for (let y = hy; y < hy + depth; y++) put(x, y, LAVA);
        put(x, hy + depth, BASALT);
      }
    }
    for (let i = 0; i < 6; i++) { // lava pockets underground
      const cx = rng.range(10, W - 10), cy = rng.range(H * 0.75, H - 10), r = rng.range(3, 7);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r / 2; dy <= r / 2; dy++) if ((dx * dx) / (r * r) + (dy * dy) / (r * r / 4) < 1) put(cx + dx, cy + dy, LAVA);
    }
  }
  if (f.has('cone')) {
    const cx = Math.round(W * 0.7);
    for (let x = cx - 6; x <= cx + 6; x++) { const hy = Math.round(height[x]); for (let y = hy; y < hy + 6; y++) put(x, y, LAVA); }
  }
  if (f.has('skyislands')) {
    for (let i = 0; i < 9; i++) {
      const cx = rng.range(20, W - 20), cy = rng.range(H * 0.25, H * 0.8), rw = rng.range(8, 20), rh = rng.range(3, 7);
      for (let dx = -rw; dx <= rw; dx++) {
        const d = dx / rw, bot = rh * 2.2 * Math.sqrt(Math.max(0, 1 - d * d)) * (0.7 + 0.5 * nz.n2(i * 9.1, dx * 0.2));
        for (let dy = 0; dy < bot; dy++) put(cx + dx, cy + dy, dy < 2 ? SOIL : ROCK);
      }
    }
  }
  // 4. water
  if (T.water > 0) {
    const wy = Math.round(T.water * H);
    for (let x = 0; x < W; x++) for (let y = wy; y < H; y++) if (medium[y * W + x] === AIR) medium[y * W + x] = T.waterType;
  }
  for (const p of ponds) {
    for (let x = p.x0; x < p.x1; x++) for (let y = p.y; y < H; y++) { if (medium[y * W + x] === AIR) medium[y * W + x] = FRESH; else if (IS_SOLID[medium[y * W + x]]) break; }
  }
  // 5. derived
  const surfaceY = new Int16Array(W), waterTop = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    let sy = H, wt = -1;
    for (let y = 0; y < H; y++) {
      const m = medium[y * W + x];
      if (wt < 0 && IS_WATER[m]) wt = y;
      if (IS_SOLID[m] || m === LAVA) { sy = y; break; }
    }
    surfaceY[x] = sy; waterTop[x] = wt;
  }
  void MUD;
  return { medium, surfaceY, waterTop, vents };
}
