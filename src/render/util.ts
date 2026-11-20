export const hexR = (c: number) => (c >> 16) & 255;
export const hexG = (c: number) => (c >> 8) & 255;
export const hexB = (c: number) => c & 255;
export const rgb = (r: number, g: number, b: number) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
export function mix(a: number, b: number, t: number): number {
  return rgb(hexR(a) + (hexR(b) - hexR(a)) * t, hexG(a) + (hexG(b) - hexG(a)) * t, hexB(a) + (hexB(b) - hexB(a)) * t);
}
export const css = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
export function hsl2rgb(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return rgb(f(0) * 255, f(8) * 255, f(4) * 255);
}
/** Integer hash -> [0,1) */
export function hash2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
