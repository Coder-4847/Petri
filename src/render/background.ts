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

function silhouette(ctx: Ctx, th: number, color: number, hf: (x: number) => number, edge?: number) {
  for (let x = 0; x < TW; x++) {
    const top = Math.max(0, Math.round(th - hf(x)));
    ctx.fillStyle = css(color); ctx.fillRect(x, top, 1, th - top);
    if (edge !== undefined) { ctx.fillStyle = css(edge); ctx.fillRect(x, top, 1, 1); }
  }
}

function drawLayer(l: ParallaxLayer, th: number, def: BiomeDef): HTMLCanvasElement {
  const c = makeCanvas(TW, th); const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  const r = new RNG(l.seed * 977);
  const col = l.color, hi = mix(col, 0xffffff, 0.22), lo = mix(col, 0x000000, 0.2);
  switch (l.kind) {
    case 'hills': {
      const f = periodic(l.seed, [[2, th * 0.3], [5, th * 0.12], [11, th * 0.05]]);
      silhouette(ctx, th, col, (x) => th * 0.5 + f(x), hi); break;
    }
    case 'mountains': {
      const f = periodic(l.seed, [[2, 0.5], [4, 0.3], [7, 0.14], [13, 0.05]]);
      silhouette(ctx, th, col, (x) => { const v = 1 - Math.abs(f(x)); return th * (0.2 + 0.7 * Math.pow(v, 1.6)); }, hi);
      // snow-lit ridges
      for (let x = 0; x < TW; x++) { const v = 1 - Math.abs(f(x)); const top = Math.round(th - th * (0.2 + 0.7 * Math.pow(v, 1.6))); if (v > 0.8) { ctx.fillStyle = css(mix(col, 0xffffff, 0.55)); ctx.fillRect(x, top, 1, Math.round((v - 0.8) * 30)); } }
      break;
    }
    case 'dunes': {
      const f = periodic(l.seed, [[4, 0.5], [7, 0.25], [13, 0.08]]);
      silhouette(ctx, th, col, (x) => { const s = f(x); return th * (0.4 + 0.5 * (s > 0 ? Math.pow(s, 0.8) : s * 0.5)); }, hi); break;
    }
    case 'rocks': {
      for (let i = 0; i < 14; i++) { const cx = r.range(0, TW), w = r.range(18, 60), h = r.range(th * 0.25, th * 0.9);
        wrap((ox) => { ctx.fillStyle = css(r.chance(0.5) ? col : lo); ctx.beginPath(); ctx.moveTo(cx + ox - w, th); ctx.lineTo(cx + ox - w * 0.3, th - h); ctx.lineTo(cx + ox + w * 0.2, th - h * 0.8); ctx.lineTo(cx + ox + w, th); ctx.fill(); }); }
      break;
    }
    case 'trees': case 'canopy': {
      const n = l.kind === 'canopy' ? 22 : 16;
      for (let i = 0; i < n; i++) { const cx = r.range(0, TW), h = r.range(th * 0.5, th * 0.95), tw = r.range(3, 6), rad = r.range(h * 0.22, h * 0.4);
        const conifer = l.kind === 'trees' && r.chance(0.35);
        wrap((ox) => {
          ctx.fillStyle = css(lo); ctx.fillRect(cx + ox - tw / 2, th - h * 0.6, tw, h * 0.6);
          ctx.fillStyle = css(r.chance(0.5) ? col : mix(col, 0x000000, 0.1));
          if (conifer) { for (let k = 0; k < 4; k++) { const y = th - h * (0.3 + k * 0.2), w = rad * (1.1 - k * 0.22); ctx.beginPath(); ctx.moveTo(cx + ox - w, y); ctx.lineTo(cx + ox, y - h * 0.28); ctx.lineTo(cx + ox + w, y); ctx.fill(); } }
          else { for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(cx + ox + r.range(-rad, rad) * 0.8, th - h * 0.7 + r.range(-rad, rad) * 0.5, rad * r.range(0.5, 0.9), 0, 7); ctx.fill(); } }
        });
      }
      if (l.kind === 'canopy') { for (let i = 0; i < 40; i++) { const x = r.range(0, TW), len = r.range(10, th * 0.5); ctx.fillStyle = css(lo); ctx.fillRect(x, 0, 1, len); } }
      break;
    }
    case 'kelp': {
      for (let i = 0; i < 26; i++) { const x0 = r.range(0, TW), h = r.range(th * 0.5, th), sw = r.range(0.04, 0.09), ph = r.range(0, 6), wdt = r.chance(0.3) ? 3 : 2;
        wrap((ox) => { for (let y = 0; y < h; y++) { const x = x0 + ox + Math.sin(y * sw + ph) * (3 + y * 0.06); ctx.fillStyle = css(y % 9 < 3 ? hi : col); ctx.fillRect(Math.round(x), th - y, wdt, 1); if (y % 14 === 0) ctx.fillRect(Math.round(x) + (y % 28 ? 2 : -3), th - y, 3, 2); } }); }
      break;
    }
    case 'coral': {
      for (let i = 0; i < 20; i++) { const cx = r.range(0, TW), w = r.range(10, 34), h = r.range(th * 0.3, th * 0.8), branchy = r.chance(0.5);
        wrap((ox) => {
          ctx.fillStyle = css(r.chance(0.5) ? col : lo);
          if (branchy) { for (let b = -2; b <= 2; b++) { const bx = cx + ox + b * w * 0.25; ctx.fillRect(bx, th - h * (1 - Math.abs(b) * 0.2), 3, h * (1 - Math.abs(b) * 0.2)); ctx.fillRect(bx - 2, th - h * (1 - Math.abs(b) * 0.2), 7, 3); } }
          else { ctx.beginPath(); ctx.ellipse(cx + ox, th, w, h, 0, Math.PI, 0); ctx.fill(); }
        });
      }
      break;
    }
    case 'reeds': {
      for (let i = 0; i < 60; i++) { const x = r.range(0, TW), h = r.range(th * 0.4, th * 0.95); ctx.fillStyle = css(r.chance(0.3) ? hi : col); ctx.fillRect(x, th - h, 1, h); if (r.chance(0.4)) ctx.fillRect(x - 1, th - h, 3, 4); }
      break;
    }
    case 'volcano': {
      const cx = TW * 0.5, w = TW * 0.42;
      ctx.fillStyle = css(col); ctx.beginPath(); ctx.moveTo(cx - w, th); ctx.lineTo(cx - 22, th * 0.18); ctx.lineTo(cx + 22, th * 0.18); ctx.lineTo(cx + w, th); ctx.fill();
      ctx.fillStyle = css(0xff7a2a); ctx.fillRect(cx - 22, th * 0.18, 44, 3); ctx.fillStyle = css(0xffc860); ctx.fillRect(cx - 12, th * 0.18, 24, 1);
      for (let k = 0; k < 3; k++) { ctx.fillStyle = css(0xff5a1a); ctx.fillRect(cx - 14 + k * 12 + r.range(-3, 3), th * 0.2, 2, th * r.range(0.2, 0.5)); }
      ctx.fillStyle = 'rgba(80,60,60,0.6)'; for (let k = 0; k < 18; k++) ctx.fillRect(cx - 20 + r.range(-14, 14) + k * 2.4, th * 0.18 - k * 5, 18 + k, 8);
      break;
    }
    case 'clouds': {
      for (let i = 0; i < 9; i++) { const cx = r.range(0, TW), cy = r.range(th * 0.3, th * 0.8), puffs = 4 + r.int(5);
        wrap((ox) => { for (let p = 0; p < puffs; p++) { const px = cx + ox + (p - puffs / 2) * r.range(10, 18), rad = r.range(8, 20) * (1 - Math.abs(p - puffs / 2) / puffs * 0.8);
          ctx.fillStyle = css(col); ctx.beginPath(); ctx.arc(px, cy, rad, 0, 7); ctx.fill();
          ctx.fillStyle = css(mix(col, 0x8a9ab8, 0.28)); ctx.fillRect(px - rad, cy + rad * 0.45, rad * 2, rad * 0.55); } });
      }
      // flat pixel-art bottoms
      break;
    }
    case 'stars': {
      for (let i = 0; i < 70; i++) { ctx.fillStyle = css(r.chance(0.2) ? 0xbfd8ff : 0xffffff); ctx.fillRect(r.int(TW), r.int(th), 1, 1); }
      break;
    }
    case 'rays': {
      for (let i = 0; i < 9; i++) { const x = r.range(0, TW), w = r.range(14, 46), sl = r.range(0.4, 0.8);
        wrap((ox) => { const g = ctx.createLinearGradient(0, 0, 0, th); g.addColorStop(0, css(col)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g;
          ctx.globalAlpha = r.range(0.3, 0.9); ctx.beginPath(); ctx.moveTo(x + ox, 0); ctx.lineTo(x + ox + w * 0.4, 0); ctx.lineTo(x + ox + w * 0.4 + th * sl, th); ctx.lineTo(x + ox + th * sl - w, th); ctx.fill(); ctx.globalAlpha = 1; });
      }
      break;
    }
    default: break;
  }
  void def;
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
    const gc = makeCanvas(1, rows); const gx = gc.getContext('2d')!;
    const gradRows = Math.max(8, Math.min(rows, Math.round((horizonY - top) / 4)));
    for (let i = 0; i < rows; i++) { gx.fillStyle = css(mix(def.sky[0], def.sky[1], Math.min(1, i / (gradRows - 1)))); gx.fillRect(0, i, 1, 1); }
    this.skyTex?.destroy(true);
    this.skyTex = Texture.from(gc); this.skyTex.source.scaleMode = 'nearest';
    this.sky.texture = this.skyTex;
    this.sky.x = -60; this.sky.y = top; this.sky.width = W + 120; this.sky.height = rows * 4;
    for (const spec of def.parallax) {
      const th = Math.max(24, Math.min(200, Math.round(spec.amp * H * 2)));
      const c = drawLayer(spec, th, def);
      const tex = Texture.from(c); tex.source.scaleMode = 'nearest'; tex.source.addressMode = 'repeat';
      const tile = new TilingSprite({ texture: tex, width: 100, height: th });
      const fill = new Sprite(Texture.WHITE);
      const top = spec.kind === 'rays' || spec.kind === 'stars' || spec.kind === 'canopy';
      const bodyCol = spec.kind === 'hills' || spec.kind === 'mountains' || spec.kind === 'dunes' || spec.kind === 'volcano' ? spec.color : 0;
      fill.tint = mix(bodyCol, 0x000000, 0.0); fill.visible = !!bodyCol && !top;
      const a = spec.alpha ?? 1; tile.alpha = a; fill.alpha = a;
      if (spec.kind === 'rays') tile.blendMode = 'add';
      this.layers.addChild(fill, tile);
      this.rts.push({ spec, tile, fill, th, world: spec.y * H, top, drift: spec.kind === 'clouds' ? 0.8 + spec.speed * 4 : 0 });
    }
  }

  update(cam: Camera, time: number, fogCol: number) {
    const { sw, sh, zoom } = cam;
    for (const r of this.rts) {
      const s = r.spec.speed;
      const texel = Math.max(2, Math.round(zoom * 0.5 * (0.35 + 0.65 * s)));
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
