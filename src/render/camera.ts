import { W, H } from '../shared/constants';

/** Smooth pan/zoom camera over the side-view world. zoom = screen pixels per world cell. */
export class Camera {
  x = W / 2; y = H / 2; zoom = 4;
  tx = W / 2; ty = H / 2; tz = 4;
  sw = 1280; sh = 720;
  maxZoom = 72;

  get minZoom() { return Math.max(this.sw / W, this.sh / H); }

  setScreen(w: number, h: number) { this.sw = w; this.sh = h; this.tz = Math.max(this.tz, this.minZoom); }

  /** Zoom keeping the world point under screen (px,py) fixed. */
  zoomAt(px: number, py: number, factor: number) {
    const nz = Math.min(this.maxZoom, Math.max(this.minZoom, this.tz * factor));
    const wx = this.tx + (px - this.sw / 2) / this.tz, wy = this.ty + (py - this.sh / 2) / this.tz;
    this.tz = nz;
    this.tx = wx - (px - this.sw / 2) / nz; this.ty = wy - (py - this.sh / 2) / nz;
  }
  pan(dxPx: number, dyPx: number) { this.tx -= dxPx / this.zoom; this.ty -= dyPx / this.zoom; this.x = this.tx; this.y = this.ty; this.clampTarget(); }
  focus(wx: number, wy: number, zoom?: number) { this.tx = wx; this.ty = wy; if (zoom) this.tz = Math.min(this.maxZoom, Math.max(this.minZoom, zoom)); }

  private clampTarget() {
    const hw = this.sw / 2 / this.tz, hh = this.sh / 2 / this.tz;
    this.tx = Math.min(W - hw, Math.max(hw, this.tx));
    this.ty = Math.min(H - hh, Math.max(hh, this.ty));
  }

  update(dt: number) {
    this.tz = Math.min(this.maxZoom, Math.max(this.minZoom, this.tz));
    this.clampTarget();
    const k = 1 - Math.exp(-dt * 11);
    // Zoom smoothly in log space so it feels even at every scale.
    this.zoom = Math.exp(Math.log(this.zoom) + (Math.log(this.tz) - Math.log(this.zoom)) * k);
    this.x += (this.tx - this.x) * k; this.y += (this.ty - this.y) * k;
    const hw = this.sw / 2 / this.zoom, hh = this.sh / 2 / this.zoom;
    this.x = Math.min(W - hw, Math.max(hw, this.x)); this.y = Math.min(H - hh, Math.max(hh, this.y));
  }
  /** Top-left screen offset of world origin (rounded to whole pixels for crisp pixel art). */
  get ox() { return Math.round(this.sw / 2 - this.x * this.zoom); }
  get oy() { return Math.round(this.sh / 2 - this.y * this.zoom); }
  screenToWorld(px: number, py: number) { return { x: (px - this.ox) / this.zoom, y: (py - this.oy) / this.zoom }; }
  worldToScreenY(wy: number) { return wy * this.zoom + this.oy; }
  view() { const hw = this.sw / 2 / this.zoom, hh = this.sh / 2 / this.zoom; return { x0: this.x - hw, x1: this.x + hw, y0: this.y - hh, y1: this.y + hh }; }
}
