import { Container, Sprite, Texture, Mesh, MeshGeometry, Shader, UniformGroup, BufferImageSource } from 'pixi.js';
import { W, H, LAVA, IS_WATER } from '../shared/constants';
import type { BiomeDef } from '../data/biomes';
import { hexR, hexG, hexB } from './util';
import { paintGround, PX } from './ground';

export { PX };

const VERT = `
in vec2 aPosition; in vec2 aUV; out vec2 vUV;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
void main(){ mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition,1.0)).xy,0.0,1.0); vUV = aUV; }`;

// Water + lava volume. R: 1=water, 0.5=lava. G: depth below water surface (cells). B: light 0..1.
const FRAG = `
in vec2 vUV; out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime; uniform float uMode; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec2 uWorld; uniform float uDim; uniform vec3 uTint;
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
    vec3 col = mix(uDeep, uShallow, pow(light, 0.85));
    float cs = caustic(q * 0.045, uTime * 0.5) * light * light;
    // god rays: slanted, slowly swaying shafts that fade with depth
    float ray = pow(max(0.0, sin((q.x + q.y * 0.42) * 0.11 + sin(uTime * 0.13 + q.x * 0.01) * 2.2)), 10.0) + 0.6 * pow(max(0.0, sin((q.x + q.y * 0.38) * 0.053 - uTime * 0.07)), 14.0);
    ray *= light * exp(-depth * 0.018);
    vec4 up = texture(uTexture, vUV - vec2(0.0, 1.0 / uWorld.y));
    float surf = 0.0, foam = 0.0;
    if (up.r < 0.9) { float wave = 0.3 + 0.16 * sin(cell.x * 0.7 + uTime * 1.6) + 0.08 * sin(cell.x * 1.9 - uTime * 2.3); surf = step(fract(cell.y), wave); foam = step(0.82, fract(sin(floor(q.x * 2.0) * 12.9898 + floor(uTime * 3.0)) * 43758.5453)) * surf; }
    float sub = (up.r > 0.9 && texture(uTexture, vUV - vec2(0.0, 2.0 / uWorld.y)).r < 0.9) ? 1.0 : 0.0;
    if (uMode < 0.5) {
      col += vec3(0.55, 0.9, 1.0) * cs * 0.55 + vec3(0.6, 0.9, 1.0) * ray * 0.16;
      col = mix(col, uShallow * 1.25, sub * 0.35);
      col = mix(col, vec3(0.88, 0.98, 1.0), surf * 0.75); col = mix(col, vec3(1.0), foam * 0.6);
      col *= uDim * uTint;
      float a = 0.93; finalColor = vec4(col * a, a);
    } else {
      float haze = 1.0 - exp(-depth * 0.012);
      col = col + vec3(0.5, 0.85, 1.0) * cs * 0.5 + vec3(0.7, 0.95, 1.0) * ray * 0.5;
      col *= uTint;
      float a = (0.07 + 0.24 * haze) + surf * 0.35 + ray * 0.1; finalColor = vec4(mix(col, vec3(0.9,1.0,1.0) * uTint, surf) * a, a);
    }
  } else if (d.r > 0.4) {
    if (uMode > 0.5) { finalColor = vec4(0.0); return; }
    float n = sin(q.x*1.3+uTime*0.8) + sin(q.y*1.7-uTime*0.6) + sin((q.x+q.y)*0.9+uTime*0.5) + sin(q.x*3.1 - q.y*2.2 + uTime*1.3)*0.5;
    vec3 col = mix(vec3(0.75, 0.16, 0.04), vec3(1.0, 0.72, 0.2), smoothstep(-1.0, 2.2, n));
    float crust = step(1.7, n * 0.5 + sin(q.x * 5.0) * 0.4); col = mix(col, vec3(0.25, 0.07, 0.03), crust * 0.7);
    vec4 up = texture(uTexture, vUV - vec2(0.0, 1.0 / uWorld.y)); if (up.r < 0.4) col = mix(col, vec3(1.0, 0.9, 0.5), 0.5);
    col *= mix(uTint, vec3(1.0), 0.75);
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
        uWorld: { value: [W, H], type: 'vec2<f32>' }, uDim: { value: 1, type: 'f32' }, uTint: { value: [1, 1, 1], type: 'vec3<f32>' },
      });
      const shader = Shader.from({ gl: { vertex: VERT, fragment: FRAG }, resources: { uTexture: this.dataSource!, uSampler: this.dataSource!.style, waterUniforms: uni } });
      return { uni, mesh: new Mesh({ geometry: this.geom!, shader }) };
    };
    const b = mk(0), f = mk(1);
    this.waterBack = b.mesh; this.uniBack = b.uni; this.waterFront = f.mesh; this.uniFront = f.uni;
    this.ready = true;
  }

  private paintedKey = '';
  build(def: BiomeDef, medium: Uint8Array, light: Uint8Array) {
    // ground is repainted only when the grid changed; the water meshes and their data texture live for the whole session
    let h = 2166136261; for (let i = 0; i < medium.length; i++) h = Math.imul(h ^ medium[i], 16777619);
    const key = def.id + ':' + h;
    if (key === this.paintedKey && this.ready) { this.refreshLight(medium, light); return; }
    this.paintedKey = key;
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

  tint = 0xffffff;
  update(time: number, dim = 1) {
    const t = [hexR(this.tint) / 255, hexG(this.tint) / 255, hexB(this.tint) / 255];
    if (this.uniBack) { this.uniBack.uniforms.uTime = time; this.uniBack.uniforms.uDim = dim; this.uniBack.uniforms.uTint = t; }
    if (this.uniFront) { this.uniFront.uniforms.uTime = time; this.uniFront.uniforms.uTint = t; }
  }

}

