// Genome -> pixel sprite. (Phase 1: compact stand-in; Phase 4 replaces this with the full modular generator.)
import { G } from '../shared/constants';
import { hsl2rgb, css, makeCanvas } from './util';

export interface SpriteSet { frames: HTMLCanvasElement[]; basePx: number; color: number; }

export function generateSprite(genome: number[] | Float32Array): SpriteSet {
  const size = genome[G.SIZE];
  const px = Math.max(8, Math.round(10 + size * 22));
  const hue = genome[G.HUE], col = hsl2rgb(hue, 0.55, 0.55), dark = hsl2rgb(hue, 0.5, 0.3), light = hsl2rgb(hue, 0.5, 0.75);
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const c = makeCanvas(px, Math.round(px * 0.7)); const x = c.getContext('2d')!;
    const h = c.height, bodyW = px * 0.7, bodyH = h * 0.7;
    const wag = Math.sin((f / 4) * Math.PI * 2) * (h * 0.12);
    x.fillStyle = css(dark);
    // tail
    for (let i = 0; i < px * 0.3; i++) { const t = i / (px * 0.3); const hh = (1 - t * 0.2) * bodyH * 0.5; x.fillRect(Math.round(i), Math.round(h / 2 - hh / 2 + wag * (1 - t)), 1, Math.max(1, Math.round(hh))); }
    // body
    for (let i = 0; i < bodyW; i++) { const t = i / bodyW; const hh = Math.sin(Math.PI * (0.15 + t * 0.85)) * bodyH; const y0 = Math.round(h / 2 - hh / 2);
      x.fillStyle = css(col); x.fillRect(Math.round(px * 0.28 + i), y0, 1, Math.max(1, Math.round(hh)));
      x.fillStyle = css(light); x.fillRect(Math.round(px * 0.28 + i), y0, 1, Math.max(1, Math.round(hh * 0.25))); }
    x.fillStyle = '#10141c'; x.fillRect(Math.round(px * 0.85), Math.round(h * 0.38), Math.max(1, Math.round(px / 14)), Math.max(1, Math.round(px / 14)));
    frames.push(c);
  }
  const dot = makeCanvas(2, 2); const dx = dot.getContext('2d')!; dx.fillStyle = '#fff'; dx.fillRect(0, 0, 2, 2);
  frames.push(dot);
  return { frames, basePx: px, color: col };
}
