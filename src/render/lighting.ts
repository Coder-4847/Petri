import { Sprite, Texture } from 'pixi.js';
import { makeCanvas } from './util';

/** Screen-space vignette + ambient colour, multiplied over the scene. */
export class Lighting {
  sprite: Sprite;
  constructor() {
    const c = makeCanvas(128, 128); const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 20, 64, 64, 92);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.65, 'rgba(236,240,250,1)'); g.addColorStop(1, 'rgba(150,160,190,1)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = Texture.from(c); t.source.scaleMode = 'linear';
    this.sprite = new Sprite(t); this.sprite.blendMode = 'multiply';
  }
  resize(w: number, h: number) { this.sprite.width = w; this.sprite.height = h; }
  setAmbient(color: number) { this.sprite.tint = color; }
}
