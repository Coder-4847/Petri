import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { W, H } from '../shared/constants';
import type { BiomeDef, ParallaxLayer } from '../data/biomes';
import { RNG } from '../shared/rng';
import { css, hexR, hexG, hexB, makeCanvas, mix } from './util';
import type { Camera } from './camera';

const TW = 512; // tile width in texels

type Ctx = CanvasRenderingContext2D;

/** Tileable height function from integer-frequency sines. */
function periodic(seed: number, comps: [number, number][]) {
  const r = new RNG(seed); const ph = comps.map(() => r.next() * Math.PI * 2);
  return (x: number) => { let s = 0; comps.forEach(([k, a], i) => { s += a * Math.sin((2 * Math.PI * k * x) / TW + ph[i]); }); return s; };
}
const wrap = (fn: (ox: number) => void) => { fn(0); fn(-TW); fn(TW); };

function _silhouette(ctx: Ctx, th: number, color: number, hf: (x: number) => number, edge?: number) {
  for (let x = 0; x < TW; x++) {
    const top = Math.max(0, Math.round(th - hf(x)));
    ctx.fillStyle = css(color); ctx.fillRect(x, top, 1, th - top);
    if (edge !== undefined) { ctx.fillStyle = css(edge); ctx.fillRect(x, top, 1, 1); }
  }
}

// ---------------------------------------------------------------- pixel painter with shading
const BY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BY[((y & 3) << 2) | (x & 3)];
class Pix {
  img: ImageData; buf: Uint32Array;
  constructor(public ctx: Ctx, public w: number, public h: number) { this.img = ctx.createImageData(w, h); this.buf = new Uint32Array(this.img.data.buffer); }
  set(x: number, y: number, c: number, a = 255) { x = Math.round(x); y = Math.round(y); if (y < 0 || y >= this.h) return; x = ((x % this.w) + this.w) % this.w; this.buf[y * this.w + x] = (a << 24) | ((c & 255) << 16) | (((c >> 8) & 255) << 8) | ((c >> 16) & 255); }
  get(x: number, y: number) { x = ((Math.round(x) % this.w) + this.w) % this.w; y = Math.round(y); return y < 0 || y >= this.h ? 0 : this.buf[y * this.w + x]; }
  /** pick between two colours with ordered dithering by t (0..1) */
  dset(x: number, y: number, a: number, b: number, t: number) { this.set(x, y, t > dith(x | 0, y | 0) ? b : a); }
  done() { this.ctx.putImageData(this.img, 0, 0); }
}
const hn = (x: number, s: number) => { const xi = Math.floor(x), f = x - xi, u = f * f * (3 - 2 * f); const a = Math.sin(xi * 127.1 + s * 311.7) * 43758.5453, b = Math.sin((xi + 1) * 127.1 + s * 311.7) * 43758.5453; return (a - Math.floor(a)) * (1 - u) + (b - Math.floor(b)) * u; };

function drawLayer(l: ParallaxLayer, th: number, def: BiomeDef): HTMLCanvasElement {
  const c = makeCanvas(TW, th); const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  const r = new RNG(l.seed * 977), P = new Pix(ctx, TW, th);
  const col = l.color, horizon = def.sky[1], skyTop = def.sky[0];
  const hi = mix(col, mix(0xfff4dc, skyTop, 0.4), 0.3), lo = mix(col, 0x0a0c18, 0.22), hi2 = mix(col, 0xffffff, 0.5);
  const haze = (c0: number, y: number, top: number) => mix(c0, horizon, Math.min(0.55, Math.pow(Math.max(0, (y - top) / Math.max(1, th - top)), 1.6) * 0.45));
  /** filled terrain silhouette lit from the upper left */
  const ridge = (hf: (x: number) => number, o: { snow?: number; grass?: boolean; trees?: boolean; strata?: boolean } = {}) => {
    for (let x = 0; x < TW; x++) {
      const top = Math.max(0, Math.round(th - hf(x)));
      const snowDepth = o.snow ? Math.max(0, (hf(x) - th * o.snow) * 0.55 + (hn(x * 0.3, l.seed) - 0.5) * 5) : 0;
      for (let y = top; y < th; y++) {
        const dy = y - top, body = Math.max(1, th - top);
        // facets: the slope is sampled along a diagonal, so light and shadow faces run down from each peak
        const xs = x - dy * 0.75, slope = hf(xs + 1.5) - hf(xs - 1.5);
        const w = Math.max(0, 1 - (dy / body) * 1.5);
        let face = slope > 0.6 ? 1 : slope < -0.6 ? -1 : slope / 0.6;
        face *= w;
        let cc = face > 0 ? mix(col, dy < 2 ? hi2 : hi, Math.min(1, face)) : mix(col, lo, Math.min(1, -face));
        if (o.strata && (y + Math.round(hn(xs * 0.05, l.seed) * 8)) % 9 === 0 && face < 0.2) cc = mix(cc, lo, 0.35 * w);
        if (dy < snowDepth) cc = face < -0.2 ? mix(0xc4d4ee, col, 0.2) : dy === 0 ? 0xffffff : mix(0xf2f6ff, col, 0.1);
        if (o.grass && dy === 0) cc = mix(hi2, 0xe8ffb0, 0.3);
        cc = haze(cc, y, top);
        if (dy >= snowDepth && Math.abs(face) < 0.5 && dy > 0) P.dset(x, y, cc, haze(face >= 0 ? hi : lo, y, top), Math.abs(face) * 0.8); else P.set(x, y, cc);
      }
      if (o.trees && hn(x * 0.21, l.seed + 3) > 0.62) { // little trees along the crest
        const h = 3 + Math.round(hn(x * 0.9, l.seed + 4) * 5); for (let k = 0; k < h; k++) { const ww = Math.max(0, Math.round((1 - k / h) * 2)); for (let dx = -ww; dx <= ww; dx++) P.set(x + dx, top - k, dx < 0 ? mix(lo, col, 0.4) : lo); }
      }
    }
  };
  switch (l.kind) {
    case 'hills': { const f = periodic(l.seed, [[2, th * 0.3], [5, th * 0.12], [11, th * 0.05]]); ridge((x) => th * 0.5 + f(x), { grass: true, trees: true }); break; }
    case 'mountains': {
      const f = periodic(l.seed, [[2, 0.5], [4, 0.3], [7, 0.14], [13, 0.05], [29, 0.02]]);
      ridge((x) => { const v = 1 - Math.abs(f(x)); return th * (0.2 + 0.75 * Math.pow(v, 1.5)); }, { snow: def.env.temp < 0.75 ? 0.62 : 0.86, strata: true });
      break;
    }
    case 'dunes': {
      const f = periodic(l.seed, [[4, 0.5], [7, 0.25], [13, 0.08]]);
      ridge((x) => { const s = f(x); return th * (0.4 + 0.5 * (s > 0 ? Math.pow(s, 0.8) : s * 0.5)); });
      for (let y = 0; y < th; y += 3) for (let x = 0; x < TW; x++) if (P.get(x, y) && Math.sin(x * 0.2 + y * 0.6) > 0.94) P.set(x, y, hi);
      break;
    }
    case 'rocks': {
      for (let i = 0; i < 16; i++) {
        const cx = r.range(0, TW), w = r.range(10, 40), h = r.range(th * 0.2, th * 0.8), sk = r.range(-0.4, 0.4);
        for (let y = 0; y < h; y++) { const t = y / h, half = w * Math.sqrt(Math.max(0, 1 - Math.pow(t * 0.9, 2))) * (0.7 + 0.3 * hn(y * 0.3, i)); const x0 = cx + sk * y - half, x1 = cx + sk * y + half;
          for (let x = Math.round(x0); x <= Math.round(x1); x++) { const u = (x - x0) / Math.max(1, x1 - x0); const yy = th - 1 - y; P.set(x, yy, haze(t > 0.92 || u < 0.25 ? hi : u > 0.72 ? lo : col, yy, th - h)); } }
      }
      break;
    }
    case 'trees': case 'canopy': {
      const n = l.kind === 'canopy' ? 26 : 22; const trees: { x: number; h: number; con: boolean; d: number }[] = [];
      for (let i = 0; i < n; i++) trees.push({ x: r.range(0, TW), h: r.range(th * 0.45, th * 0.98), con: l.kind === 'trees' && r.chance(def.env.temp < 0.45 ? 0.75 : 0.3), d: r.next() });
      trees.sort((a, b) => b.d - a.d);
      for (const t of trees) {
        const fog = t.d * 0.35, C = mix(col, horizon, fog), Hi = mix(hi, horizon, fog), Lo = mix(lo, horizon, fog * 0.8), trunk = mix(mix(col, 0x2a1a10, 0.45), horizon, fog);
        const base = th, tw = Math.max(1, Math.round(t.h * 0.05));
        for (let y = Math.round(base - t.h * 0.55); y < base; y++) for (let k = 0; k < tw; k++) P.set(t.x + k - tw / 2, y, k === 0 ? mix(trunk, Hi, 0.25) : trunk);
        if (t.con) {
          const tiers = 4 + Math.floor(t.h / 30);
          for (let k = 0; k < tiers; k++) { const ty0 = base - t.h * (0.25 + 0.75 * k / tiers), th2 = t.h * 0.32, w0 = t.h * 0.22 * (1 - k / (tiers + 1));
            for (let y = 0; y < th2; y++) { const w = w0 * (y / th2) + (hn((t.x + y) * 0.9, k) - 0.5) * 2; for (let dx = -Math.round(w); dx <= Math.round(w); dx++) { const yy = Math.round(ty0 - th2 + y); P.set(t.x + dx, yy, dx < -w * 0.35 ? Hi : dx > w * 0.4 ? Lo : (y & 3) === 0 && dx > 0 ? Lo : C); } } }
        } else {
          const rad = t.h * 0.26, cy0 = base - t.h * 0.68, blobs = 5 + r.int(4);
          const bl = Array.from({ length: blobs }, () => ({ x: t.x + r.range(-rad, rad) * 0.85, y: cy0 + r.range(-rad, rad) * 0.55, r: rad * r.range(0.45, 0.8) }));
          for (const b of bl) for (let dy = -b.r; dy <= b.r; dy++) for (let dx = -b.r; dx <= b.r; dx++) {
            const d2 = (dx * dx + dy * dy) / (b.r * b.r); if (d2 > 1 || (d2 > 0.82 && hn((b.x + dx) * 1.7 + dy, 9) > 0.5)) continue;
            const lightness = -(dx + dy) / (b.r * 1.4) + 0.15; const X = b.x + dx, Y = b.y + dy;
            if (lightness > 0.45) P.set(X, Y, Hi); else if (lightness < -0.35) P.set(X, Y, Lo); else P.dset(X, Y, C, lightness > 0.1 ? Hi : Lo, Math.abs(lightness) * 0.9);
          }
        }
      }
      if (l.kind === 'canopy') for (let i = 0; i < 46; i++) { const x = r.range(0, TW), len = r.range(10, th * 0.55); for (let y = 0; y < len; y++) { const xx = x + Math.sin(y * 0.15 + i) * 1.5; P.set(xx, y, lo); if (y % 7 === 3) { P.set(xx - 1, y, col); P.set(xx + 1, y + 1, col); } } }
      break;
    }
    case 'kelp': {
      for (let i = 0; i < 26; i++) {
        const x0 = r.range(0, TW), h = r.range(th * 0.5, th), sw = r.range(0.04, 0.09), ph = r.range(0, 6), gold = mix(col, 0xb8a040, 0.35);
        for (let y = 0; y < h; y++) {
          const x = x0 + Math.sin(y * sw + ph) * (3 + y * 0.06), yy = th - y;
          P.set(x, yy, y % 9 < 3 ? hi : col); P.set(x + 1, yy, lo);
          if (y % 11 === 0 && y > 6) { const side = (y / 11) % 2 ? 1 : -1; for (let k = 1; k < 6; k++) { P.set(x + side * k, yy - Math.round(k * 0.4), k < 3 ? gold : col); P.set(x + side * k, yy - Math.round(k * 0.4) + 1, lo); } P.set(x + side * 6, yy - 2, hi2); }
        }
      }
      break;
    }
    case 'coral': {
      const pals = [0xff8aa0, 0xffb060, 0xb88aff, 0xffe080, 0x7ae0c8, 0xff6a7a];
      for (let i = 0; i < 24; i++) {
        const cx = r.range(0, TW), w = r.range(8, 30), h = r.range(th * 0.25, th * 0.75), type = r.int(4), tint = mix(col, pals[r.int(pals.length)], 0.38), tHi = mix(tint, 0xffffff, 0.3), tLo = mix(tint, 0x081830, 0.3);
        if (type === 0) { for (let dy = 0; dy < h * 0.6; dy++) { const half = w * Math.sqrt(1 - Math.pow(dy / (h * 0.6), 2)); for (let dx = -half; dx <= half; dx++) { const yy = th - 1 - dy; P.set(cx + dx, yy, Math.sin(dx * 0.9 + Math.sin(dy * 0.5) * 2) > 0.6 ? tLo : dx < -half * 0.3 && dy > h * 0.3 ? tHi : tint); } } }
        else if (type === 1) { const branch = (x: number, y: number, a: number, len: number, dep: number) => { for (let k = 0; k < len; k++) { const xx = x + Math.cos(a) * k, yy = y - Math.sin(a) * k; P.set(xx, yy, tint); P.set(xx + 1, yy, tLo); if (k === len - 1) P.set(xx, yy - 1, tHi); } if (dep > 0) { const ex = x + Math.cos(a) * len, ey = y - Math.sin(a) * len; branch(ex, ey, a + 0.45, len * 0.7, dep - 1); branch(ex, ey, a - 0.45, len * 0.7, dep - 1); } }; branch(cx, th - 1, Math.PI / 2 + r.range(-0.2, 0.2), h * 0.4, 3); }
        else if (type === 2) { for (let dy = 0; dy < h; dy++) for (let dx = -w * 0.6; dx <= w * 0.6; dx++) { const yy = th - 1 - dy, fan = Math.abs(dx) < (dy / h) * w * 0.6 + 1 && dy > 2; if (fan && ((Math.round(dx) + dy) % 3 === 0 || (Math.round(dx) - dy) % 3 === 0)) P.set(cx + dx, yy, dy > h * 0.8 ? tHi : tint); } for (let dy = 0; dy < 4; dy++) P.set(cx, th - 1 - dy, tLo); }
        else { const tubes = 2 + r.int(4); for (let k = 0; k < tubes; k++) { const tx = cx + k * 4 - tubes * 2, thh = h * r.range(0.4, 0.9); for (let dy = 0; dy < thh; dy++) { P.set(tx, th - 1 - dy, tHi); P.set(tx + 1, th - 1 - dy, tint); P.set(tx + 2, th - 1 - dy, tLo); } P.set(tx + 1, th - thh, tLo); } }
      }
      break;
    }
    case 'reeds': {
      for (let i = 0; i < 70; i++) { const x = r.range(0, TW), h = r.range(th * 0.4, th * 0.95), lean = r.range(-0.06, 0.06); for (let y = 0; y < h; y++) P.set(x + lean * y, th - 1 - y, y > h * 0.7 && r.chance(0.2) ? hi : col); if (r.chance(0.45)) for (let k = 0; k < 4; k++) { P.set(x + lean * h, th - h + k, 0x6a4022); P.set(x + lean * h + 1, th - h + k, 0x4a2a14); } }
      break;
    }
    case 'volcano': {
      const cx = TW * 0.5, w = TW * 0.42, top = th * 0.18;
      for (let x = Math.round(cx - w); x <= cx + w; x++) { const t = Math.abs(x - cx) / w, yTop = Math.round(top + (th - top) * Math.pow(Math.max(0, t - 0.06) / 0.94, 0.8) + (hn(x * 0.2, 5) - 0.5) * 3); for (let y = yTop; y < th; y++) { const left = x < cx; let cc = left ? (y - yTop < 3 ? hi : col) : lo; if ((y + Math.round(hn(x * 0.1, 3) * 10)) % 12 === 0) cc = mix(cc, lo, 0.5); P.set(x, y, haze(cc, y, top)); } }
      for (let k = 0; k < 4; k++) { let x = cx - 16 + k * 10 + r.range(-3, 3); const len = th * r.range(0.25, 0.6); for (let y = top + 2; y < top + len; y++) { x += r.range(-0.6, 0.6); P.set(x, y, y < top + 6 ? 0xffd070 : 0xff6a20); P.set(x + 1, y, 0xb83a10); } }
      for (let x = cx - 18; x <= cx + 18; x++) { P.set(x, top, 0xffc860); P.set(x, top + 1, 0xff7a2a); }
      for (let k = 0; k < 22; k++) { const px = cx + Math.sin(k * 0.9) * (4 + k * 0.8), py = top - 4 - k * 4.5, rad = 4 + k * 0.6; for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy < rad * rad && py + dy >= 0) P.set(px + dx, py + dy, dx + dy < -rad * 0.3 ? 0x8a7a7c : dy > rad * 0.3 ? 0x3a3034 : 0x5a4e52); }
      break;
    }
    case 'clouds': {
      const cl = mix(col, 0xffffff, 0.3), sh = mix(col, mix(skyTop, 0x6a7aa0, 0.5), 0.35), mid = mix(col, sh, 0.35), rim = mix(col, 0xfff2d0, 0.6);
      for (let i = 0; i < 8; i++) {
        const cx = r.range(0, TW), base = r.range(th * 0.45, th * 0.85), puffs = 4 + r.int(5), wid = r.range(30, 70);
        const pp = Array.from({ length: puffs }, (_, p) => ({ x: cx + (p / (puffs - 1) - 0.5) * wid, r: r.range(7, 17) * (1 - Math.abs(p / (puffs - 1) - 0.5) * 0.9) }));
        for (const q of pp) for (let dy = -q.r; dy <= 0; dy++) for (let dx = -q.r; dx <= q.r; dx++) {
          if (dx * dx + dy * dy > q.r * q.r) continue; const Y = base - q.r * 0.35 + dy, X = q.x + dx;
          const u = (base - Y) / (q.r * 1.3), sideLit = -dx / q.r;
          let cc = u > 0.75 ? cl : u > 0.4 ? (sideLit > 0.2 ? cl : col) : u > 0.18 ? col : mid; if (dx * dx + dy * dy > q.r * q.r * 0.86 && dy < -q.r * 0.5) cc = rim;
          P.set(X, Y, cc);
        }
        for (let x = Math.round(cx - wid / 2 - 6); x < cx + wid / 2 + 6; x++) { if (P.get(x, base - 1)) { P.set(x, base, sh); P.set(x, base - 1, mid); } }
      }
      for (let i = 0; i < 6; i++) { const y = r.range(4, th * 0.4), x0 = r.range(0, TW), len = r.range(20, 70); for (let x = 0; x < len; x++) if (hn((x0 + x) * 0.3, i) > 0.35) P.set(x0 + x, y + Math.round(Math.sin(x * 0.08) * 1.5), mix(col, skyTop, 0.45)); }
      break;
    }
    case 'stars': { for (let i = 0; i < 90; i++) { const x = r.int(TW), y = r.int(th), b = r.chance(0.15); P.set(x, y, r.chance(0.2) ? 0xbfd8ff : 0xffffff); if (b) { P.set(x + 1, y, 0x8090b0); P.set(x - 1, y, 0x8090b0); P.set(x, y + 1, 0x8090b0); P.set(x, y - 1, 0x8090b0); } } break; }
    case 'rays': {
      P.done();
      for (let i = 0; i < 9; i++) { const x = r.range(0, TW), w = r.range(14, 46), sl = r.range(0.4, 0.8);
        wrap((ox) => { const g = ctx.createLinearGradient(0, 0, 0, th); g.addColorStop(0, css(col)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g;
          ctx.globalAlpha = r.range(0.3, 0.9); ctx.beginPath(); ctx.moveTo(x + ox, 0); ctx.lineTo(x + ox + w * 0.4, 0); ctx.lineTo(x + ox + w * 0.4 + th * sl, th); ctx.lineTo(x + ox + th * sl - w, th); ctx.fill(); ctx.globalAlpha = 1; });
      }
      return c;
    }
    default: break;
  }
  P.done();
  return c;
}

interface LayerRT { spec: ParallaxLayer; tile: TilingSprite; fill: Sprite; th: number; world: number; top: boolean; drift: number; }

export class Background {
  /** screen-space parallax layers */
  layers = new Container();
  /** world-space sky gradient */
  sky = new Sprite();
  private rts: LayerRT[] = [];
  private skyTex: Texture | null = null;
  horizon = 0;

  build(def: BiomeDef, horizonY: number) {
    this.layers.removeChildren().forEach((c) => c.destroy());
    this.rts = []; this.horizon = horizonY;
    // sky gradient in retro bands (4 world cells per band), constant below the horizon
    const top = -120, bottom = H + 80, rows = Math.ceil((bottom - top) / 4);
    // one texel per world cell, 20 colour steps with ordered dithering between them
    const sw = W + 120, shh = rows * 4, gc = makeCanvas(sw, shh); const gx = gc.getContext('2d')!; const gimg = gx.createImageData(sw, shh), gb = new Uint32Array(gimg.data.buffer);
    const gradH = Math.max(32, Math.min(shh, horizonY - top)), steps = 20;
    for (let y = 0; y < shh; y++) { const t = Math.min(1, y / gradH) * steps; for (let x = 0; x < sw; x++) { const lv = Math.min(steps, Math.floor(t + dith(x, y) - 0.5)); const c0 = mix(def.sky[0], def.sky[1], Math.max(0, lv) / steps); gb[y * sw + x] = (255 << 24) | ((c0 & 255) << 16) | (((c0 >> 8) & 255) << 8) | ((c0 >> 16) & 255); } }
    gx.putImageData(gimg, 0, 0);
    this.skyTex?.destroy(true);
    this.skyTex = Texture.from(gc); this.skyTex.source.scaleMode = 'nearest';
    this.sky.texture = this.skyTex;
    this.sky.x = -60; this.sky.y = top; this.sky.width = W + 120; this.sky.height = shh;
    this.skyTex.source.addressMode = 'repeat';
    for (const spec of def.parallax) {
      const th = Math.max(24, Math.min(200, Math.round(spec.amp * H * 2)));
      const c = drawLayer(spec, th, def);
      const tex = Texture.from(c); tex.source.scaleMode = 'nearest'; tex.source.addressMode = 'repeat';
      const tile = new TilingSprite({ texture: tex, width: 100, height: th });
      const fill = new Sprite(Texture.WHITE);
      const top = spec.kind === 'rays' || spec.kind === 'stars' || spec.kind === 'canopy';
      const bodyCol = spec.kind === 'hills' || spec.kind === 'mountains' || spec.kind === 'dunes' || spec.kind === 'volcano' ? spec.color : 0;
      fill.tint = mix(bodyCol, def.sky[1], 0.45); fill.visible = !!bodyCol && !top;
      const a0 = spec.alpha ?? 1, a = spec.kind === 'rays' ? a0 : 0.3 + 0.7 * a0; tile.alpha = a; fill.alpha = a;
      if (spec.kind === 'rays') tile.blendMode = 'add';
      this.layers.addChild(fill, tile);
      this.rts.push({ spec, tile, fill, th, world: spec.y * H, top, drift: spec.kind === 'clouds' ? 0.8 + spec.speed * 4 : 0 });
    }
  }

  update(cam: Camera, time: number, fogCol: number) {
    const { sw, sh, zoom } = cam;
    for (const r of this.rts) {
      const s = r.spec.speed;
      const texel = Math.max(2, Math.min(4, Math.round(1.6 + zoom * 0.14 * (0.35 + 0.65 * s))));
      r.tile.width = sw; r.tile.height = r.th * texel;
      r.tile.tileScale.set(texel, texel);
      r.tile.tilePosition.x = -(cam.x * zoom * s) - time * r.drift;
      const by = sh / 2 + (r.world - cam.y) * zoom * (0.25 + 0.75 * s);
      const hgt = r.th * texel;
      r.tile.x = 0;
      r.tile.y = r.top ? Math.round(sh / 2 + (0 - cam.y) * zoom * (0.25 + 0.75 * s)) : Math.round(by - hgt);
      r.fill.x = 0; r.fill.width = sw; r.fill.y = r.tile.y + hgt - 1; r.fill.height = Math.max(0, sh - r.fill.y + 4);
      if (r.spec.kind === 'rays') r.tile.alpha = (r.spec.alpha ?? 0.2) * (0.75 + 0.25 * Math.sin(time * 0.5 + r.spec.seed));
    }
    void fogCol; void hexR; void hexG; void hexB;
  }
}
