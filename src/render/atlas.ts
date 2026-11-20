import { Texture, Rectangle } from 'pixi.js';
import { makeCanvas } from './util';

const PAGE = 2048;

export class AtlasPage {
  canvas = makeCanvas(PAGE, PAGE);
  ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
  texture: Texture;
  sx = 1; sy = 1; sh = 0; // shelf cursor
  dirty = false;
  constructor(public index: number) {
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'nearest';
    this.texture.source.autoGenerateMipmaps = false;
  }
  /** Try to pack all frames of a set on this page. Returns rects or null (state unchanged). */
  tryPack(frames: HTMLCanvasElement[]): { x: number; y: number }[] | null {
    let { sx, sy, sh } = this;
    const out: { x: number; y: number }[] = [];
    for (const f of frames) {
      const w = f.width + 1, h = f.height + 1;
      if (sx + w > PAGE) { sx = 1; sy += sh + 1; sh = 0; }
      if (sy + h > PAGE) return null;
      out.push({ x: sx, y: sy }); sx += w; if (h > sh) sh = h;
    }
    this.sx = sx; this.sy = sy; this.sh = sh;
    return out;
  }
}

/** Multi-page dynamic texture atlas. A species' frames always live on one page. */
export class Atlas {
  pages: AtlasPage[] = [];
  /** Pack frames; returns page index and per-frame textures. */
  add(frames: HTMLCanvasElement[]): { page: number; tex: Texture[] } {
    let page = -1, pos: { x: number; y: number }[] | null = null;
    for (let i = this.pages.length - 1; i >= 0 && i >= this.pages.length - 2; i--) { pos = this.pages[i].tryPack(frames); if (pos) { page = i; break; } }
    if (!pos) { const p = new AtlasPage(this.pages.length); this.pages.push(p); pos = p.tryPack(frames); page = p.index; }
    const p = this.pages[page];
    const tex = frames.map((f, i) => {
      p.ctx.drawImage(f, pos![i].x, pos![i].y);
      return new Texture({ source: p.texture.source, frame: new Rectangle(pos![i].x, pos![i].y, f.width, f.height) });
    });
    p.dirty = true;
    return { page, tex };
  }
  flush() { for (const p of this.pages) if (p.dirty) { p.texture.source.update(); p.dirty = false; } }
}
