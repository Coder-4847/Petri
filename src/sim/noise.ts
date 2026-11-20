import { RNG } from '../shared/rng';

/** Seeded value noise (1D / 2D) with smooth interpolation. Output in [0,1]. */
export class Noise {
  private p = new Uint8Array(512);
  private v = new Float32Array(256);
  constructor(seed: number) {
    const r = new RNG(seed);
    for (let i = 0; i < 256; i++) { this.p[i] = i; this.v[i] = r.next(); }
    for (let i = 255; i > 0; i--) { const j = r.int(i + 1); const t = this.p[i]; this.p[i] = this.p[j]; this.p[j] = t; }
    for (let i = 0; i < 256; i++) this.p[i + 256] = this.p[i];
  }
  private lat(x: number, y: number) { return this.v[this.p[(this.p[x & 255] + y) & 255]]; }
  n2(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const a = this.lat(xi, yi), b = this.lat(xi + 1, yi), c = this.lat(xi, yi + 1), d = this.lat(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }
  n1(x: number) { return this.n2(x, 7.31); }
  fbm1(x: number, oct = 4): number {
    let s = 0, a = 0.5, f = 1, t = 0;
    for (let i = 0; i < oct; i++) { s += a * this.n2(x * f, i * 13.7); t += a; a *= 0.5; f *= 2; }
    return s / t;
  }
  fbm2(x: number, y: number, oct = 3): number {
    let s = 0, a = 0.5, f = 1, t = 0;
    for (let i = 0; i < oct; i++) { s += a * this.n2(x * f + i * 17.1, y * f + i * 5.3); t += a; a *= 0.5; f *= 2; }
    return s / t;
  }
}
