// Tiny indexed-colour pixel canvas used by the sprite painters.
export const P = { NONE: 0, OUT: 1, DARK: 2, SHADE: 3, BASE: 4, LIGHT: 5, ACCENT: 6, EYE: 7, PUPIL: 8, BELLY: 9, GLOW: 10, GORE: 11, BONE: 12, ORGAN: 13, TOOTH: 14, ACCENT2: 15 } as const;

export class C8 {
  px: Uint8Array;
  constructor(public w: number, public h: number) { this.px = new Uint8Array(w * h); }
  get(x: number, y: number): number { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x]; }
  set(x: number, y: number, c: number) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  /** only paints over empty pixels */
  under(x: number, y: number, c: number) { if (this.get(x, y) === 0) this.set(x, y, c); }
  disc(cx: number, cy: number, rx: number, ry: number, c: number, onlyEmpty = false) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = (x - cx) / Math.max(0.5, rx), dy = (y - cy) / Math.max(0.5, ry); if (dx * dx + dy * dy <= 1.02) { if (!onlyEmpty || this.get(x, y) === 0) this.set(x, y, c); } }
  }
  rect(x: number, y: number, w: number, h: number, c: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  line(x0: number, y0: number, x1: number, y1: number, c: number, t = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; if (t <= 1) this.set(x, y, c); else this.disc(x, y, t / 2, t / 2, c); }
  }
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number) {
    const minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2)), minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2));
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(d) < 1e-6) return;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d, b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d, g = 1 - a - b;
      if (a >= -0.05 && b >= -0.05 && g >= -0.05) this.set(x, y, c);
    }
  }
  /** fill between top(x) and bottom(x) for x in [x0,x1] */
  profile(x0: number, x1: number, f: (x: number) => [number, number], c: number) { for (let x = Math.round(x0); x <= Math.round(x1); x++) { const [t, b] = f(x); for (let y = Math.round(t); y <= Math.round(b); y++) this.set(x, y, c); } }
  poly(pts: [number, number][], c: number, t = 1) { for (let i = 0; i < pts.length - 1; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, t); }
  flipV() { for (let y = 0; y < (this.h >> 1); y++) for (let x = 0; x < this.w; x++) { const a = y * this.w + x, b = (this.h - 1 - y) * this.w + x; const t = this.px[a]; this.px[a] = this.px[b]; this.px[b] = t; } }
  clone(): C8 { const c = new C8(this.w, this.h); c.px.set(this.px); return c; }
  bbox() { let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1; for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.px[y * this.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, y0, x1, y1 }; }
}

/** Volume shading on BASE pixels (light from the top), plus optional pattern. */
export function shade(c: C8, light = true) {
  const colTop = new Int16Array(c.w).fill(-1), colBot = new Int16Array(c.w).fill(-1);
  for (let x = 0; x < c.w; x++) for (let y = 0; y < c.h; y++) if (c.px[y * c.w + x] === P.BASE) { if (colTop[x] < 0) colTop[x] = y; colBot[x] = y; }
  for (let x = 0; x < c.w; x++) {
    if (colTop[x] < 0) continue; const span = colBot[x] - colTop[x] + 1;
    for (let y = colTop[x]; y <= colBot[x]; y++) {
      if (c.px[y * c.w + x] !== P.BASE) continue;
      const t = span <= 2 ? 0.5 : (y - colTop[x]) / (span - 1);
      if (light && t < 0.22) c.px[y * c.w + x] = P.LIGHT; else if (t > 0.72) c.px[y * c.w + x] = P.SHADE;
    }
  }
}

export function outline(c: C8, col = P.OUT) {
  const add: number[] = [];
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (c.px[y * c.w + x]) continue;
    if (c.get(x - 1, y) || c.get(x + 1, y) || c.get(x, y - 1) || c.get(x, y + 1)) add.push(y * c.w + x);
  }
  for (const i of add) c.px[i] = col;
}
