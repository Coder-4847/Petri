// Civilization made visible: little pixel buildings standing on dry ground, growing in number and sophistication
// with the civilization's population and technology. Purely cosmetic; driven by the civ summary from the sim.
import { Container, Sprite, Texture } from 'pixi.js';
import { W, H } from '../shared/constants';
import { makeCanvas } from './util';

type Paint = (c: CanvasRenderingContext2D) => void;
interface Kind { id: string; w: number; h: number; minTech: number; weight: number; paint: Paint }
const SCALE = 0.5; // world cells per building texel
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const R = (c: CanvasRenderingContext2D, col: string, x: number, y: number, w: number, h: number) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const tri = (c: CanvasRenderingContext2D, col: string, x: number, y: number, w: number, h: number) => { c.fillStyle = col; for (let i = 0; i < h; i++) { const k = Math.round((w / 2) * (1 - i / h)); c.fillRect(x + w / 2 - k - 0.5 + 0.5, y + h - 1 - i, k * 2, 1); } };
const win = (c: CanvasRenderingContext2D, x: number, y: number, col = '#f6d27a') => { R(c, col, x, y, 1, 2); };

const KINDS: Kind[] = [
  { id: 'hut', w: 9, h: 8, minTech: 0, weight: 3, paint: (c) => { R(c, '#8a6a46', 1, 4, 7, 4); R(c, '#6a4e32', 1, 4, 1, 4); tri(c, '#c8a85a', 0, 0, 9, 5); R(c, '#3a281a', 4, 5, 2, 3); } },
  { id: 'field', w: 16, h: 4, minTech: 0, weight: 2.5, paint: (c) => { R(c, '#6a5232', 0, 2, 16, 2); for (let x = 0; x < 16; x += 2) { R(c, '#8ac05a', x, 0, 1, 3); R(c, '#5a9a44', x + 1, 1, 1, 2); } } },
  { id: 'house', w: 11, h: 10, minTech: 0.12, weight: 3, paint: (c) => { R(c, '#9a9a96', 1, 4, 9, 6); R(c, '#7a7a76', 1, 4, 1, 6); tri(c, '#a85a3a', 0, 0, 11, 5); win(c, 3, 6); win(c, 7, 6); R(c, '#4a3220', 5, 7, 2, 3); } },
  { id: 'granary', w: 8, h: 15, minTech: 0.2, weight: 1.5, paint: (c) => { R(c, '#aaa6a0', 1, 4, 6, 11); R(c, '#86827c', 1, 4, 1, 11); R(c, '#aaa6a0', 0, 3, 8, 2); for (let x = 0; x < 8; x += 2) R(c, '#aaa6a0', x, 1, 1, 2); R(c, '#e04a3a', 4, 0, 3, 1); R(c, '#3a2a20', 3, 11, 2, 4); win(c, 3, 7, '#1a1a22'); } },
  { id: 'mill', w: 14, h: 20, minTech: 0.3, weight: 1.5, paint: (c) => { R(c, '#cfc9bc', 4, 8, 6, 12); R(c, '#aaa294', 4, 8, 1, 12); tri(c, '#8a4a30', 3, 4, 8, 5); c.strokeStyle = '#6a4e32'; c.lineWidth = 1; c.beginPath(); c.moveTo(1, 2); c.lineTo(13, 12); c.moveTo(13, 2); c.lineTo(1, 12); c.stroke(); R(c, '#3a2a20', 6, 16, 2, 4); } },
  { id: 'hall', w: 17, h: 19, minTech: 0.35, weight: 1.5, paint: (c) => { R(c, '#b0aca4', 2, 8, 13, 11); R(c, '#8e8a82', 2, 8, 1, 11); R(c, '#b0aca4', 0, 5, 4, 14); R(c, '#b0aca4', 13, 5, 4, 14); tri(c, '#7a4a3a', 0, 1, 4, 5); tri(c, '#7a4a3a', 13, 1, 4, 5); tri(c, '#6a3a30', 4, 4, 9, 5); R(c, '#2a1e18', 7, 13, 3, 6); win(c, 4, 10); win(c, 11, 10); win(c, 1, 8); win(c, 15, 8); } },
  { id: 'brick', w: 12, h: 13, minTech: 0.45, weight: 3, paint: (c) => { R(c, '#a8553f', 1, 3, 10, 10); R(c, '#86402e', 1, 3, 1, 10); R(c, '#5a4a48', 0, 1, 12, 3); R(c, '#7a3e30', 8, 0, 2, 3); for (let y = 5; y < 12; y += 3) for (let x = 3; x < 10; x += 3) win(c, x, y); R(c, '#2a1e18', 5, 10, 2, 3); } },
  { id: 'factory', w: 22, h: 25, minTech: 0.5, weight: 2, paint: (c) => { R(c, '#7a6a64', 0, 14, 17, 11); for (let x = 0; x < 15; x += 5) { R(c, '#5a4a46', x, 11, 5, 3); R(c, '#8a7a72', x, 11, 1, 3); } R(c, '#8a4a38', 17, 3, 4, 22); R(c, '#6a3a2c', 17, 3, 1, 22); R(c, '#2a2a30', 17, 2, 4, 1); for (let x = 2; x < 15; x += 4) win(c, x, 17); R(c, '#2a2a30', 6, 20, 4, 5); } },
  { id: 'radio', w: 5, h: 26, minTech: 0.55, weight: 1, paint: (c) => { for (let y = 2; y < 26; y += 4) { c.fillStyle = '#9aa0a8'; c.fillRect(1, y, 1, 4); c.fillRect(3, y, 1, 4); c.fillRect(2, y + 1, 1, 1); } R(c, '#ff4a4a', 2, 0, 1, 2); } },
  { id: 'office', w: 11, h: 30, minTech: 0.62, weight: 3, paint: (c) => { R(c, '#4a6a8a', 1, 2, 9, 28); R(c, '#34506e', 1, 2, 1, 28); R(c, '#6a8ab0', 9, 2, 1, 28); for (let y = 4; y < 28; y += 3) for (let x = 2; x < 9; x += 2) R(c, y % 6 === 4 ? '#a8d0e8' : '#7aa0c0', x, y, 1, 2); R(c, '#9aa0a8', 5, 0, 1, 3); } },
  { id: 'plant', w: 16, h: 20, minTech: 0.62, weight: 1, paint: (c) => { for (let y = 0; y < 18; y++) { const k = 3 + Math.round(Math.pow(Math.abs(y - 10) / 10, 1.6) * 3); R(c, '#cfd0d2', 8 - k, y, k * 2, 1); R(c, '#a8a9ac', 8 - k, y, 1, 1); } R(c, '#7a7a80', 0, 17, 16, 3); R(c, 'rgba(240,240,240,.6)', 4, 0, 3, 2); R(c, 'rgba(240,240,240,.45)', 6, -1 + 1, 3, 1); } },
  { id: 'tower', w: 9, h: 42, minTech: 0.75, weight: 3, paint: (c) => { R(c, '#8aa8c0', 1, 3, 7, 39); R(c, '#68869e', 1, 3, 1, 39); R(c, '#b8d4e6', 7, 3, 1, 39); for (let y = 6; y < 40; y += 2) for (let x = 2; x < 7; x += 2) R(c, (x + y) % 4 ? '#d8ecf6' : '#6a98b8', x, y, 1, 1); R(c, '#aab2ba', 4, 0, 1, 4); R(c, '#ff4a4a', 4, 0, 1, 1); } },
  { id: 'solar', w: 18, h: 5, minTech: 0.78, weight: 1.5, paint: (c) => { for (let x = 0; x < 18; x += 6) { R(c, '#2a4a80', x, 1, 5, 3); R(c, '#4a7ac0', x, 1, 5, 1); R(c, '#aab2ba', x + 2, 4, 1, 1); } } },
  { id: 'eco', w: 13, h: 34, minTech: 0.8, weight: 3, paint: (c) => { R(c, '#e8ece4', 3, 4, 7, 30); R(c, '#c4cabe', 3, 4, 1, 30); for (let y = 6; y < 32; y += 6) { R(c, '#3a8a46', 0, y, 13, 2); R(c, '#58b060', 1, y - 1, 3, 1); R(c, '#58b060', 8, y - 1, 4, 1); R(c, '#3a8a46', 0, y + 2, 2, 2); R(c, '#3a8a46', 11, y + 2, 2, 3); } for (let y = 9; y < 32; y += 6) R(c, '#78c8d0', 5, y, 3, 2); R(c, '#3a8a46', 4, 1, 5, 3); R(c, '#58b060', 5, 0, 3, 2); } },
];

export class Settlements {
  container = new Container();
  /** additive copies of the lit windows, faded in at night */
  lights = new Container();
  private tex = new Map<string, Texture>();
  private ltex = new Map<string, Texture>();
  private surfaceY: Int16Array = new Int16Array(W).fill(H); private waterTop: Int16Array = new Int16Array(W).fill(-1);
  private key = '';
  private civ: { pop: number; tech: number } | null = null;
  ruined = false;

  setTerrain(surfaceY: Int16Array, waterTop: Int16Array) { this.surfaceY = surfaceY; this.waterTop = waterTop; this.key = ''; this.refresh(); }
  set(civ: { pop: number; tech: number } | null, ruined = false) { this.civ = civ; this.ruined = ruined; this.refresh(); }

  private texture(k: Kind): Texture {
    let t = this.tex.get(k.id); if (t) return t;
    const cv = makeCanvas(k.w, k.h); k.paint(cv.getContext('2d')!);
    // dark outline so buildings read against the backdrop
    const x = cv.getContext('2d')!, img = x.getImageData(0, 0, k.w, k.h), out = x.createImageData(k.w, k.h);
    for (let i = 0; i < k.w * k.h; i++) { const a = img.data[i * 4 + 3]; if (a) { out.data.set(img.data.subarray(i * 4, i * 4 + 4), i * 4); continue; } const px = i % k.w, py = (i / k.w) | 0; let near = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) { const nx = px + dx, ny = py + dy; if (nx >= 0 && ny >= 0 && nx < k.w && ny < k.h && img.data[(ny * k.w + nx) * 4 + 3]) near = true; } if (near) { out.data[i * 4] = 24; out.data[i * 4 + 1] = 22; out.data[i * 4 + 2] = 30; out.data[i * 4 + 3] = 255; } }
    x.putImageData(out, 0, 0);
    t = Texture.from(cv); t.source.scaleMode = 'nearest'; this.tex.set(k.id, t);
    // light map: warm/cool window pixels only
    const lc = makeCanvas(k.w, k.h), lx = lc.getContext('2d')!, li = lx.createImageData(k.w, k.h);
    for (let i = 0; i < k.w * k.h; i++) { const r = out.data[i * 4], g = out.data[i * 4 + 1], b = out.data[i * 4 + 2]; const hex = (r << 16) | (g << 8) | b, warm = hex === 0xf6d27a, cool = hex === 0xa8d0e8 || hex === 0xd8ecf6 || hex === 0x78c8d0 || hex === 0x58b0b8; if (warm || cool) { li.data[i * 4] = warm ? 255 : 200; li.data[i * 4 + 1] = warm ? 210 : 235; li.data[i * 4 + 2] = warm ? 120 : 255; li.data[i * 4 + 3] = 255; } }
    lx.putImageData(li, 0, 0); const lt = Texture.from(lc); lt.source.scaleMode = 'nearest'; this.ltex.set(k.id, lt);
    return t;
  }

  private refresh() {
    const c = this.civ;
    const count = c ? Math.min(90, Math.round(Math.sqrt(c.pop) * 1.5)) : 0, tier = c ? Math.floor(c.tech * 14) : 0;
    const key = `${count}|${tier}|${this.ruined}|${this.surfaceY[10]}|${this.surfaceY[200]}`;
    if (key === this.key) return; this.key = key;
    this.container.removeChildren().forEach((s) => s.destroy()); this.lights.removeChildren().forEach((s) => s.destroy());
    if (!c || count === 0) return;
    const taken: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const elig = KINDS.filter((k) => k.minTech <= c.tech);
      const wts = elig.map((k) => k.weight * (1 + 3 * Math.max(0, 1 - (c.tech - k.minTech) / 0.25)));
      let r = hash(i * 3.7) * wts.reduce((a, b) => a + b, 0), kind = elig[0]; for (let j = 0; j < elig.length; j++) { r -= wts[j]; if (r <= 0) { kind = elig[j]; break; } }
      let placed = false;
      for (let a = 0; a < 10 && !placed; a++) {
        const kw = Math.ceil(kind.w * SCALE), x = Math.round(8 + hash(i * 7.3 + a * 13.1) * (W - 16 - kw)), cx = x + kw / 2;
        if (this.waterTop[x] >= 0 || this.waterTop[x + kw - 1] >= 0) continue;
        const y0 = this.surfaceY[x], y1 = this.surfaceY[x + kw - 1], ym = this.surfaceY[(x + kw / 2) | 0];
        if (y0 >= H || y1 >= H || Math.abs(y0 - y1) > 2 || Math.abs(ym - y0) > 2) continue;
        if (taken.some(([a0, a1]) => x < a1 + 1 && x + kw > a0 - 1)) continue;
        taken.push([x, x + kw]);
        const s = new Sprite(this.texture(kind)); s.anchor.set(0, 1); s.position.set(x, Math.max(y0, y1) + 0.6); s.scale.set(SCALE);
        if (this.ruined) { s.tint = 0x585860; s.alpha = 0.85; s.scale.set(SCALE, SCALE * 0.7); }
        this.container.addChild(s); placed = true; void cx;
        if (!this.ruined) { const l = new Sprite(this.ltex.get(kind.id)!); l.anchor.set(0, 1); l.position.copyFrom(s.position); l.scale.copyFrom(s.scale); l.blendMode = 'add'; this.lights.addChild(l); }
      }
    }
  }
}
