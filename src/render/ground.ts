// Ground painter: turns the cell grid into detailed pixel art at PX texels per cell.
// Every material has its own pattern (Voronoi stones, strata, ripples, basalt columns, crystal facets…),
// shaded with a hue-shifted palette ramp, rim-lit where it meets the air and sinking into ordered-dithered
// darkness with depth so the surface reads clearly. Decorations (grass, flowers, stalactites, snow,
// pebbles, roots, fossils, ores) are added on top.
import { W, H, AIR, LAVA, ICE, IS_SOLID, IS_WATER, SNOW, SOIL, ROCK, SAND, MUD, BASALT, CRYSTAL } from '../shared/constants';
import { DEFAULT_PAL, type BiomeDef, type MediumPal } from '../data/biomes';
import { hexR, hexG, hexB, hash2, makeCanvas } from './util';

export const PX = 4;
const N = 8; // shades per ramp

// ---------------------------------------------------------------- colour
function rgb2hsl(c: number): [number, number, number] {
  const r = hexR(c) / 255, g = hexG(c) / 255, b = hexB(c) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const a = s * Math.min(l, 1 - l), f = (n: number) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return ((Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255));
}
/** 8-step ramp around a material palette: shadows drift cool and saturated, highlights warm and paler. */
function ramp(p: MediumPal): number[] {
  const [h, s, l] = rgb2hsl(p.base), lo = rgb2hsl(p.lo)[2], hi = rgb2hsl(p.hi)[2];
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); // 0 dark .. 1 light
    const L = t < 0.55 ? lo * 0.35 + (l - lo * 0.35) * (t / 0.55) : l + (Math.min(0.97, hi * 1.06) - l) * ((t - 0.55) / 0.45);
    // shadows lean toward blue-violet, highlights toward warm yellow (classic pixel-art hue shifting)
    const target = t < 0.5 ? 0.7 : 0.13, amt = (t < 0.5 ? (0.5 - t) * 0.22 : (t - 0.5) * 0.12) * (s > 0.08 ? 1 : 0.4);
    let dh = target - h; if (dh > 0.5) dh -= 1; if (dh < -0.5) dh += 1;
    out.push(hsl(h + dh * amt, s * (t < 0.5 ? 1 + (0.5 - t) * 0.12 : 1 - (t - 0.5) * 0.45), L));
  }
  return out;
}
const pk = (c: number) => (255 << 24) | (hexB(c) << 16) | (hexG(c) << 8) | hexR(c);
const mixc = (a: number, b: number, t: number) => ((Math.round(hexR(a) + (hexR(b) - hexR(a)) * t) << 16) | (Math.round(hexG(a) + (hexG(b) - hexG(a)) * t) << 8) | Math.round(hexB(a) + (hexB(b) - hexB(a)) * t));

// ---------------------------------------------------------------- noise
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, s: number) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 2) * 0.15;
/** Voronoi on a jittered grid: returns nearest id, distance to it and the gap to the 2nd nearest (edges). */
function voronoi(x: number, y: number, cell: number, s: number, sy = 1) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / (cell * sy));
  let d1 = 1e9, d2 = 1e9, id = 0, fx = 0, fy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j;
    const px = (cx + 0.15 + hash2(cx, cy, s) * 0.7) * cell, py = (cy + 0.15 + hash2(cx, cy, s + 7) * 0.7) * cell * sy;
    const dx = x - px, dy = (y - py) / sy, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = cx * 7919 + cy * 104729; fx = px; fy = py; } else if (d < d2) d2 = d;
  }
  return { id, edge: Math.sqrt(d2) - Math.sqrt(d1), dy: (y - fy) / (cell * sy), dx: (x - fx) / cell };
}

// ---------------------------------------------------------------- biome flavour
const FLOWERS: Record<string, number[]> = {
  grassland: [0xfff27a, 0xffffff, 0xff8ad8, 0xb48aff], plains: [0xfff27a, 0xffffff], forest: [0xffffff, 0xff9ac0, 0xfff27a], river: [0xffffff, 0x9adfff, 0xfff27a],
  rainforest: [0xff4a7a, 0xffb02a, 0xc06aff, 0xffffff], mountains: [0xb48aff, 0xffffff], mangrove: [0xffffff], swamp: [0xfff6a0],
};
const DRY: Record<string, boolean> = { savanna: true, desert: true };

export interface GroundOut { canvas: HTMLCanvasElement }

/** Paint the ground of one biome. Returns a canvas W*PX x H*PX. */
export function paintGround(def: BiomeDef, medium: Uint8Array): HTMLCanvasElement {
  const cw = W * PX, ch = H * PX;
  const canvas = makeCanvas(cw, ch), ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cw, ch), buf = new Uint32Array(img.data.buffer);
  const palOf = (m: number): MediumPal => def.pal[m] ?? DEFAULT_PAL[m] ?? DEFAULT_PAL[ROCK];
  const ramps = new Map<number, number[]>();
  const R = (m: number) => { let r = ramps.get(m); if (!r) { r = ramp(palOf(m)); ramps.set(m, r); } return r; };
  const capPal = palOf(SOIL).cap ?? 0x5fb04a, cap = ramp({ base: capPal, hi: mixc(capPal, 0xfff6c0, 0.45), lo: mixc(capPal, 0x001810, 0.55) });
  const dryCap = ramp({ base: 0xc8a850, hi: 0xf0dc8a, lo: 0x6a5228 });
  const grass = DRY[def.id] ? dryCap : cap;
  const deepCol = mixc(palOf(ROCK).lo, 0x05060a, 0.7);
  const cold = def.env.temp < 0.3;
  const solidAt = (x: number, y: number) => x < 0 || x >= W ? true : y < 0 ? false : y >= H ? !def.noFloor : IS_SOLID[medium[y * W + x]] === 1;

  // distance (cells) from each solid cell to open space, via two-pass chamfer; open space under water counts
  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = IS_SOLID[medium[i]] ? 999 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!dist[i]) continue; let d = dist[i]; if (x > 0) d = Math.min(d, dist[i - 1] + 1); if (y > 0) d = Math.min(d, dist[i - W] + 1); if (x > 0 && y > 0) d = Math.min(d, dist[i - W - 1] + 1.41); if (x < W - 1 && y > 0) d = Math.min(d, dist[i - W + 1] + 1.41); dist[i] = d; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!dist[i]) continue; let d = dist[i]; if (x < W - 1) d = Math.min(d, dist[i + 1] + 1); if (y < H - 1) d = Math.min(d, dist[i + W] + 1); if (x < W - 1 && y < H - 1) d = Math.min(d, dist[i + W + 1] + 1.41); if (x > 0 && y < H - 1) d = Math.min(d, dist[i + W - 1] + 1.41); dist[i] = d; }
  const dAt = (x: number, y: number) => { const cx = Math.max(0, Math.min(W - 1, x | 0)), cy = Math.max(0, Math.min(H - 1, y | 0)); return dist[cy * W + cx]; };
  // smooth distance at texel resolution (bilinear over cell centres)
  const dSmooth = (X: number, Y: number) => {
    const fx = X / PX - 0.5, fy = Y / PX - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    const a = dAt(x0, y0), b = dAt(x0 + 1, y0), c = dAt(x0, y0 + 1), d = dAt(x0 + 1, y0 + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
  // depth of each solid cell below the first exposed surface in its column (for strata and topsoil)
  const surf = new Int16Array(W); for (let x = 0; x < W; x++) { let y = 0; while (y < H && !IS_SOLID[medium[y * W + x]]) y++; surf[x] = y; }
  // cave air: open cells with ground above and not far below
  const cave = new Uint8Array(W * H);
  if (!def.noFloor) for (let x = 0; x < W; x++) { let roof = false; for (let y = 0; y < H; y++) { const i = y * W + x; if (IS_SOLID[medium[i]]) { roof = true; continue; } if (roof && medium[i] === AIR) { let k = y; while (k < H && k - y < 45 && !IS_SOLID[medium[k * W + x]]) k++; if (k < H && k - y < 45) cave[i] = 1; } } }

  // ---------------------------------------------------------- solids
  for (let Y = 0; Y < ch; Y++) {
    const cy = (Y / PX) | 0;
    for (let X = 0; X < cw; X++) {
      const cx = (X / PX) | 0, i = cy * W + cx, m = medium[i];
      if (!IS_SOLID[m]) {
        if (cave[i]) { // cave back wall: dim, low-contrast stone
          const vv = voronoi(X, Y, 11, 91); const r = R(ROCK);
          let s = 1.6 + (hash2(vv.id, 1, 3) - 0.5) * 0.8 + (vv.dy < -0.25 ? 0.4 : 0) - (vv.edge < 1.2 ? 1 : 0);
          s -= Math.min(1.5, dSmoothAir(cx, cy) * 0.0);
          buf[Y * cw + X] = pk(mixc(r[Math.max(0, Math.min(N - 1, Math.floor(s + bayer(X, Y))))], 0x020308, 0.55));
        }
        continue;
      }
      const r = m === SNOW ? R(SNOW) : R(m);
      const d = dSmooth(X, Y), dep = Math.max(0, cy - surf[cx]);
      const rnd = hash2(X, Y, 1);
      let s = 4.2; // shade on the ramp (0..N-1)
      let override = -1;
      switch (m) {
        case ROCK: {
          const v = voronoi(X, Y, 9 + (dep > 12 ? 4 : 0), 11, 0.8);
          s = 3.6 + (hash2(v.id, 0, 5) - 0.5) * 1.6 - v.dy * 1.8;
          if (v.edge < 1.1) s = 1.2; else if (v.edge < 2.2 && v.dy < 0) s += 0.9;
          if (rnd > 0.985) s += 1.5;
          // ore veins and gems deep down
          if (dep > 14) { const o = vnoise(X * 0.06, Y * 0.06, 33); if (o > 0.86 && hash2(X >> 1, Y >> 1, 34) > 0.7) override = (o > 0.9 ? 0xf2c14a : hash2(v.id, 2, 2) > 0.5 ? 0xd88a4a : 0x6ad0e8); }
          break;
        }
        case SOIL: {
          const n = fbm(X * 0.09, Y * 0.12, 3);
          s = 3.3 + (n - 0.5) * 2.4 + (dep < 2 ? -0.5 : 0); // dark rich topsoil
          if (((Y + Math.round(Math.sin(X * 0.05) * 3)) % 23) === 0 && dep > 4) s -= 0.8; // faint strata
          // pebbles
          const pv = voronoi(X, Y, 14, 41);
          if (Math.sqrt(pv.dx * pv.dx + pv.dy * pv.dy * 1.6) < 0.16 && hash2(pv.id, 9, 1) > 0.55) { const rr = R(ROCK); override = rr[pv.dy < -0.05 ? 6 : pv.dy > 0.06 ? 2 : 4]; }
          // roots near the top
          if (dep < 4 && grassy(def) && Math.abs(Math.sin(X * 0.7 + Math.sin(Y * 0.5) * 1.4)) < 0.06 && hash2(X >> 3, 0, 8) > 0.6) s = 1.5;
          // ammonite fossils deep down
          if (dep > 10 && hash2(cx >> 3, cy >> 3, 77) > 0.95) { const fx = (cx >> 3) * 8 * PX + 16, fy = (cy >> 3) * 8 * PX + 14; const dx = X - fx, dy = Y - fy, rr = Math.sqrt(dx * dx + dy * dy); if (rr < 6) { const ang = Math.atan2(dy, dx); const spiral = (rr - ang * 0.9 + 20) % 2.8; override = spiral < 1 ? 0x8a7c62 : rr < 1.5 ? 0xa89a7c : 0xd8cdb0; } }
          break;
        }
        case SAND: {
          const rip = Math.sin(X * 0.32 + Math.sin(Y * 0.16 + X * 0.02) * 2.2 + Y * 0.9);
          s = 4.4 + rip * 0.55 + (fbm(X * 0.05, Y * 0.05, 4) - 0.5) * 1.4 + (rnd > 0.94 ? 1 : rnd < 0.05 ? -1 : 0);
          if (dep > 6) s -= 0.6;
          if (rnd > 0.997) override = 0xf6eee0; // shell
          break;
        }
        case MUD: {
          s = 2.8 + (fbm(X * 0.08, Y * 0.2, 5) - 0.5) * 2 + (Math.sin(X * 0.15 + Y * 0.04) > 0.92 ? 1.4 : 0);
          if (rnd > 0.992) s = 5.5;
          break;
        }
        case ICE: {
          const streak = Math.abs(Math.sin((X + Y * 0.6) * 0.11 + vnoise(X * 0.03, Y * 0.03, 6) * 4));
          s = 4.2 + (streak > 0.96 ? 2.2 : 0) + (fbm(X * 0.04, Y * 0.04, 7) - 0.5) * 1.6;
          const v = voronoi(X, Y, 20, 61); if (v.edge < 0.8) s = 2.2;
          if (rnd > 0.995) override = 0xffffff;
          break;
        }
        case SNOW: {
          s = 6.2 + (fbm(X * 0.06, Y * 0.06, 8) - 0.5) * 1.2 - Math.min(2, dep * 0.25);
          if (rnd > 0.993) override = 0xffffff;
          break;
        }
        case BASALT: {
          const col = Math.floor(X / 7 + vnoise(Y * 0.02, X * 0.001, 9) * 1.5), lx = X - col * 7;
          s = 3.2 + (hash2(col, Math.floor(Y / 22), 3) - 0.5) * 1.4 + (lx < 2 ? 1.1 : lx > 5 ? -0.8 : 0);
          if (lx === 0 || (Y + col * 5) % 22 === 0) s = 1;
          break;
        }
        case CRYSTAL: {
          const v = voronoi(X, Y, 8, 71, 1.6);
          const hue = hash2(v.id, 4, 4);
          override = hsl(hue > 0.5 ? 0.52 : 0.82, 0.75, 0.42 + (v.dx - v.dy) * 0.25 + (v.edge < 1 ? -0.15 : 0) + (rnd > 0.98 ? 0.35 : 0));
          break;
        }
      }
      // light: rim on edges that face open space, ambient occlusion with depth
      const up = !solidAt(cx, cy - 1), lf = !solidAt(cx - 1, cy), rt = !solidAt(cx + 1, cy), dn = !solidAt(cx, cy + 1);
      const ty = Y - cy * PX, tx = X - cx * PX;
      if (up && ty === 0) s += 2.2; else if (up && ty === 1) s += 1;
      if (lf && tx === 0) s += 1; if (rt && tx === PX - 1) s -= 0.8; if (dn && ty === PX - 1) s -= 1.6;
      const ao = Math.max(0, d - 1.2);
      const aoK = m === SAND ? 0.17 : m === SNOW || m === ICE ? 0.12 : 0.3;
      s -= Math.min(3, ao * aoK);
      let c = override >= 0 ? override : r[Math.max(0, Math.min(N - 1, Math.floor(s + bayer(X, Y) - 0.5)))];
      if (override >= 0 && ao > 1) c = mixc(c, r[1], Math.min(0.7, ao * 0.1));
      // the deep underground fades to near-black (dithered), so attention stays on the surface
      const fade = Math.max(0, Math.min(1, (d - 11) / 22));
      if (fade > 0) c = mixc(c, deepCol, Math.min(0.92, fade * 0.95 + (bayer(X, Y) - 0.5) * 0.12));
      buf[Y * cw + X] = pk(c);
    }
  }

  // ---------------------------------------------------------- decorations
  const put = (X: number, Y: number, col: number) => { if (X >= 0 && Y >= 0 && X < cw && Y < ch) buf[Y * cw + X] = pk(col); };
  const isAirTexel = (X: number, Y: number) => { const cx = (X / PX) | 0, cy = (Y / PX) | 0; if (cy < 0 || cy >= H || cx < 0 || cx >= W) return false; const m = medium[cy * W + cx]; return m === AIR && !cave[cy * W + cx] ? true : m === AIR; };
  const flowers = FLOWERS[def.id];
  for (let cx = 0; cx < W; cx++) for (let cy = 1; cy < H; cy++) {
    const i = cy * W + cx, m = medium[i]; if (!IS_SOLID[m]) continue;
    const above = medium[i - W];
    // turf + grass on exposed soil in air
    if (m === SOIL && above === AIR && palOf(SOIL).cap) {
      for (let tx = 0; tx < PX; tx++) {
        const X = cx * PX + tx, top = cy * PX;
        const rag = 2 + (hash2(X, 3, 5) > 0.5 ? 1 : 0) + (hash2(X >> 1, 4, 6) > 0.7 ? 1 : 0);
        for (let k = 0; k < rag; k++) put(X, top + k, grass[k === 0 ? 6 : k === rag - 1 ? 2 : 4 - (hash2(X, k, 2) > 0.6 ? 1 : 0)]);
        const hr = hash2(X, cy, 9); const tall = DRY[def.id] ? 3 + Math.floor(hr * 6) : 1 + Math.floor(hr * hr * 6);
        const lean = hash2(X >> 2, cy, 12) > 0.5 ? 1 : -1;
        if (hr > (cold ? 0.7 : 0.25)) for (let k = 1; k <= tall; k++) { const XX = X + (k > tall * 0.6 && hr > 0.6 ? lean : 0), YY = top - k; if (isAirTexel(XX, YY)) put(XX, YY, grass[Math.min(N - 1, 3 + Math.floor((k / tall) * 4))]); }
        if (flowers && hr > 0.965 && tall >= 2) { const fc = flowers[Math.floor(hash2(X, cy, 14) * flowers.length)]; put(X, top - tall - 1, fc); if (hash2(X, cy, 15) > 0.5) { put(X - 1, top - tall, fc); put(X + 1, top - tall, fc); put(X, top - tall, 0xfff2a0); } }
      }
    }
    // snow caps on cold exposed ground
    if ((cold || def.id === 'mountains' && cy < H * 0.45) && above === AIR && m !== SNOW && m !== ICE) {
      const sr = R(SNOW);
      for (let tx = 0; tx < PX; tx++) { const X = cx * PX + tx, n = 1 + (hash2(X, 7, 3) > 0.4 ? 1 : 0) + (hash2(X >> 2, 8, 3) > 0.6 ? 1 : 0); for (let k = 0; k < n; k++) put(X, cy * PX + k, sr[k === 0 ? 7 : 5]); put(X, cy * PX - 1, hash2(X, 9, 9) > 0.5 ? sr[6] : sr[7]); }
    }
    // stalactites and moss under cave ceilings / overhangs
    if (cy < H - 1 && medium[i + W] === AIR && (cave[i + W] || dAt(cx, cy) <= 1)) {
      const rr = R(m === SOIL ? ROCK : m);
      if (hash2(cx, cy, 21) > 0.72) { const len = 3 + Math.floor(hash2(cx, cy, 22) * 9), X0 = cx * PX + 1 + Math.floor(hash2(cx, cy, 23) * 2), Y0 = (cy + 1) * PX; for (let k = 0; k < len; k++) { const w = Math.max(0, Math.round((1 - k / len) * 1.6)); for (let dx = -w; dx <= w; dx++) if (isAirTexel(X0 + dx, Y0 + k)) put(X0 + dx, Y0 + k, rr[dx < 0 ? 4 : dx > 0 ? 2 : 3]); } }
      else if ((m === SOIL || def.env.humidity > 0.6) && hash2(cx, cy, 24) > 0.5) for (let tx = 0; tx < PX; tx++) { const X = cx * PX + tx, len = Math.floor(hash2(X, cy, 25) * 4); for (let k = 0; k < len; k++) if (isAirTexel(X, (cy + 1) * PX + k)) put(X, (cy + 1) * PX + k, cap[2 + (k === len - 1 ? 2 : 0)]); }
    }
    // surface pebbles and rocks on sand/mud/rock in the open
    if ((m === SAND || m === ROCK || m === MUD || m === BASALT) && (above === AIR || IS_WATER[above]) && hash2(cx, cy, 31) > 0.86) {
      const rr = R(ROCK), X0 = cx * PX + Math.floor(hash2(cx, cy, 32) * 3), Y0 = cy * PX - 1, w = hash2(cx, cy, 33) > 0.6 ? 3 : 2;
      for (let dx = 0; dx < w; dx++) { put(X0 + dx, Y0, rr[dx === 0 ? 6 : 4]); if (w === 3) put(X0 + dx, Y0 - 1, rr[dx === 1 ? 6 : 5]); }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const grassy = (def: BiomeDef) => !!(def.pal[SOIL]?.cap ?? DEFAULT_PAL[SOIL]?.cap);
function dSmoothAir(_x: number, _y: number) { return 0; }
void LAVA; void ICE;
