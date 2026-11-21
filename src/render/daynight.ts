// Day and night: a slow visual cycle (real time, independent of simulation speed). Sun and moon arc over the sky,
// stars come out, the world takes on warm dusk and cool night tints, and lights (glows, windows) matter more at night.
import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { BiomeDef } from '../data/biomes';
import type { Camera } from './camera';
import { makeCanvas, mix } from './util';
import { RNG } from '../shared/rng';

const DAY_SECONDS = 360;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function sunTex(): Texture {
  const c = makeCanvas(48, 48), x = c.getContext('2d')!;
  for (let r = 22; r > 6; r -= 4) { x.fillStyle = `rgba(255,236,170,${0.05 + (22 - r) * 0.012})`; disc(x, 24, 24, r); }
  x.fillStyle = '#ffe9a0'; disc(x, 24, 24, 7); x.fillStyle = '#fff8dc'; disc(x, 23, 23, 5);
  const t = Texture.from(c); t.source.scaleMode = 'nearest'; return t;
}
function moonTex(): Texture {
  const c = makeCanvas(40, 40), x = c.getContext('2d')!;
  for (let r = 18; r > 6; r -= 4) { x.fillStyle = `rgba(190,210,255,${0.04 + (18 - r) * 0.01})`; disc(x, 20, 20, r); }
  x.fillStyle = '#dfe6f4'; disc(x, 20, 20, 6); x.fillStyle = '#b8c2d8'; x.fillRect(17, 18, 2, 2); x.fillRect(21, 22, 2, 1); x.fillRect(22, 17, 1, 1); x.fillStyle = '#f4f8ff'; x.fillRect(17, 16, 2, 1);
  const t = Texture.from(c); t.source.scaleMode = 'nearest'; return t;
}
function starsTex(): Texture {
  const c = makeCanvas(256, 160), x = c.getContext('2d')!, r = new RNG(77);
  for (let i = 0; i < 170; i++) { const px = r.int(256), py = r.int(160), b = r.next(); x.fillStyle = b > 0.9 ? '#ffffff' : b > 0.6 ? '#c8d8ff' : '#7f8fb8'; x.fillRect(px, py, 1, 1); if (b > 0.97) { x.fillStyle = 'rgba(200,215,255,.5)'; x.fillRect(px - 1, py, 3, 1); x.fillRect(px, py - 1, 1, 3); } }
  const t = Texture.from(c); t.source.scaleMode = 'nearest'; t.source.addressMode = 'repeat'; return t;
}
function glowTex(): Texture {
  const c = makeCanvas(1, 64), x = c.getContext('2d')!, g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,140,80,0)'); g.addColorStop(0.7, 'rgba(255,150,90,.55)'); g.addColorStop(1, 'rgba(255,190,120,.8)'); x.fillStyle = g; x.fillRect(0, 0, 1, 64);
  return Texture.from(c);
}
function disc(x: CanvasRenderingContext2D, cx: number, cy: number, r: number) { for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); x.fillRect(cx - w, cy + dy, w * 2 + 1, 1); } }

export interface Grade { world: number; sky: number; layers: number; glow: number; night: number; }

export class DayNight {
  container = new Container();
  private stars = new TilingSprite({ texture: starsTex(), width: 100, height: 100 });
  private sun = new Sprite(sunTex()); private moon = new Sprite(moonTex());
  private dusk = new Sprite(glowTex());
  tod = 0.33; enabled = true;
  private strength = 1; private sea = false;

  constructor() {
    this.sun.anchor.set(0.5); this.moon.anchor.set(0.5); this.dusk.blendMode = 'add';
    this.container.addChild(this.stars, this.dusk, this.moon, this.sun);
  }
  setWorld(def: BiomeDef) {
    this.sea = def.group === 'sea';
    this.strength = def.env.sunlight < 0.3 ? 0.2 : this.sea ? 0.6 : 1;
  }

  update(dt: number, cam: Camera, horizonWorldY: number): Grade {
    if (this.enabled) this.tod = (this.tod + dt / DAY_SECONDS) % 1; else this.tod += (0.38 - this.tod) * Math.min(1, dt * 2);
    const a = (this.tod - 0.25) * Math.PI * 2, el = Math.sin(a); // sun elevation -1..1
    const day = smooth(-0.18, 0.22, el), night = 1 - day, dusk = Math.exp(-Math.pow(el / 0.2, 2));
    const k = this.strength;
    const { sw, sh, zoom } = cam;
    const hz = Math.max(sh * 0.25, Math.min(sh * 1.2, sh / 2 + (horizonWorldY - cam.y) * zoom * 0.3));
    const px = Math.max(2, Math.min(3, Math.round(zoom * 0.3)));
    const arcX = (p: number) => sw * (0.12 + 0.76 * p), arcY = (e: number) => hz - e * Math.min(hz * 0.92, sh * 0.7);
    // sun runs 0.25 → 0.75 across the sky; the moon takes the night
    const ps = (this.tod - 0.25 + 1) % 1 / 0.5, pm = (this.tod - 0.75 + 1) % 1 / 0.5;
    this.sun.visible = !this.sea && el > -0.12; this.sun.position.set(arcX(ps), arcY(el)); this.sun.scale.set(px);
    this.sun.tint = mix(0xffffff, 0xff9a60, dusk * 0.8);
    this.moon.visible = !this.sea && el < 0.12; this.moon.position.set(arcX(Math.min(1, pm)), arcY(-el)); this.moon.scale.set(px);
    this.stars.width = sw; this.stars.height = hz; this.stars.tileScale.set(px); this.stars.tilePosition.x = -cam.x * zoom * 0.02;
    this.stars.alpha = this.sea ? 0 : Math.max(0, night - 0.15) * k;
    this.dusk.width = sw; this.dusk.height = sh * 0.35; this.dusk.y = hz - sh * 0.3; this.dusk.alpha = this.sea ? 0 : dusk * 0.6 * k;
    // colour grade
    const nightTint = this.sea ? 0x4a62a0 : 0x3c4a88, duskTint = 0xffb48a;
    let world = mix(0xffffff, duskTint, dusk * 0.45 * k); world = mix(world, nightTint, night * 0.78 * k);
    let sky = mix(0xffffff, 0xff9a70, dusk * 0.5 * k); sky = mix(sky, 0x1a2350, night * 0.9 * k);
    const layers = mix(world, sky, 0.35);
    return { world, sky, layers, glow: 0.75 + night * 0.9 * k, night: night * k };
  }
}
