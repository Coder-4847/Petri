// Small painted previews of each biome for the biome picker (generated from the real terrain generator).
import { W, H, IS_SOLID, IS_WATER, AIR, SOIL, LAVA } from '../shared/constants';
import { DEFAULT_PAL, type BiomeDef } from '../data/biomes';
import { generateTerrain } from '../sim/terrain';
import { mix } from '../render/util';

const cache = new Map<string, HTMLCanvasElement>();
const PW = 128, PH = 56;

export function biomePreview(def: BiomeDef): HTMLCanvasElement {
  const hit = cache.get(def.id); if (hit) return clone(hit);
  const t = generateTerrain(def, 4242);
  const c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const x = c.getContext('2d')!, img = x.createImageData(PW, PH), b = new Uint32Array(img.data.buffer);
  // frame the interesting band: from a bit above the highest ground to below the median surface
  const ys = Array.from(t.surfaceY).filter((v) => v < H).sort((a, b2) => a - b2);
  const mid = ys.length ? ys[ys.length >> 1] : H * 0.6, top = Math.max(0, Math.min(H - 96, Math.round((ys[0] ?? mid) - 30))), span = Math.min(H - top, 96);
  const put = (i: number, c0: number) => { b[i] = (255 << 24) | ((c0 & 255) << 16) | (((c0 >> 8) & 255) << 8) | ((c0 >> 16) & 255); };
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const wx = Math.floor((px / PW) * W), wy = Math.floor(top + (py / PH) * span), m = t.medium[wy * W + wx];
    let col: number;
    if (m === AIR) col = mix(def.sky[0], def.sky[1], Math.min(1, wy / Math.max(1, mid)));
    else if (IS_WATER[m]) { let d = 0; while (wy - d > 0 && IS_WATER[t.medium[(wy - d - 1) * W + wx]]) d++; col = mix(def.water[0], def.water[1], Math.min(1, d / 60)); if (d === 0) col = mix(col, 0xffffff, 0.5); }
    else if (m === LAVA) col = 0xff7a2a;
    else if (IS_SOLID[m]) {
      const p = def.pal[m] ?? DEFAULT_PAL[m] ?? DEFAULT_PAL[5]; const above = wy > 0 ? t.medium[(wy - 1) * W + wx] : AIR;
      let d = 0; while (d < 12 && wy - d > 0 && IS_SOLID[t.medium[(wy - d - 1) * W + wx]]) d++;
      col = d === 0 ? (m === SOIL && p.cap ? p.cap : p.hi) : d < 3 ? p.base : mix(p.lo, 0x05060a, Math.min(0.75, d / 14));
      if (above === AIR && m === SOIL && p.cap) col = p.cap;
    } else col = def.sky[1];
    put(py * PW + px, col);
  }
  x.putImageData(img, 0, 0); cache.set(def.id, c);
  return clone(c);
}
function clone(c: HTMLCanvasElement) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d')!.drawImage(c, 0, 0); d.className = 'sw'; return d; }
