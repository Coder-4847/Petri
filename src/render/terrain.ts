import { Container, Sprite, Texture, Mesh, MeshGeometry, Shader, UniformGroup, BufferImageSource } from 'pixi.js';
import { W, H, AIR, LAVA, ICE, IS_SOLID, IS_WATER, SNOW } from '../shared/constants';
import { DEFAULT_PAL, type BiomeDef, type MediumPal } from '../data/biomes';
import { hexR, hexG, hexB, hash2, makeCanvas, mix } from './util';

export const PX = 4; // texels per world cell in the terrain texture

const VERT = `
in vec2 aPosition; in vec2 aUV; out vec2 vUV;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
void main(){ mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition,1.0)).xy,0.0,1.0); vUV = aUV; }`;

// Water + lava volume. R: 1=water, 0.5=lava. G: depth below water surface (cells). B: light 0..1.
const FRAG = `
in vec2 vUV; out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime; uniform float uMode; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec2 uWorld; uniform float uDim;
float caustic(vec2 uv, float time){
  vec2 p = mod(uv*6.28318530718, 6.28318530718) - 250.0; vec2 i = p; float c = 1.0; float inten = .005;
  for (int n = 0; n < 4; n++) { float t = time * (1.0 - (3.5 / float(n+1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x+t)/inten), p.y / (cos(i.y+t)/inten))); }
  c /= 4.0; c = 1.17 - pow(c, 1.4); return pow(abs(c), 8.0);
}
void main(){
  vec4 d = texture(uTexture, vUV);
  vec2 cell = vUV * uWorld;
  vec2 q = floor(cell * 4.0) / 4.0;
  if (d.r > 0.9) {
    float depth = d.g * 255.0; float light = d.b;
    vec3 col = mix(uDeep, uShallow, pow(light, 0.8));
    float cs = caustic(q * 0.045, uTime * 0.5) * light * light;
    vec4 up = texture(uTexture, vUV - vec2(0.0, 1.0 / uWorld.y));
    float surf = 0.0;
    if (up.r < 0.9) { float wave = 0.3 + 0.16 * sin(cell.x * 0.7 + uTime * 1.6) + 0.08 * sin(cell.x * 1.9 - uTime * 2.3); surf = step(fract(cell.y), wave); }
    if (uMode < 0.5) {
      col += vec3(0.55, 0.9, 1.0) * cs * 0.55;
      col = mix(col, vec3(0.88, 0.98, 1.0), surf * 0.75);
      col *= uDim;
      float a = 0.93; finalColor = vec4(col * a, a);
    } else {
      // translucent overlay in front of creatures: depth haze + a little caustic shimmer
      float haze = 1.0 - exp(-depth * 0.012);
      col = col + vec3(0.5, 0.85, 1.0) * cs * 0.5;
      float a = (0.08 + 0.22 * haze) + surf * 0.35; finalColor = vec4(mix(col, vec3(0.9,1.0,1.0), surf) * a, a);
    }
  } else if (d.r > 0.4) {
    if (uMode > 0.5) { finalColor = vec4(0.0); return; }
    float n = sin(q.x*1.3+uTime*0.8) + sin(q.y*1.7-uTime*0.6) + sin((q.x+q.y)*0.9+uTime*0.5) + sin(q.x*3.1 - q.y*2.2 + uTime*1.3)*0.5;
    vec3 col = mix(vec3(0.75, 0.16, 0.04), vec3(1.0, 0.72, 0.2), smoothstep(-1.0, 2.2, n));
    float crust = step(1.7, n * 0.5 + sin(q.x * 5.0) * 0.4); col = mix(col, vec3(0.25, 0.07, 0.03), crust * 0.7);
    vec4 up = texture(uTexture, vUV - vec2(0.0, 1.0 / uWorld.y)); if (up.r < 0.4) col = mix(col, vec3(1.0, 0.9, 0.5), 0.5);
    finalColor = vec4(col, 1.0);
  } else { finalColor = vec4(0.0); }
}`;

const rgb3 = (c: number) => [hexR(c) / 255, hexG(c) / 255, hexB(c) / 255];

/** Static ground texture + animated water/lava volume for one biome. */
export class TerrainLayer {
  ground = new Container();
  waterBack: Mesh<MeshGeometry, Shader> | null = null;
  waterFront: Mesh<MeshGeometry, Shader> | null = null;
  private groundSprite: Sprite | null = null;
  private dataSource: BufferImageSource | null = null;
  private uniBack: UniformGroup | null = null;
  private uniFront: UniformGroup | null = null;
  private data = new Uint8Array(W * H * 4);
  private geom: MeshGeometry | null = null;
  private tex: Texture | null = null;
  private groundTex: Texture | null = null;

  private ready = false;
  private makeWater() {
    this.dataSource = new BufferImageSource({ resource: this.data, width: W, height: H, format: 'rgba8unorm', scaleMode: 'nearest', alphaMode: 'no-premultiply-alpha' as any });
    const positions = new Float32Array([0, 0, W, 0, W, H, 0, H]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    this.geom = new MeshGeometry({ positions, uvs, indices });
    const mk = (mode: number) => {
      const uni = new UniformGroup({
        uTime: { value: 0, type: 'f32' }, uMode: { value: mode, type: 'f32' },
        uShallow: { value: [0, 0, 0], type: 'vec3<f32>' }, uDeep: { value: [0, 0, 0], type: 'vec3<f32>' },
        uWorld: { value: [W, H], type: 'vec2<f32>' }, uDim: { value: 1, type: 'f32' },
      });
      const shader = Shader.from({ gl: { vertex: VERT, fragment: FRAG }, resources: { uTexture: this.dataSource!, uSampler: this.dataSource!.style, waterUniforms: uni } });
      return { uni, mesh: new Mesh({ geometry: this.geom!, shader }) };
    };
    const b = mk(0), f = mk(1);
    this.waterBack = b.mesh; this.uniBack = b.uni; this.waterFront = f.mesh; this.uniFront = f.uni;
    this.ready = true;
  }

  build(def: BiomeDef, medium: Uint8Array, light: Uint8Array) {
    // ground is repainted; the water meshes and their data texture live for the whole session
    this.ground.removeChildren();
    this.groundSprite?.destroy(); this.groundTex?.destroy(true);
    const canvas = paintGround(def, medium);
    this.groundTex = Texture.from(canvas);
    this.groundTex.source.scaleMode = 'nearest';
    this.groundSprite = new Sprite(this.groundTex);
    this.groundSprite.scale.set(1 / PX);
    this.ground.addChild(this.groundSprite);
    if (!this.ready) this.makeWater();
    this.writeData(medium, light);
    this.dataSource!.update();
    for (const u of [this.uniBack!, this.uniFront!]) { u.uniforms.uShallow = rgb3(def.water[0]); u.uniforms.uDeep = rgb3(def.water[1]); }
  }

  private writeData(medium: Uint8Array, light: Uint8Array) {
    const d = this.data;
    for (let x = 0; x < W; x++) {
      let depth = 0;
      for (let y = 0; y < H; y++) {
        const i = y * W + x, m = medium[i], o = i * 4;
        if (IS_WATER[m]) { d[o] = 255; d[o + 1] = Math.min(255, depth++); d[o + 2] = light[i]; d[o + 3] = 255; }
        else if (m === LAVA) { d[o] = 128; d[o + 1] = 0; d[o + 2] = 255; d[o + 3] = 255; depth = 0; }
        else { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 0; depth = 0; }
      }
    }
  }

  /** Refresh water light/depth after the environment changes (cheap, no repaint of ground). */
  refreshLight(medium: Uint8Array, light: Uint8Array) { this.writeData(medium, light); this.dataSource?.update(); }

  update(time: number, dim = 1) {
    if (this.uniBack) { this.uniBack.uniforms.uTime = time; this.uniBack.uniforms.uDim = dim; }
    if (this.uniFront) this.uniFront.uniforms.uTime = time;
  }

}

/** Paint every solid cell (and cave back-walls) at PX texels per cell with pixel-art shading. */
function paintGround(def: BiomeDef, medium: Uint8Array): HTMLCanvasElement {
  const cw = W * PX, ch = H * PX;
  const canvas = makeCanvas(cw, ch);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cw, ch);
  const buf = new Uint32Array(img.data.buffer);
  const pal = (m: number): MediumPal => def.pal[m] ?? DEFAULT_PAL[m] ?? DEFAULT_PAL[5];
  const pk = (c: number) => (255 << 24) | (hexB(c) << 16) | (hexG(c) << 8) | hexR(c);

  // depth below the exposed top surface, per cell, and cave detection (air beneath ground)
  const dtop = new Uint8Array(W * H), cave = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    let d = 0, roofed = false;
    for (let y = 0; y < H; y++) {
      const i = y * W + x, s = IS_SOLID[medium[i]];
      if (s) { d = Math.min(255, d + 1); roofed = true; dtop[i] = d; }
      else { d = 0; if (roofed && medium[i] !== LAVA) cave[i] = 1; }
    }
  }
  // palettes darken with depth (16 dithered buckets) so the underground reads as deep
  const cache = new Map<number, [number, number, number, number, number]>();
  const colors = (m: number, depthY: number, jitter: number) => {
    const bucket = Math.min(15, Math.max(0, (((depthY / H) * 17 - 3) + jitter) | 0)), key = m * 32 + bucket;
    let c = cache.get(key);
    if (!c) { const p = pal(m), k = bucket * 0.04, dk = (v: number) => mix(v, 0x06080d, k);
      c = [pk(dk(p.hi)), pk(dk(p.base)), pk(dk(p.lo)), p.cap ? pk(p.cap) : 0, p.cap ? pk(mix(p.cap, 0xffffff, 0.28)) : 0]; cache.set(key, c); }
    return c;
  };
  const rockLo = pal(5).lo;
  const caveCol = [pk(mix(rockLo, 0x000000, 0.55)), pk(mix(rockLo, 0x000000, 0.7)), pk(mix(rockLo, 0x000000, 0.4))];

  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx, m = medium[i];
      const solid = IS_SOLID[m];
      if (!solid && !cave[i]) continue;
      const aboveSolid = cy > 0 && IS_SOLID[medium[i - W]];
      const belowSolid = cy < H - 1 ? IS_SOLID[medium[i + W]] : 1;
      const leftSolid = cx > 0 ? IS_SOLID[medium[i - 1]] : 1;
      const rightSolid = cx < W - 1 ? IS_SOLID[medium[i + 1]] : 1;
      const dd = dtop[i];
      const [chi, cbase, clo, ccap, ccapHi] = solid ? colors(m, cy, hash2(cx, cy, 21)) : [0, 0, 0, 0, 0];
      const isIce = m === ICE, isSnow = m === SNOW;
      for (let ty = 0; ty < PX; ty++) {
        for (let tx = 0; tx < PX; tx++) {
          const X = cx * PX + tx, Y = cy * PX + ty;
          const r = hash2(X, Y, 1);
          let c: number;
          if (!solid) { // cave back-wall
            c = caveCol[r > 0.8 ? 2 : r > 0.4 ? 0 : 1];
            if (!aboveSolid && ty === 0) c = caveCol[2];
          } else {
            const blob = hash2(X >> 2, Y >> 1, 7) * 0.55 + hash2(X >> 1, Y >> 1, 8) * 0.3 + r * 0.15;
            c = blob > 0.72 ? chi : blob < 0.3 ? clo : cbase;
            if (isIce && r > 0.93) c = pk(0xffffff);
            else if (dd > 6 && !isSnow && ((cy + ((cx * 0.07) | 0)) % 9 === 0) && ty === 1) c = clo; // faint strata
            // deeper ground gets darker
            if (dd > 2 && !isSnow) { const t = Math.min(0.5, (dd - 2) * 0.018); if (hash2(X >> 1, Y >> 1, 3) < t * 2) c = clo; }
            // grassy/snowy cap with a ragged lower edge
            if (ccap && !aboveSolid) {
              const rag = 2 + (hash2(X, 0, 5) > 0.55 ? 1 : 0) + (hash2(X >> 1, 1, 6) > 0.7 ? 1 : 0);
              if (ty < rag) c = ty === 0 || r > 0.78 ? ccapHi : ccap;
              else if (ty === rag && r > 0.45) c = ccap;
            } else if (ccap && dd === 2 && ty < 1 && r > 0.5) c = ccap; // roots show under thin caps
            // lit left edges / shadowed right & under edges
            if (!leftSolid && tx === 0) c = chi;
            if (!rightSolid && tx === PX - 1) c = clo;
            if (!belowSolid && ty === PX - 1) c = clo;
          }
          buf[Y * cw + X] = c;
        }
      }
      // grass fringe above the surface
      if (solid && ccap && !aboveSolid && cy > 0) {
        for (let tx = 0; tx < PX; tx++) {
          const X = cx * PX + tx, r = hash2(X, cy, 9);
          if (r > 0.5) { const hgt = r > 0.9 ? 2 : 1; for (let k = 1; k <= hgt; k++) { const Y = cy * PX - k; if (Y >= 0 && !buf[Y * cw + X]) buf[Y * cw + X] = r > 0.8 ? ccapHi : ccap; } }
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
