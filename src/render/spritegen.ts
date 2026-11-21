// Genome -> pixel creature. A genome is classified into a body plan (archetype), proportions come from the genes,
// colours from hue/saturation/camouflage/pattern genes, and each archetype has a painter that draws a pose.
// Frames: 0-3 movement cycle (swim / walk / fly / crawl), 4 attack or feeding, 5 dead (with exposed innards),
// 6 bleached bones, 7 dead (clean, gore off), 8 = 2x2 dot used at low zoom.
import { G } from '../shared/constants';
import { C8, P, shade, outline } from './canvas8';
import { hsl2rgb, hexR, hexG, hexB, makeCanvas, mix } from './util';

export interface SpriteSet { frames: HTMLCanvasElement[]; basePx: number; color: number; archetype: string; glow: boolean; glowCol: number; /** feet offset below centre, in body lengths (ground walkers) */ foot: number; }
interface Pose { ph: number; atk: number; }
type Pal = number[];

interface Design {
  g: ArrayLike<number>; size: number; L: number; arch: string; variant: string; rng: () => number; producer: boolean;
}

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
function hashGenome(g: ArrayLike<number>): number { let h = 2166136261; for (let i = 0; i < 55; i++) { h ^= Math.floor((g[i] ?? 0) * 997 + i * 31); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const sizeFromGene = (s: number) => 0.12 * Math.pow(250, s);

// ---------------------------------------------------------------------------------- classification
const TPL_ARCH: Record<string, [string, string]> = {
  coccus: ['micro', 'coccus'], bacillus: ['micro', 'bacillus'], spirillum: ['micro', 'spirillum'], flagellate: ['micro', 'flagellate'], ciliate: ['micro', 'ciliate'], diatom: ['micro', 'diatom'], amoeba: ['micro', 'amoeba'],
  eel: ['worm', 'eel'], crab: ['arthropod', 'beetle'], turtle: ['turtle', ''], frog: ['frog', ''], croc: ['croc', ''], snake: ['snake', ''], bat: ['bat', 'bat'], pterosaur: ['bat', 'pterosaur'], butterfly: ['butterfly', ''], spider: ['spider', ''], ant: ['ant', ''], stego: ['quadruped', 'stego'], trike: ['quadruped', 'trike'], plesio: ['whale', 'plesio'], snail: ['snail', ''], clam: ['sessile', 'clam'], anemone: ['sessile', 'anemone'],
  volvox: ['colony', ''], stromatolite: ['mat', ''], choanoflagellate: ['colony', 'grazer'], sponge: ['sessile', 'sponge'], coral: ['sessile', 'coral'], jellyfish: ['jelly', ''],
  copepod: ['arthropod', 'crustacean'], trilobite: ['arthropod', 'trilobite'], worm: ['worm', ''], fish: ['fish', ''], dunkleosteus: ['fish', 'armored'], squid: ['squid', ''],
  moss: ['moss', ''], fern: ['fern', ''], tree: ['tree', ''], kelp: ['kelp', ''], insect: ['arthropod', 'insect'], dragonfly: ['arthropod', 'insect'], scorpion: ['arthropod', 'scorpion'],
  amphibian: ['quadruped', 'lizard'], reptile: ['quadruped', 'lizard'], sauropod: ['quadruped', 'sauropod'], theropod: ['biped', 'theropod'], bird: ['bird', ''],
  mammal: ['quadruped', 'mammal'], mammoth: ['quadruped', 'mammoth'], sabertooth: ['quadruped', 'cat'], whale: ['whale', ''], hominid: ['biped', 'hominid'],
};

export function classify(g: ArrayLike<number>, tpl?: string): { arch: string; variant: string; producer: boolean } {
  const size = sizeFromGene(g[G.SIZE]);
  const auto = Math.max(g[G.PHOTO], g[G.CHEMO]), het = Math.max(g[G.HERB], g[G.CARN], g[G.SCAV], g[G.FILTER], g[G.PARASITE]);
  const producer = auto >= het && auto > 0.35;
  const aquatic = g[G.GILLS] > 0.4;
  const hint = tpl ? TPL_ARCH[tpl] : undefined;
  if (hint && hint[0] === 'micro' && size < 0.4) return { arch: 'micro', variant: hint[1], producer };
  if (producer) {
    if (size < 0.3) return { arch: 'micro', variant: '', producer };
    if (hint && ['colony', 'mat', 'moss', 'fern', 'tree', 'kelp'].includes(hint[0])) { if (aquatic || hint[0] !== 'kelp') return { arch: hint[0], variant: '', producer }; }
    if (g[G.MULTICELL] < 0.65 && size < 0.5) return { arch: g[G.CUTICLE] > 0.4 && g[G.SWIM] < 0.05 ? 'mat' : 'colony', variant: '', producer };
    if (aquatic) return { arch: 'kelp', variant: '', producer };
    if (size < 0.4) return { arch: 'moss', variant: '', producer };
    if (g[G.WOODY] > 0.5 && size >= 0.5) return { arch: 'tree', variant: '', producer };
    return { arch: size < 0.5 || g[G.WOODY] < 0.2 ? 'grass' : 'fern', variant: '', producer };
  }
  if (size < 0.3) return { arch: 'micro', variant: '', producer };
  const sessile = g[G.SWIM] < 0.12 && g[G.WALK] < 0.12 && g[G.FLY] < 0.15 && g[G.CRAWL] < 0.2;
  if (hint && !sessile) {
    // trust the blueprint unless the genes have drifted far from it
    const [a, v] = hint;
    if (a === 'fish' && g[G.SWIM] > 0.3) return { arch: a, variant: v, producer };
    if (a === 'quadruped' && g[G.LIMBS] > 0.35) return { arch: a, variant: v, producer };
    if (a === 'biped' && g[G.LIMBS] > 0.45) return { arch: a, variant: v, producer };
    if (a === 'bird' && g[G.WINGS] > 0.4) return { arch: a, variant: v, producer };
    if (['jelly', 'worm', 'squid', 'whale', 'arthropod', 'colony', 'turtle', 'frog', 'croc', 'snake', 'butterfly', 'spider', 'ant'].includes(a)) return { arch: a, variant: v, producer };
    if (a === 'bat' && g[G.WINGS] > 0.3) return { arch: a, variant: v, producer };
  }
  if (sessile) return { arch: 'sessile', variant: hint && hint[0] === 'sessile' && hint[1] ? hint[1] : g[G.SHELL] > 0.45 ? 'coral' : g[G.FILTER] > 0.5 ? 'sponge' : g[G.VENOM] > 0.3 ? 'anemone' : 'clam', producer };
  if (g[G.WINGS] > 0.45 && g[G.FLY] > 0.35) return g[G.CUTICLE] > 0.5 && size < 1.2 ? { arch: 'arthropod', variant: 'insect', producer } : { arch: 'bird', variant: '', producer };
  const legs = g[G.LIMBS] >= 0.35 && (g[G.WALK] >= 0.25 || g[G.CRAWL] >= 0.3);
  if (legs && g[G.CUTICLE] > 0.5 && g[G.SEGMENTS] > 0.45 && size < 2.5) return { arch: 'arthropod', variant: g[G.SWIM] > 0.4 ? 'crustacean' : g[G.VENOM] > 0.3 ? 'scorpion' : g[G.SHELL] > 0.5 && aquatic ? 'trilobite' : g[G.SHELL] > 0.45 ? 'beetle' : 'insect', producer };
  if (legs && !aquatic && g[G.SHELL] > 0.6 && size > 0.4) return { arch: 'turtle', variant: '', producer };
  if (!legs && !aquatic && g[G.LIMBS] < 0.25 && g[G.SEGMENTS] > 0.4 && (g[G.CRAWL] > 0.3 || g[G.WALK] > 0.3) && size >= 0.4) return { arch: 'snake', variant: '', producer };
  if (legs && g[G.SWIM] > 0.5 && g[G.GILLS] < 0.5 && size > 1 && g[G.ENDOTHERM] < 0.4) return { arch: 'croc', variant: '', producer };
  if (legs && !aquatic && g[G.HORNS] > 0.5 && g[G.ARMOR] > 0.3 && g[G.HERB] > 0.6 && size > 3) return { arch: 'quadruped', variant: 'trike', producer };
  if (legs && !aquatic && g[G.ARMOR] > 0.5 && g[G.TAIL] > 0.5 && g[G.HERB] > 0.6 && size > 3) return { arch: 'quadruped', variant: 'stego', producer };
  if (legs && !aquatic) return g[G.INTEL] > 0.5 && g[G.LIMBS] > 0.75 ? { arch: 'biped', variant: 'hominid', producer } : { arch: 'quadruped', variant: g[G.ENDOTHERM] > 0.4 ? 'mammal' : size > 5 && g[G.HERB] > 0.5 ? 'sauropod' : 'lizard', producer };
  if (g[G.SWIM] > 0.3 && g[G.EYES] > 0.65 && g[G.INTEL] > 0.3 && g[G.FINS] < 0.45) return { arch: 'squid', variant: '', producer };
  if (g[G.SWIM] > 0.3 && (g[G.FINS] > 0.2 || g[G.HEAD] > 0.4 || g[G.TAIL] > 0.3)) return size > 8 && g[G.ENDOTHERM] > 0.4 ? { arch: 'whale', variant: '', producer } : { arch: 'fish', variant: g[G.ARMOR] > 0.45 ? 'armored' : '', producer };
  if (g[G.CRAWL] > 0.35 && g[G.LIMBS] < 0.35) return { arch: g[G.SHELL] > 0.5 ? 'snail' : 'worm', variant: '', producer };
  if (g[G.MULTICELL] > 0.4 && g[G.SWIM] > 0.1) return { arch: 'jelly', variant: '', producer };
  if (g[G.SWIM] > 0.3) return { arch: 'fish', variant: '', producer };
  return { arch: legs ? 'quadruped' : 'worm', variant: 'lizard', producer };
}

// ---------------------------------------------------------------------------------- palette
function makePalette(g: ArrayLike<number>, producer: boolean): Pal {
  const hue = g[G.HUE], sat = 0.3 + g[G.SAT] * 0.55, camo = g[G.CAMO];
  const l = producer ? 0.42 : 0.52;
  const base = hsl2rgb(hue, sat * (1 - camo * 0.35), l);
  const pal: Pal = new Array(16).fill(0);
  pal[P.OUT] = hsl2rgb(hue, 0.4, 0.1); pal[P.DARK] = hsl2rgb(hue, sat, l * 0.45); pal[P.SHADE] = hsl2rgb(hue, sat, l * 0.72); pal[P.BASE] = base; pal[P.LIGHT] = hsl2rgb(hue, sat * 0.85, Math.min(0.85, l + 0.18));
  pal[P.ACCENT] = hsl2rgb(hue + 0.45 * Math.max(0, g[G.PATTERN] - 0.35) + 0.04, Math.min(1, sat * 0.95 + 0.05), 0.5); pal[P.ACCENT2] = hsl2rgb(hue + 0.15, sat, 0.62);
  pal[P.EYE] = 0xf4f6f8; pal[P.PUPIL] = 0x10141c; pal[P.BELLY] = hsl2rgb(hue, sat * 0.4, 0.8);
  pal[P.GLOW] = hsl2rgb(0.5 + g[G.HUE] * 0.2, 0.9, 0.7); pal[P.GORE] = 0xb31f2d; pal[P.BONE] = 0xe8e2cf; pal[P.ORGAN] = 0xe0809a; pal[P.TOOTH] = 0xf6f2e6;
  return pal;
}

// ---------------------------------------------------------------------------------- shared parts
function eye(c: C8, x: number, y: number, r: number, atk = 0) {
  if (r <= 0.9) { c.set(x, y, P.PUPIL); return; }
  c.disc(x, y, r, r, P.EYE); c.set(x + (r > 1.6 ? 1 : 0), y + (atk > 0.5 ? 1 : 0), P.PUPIL); if (r > 2.4) c.set(x + 1, y, P.PUPIL);
}
const wave = (ph: number, k = 1, off = 0) => Math.sin(ph * k + off);

// ---------------------------------------------------------------------------------- painters
type Painter = (c: C8, d: Design, p: Pose) => void;
const g_ = (d: Design, k: number) => d.g[k];

/** Single-celled forms: cocci, rods, spirilla, flagellates, ciliates, diatoms, amoebae */
const micro: Painter = (c, d, p) => {
  const g = d.g, cx = c.w / 2 - 0.5, cy = c.h / 2 - 0.5, r = Math.max(2.4, d.L / 2 - 0.5), kinds = ['coccus', 'bacillus', 'spirillum', 'flagellate', 'ciliate', 'diatom', 'amoeba'];
  const k = d.variant || (d.producer && g[G.SWIM] < 0.1 ? kinds[[0, 1, 5, 0][Math.floor(d.rng() * 4)]] : kinds[Math.floor(d.rng() * kinds.length)]);
  d.variant = k;
  switch (k) {
    case 'bacillus': c.profile(cx - r, cx + r, (x) => { const t = (x - cx) / r; const hh = r * 0.5 * Math.sqrt(Math.max(0, 1 - t * t * t * t)); return [cy - hh, cy + hh]; }, P.BASE); break;
    case 'spirillum': for (let x = -r; x <= r; x++) { const y = Math.sin((x / r) * 5 + p.ph) * r * 0.45; c.disc(cx + x, cy + y, 1, 1, P.BASE); } break;
    case 'flagellate': c.disc(cx + 1, cy, r * 0.65, r * 0.55, P.BASE); for (let i = 1; i <= r + 2; i++) c.set(cx - r * 0.6 - i, cy + Math.sin(p.ph + i * 0.8) * (0.4 + i * 0.25), P.ACCENT); c.set(cx + r * 0.4, cy - 1, P.GORE); break;
    case 'ciliate': c.disc(cx, cy, r * 0.9, r * 0.6, P.BASE); for (let i = -r; i <= r; i += 1.4) { const o = Math.sin(p.ph + i) > 0 ? 1 : 0; c.set(cx + i, cy - r * 0.6 - 1 - o * 0, P.ACCENT); c.set(cx + i, cy + r * 0.6 + 1, P.ACCENT); } break;
    case 'diatom': c.profile(cx - r, cx + r, (x) => { const t = (x - cx) / r; const hh = r * 0.6 * (1 - Math.abs(t) * 0.7); return [cy - hh, cy + hh]; }, P.BASE); for (let x = -r + 1; x < r; x += 2) c.line(cx + x, cy - 1, cx + x, cy + 1, P.ACCENT); break;
    case 'amoeba': { c.disc(cx, cy, r * 0.7, r * 0.6, P.BASE); for (let a = 0; a < 5; a++) { const an = a * 1.26 + Math.sin(p.ph + a) * 0.5; c.disc(cx + Math.cos(an) * r * 0.85, cy + Math.sin(an) * r * 0.7, r * 0.3, r * 0.3, P.BASE); } c.disc(cx, cy, r * 0.25, r * 0.25, P.DARK); break; }
    default: c.disc(cx, cy, r * (0.85 + Math.sin(p.ph) * 0.05), r * 0.85, P.BASE); c.disc(cx + 1, cy, r * 0.3, r * 0.3, P.DARK);
  }
  if (g[G.PHOTO] > 0.35) for (let i = 0; i < 3; i++) c.set(cx - 1 + i * 1.3, cy + (i % 2) - 0.5, P.ACCENT2);
  if (g[G.BIOLUM] > 0.35) c.set(cx - 1, cy - 1, P.GLOW);
  if (d.size > 0.2 && p.atk > 0.5) c.set(cx + r, cy, P.GORE);
};

const colony: Painter = (c, d, p) => {
  const cx = c.w / 2 - 0.5, cy = c.h / 2 - 0.5, R = d.L / 2 - 1.5, n = 9 + Math.floor(d.rng() * 4);
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + p.ph * 0.15; c.disc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 2, 2, P.BASE); }
  c.disc(cx, cy, R * 0.55, R * 0.55, P.LIGHT, true); for (let i = 0; i < 4; i++) c.set(cx + Math.cos(i * 1.6 + p.ph) * R * 0.3, cy + Math.sin(i * 1.6) * R * 0.3, P.ACCENT2);
};
const mat: Painter = (c, d, p) => {
  const w = c.w - 4, base = c.h - 3; for (let x = 0; x < w; x++) { const hh = 2 + Math.floor((Math.sin(x * 0.7 + d.size * 9) + 1) * 1.6 + Math.sin(x * 0.23 + p.ph * 0.2) * 0.6); for (let y = 0; y < hh; y++) c.set(2 + x, base - y, y === hh - 1 ? P.LIGHT : P.BASE); }
  for (let x = 0; x < w; x += 3) c.set(2 + x, base - 1, P.ACCENT2);
};

const jelly: Painter = (c, d, p) => {
  const cx = c.w / 2 - 0.5, W = d.L * 0.5 * (1 + 0.14 * Math.sin(p.ph)), top = 3, hgt = d.L * 0.38 * (1 - 0.1 * Math.sin(p.ph));
  c.profile(cx - W, cx + W, (x) => { const t = (x - cx) / W; const h = hgt * Math.sqrt(Math.max(0, 1 - t * t)); return [top + hgt - h, top + hgt - 1 + (Math.abs(t) > 0.8 ? 1 : 0)]; }, P.BASE);
  c.disc(cx, top + hgt * 0.6, W * 0.35, hgt * 0.28, P.ACCENT, true); // gonads
  const n = 4 + Math.floor(d.L / 9);
  for (let i = 0; i < n; i++) { const x0 = cx - W * 0.8 + (i / Math.max(1, n - 1)) * W * 1.6, len = d.L * (0.35 + 0.2 * ((i * 7) % 3) / 3); for (let j = 0; j < len; j++) c.set(x0 + Math.sin(p.ph + j * 0.5 + i) * 1.1, top + hgt + j, i % 2 ? P.ACCENT : P.SHADE); }
  if (d.g[G.BIOLUM] > 0.3) for (let i = 0; i < 4; i++) c.set(cx - W * 0.6 + i * W * 0.4, top + hgt * 0.4, P.GLOW);
};

const sessile: Painter = (c, d, p) => {
  const cx = c.w / 2 - 0.5, base = c.h - 3, H = c.h - 6;
  switch (d.variant) {
    case 'coral': { const branch = (x: number, y: number, a: number, len: number, depth: number) => { const x1 = x + Math.sin(a) * len, y1 = y - Math.cos(a) * len; c.line(x, y, x1, y1, depth > 1 ? P.BASE : P.SHADE, depth > 1 ? 2 : 1); if (depth > 0) { branch(x1, y1, a - 0.55 + Math.sin(p.ph) * 0.03, len * 0.72, depth - 1); branch(x1, y1, a + 0.5, len * 0.7, depth - 1); } else c.set(x1, y1, P.ACCENT); }; branch(cx, base, 0, H * 0.34, 3); break; }
    case 'sponge': { const wd = d.L * 0.22; c.profile(cx - wd, cx + wd, (x) => [base - H * (0.7 + 0.15 * Math.sin(x * 0.9)), base], P.BASE); c.disc(cx, base - H * 0.72, wd * 0.6, 1.2, P.DARK); for (let i = 0; i < 6; i++) c.set(cx - wd + 1 + (i * 3) % (wd * 2 - 1), base - 2 - ((i * 5) % Math.max(3, Math.floor(H * 0.6))), P.SHADE); break; }
    case 'anemone': { const wd = d.L * 0.17; c.profile(cx - wd, cx + wd, () => [base - H * 0.35, base], P.BASE); const n = 7; for (let i = 0; i < n; i++) { const a = -1.2 + (i / (n - 1)) * 2.4; for (let j = 0; j < H * 0.55; j++) c.set(cx + Math.sin(a) * j * 0.6 + Math.sin(p.ph + j * 0.4 + i) * 1.1, base - H * 0.3 - Math.cos(a) * j * 0.8, i % 2 ? P.ACCENT : P.LIGHT); } break; }
    default: { const open = 0.25 + p.atk * 0.4 + 0.1 * Math.sin(p.ph); const R = d.L * 0.38; for (let s of [-1, 1]) c.profile(cx - R, cx + R, (x) => { const t = (x - cx) / R; const h = R * 0.9 * Math.sqrt(Math.max(0, 1 - t * t)); return s < 0 ? [base - h * (1 + open) , base - open * R * 0.4] : [base - open * R * 0.4 + 1, base]; }, s < 0 ? P.BASE : P.SHADE); for (let i = -R + 2; i < R; i += 2) c.line(cx + i, base - R * 0.4, cx + i * 0.8, base - R * 1.2, P.DARK); }
  }
};

const worm: Painter = (c, d, p) => {
  const L = d.L, cy = c.h / 2 - 0.5, th = Math.max(1.5, L * 0.1 + d.g[G.SEGMENTS] * 1.2), amp = L * 0.09 + 0.6, seg = Math.max(3, Math.floor(L * 0.45)), K = 6.3 / (L * 0.55 + 4);
  for (let x = 2; x < c.w - 2; x++) { const t = (x - 2) / (c.w - 5); const rr = th * (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.15) * 2.4 + 0.3)) * (t < 0.12 ? 0.6 + t * 3.3 : 1); const y = cy + Math.sin(x * K - p.ph * 1.4) * amp * (1 - t * 0.2); c.disc(x, y, 0.7, rr, P.BASE); if ((x % Math.max(2, Math.floor(L / seg))) === 0) c.set(x, y + rr * 0.3, P.SHADE); }
  const hx = c.w - 3, hy = cy + Math.sin(hx * K - p.ph * 1.4) * amp; eye(c, hx - 1, hy - 1, d.g[G.EYES] > 0.3 ? 1 : 0.5); if (p.atk > 0.5) c.set(hx + 1, hy, P.GORE);
  if (d.g[G.BIOLUM] > 0.3) for (let x = 5; x < c.w - 4; x += 4) c.set(x, cy, P.GLOW);
};

const arthropod: Painter = (c, d, p) => {
  const g = d.g, L = d.L, cx = c.w / 2 - 0.5, cy = c.h * 0.46, v = d.variant || 'insect', bob = Math.round(Math.sin(p.ph * 2) * 0.5);
  const legs = (n: number, x0: number, spread: number, len: number, y0: number) => { for (let i = 0; i < n; i++) { const x = x0 + (i / Math.max(1, n - 1)) * spread, s = Math.sin(p.ph + i * 1.9) ; const side = i % 2 ? 1 : -1; c.line(x, y0, x + side * 1.5 + s * 1.2, y0 + len * 0.55, P.DARK); c.line(x + side * 1.5 + s * 1.2, y0 + len * 0.55, x + side * 2.5 + s * 2, y0 + len, P.DARK); } };
  const antenna = (x: number, y: number) => { c.line(x, y, x + 3 + p.atk * 2, y - 3, P.DARK); c.line(x, y, x + 4, y - 1 + Math.sin(p.ph) , P.DARK); };
  if (v === 'trilobite') {
    const W = L * 0.5, Hh = L * 0.28;
    c.profile(cx - W, cx + W, (x) => { const t = (x - cx) / W; const h = Hh * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(t), 2.4))); return [cy - h + bob, cy + h * 0.9 + bob]; }, P.BASE);
    for (let x = -W + 2; x < W - 1; x += 2) { c.line(cx + x, cy - Hh * 0.9 + bob, cx + x, cy + Hh * 0.8 + bob, P.SHADE); } c.line(cx - W * 0.8, cy + bob, cx + W * 0.7, cy + bob, P.LIGHT);
    c.disc(cx + W * 0.62, cy - Hh * 0.35 + bob, 1.2, 1.2, P.EYE); c.set(cx + W * 0.62, cy - Hh * 0.35 + bob, P.PUPIL); legs(5, cx - W * 0.5, W, Hh + 2, cy + Hh * 0.6 + bob); antenna(cx + W * 0.9, cy - 1 + bob); return;
  }
  if (v === 'crustacean') { // copepod / shrimp: curved body, tail fan, swimming legs
    const n = 5; for (let i = 0; i < n; i++) { const t = i / (n - 1); const x = cx - L * 0.4 + t * L * 0.75, y = cy + Math.sin(t * 3 + p.ph) * 1.3 * (1 - t) + (1 - t) * 1.2; c.disc(x, y, L * 0.11 * (1.15 - t * 0.5) + 0.7, L * 0.12 * (1.2 - t * 0.45) + 0.6, P.BASE); }
    const tx = cx - L * 0.45, ty = cy + 1.2; c.tri(tx, ty, tx - 3, ty - 2 + Math.sin(p.ph), tx - 3, ty + 2 - Math.sin(p.ph), P.ACCENT);
    eye(c, cx + L * 0.4, cy - 1, 1.2); antenna(cx + L * 0.42, cy - 2); legs(4, cx - L * 0.1, L * 0.35, L * 0.28, cy + L * 0.1);
    if (g[G.CARN] > 0.4 || g[G.JAWS] > 0.4) { c.line(cx + L * 0.42, cy + 1, cx + L * 0.55 + p.atk * 2, cy + 3, P.ACCENT, 1); } return;
  }
  if (v === 'beetle' || v === 'scorpion') {
    const W = L * 0.42, Hh = L * 0.26; c.disc(cx, cy + bob, W, Hh, P.BASE); c.line(cx, cy - Hh + bob, cx, cy + Hh + bob, P.DARK); c.disc(cx + W * 0.95, cy + bob, W * 0.3, Hh * 0.55, P.SHADE);
    eye(c, cx + W * 1.05, cy - 1 + bob, 1); legs(6, cx - W * 0.5, W, Hh + 3, cy + Hh * 0.8 + bob);
    if (v === 'scorpion') { for (let j = 0; j < 7; j++) c.disc(cx - W - j * 0.6, cy - Hh * 0.2 - j * 1.1 + bob, 1.1, 1.1, P.BASE); c.tri(cx - W - 4, cy - Hh - 7 + bob, cx - W - 2, cy - Hh - 6 + bob, cx - W - 3, cy - Hh - 4 + bob, P.GORE); c.disc(cx + W + 2, cy - 2 + bob + p.atk, 2, 1.6, P.ACCENT); c.disc(cx + W + 2, cy + 2 + bob - p.atk, 2, 1.6, P.ACCENT); }
    return;
  }
  // insect: head, thorax, abdomen; wings if present
  const hx = cx + L * 0.32, tx = cx, ax = cx - L * 0.33;
  c.disc(ax, cy + bob + 0.6, L * 0.2, L * 0.13, P.BASE); c.disc(tx, cy + bob, L * 0.16, L * 0.13, P.SHADE); c.disc(hx, cy + bob, L * 0.12, L * 0.11, P.BASE);
  eye(c, hx + 1, cy - 1 + bob, L > 12 ? 1.3 : 0.9); antenna(hx + 2, cy - L * 0.1 + bob); legs(3, tx - L * 0.08, L * 0.2, L * 0.32, cy + L * 0.1 + bob);
  if (g[G.WINGS] > 0.3 && g[G.FLY] > 0.25) { const fl = Math.sin(p.ph * 2.2); for (const dx of [-1.5, 1]) c.tri(tx + dx, cy - L * 0.1 + bob, tx + dx - L * 0.3, cy - L * (0.25 + 0.2 * fl) + bob, tx + dx + L * 0.05, cy - L * (0.28 + 0.2 * fl) + bob, P.LIGHT); }
  for (let i = 0; i < 3; i++) c.set(ax - 2 + i * 2, cy + bob + 0.5, P.ACCENT); if (g[G.BIOLUM] > 0.3) c.set(ax - 3, cy + bob + 1, P.GLOW); if (p.atk > 0.5) c.set(hx + 3, cy + 1 + bob, P.GORE);
};

const snail: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, base = c.h - 3, sw = Math.sin(p.ph) * 0.6;
  c.profile(cx - L * 0.45, cx + L * 0.45, (x) => { const t = (x - cx) / (L * 0.45); return [base - 2 - (t > 0.5 ? (t - 0.5) * 3 : 0), base]; }, P.BASE);
  const R = L * 0.3, sx = cx - L * 0.08, sy = base - 2 - R; c.disc(sx, sy, R, R, P.ACCENT); for (let a = 0; a < 12; a += 0.4) { const rr = R * (1 - a / 14); c.set(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, P.DARK); }
  c.line(cx + L * 0.38, base - 3, cx + L * 0.46 + sw, base - 7, P.BASE); eye(c, cx + L * 0.46 + sw, base - 7, 0.8);
};

const squid: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, cy = c.h * 0.42, mw = L * 0.34, mh = L * 0.17 * (1 + 0.1 * Math.sin(p.ph));
  c.profile(cx - mw - 4, cx + mw * 0.2, (x) => { const t = (x - (cx - mw - 4)) / (mw + 4 + mw * 0.2); const h = mh * Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.9 + 0.2); return [cy - h, cy + h]; }, P.BASE);
  c.tri(cx - mw - 4, cy, cx - mw + 1, cy - mh * 1.5, cx - mw + 1, cy + mh * 1.5, P.ACCENT);
  c.disc(cx + mw * 0.35, cy, mh * 0.9, mh * 0.85, P.SHADE); eye(c, cx + mw * 0.4, cy - 1, Math.max(1.3, L * 0.07));
  const n = 8; for (let i = 0; i < n; i++) { const y0 = cy - mh * 0.6 + (i / (n - 1)) * mh * 1.2, len = L * (i === 2 || i === 5 ? 0.46 : 0.34); for (let j = 0; j < len; j++) c.set(cx + mw * 0.55 + j * 0.9 + p.atk * j * 0.4, y0 + Math.sin(p.ph + j * 0.5 + i) * (0.8 + j * 0.06), i % 2 ? P.SHADE : P.BASE); }
  if (d.g[G.BIOLUM] > 0.25) for (let i = 0; i < 5; i++) c.set(cx - mw + i * 3, cy - mh * 0.4, P.GLOW);
};

const fish: Painter = (c, d, p) => {
  const g = d.g, L = d.L, cx = c.w / 2 - 0.5, cy = c.h * 0.5, armored = d.variant === 'armored';
  const Hh = L * (0.17 + g[G.ARMOR] * 0.06 + (1 - g[G.SEGMENTS]) * 0.04) * (g[G.JAWS] > 0.6 && g[G.SWIM] > 0.7 ? 0.9 : 1), x0 = cx - L * 0.5, x1 = cx + L * 0.5;
  const tailFrac = 0.2 + g[G.TAIL] * 0.12, bend = Math.sin(p.ph) * L * 0.06;
  const wob = (x: number) => { const t = (x1 - x) / L; return bend * Math.max(0, t - 0.4) * 2.2; };
  c.profile(x0 + L * tailFrac * 0.4, x1, (x) => { const t = (x - x0) / L; const sn = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, (t - 0.05) / 0.98))), armored ? 0.6 : 0.85); const hh = Hh * sn * (t > 0.82 ? 0.55 + (1 - t) * 2.5 : 1); const w = wob(x); return [cy - hh + w, cy + hh * 0.9 + w]; }, P.BASE);
  // belly countershading
  for (let x = Math.round(x0 + L * 0.25); x <= x1 - 2; x++) { for (let y = 0; y < c.h; y++) if (c.get(x, y) === P.BASE && y > cy + Hh * 0.35 + wob(x)) c.set(x, y, P.BELLY); }
  // tail fin
  const tx = x0 + L * tailFrac * 0.4, tw = L * tailFrac, ty = cy + wob(tx), fork = g[G.SWIM] > 0.6 ? 0.55 : 0.2;
  c.tri(tx + 1, ty, tx - tw, ty - Hh * 1.05, tx - tw * (1 - fork) * 0.5, ty, P.ACCENT); c.tri(tx + 1, ty, tx - tw, ty + Hh * 1.05, tx - tw * (1 - fork) * 0.5, ty, P.ACCENT);
  // dorsal and pectoral fins
  const dh = Hh * (0.4 + g[G.FINS] * 0.9 + (g[G.JAWS] > 0.6 ? 0.5 : 0)); c.tri(cx - L * 0.12, cy - Hh * 0.92 + wob(cx), cx + L * 0.08, cy - Hh * 0.92 + wob(cx), cx - L * 0.2, cy - Hh - dh, P.ACCENT);
  const pf = Math.cos(p.ph) * 1.4; c.tri(cx + L * 0.12, cy + Hh * 0.2, cx + L * 0.02, cy + Hh * 0.2, cx - L * 0.02, cy + Hh * 0.95 + pf + g[G.FINS] * 3, P.ACCENT2);
  if (g[G.FINS] > 0.35) c.tri(cx - L * 0.15, cy + Hh * 0.8, cx - L * 0.03, cy + Hh * 0.8, cx - L * 0.2, cy + Hh * 1.5, P.ACCENT);
  // head: eye, mouth, jaws
  const hx = x1 - L * 0.17; eye(c, hx, cy - Hh * 0.3, Math.max(1, Math.min(3, L * 0.045 * (0.7 + g[G.EYES]))));
  const mouth = 0.5 + p.atk * Math.max(1.5, Hh * 0.45); c.line(x1 - 1, cy + Hh * 0.2, x1 - L * 0.12, cy + Hh * 0.25 + mouth * 0.4, P.DARK);
  if (g[G.JAWS] > 0.35) { for (let i = 0; i < 3; i++) c.set(x1 - 1 - i * 1.5, cy + Hh * 0.2 + (p.atk > 0.5 ? 1 + i * 0.4 : 0) - (i % 2), P.TOOTH); }
  if (g[G.HORNS] > 0.3) c.tri(x1 - L * 0.2, cy - Hh * 0.9, x1 - L * 0.1, cy - Hh * 0.8, x1 - L * 0.12, cy - Hh * 1.6, P.TOOTH);
  if (armored || g[G.ARMOR] > 0.4) for (let x = Math.round(x0 + L * 0.4); x < x1 - L * 0.15; x += 3) c.line(x, cy - Hh * 0.7 + wob(x), x, cy + Hh * 0.2 + wob(x), P.SHADE);
  if (g[G.BIOLUM] > 0.3) for (let x = Math.round(x0 + L * 0.35); x < x1 - L * 0.2; x += 3) c.set(x, cy + Hh * 0.5 + wob(x), P.GLOW);
  if (g[G.CAMO] < 0.3 && g[G.PATTERN] > 0.55) for (let x = Math.round(x0 + L * 0.3); x < x1 - L * 0.2; x += 4) c.line(x, cy - Hh * 0.6 + wob(x), x + 1, cy + Hh * 0.1 + wob(x), P.ACCENT);
};

const plesio: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, cy = c.h * 0.55, bw = L * 0.26, bh = L * 0.14, sw = Math.sin(p.ph);
  c.disc(cx - L * 0.05, cy, bw, bh, P.BASE); for (let x = Math.round(cx - bw); x < cx + bw * 0.8; x++) c.set(x, cy + bh * 0.6, P.BELLY);
  for (let i = 0; i < L * 0.3; i++) { const t = i / (L * 0.3); c.disc(cx - bw - i * 0.9, cy + t * 2 + sw * t * 1.5, Math.max(0.7, (1 - t) * bh * 0.45), Math.max(0.7, (1 - t) * bh * 0.45), P.BASE); }
  let nx = cx + bw * 0.7, ny = cy - bh * 0.3; const n = Math.floor(L * 0.38); for (let i = 0; i < n; i++) { const t = i / n; nx += 0.9; ny -= 0.45 * (1 - t) + sw * 0.1; c.disc(nx, ny, 1.2, 1.2, P.BASE); }
  c.disc(nx + 1, ny - 1, L * 0.065 + 0.6, L * 0.055 + 0.5, P.BASE); c.line(nx + 2, ny, nx + 3 + L * 0.06, ny + p.atk * 2, P.BASE, 2); eye(c, nx + 1.5, ny - 1.5, 0.9); if (d.g[G.JAWS] > 0.3) c.set(nx + L * 0.07, ny + 1 + p.atk, P.TOOTH);
  for (const [fx, col] of [[cx + bw * 0.5, P.ACCENT], [cx - bw * 0.6, P.SHADE]] as [number, number][]) { const a = sw * 0.6; c.tri(fx, cy + bh * 0.5, fx + 3, cy + bh * 0.5, fx - 3 + a * 3, cy + bh * 1.5 + a * 2, col); c.tri(fx, cy + bh * 0.4, fx + 3, cy + bh * 0.4, fx + 6 - a * 3, cy + bh * 1.4 - a * 2, P.DARK); }
};
const whale: Painter = (c, d, p) => {
  if (d.variant === 'plesio') return plesio(c, d, p);
  const g = d.g, L = d.L, cx = c.w / 2 - 0.5, cy = c.h * 0.46, Hh = L * 0.17, x0 = cx - L * 0.5, x1 = cx + L * 0.5, bend = Math.sin(p.ph) * L * 0.05;
  c.profile(x0 + L * 0.12, x1, (x) => { const t = (x - x0) / L; const hh = Hh * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.02)), 0.7) * (t < 0.2 ? 0.45 + t * 2.7 : 1); const w = bend * Math.max(0, 0.5 - t) * 2; return [cy - hh + w, cy + hh * 0.85 + w]; }, P.BASE);
  for (let x = Math.round(x0 + L * 0.3); x < x1 - 2; x++) for (let y = 0; y < c.h; y++) if (c.get(x, y) === P.BASE && y > cy + Hh * 0.25) c.set(x, y, P.BELLY);
  const tx = x0 + L * 0.12, ty = cy + bend; c.tri(tx + 2, ty, tx - L * 0.1, ty - Hh * 0.55 - bend * 0.6, tx - L * 0.02, ty - 1, P.ACCENT); c.tri(tx + 2, ty, tx - L * 0.1, ty + Hh * 0.6 - bend * 0.6, tx - L * 0.02, ty + 1, P.ACCENT);
  c.tri(cx, cy + Hh * 0.5, cx + L * 0.12, cy + Hh * 0.5, cx + L * 0.02, cy + Hh * 1.3 + Math.cos(p.ph) * 1.2, P.ACCENT); c.tri(cx - L * 0.1, cy - Hh * 0.8, cx - L * 0.02, cy - Hh * 0.8, cx - L * 0.1, cy - Hh * 1.3, P.ACCENT);
  eye(c, x1 - L * 0.17, cy + Hh * 0.05, Math.max(1, L * 0.025)); c.line(x1 - 1, cy + Hh * 0.35, x1 - L * 0.22, cy + Hh * 0.45 + p.atk * 2, P.DARK);
  for (let i = 0; i < 4; i++) c.set(cx - L * 0.05 + i * L * 0.1, cy - Hh * 0.6, P.SHADE);
};

const quadruped: Painter = (c, d, p) => {
  const g = d.g, L = d.L, v = d.variant || 'mammal', cx = c.w / 2 - 0.5;
  const lizard = v === 'lizard', sauropod = v === 'sauropod', cat = v === 'cat', mammoth = v === 'mammoth';
  const legLen = L * (lizard ? 0.14 : sauropod || mammoth ? 0.34 : 0.3), bodyH = L * (lizard ? 0.17 : sauropod ? 0.3 : 0.24), bodyL = L * (sauropod ? 0.4 : 0.52);
  const gy = c.h - 2, by = gy - legLen - bodyH * 0.5 + Math.round(Math.sin(p.ph * 2) * 0.5);
  const bx0 = cx - bodyL * 0.5 - (sauropod ? L * 0.04 : 0), bx1 = bx0 + bodyL;
  // legs (back pair darker)
  const leg = (x: number, off: number, col: number) => { const s = Math.sin(p.ph + off) * (lizard ? 2 : 3), lift = Math.max(0, Math.cos(p.ph + off)) * 1.5; const kx = x + s * 0.4, ky = by + bodyH * 0.35 + legLen * 0.5; c.line(x, by + bodyH * 0.35, kx, ky, col, lizard ? 1 : Math.max(1, L / 14)); c.line(kx, ky, x + s, gy - lift, col, lizard ? 1 : Math.max(1, L / 14)); c.set(x + s + 1, gy - lift, P.DARK); };
  leg(bx0 + 3, 0, P.DARK); leg(bx1 - 4, 3.1, P.DARK);
  c.profile(bx0, bx1, (x) => { const t = (x - bx0) / bodyL; const h = bodyH * 0.5 * (0.75 + 0.45 * Math.sin(t * Math.PI)); return [by - h, by + h]; }, P.BASE);
  for (let x = Math.round(bx0 + 2); x < bx1 - 1; x++) for (let y = 0; y < c.h; y++) if (c.get(x, y) === P.BASE && y > by + bodyH * 0.2) c.set(x, y, P.BELLY);
  leg(bx0 + 5, 1.6, P.SHADE); leg(bx1 - 2, 4.7, P.SHADE);
  // tail
  const tl = L * (0.15 + g[G.TAIL] * (lizard || sauropod ? 0.38 : 0.2)), tw = Math.sin(p.ph * 0.8);
  for (let i = 0; i < tl; i++) { const t = i / tl; c.disc(bx0 - i, by - bodyH * 0.1 + t * (lizard ? 2 : -1) + tw * t * 1.5, Math.max(0.6, (1 - t) * bodyH * (lizard || sauropod ? 0.28 : 0.15)), Math.max(0.6, (1 - t) * bodyH * (lizard || sauropod ? 0.28 : 0.15)), P.BASE); }
  // neck + head
  const neck = sauropod ? L * 0.34 : lizard ? L * 0.05 : L * 0.1, hr = L * (cat ? 0.085 : 0.075) + 1;
  const nx = bx1 - 1, ny = by - bodyH * 0.2, hx = nx + neck * (sauropod ? 0.55 : 1), hy = ny - (sauropod ? neck * 0.95 : neck * 0.3);
  c.line(nx, ny, hx, hy, P.BASE, Math.max(2, bodyH * 0.38)); c.disc(hx + 1, hy, hr * 1.1, hr, P.BASE);
  const snout = L * (0.07 + g[G.JAWS] * 0.07 + (lizard ? 0.05 : 0)); c.profile(hx + hr, hx + hr + snout, () => [hy - hr * 0.35, hy + hr * 0.55 + p.atk * 1.2], P.BASE);
  if (p.atk > 0.5) c.line(hx + hr + snout - 1, hy + hr * 0.5, hx + hr * 0.8, hy + hr * 0.7 + p.atk * 2, P.GORE); 
  if (g[G.JAWS] > 0.4 || g[G.CARN] > 0.5) { c.set(hx + hr + snout - 1, hy + hr * 0.5, P.TOOTH); c.set(hx + hr + snout - 3, hy + hr * 0.5, P.TOOTH); }
  eye(c, hx + hr * 0.6, hy - hr * 0.35, Math.max(0.9, hr * 0.38));
  if (!lizard && !sauropod) { c.tri(hx - hr * 0.4, hy - hr * 0.8, hx + hr * 0.1, hy - hr * 0.8, hx - hr * 0.2, hy - hr * 1.7, P.SHADE); }
  if (mammoth) { c.line(hx + hr, hy + hr * 0.5, hx + hr + snout * 0.6, hy + hr * 2.4, P.BASE, 2); c.tri(hx + hr, hy + hr * 0.3, hx + hr + L * 0.12, hy + hr * 0.2, hx + hr + L * 0.14, hy + hr * 1.6, P.TOOTH); }
  if (g[G.HORNS] > 0.3) { const hl = L * (0.05 + g[G.HORNS] * 0.12); c.tri(hx, hy - hr * 0.9, hx + hr * 0.6, hy - hr * 0.7, hx + hr * 0.5 + hl * 0.4, hy - hr * 0.9 - hl, P.TOOTH); if (g[G.HORNS] > 0.5) c.tri(hx + hr * 0.9, hy - hr * 0.7, hx + hr * 1.4, hy - hr * 0.4, hx + hr * 1.6 + hl * 0.3, hy - hr * 0.7 - hl * 0.8, P.TOOTH); }
  if (v === 'stego') for (let x = Math.round(bx0 + 3); x < bx1 - 1; x += 3) { const hgt = L * 0.14 * (1 - Math.abs((x - (bx0 + bx1) / 2) / bodyL) * 1.2); c.tri(x, by - bodyH * 0.5, x + 3, by - bodyH * 0.5, x + 1.5, by - bodyH * 0.5 - hgt, P.ACCENT); }
  if (v === 'trike') { c.disc(hx - hr * 0.2, hy - hr * 0.4, hr * 1.5, hr * 1.7, P.ACCENT); c.disc(hx - hr * 0.2, hy - hr * 0.4, hr * 1.1, hr * 1.3, P.BASE); c.tri(hx + hr, hy - hr * 0.2, hx + hr + L * 0.14, hy - hr * 0.5, hx + hr + L * 0.02, hy - hr * 0.7, P.TOOTH); c.tri(hx + hr * 0.2, hy - hr * 0.9, hx + hr * 0.8, hy - hr * 0.9, hx + hr * 0.7 + L * 0.05, hy - hr * 2.1, P.TOOTH); }
  if (g[G.ARMOR] > 0.3 || g[G.SHELL] > 0.3) for (let x = Math.round(bx0 + 2); x < bx1 - 2; x += 3) c.tri(x, by - bodyH * 0.5, x + 2, by - bodyH * 0.5, x + 1, by - bodyH * 0.5 - 2 - g[G.ARMOR] * 3, P.ACCENT);
  if (g[G.PATTERN] > 0.55 && g[G.CAMO] < 0.4) for (let x = Math.round(bx0 + 3); x < bx1 - 2; x += 4) c.line(x, by - bodyH * 0.35, x + 1, by + bodyH * 0.1, P.DARK);
};

const biped: Painter = (c, d, p) => {
  const g = d.g, L = d.L, v = d.variant || 'hominid', cx = c.w / 2 - 0.5, gy = c.h - 2, theropod = v === 'theropod';
  const sw = Math.sin(p.ph) * 2.4;
  if (theropod) {
    const bodyL = L * 0.46, legL = L * 0.3, by = gy - legL - L * 0.1, bx0 = cx - bodyL * 0.5, bx1 = cx + bodyL * 0.5;
    for (const [off, col] of [[0, P.DARK], [3.14, P.SHADE]] as [number, number][]) { const s = Math.sin(p.ph + off) * 3; c.line(cx - 1, by + L * 0.05, cx + s * 0.5, gy - legL * 0.4, col, Math.max(2, L / 10)); c.line(cx + s * 0.5, gy - legL * 0.4, cx + s, gy, col, Math.max(1, L / 14)); c.line(cx + s, gy, cx + s + 2, gy, col, 1); }
    c.profile(bx0, bx1, (x) => { const t = (x - bx0) / bodyL; const h = L * 0.13 * (0.7 + 0.5 * Math.sin(t * Math.PI)); return [by - h, by + h]; }, P.BASE);
    for (let i = 0; i < L * 0.34; i++) { const t = i / (L * 0.34); c.disc(bx0 - i, by - 1 + Math.sin(p.ph + i * 0.2) * t, Math.max(0.6, (1 - t) * L * 0.1), Math.max(0.6, (1 - t) * L * 0.1), P.BASE); }
    const nx = bx1 - 2, ny = by - L * 0.05, hx = nx + L * 0.09, hy = ny - L * 0.15; c.line(nx, ny, hx, hy, P.BASE, Math.max(2, L * 0.08)); c.profile(hx - 1, hx + L * 0.16, (x) => { const t = (x - hx) / (L * 0.16); return [hy - L * 0.06 * (1 - t * 0.3), hy + L * 0.05 + p.atk * 2.2 * t]; }, P.BASE);
    eye(c, hx + 2, hy - L * 0.025, Math.max(1, L * 0.03)); for (let i = 0; i < 3; i++) c.set(hx + L * 0.16 - 1 - i * 1.6, hy + L * 0.05 + (p.atk > 0.5 ? 1 : 0), P.TOOTH);
    c.line(bx1 - 4, by + L * 0.05, bx1 - 1, by + L * 0.15, P.SHADE, 1); return;
  }
  // upright hominid: legs, torso, shoulders, arms, neck and a proper head
  const legL = L * 0.4, torso = L * 0.31, headR = L * 0.115 + 1, hip = gy - legL, sh = hip - torso + 1, lean = 1;
  for (const [off, col] of [[3.14, P.SHADE], [0, P.DARK]] as [number, number][]) { const s2 = Math.sin(p.ph + off) * 2.4, kx = cx + s2 * 0.4, ky = hip + legL * 0.52; c.line(cx, hip, kx, ky, col, 2); c.line(kx, ky, cx + s2, gy - 1, col, 2); c.line(cx + s2 - 1, gy, cx + s2 + 2, gy, col, 1); }
  c.disc(cx, (sh + hip) / 2, L * 0.14, torso / 2 + 0.6, P.BASE); c.disc(cx, sh + 1.2, L * 0.17, 2.1, P.BASE); c.disc(cx, hip - 0.5, L * 0.13, 2.2, P.SHADE);
  const as = Math.sin(p.ph + 3.14) * 3;
  for (const [sgn, col] of [[1, P.BASE], [-1, P.SHADE]] as [number, number][]) { const ax = cx + sgn * L * 0.15, ex = ax + sgn * as * 0.3, ey = sh + torso * 0.5; c.line(ax, sh + 1.5, ex, ey, col, 2); c.line(ex, ey, ex + sgn * as * 0.5 + 1 + (sgn > 0 ? p.atk * 4 : 0), sh + torso * 0.92 - (sgn > 0 ? p.atk * 4 : 0), col, 1); c.set(ex + sgn * as * 0.5 + 1 + (sgn > 0 ? p.atk * 4 : 0), sh + torso * 0.95 - (sgn > 0 ? p.atk * 4 : 0), P.DARK); }
  c.line(cx + lean, sh, cx + lean, sh - 1, P.BASE, 2); // neck
  const hy = sh - headR * 0.95; c.disc(cx + lean, hy, headR, headR * 1.05, P.BASE);
  if (g[G.INTEL] > 0.3) { c.disc(cx + lean - 0.5, hy - headR * 0.35, headR * 0.95, headR * 0.7, P.DARK, false); c.disc(cx + lean + 0.8, hy + headR * 0.15, headR * 0.7, headR * 0.65, P.BASE); }
  eye(c, cx + lean + headR * 0.45, hy + headR * 0.05, Math.max(0.9, headR * 0.28)); c.set(cx + lean + headR * 0.9, hy + headR * 0.5, P.DARK);
};

const bird: Painter = (c, d, p) => {
  const g = d.g, L = d.L, cx = c.w / 2 - 0.5, cy = c.h * 0.58, fl = Math.sin(p.ph * 1.6), flying = g[G.FLY] > 0.3;
  const bodyL = L * 0.46, bodyH = L * 0.2, bx0 = cx - bodyL * 0.45, bx1 = bx0 + bodyL;
  c.profile(bx0, bx1, (x) => { const t = (x - bx0) / bodyL; const h = bodyH * 0.5 * Math.sin(Math.PI * (t * 0.9 + 0.05)) ** 0.8; return [cy - h + (flying ? fl * 0.5 : 0), cy + h * 1.1]; }, P.BASE);
  for (let x = Math.round(bx0 + 2); x < bx1 - 2; x++) for (let y = 0; y < c.h; y++) if (c.get(x, y) === P.BASE && y > cy + bodyH * 0.1) c.set(x, y, P.BELLY);
  const tl = L * 0.26; c.tri(bx0 + 2, cy - 1, bx0 - tl, cy - 2 + fl, bx0 - tl * 0.8, cy + 2 + fl, P.ACCENT);
  const hx = bx1 + 1, hy = cy - bodyH * 0.55, hr = L * 0.09 + 1; c.disc(hx, hy, hr, hr, P.BASE); c.tri(hx + hr, hy - hr * 0.2, hx + hr + L * 0.12, hy + hr * 0.3 + p.atk * 1.5, hx + hr, hy + hr * 0.7, P.ACCENT2); eye(c, hx + 0.5, hy - 0.5, Math.max(0.9, hr * 0.38));
  if (g[G.CARN] > 0.5) c.set(hx + hr + L * 0.1, hy + hr * 0.6, P.GORE);
  const wing = (dx: number, col: number) => { const up = flying ? fl : 0.1; const ty = cy - bodyH * 0.4 - up * L * 0.28 - (flying ? L * 0.1 : 0); c.tri(cx + dx, cy - bodyH * 0.3, cx + dx - L * 0.3, ty, cx + dx + L * 0.08, ty + 1, col); c.line(cx + dx - L * 0.28, ty + 1, cx + dx - L * 0.08, cy - bodyH * 0.3, P.DARK); };
  wing(2, P.SHADE); wing(-1, P.ACCENT);
  if (!flying || p.atk > 0.5) { c.line(cx, cy + bodyH * 0.5, cx - 1, c.h - 2, P.DARK); c.line(cx + 2, cy + bodyH * 0.5, cx + 3, c.h - 2, P.DARK); }
  if (g[G.HORNS] > 0.4) c.tri(hx - 1, hy - hr, hx, hy - hr, hx - 2, hy - hr - 3, P.ACCENT);
};

// ---- plants
const kelp: Painter = (c, d, p) => {
  const H = c.h - 3, cx = c.w / 2 - 0.5, nst = d.size > 2 ? 3 : d.size > 1 ? 2 : 1;
  for (let s = 0; s < nst; s++) { const ox = (s - (nst - 1) / 2) * (c.w * 0.22), sw = 0.4 + s * 0.2; for (let y = 0; y < H; y++) { const x = cx + ox + Math.sin(y * 0.18 + p.ph * 0.9 + s) * (1 + y * 0.05) * sw; c.set(x, c.h - 2 - y, y % 3 ? P.BASE : P.LIGHT); c.set(x + 1, c.h - 2 - y, P.SHADE); if (y > 4 && y % 5 === 0) { const side = y % 10 ? 1 : -1; for (let j = 1; j < 4; j++) c.set(x + side * j, c.h - 2 - y - (j >> 1) + Math.sin(p.ph + y) * 0.5, P.ACCENT2); if (y % 15 === 0) c.disc(x + side * 2, c.h - 3 - y, 1.2, 1.2, P.ACCENT); } } }
  c.disc(cx, c.h - 2, c.w * 0.18, 1.3, P.DARK);
};
const moss: Painter = (c, d, p) => { const base = c.h - 2; for (let x = 1; x < c.w - 1; x++) { const hh = 2 + Math.round((Math.sin(x * 1.1 + d.size * 7) + 1) * c.h * 0.17 + Math.sin(p.ph + x) * 0.3); for (let y = 0; y < hh; y++) c.set(x, base - y, y > hh - 2 ? P.LIGHT : P.BASE); if (x % 3 === 0) c.set(x, base - hh - 1, P.ACCENT2); } };
const grass: Painter = (c, d, p) => {
  const n = 5 + Math.floor(d.size * 2), base = c.h - 2, cx = c.w / 2;
  for (let i = 0; i < n; i++) { const t = i / (n - 1) - 0.5, hgt = (c.h - 4) * (0.6 + 0.4 * Math.cos(t * 2.4) * (0.8 + 0.2 * ((i * 7) % 3) / 3)), lean = t * 5 + Math.sin(p.ph + i) * 1.2; for (let y = 0; y < hgt; y++) { const u = y / hgt; c.set(cx + t * c.w * 0.7 + lean * u * u, base - y, y > hgt * 0.8 ? P.LIGHT : i % 2 ? P.BASE : P.SHADE); } }
};
const fern: Painter = (c, d, p) => {
  const n = 3 + Math.floor(d.size * 1.2), base = c.h - 2, cx = c.w / 2;
  for (let f = 0; f < n; f++) { const a = -1.1 + (f / Math.max(1, n - 1)) * 2.2, len = (c.h - 4) * (0.7 + 0.3 * Math.cos(a)); let x = cx, y = base; for (let s = 0; s < len; s++) { const u = s / len; x += Math.sin(a + u * a * 0.5 + Math.sin(p.ph + f) * 0.04) * 0.9; y -= Math.cos(a * 0.4) * 0.95; c.set(x, y, P.BASE); if (s % 2 === 0 && u > 0.12) { const ll = (1 - u) * 4 + 1; c.line(x, y, x - ll, y - ll * 0.4, P.LIGHT); c.line(x, y, x + ll, y - ll * 0.4, P.SHADE); } } }
};
const tree: Painter = (c, d, p) => {
  const base = c.h - 2, cx = c.w / 2 - 0.5, th = Math.max(2, Math.round(c.w * 0.12)), trunkH = c.h * 0.46, sw = Math.sin(p.ph) * 0.7, conifer = d.rng() < 0.3;
  for (let y = 0; y < trunkH; y++) c.rect(cx - th / 2 + (y > trunkH * 0.8 ? sw * 0.4 : 0), base - y, th, 1, y % 4 === 0 ? P.DARK : P.SHADE);
  c.disc(cx, base, th * 1.1, 1.4, P.DARK);
  if (conifer) { for (let k = 0; k < 4; k++) { const y = base - trunkH * 0.6 - k * (c.h * 0.13), w = c.w * (0.42 - k * 0.08); c.tri(cx - w + sw * k * 0.3, y, cx + w + sw * k * 0.3, y, cx + sw * (k + 1) * 0.4, y - c.h * 0.22, k % 2 ? P.BASE : P.SHADE); c.line(cx - w + 1, y, cx + w - 1, y, P.LIGHT); } }
  else { const R = c.w * 0.3; for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.283; c.disc(cx + Math.cos(a) * R * 0.7 + sw, base - trunkH - R * 0.6 + Math.sin(a) * R * 0.55, R * 0.62, R * 0.55, k % 2 ? P.BASE : P.SHADE); } c.disc(cx + sw, base - trunkH - R * 0.7, R * 0.8, R * 0.62, P.BASE); for (let k = 0; k < 8; k++) c.set(cx + sw + Math.cos(k * 1.1) * R * 0.7, base - trunkH - R * 0.9 + Math.sin(k * 1.7) * R * 0.4, P.LIGHT); if (d.g[G.PATTERN] > 0.7) for (let k = 0; k < 5; k++) c.set(cx + sw + Math.cos(k * 2.3) * R, base - trunkH - R * 0.6 + Math.sin(k * 1.9) * R * 0.5, P.ACCENT); }
};


// ---- more land/air body plans
const turtle: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, gy = c.h - 2, domeH = L * 0.32, domeW = L * 0.36, sw = Math.sin(p.ph) * 1.6, by = gy - L * 0.12;
  for (const [x, off, col] of [[cx - domeW * 0.6, 0, P.DARK], [cx + domeW * 0.5, 3.14, P.DARK], [cx - domeW * 0.3, 1.6, P.SHADE], [cx + domeW * 0.7, 4.7, P.SHADE]] as [number, number, number][]) { const s2 = Math.sin(p.ph + off) * 1.6; c.line(x, by, x + s2, gy, col, 2); c.line(x + s2 - 1, gy, x + s2 + 1, gy, col, 1); }
  c.profile(cx - domeW, cx + domeW, (x) => { const t = (x - cx) / domeW; return [by - domeH * Math.sqrt(Math.max(0, 1 - t * t)), by]; }, P.ACCENT);
  c.profile(cx - domeW + 1, cx + domeW - 1, (x) => { const t = (x - cx) / domeW; return [by - domeH * Math.sqrt(Math.max(0, 1 - t * t)) + 1, by - 1]; }, P.BASE);
  for (let i = -2; i <= 2; i++) { c.line(cx + i * domeW * 0.38, by - domeH * 0.1, cx + i * domeW * 0.3, by - domeH * 0.85 * Math.sqrt(Math.max(0, 1 - (i * 0.4) ** 2)), P.DARK); }
  c.line(cx - domeW * 0.8, by - domeH * 0.55, cx + domeW * 0.8, by - domeH * 0.55, P.DARK);
  const hx = cx + domeW + 1 + p.atk * 2 + sw * 0.3, hy = by - domeH * 0.35; c.line(cx + domeW * 0.8, by - domeH * 0.2, hx, hy, P.SHADE, Math.max(2, L * 0.1)); c.disc(hx + 1, hy, L * 0.09 + 0.8, L * 0.08 + 0.7, P.SHADE); eye(c, hx + 2, hy - 1, 0.9);
  c.tri(cx - domeW, by - 1, cx - domeW - L * 0.12, by, cx - domeW, by + 1, P.SHADE);
};
const frog: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, gy = c.h - 2, jump = Math.max(0, Math.sin(p.ph)) * L * 0.18, by = gy - L * 0.2 - jump, bw = L * 0.34, bh = L * 0.2;
  c.disc(cx, by, bw, bh, P.BASE); c.disc(cx + bw * 0.7, by - bh * 0.1, bw * 0.55, bh * 0.75, P.BASE);
  for (let x = Math.round(cx - bw * 0.6); x < cx + bw * 0.6; x++) c.set(x, by + bh * 0.5, P.BELLY);
  const kx = cx - bw * 0.2, hx = cx - bw * 0.9; c.line(cx - bw * 0.3, by + bh * 0.3, kx, gy - L * 0.18 - jump * 0.5, P.SHADE, Math.max(2, L * 0.1)); c.line(kx, gy - L * 0.18 - jump * 0.5, hx - jump * 0.5, gy - jump * 0.3, P.SHADE, Math.max(1, L * 0.07));
  c.line(cx + bw * 0.55, by + bh * 0.4, cx + bw * 0.8, gy - jump * 0.2, P.DARK, 1); eye(c, cx + bw * 0.85, by - bh * 0.85, Math.max(1.1, L * 0.06)); eye(c, cx + bw * 0.35, by - bh * 0.95, Math.max(1, L * 0.05));
  c.line(cx + bw * 1.15, by + bh * 0.1, cx + bw * 0.6, by + bh * 0.2 + p.atk * 1.5, P.GORE); if (p.atk > 0.5) c.line(cx + bw * 1.15, by + bh * 0.1, cx + bw * 1.9, by - 1, P.ORGAN);
  for (let i = 0; i < 4; i++) c.set(cx - bw * 0.4 + i * 2, by - bh * 0.6, P.ACCENT);
};
const croc: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, gy = c.h - 2, bodyH = L * 0.13, bx0 = cx - L * 0.5, bx1 = cx + L * 0.12, by = gy - L * 0.1 - bodyH * 0.5 + Math.round(Math.sin(p.ph * 2) * 0.4);
  const leg = (x: number, off: number, col: number) => { const s2 = Math.sin(p.ph + off) * 2.4; c.line(x, by + bodyH * 0.4, x + s2 * 0.5 + 1, gy - 1, col, 2); c.line(x + s2 * 0.5 + 1, gy - 1, x + s2 + 3, gy, col, 1); };
  leg(bx0 + L * 0.2, 0, P.DARK); leg(bx1 - 4, 3.1, P.DARK);
  c.profile(bx0, bx1, (x) => { const t = (x - bx0) / (bx1 - bx0); const h = bodyH * 0.5 * (0.85 + 0.35 * Math.sin(t * Math.PI)); return [by - h, by + h]; }, P.BASE);
  for (let i = 0; i < L * 0.45; i++) { const t = i / (L * 0.45); c.disc(bx0 - i, by + Math.sin(p.ph + i * 0.2) * t * 2, Math.max(0.6, (1 - t) * bodyH * 0.45), Math.max(0.6, (1 - t) * bodyH * 0.45), P.BASE); if (i % 3 === 0) c.set(bx0 - i, by - bodyH * 0.45 * (1 - t) - 1, P.SHADE); }
  for (let x = Math.round(bx0 + 2); x < bx1 - 2; x += 2) c.set(x, by - bodyH * 0.6, P.SHADE);
  const hx0 = bx1 - 1, snout = L * 0.3; c.profile(hx0, hx0 + snout, (x) => { const t = (x - hx0) / snout; return [by - bodyH * (0.45 - t * 0.12) - (t < 0.25 ? 1 : 0), by + bodyH * 0.2 + p.atk * 2.2 * t]; }, P.BASE);
  c.line(hx0, by + bodyH * 0.25 + p.atk * 2, hx0 + snout, by + bodyH * 0.2 + p.atk * 2.2, P.GORE); for (let i = 0; i < 5; i++) c.set(hx0 + snout - 1 - i * 2.2, by + bodyH * 0.2 + (p.atk > 0.5 ? 1 : 0), P.TOOTH);
  eye(c, hx0 + 2, by - bodyH * 0.6, Math.max(1, L * 0.03)); c.set(hx0 + snout, by - bodyH * 0.3, P.DARK);
};
const snake: Painter = (c, d, p) => {
  const L = d.L, cy = c.h / 2 - 0.5, th = Math.max(1.6, L * 0.075), amp = L * 0.11 + 0.6, K = 6.3 / (L * 0.5 + 3);
  for (let x = 2; x < c.w - 4; x++) { const t = (x - 2) / (c.w - 7); const rr = th * (0.35 + 0.9 * Math.sin(Math.min(1, t * 1.05) * 1.4 + 0.1)) * (t < 0.1 ? 0.5 + t * 5 : 1); const y = cy + Math.sin(x * K - p.ph * 1.2) * amp * (0.5 + t * 0.5); c.disc(x, y, 0.7, rr, P.BASE); if (x % 4 < 2 && d.g[G.PATTERN] > 0.3) c.disc(x, y - rr * 0.4, 0.6, rr * 0.4, P.ACCENT); }
  const hx = c.w - 4, hy = cy + Math.sin(hx * K - p.ph * 1.2) * amp; c.disc(hx + 1, hy, th * 1.15, th * 0.95, P.BASE); eye(c, hx + 1.5, hy - 1, Math.max(0.8, th * 0.35));
  const tl = 2 + p.atk * 3 + Math.max(0, Math.sin(p.ph * 2)) * 1.5; c.line(hx + th + 1, hy, hx + th + 1 + tl, hy, P.GORE); c.set(hx + th + 1 + tl, hy - 1, P.GORE); c.set(hx + th + 1 + tl, hy + 1, P.GORE);
  if (d.g[G.VENOM] > 0.4 && p.atk > 0.5) { c.set(hx + th, hy + 1, P.TOOTH); }
};
const bat: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, cy = c.h * 0.5, fl = Math.sin(p.ph * 1.7), pter = d.variant === 'pterosaur';
  const bw = L * (pter ? 0.2 : 0.17), bh = L * 0.12; c.disc(cx, cy, bw, bh, P.BASE);
  const hx = cx + bw * 0.9, hy = cy - bh * 0.5; c.disc(hx, hy, L * 0.08 + 0.8, L * 0.07 + 0.7, P.BASE);
  if (pter) { c.tri(hx + L * 0.04, hy - 1, hx + L * 0.28, hy + 1 + p.atk * 1.5, hx + L * 0.04, hy + L * 0.06, P.ACCENT2); c.tri(hx - L * 0.04, hy - L * 0.04, hx - L * 0.2, hy - L * 0.12, hx, hy + 1, P.ACCENT); } else { c.tri(hx - 1, hy - L * 0.05, hx + 1, hy - L * 0.05, hx, hy - L * 0.17, P.SHADE); c.tri(hx + 2, hy - L * 0.05, hx + 3, hy - L * 0.02, hx + 4, hy - L * 0.16, P.SHADE); }
  eye(c, hx + 1, hy - 0.5, Math.max(0.8, L * 0.035));
  for (const [sgn, col] of [[1, P.ACCENT], [-1, P.SHADE]] as [number, number][]) { const ty = cy - L * (0.05 + 0.22 * fl) - L * 0.05, tx = cx - sgn * L * 0.45 + 1; c.tri(cx + sgn * 0.5, cy - bh * 0.5, tx - sgn * 0, ty, cx - L * 0.28 * (sgn > 0 ? 1 : 0.4), cy + bh * 0.4, col); c.line(cx, cy - bh * 0.5, tx, ty, P.DARK); c.line(tx, ty, cx - L * 0.28, cy + bh * 0.4, P.DARK); }
  c.line(cx - bw * 0.7, cy + bh * 0.6, cx - bw * 0.9, cy + bh * 1.6, P.DARK); c.line(cx + bw * 0.1, cy + bh * 0.6, cx, cy + bh * 1.6, P.DARK);
  c.line(cx - bw, cy, cx - bw - L * (pter ? 0.12 : 0.1), cy + 1, P.DARK);
};
const butterfly: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, cy = c.h / 2 - 0.5, fl = Math.sin(p.ph * 2); const wv = 0.3 + 0.7 * Math.abs(fl);
  for (const [sgn, col] of [[-1, P.SHADE], [1, P.ACCENT]] as [number, number][]) { c.disc(cx - L * 0.12, cy + sgn * L * 0.25 * wv - sgn * 0.5, L * 0.22, L * 0.28 * wv, col); c.disc(cx + L * 0.08, cy + sgn * L * 0.18 * wv, L * 0.15, L * 0.18 * wv, P.ACCENT2); }
  c.disc(cx - L * 0.1, cy, L * 0.07, L * 0.07, P.OUT); c.profile(cx - L * 0.22, cx + L * 0.18, () => [cy - 1, cy + 0.5], P.BASE); c.disc(cx + L * 0.2, cy, 1.4, 1.4, P.BASE); c.line(cx + L * 0.22, cy - 1, cx + L * 0.35, cy - L * 0.18, P.DARK);
  for (let i = 0; i < 4; i++) c.set(cx - L * 0.2 + i * 2, cy + (i % 2 ? -1 : 1) * L * 0.2 * wv, P.EYE);
};
const spider: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, cy = c.h * 0.45;
  for (let i = 0; i < 8; i++) { const sd = i < 4 ? 1 : -1, k = i % 4, ang = -0.5 + k * 0.45, s2 = Math.sin(p.ph + k * 1.7 + (i < 4 ? 0 : 3)) * 1.4; const kx = cx + Math.cos(ang) * L * 0.3 * sd * 0.9 + (i < 4 ? 1 : -1) * 0 + (sd * 0), ky = cy - L * 0.12 - k * 0.5; c.line(cx + (k - 1.5) * 1.2, cy, cx + (k - 1.5) * L * 0.2 * (sd) * 0 + sd * L * 0.3 + (k - 1.5) * 2, cy - L * 0.18, P.DARK); c.line(cx + sd * L * 0.3 + (k - 1.5) * 2, cy - L * 0.18, cx + sd * L * 0.4 + (k - 1.5) * 2.5 + s2, c.h - 2, P.DARK); void kx; void ky; }
  c.disc(cx - L * 0.15, cy, L * 0.22, L * 0.18, P.BASE); c.disc(cx + L * 0.2, cy - 1, L * 0.14, L * 0.11, P.SHADE); for (let i = 0; i < 4; i++) c.set(cx + L * 0.27 + (i % 2), cy - 2 + (i >> 1) * 1.5, P.EYE); c.set(cx + L * 0.27, cy - 2, P.PUPIL);
  c.set(cx - L * 0.2, cy - 1, P.ACCENT); c.set(cx - L * 0.12, cy, P.ACCENT); if (p.atk > 0.5) c.line(cx + L * 0.32, cy, cx + L * 0.38, cy + 3, P.TOOTH);
};
const ant: Painter = (c, d, p) => {
  const L = d.L, cx = c.w / 2 - 0.5, cy = c.h * 0.45, bob = Math.round(Math.sin(p.ph * 2) * 0.5);
  for (let i = 0; i < 3; i++) for (const sgn of [-1, 1]) { const s2 = Math.sin(p.ph + i * 2.1 + (sgn > 0 ? 0 : 3.14)) * 1.5; c.line(cx - L * 0.08 + i * L * 0.1, cy + bob, cx - L * 0.08 + i * L * 0.1 + sgn * 2 + s2, cy + L * 0.17 + bob, P.DARK); c.line(cx - L * 0.08 + i * L * 0.1 + sgn * 2 + s2, cy + L * 0.17 + bob, cx - L * 0.08 + i * L * 0.1 + sgn * 3.5 + s2 * 1.4, c.h - 2, P.DARK); }
  c.disc(cx - L * 0.32, cy + bob, L * 0.2, L * 0.14, P.BASE); c.disc(cx - L * 0.02, cy + bob, L * 0.1, L * 0.08, P.SHADE); c.disc(cx + L * 0.28, cy - 1 + bob, L * 0.13, L * 0.11, P.BASE);
  eye(c, cx + L * 0.33, cy - 2 + bob, 0.9); c.line(cx + L * 0.4, cy + bob, cx + L * 0.45, cy + 2 + p.atk * 2 + bob, P.TOOTH); c.line(cx + L * 0.35, cy - L * 0.08 + bob, cx + L * 0.5, cy - L * 0.2 + bob, P.DARK);
};

const PAINTERS: Record<string, Painter> = { micro, colony, mat, jelly, sessile, worm, arthropod, snail, squid, fish, whale, quadruped, biped, bird, kelp, moss, grass, fern, tree, turtle, frog, croc, snake, bat, butterfly, spider, ant };

// ---------------------------------------------------------------------------------- layout
interface Layout { w: number; h: number; ref: number; }
function layout(arch: string, L: number): Layout {
  const m = 3;
  switch (arch) {
    case 'micro': return { w: L + 4, h: L + 4, ref: L };
    case 'colony': return { w: L + 3, h: L + 3, ref: L };
    case 'mat': return { w: L + 4, h: Math.max(8, Math.round(L * 0.3) + 4), ref: L };
    case 'jelly': return { w: L + 6, h: Math.round(L * 1.0) + 4, ref: L };
    case 'sessile': return { w: L + 4, h: L + 6, ref: L };
    case 'worm': return { w: L + 6, h: Math.round(L * 0.45) + 6, ref: L };
    case 'arthropod': return { w: L + 8, h: Math.round(L * 0.7) + 8, ref: L };
    case 'snail': return { w: L + 6, h: Math.round(L * 0.6) + 6, ref: L };
    case 'squid': return { w: Math.round(L * 1.2) + 6, h: Math.round(L * 0.5) + 8, ref: L };
    case 'fish': return { w: L + 10, h: Math.round(L * 0.62) + 8, ref: L };
    case 'whale': return { w: L + 10, h: Math.round(L * 0.62) + 8, ref: L };
    case 'quadruped': return { w: Math.round(L * 1.35) + 8, h: Math.round(L * 0.95) + 6, ref: L };
    case 'biped': return { w: Math.round(L * 0.9) + 6, h: Math.round(L * 1.05) + 5, ref: L };
    case 'bird': return { w: Math.round(L * 1.1) + 8, h: Math.round(L * 0.8) + 8, ref: L };
    case 'turtle': return { w: Math.round(L * 1.15) + 8, h: Math.round(L * 0.7) + 6, ref: L };
    case 'frog': return { w: Math.round(L * 1.1) + 8, h: Math.round(L * 0.75) + 6, ref: L };
    case 'croc': return { w: Math.round(L * 1.2) + 8, h: Math.round(L * 0.45) + 6, ref: L };
    case 'snake': return { w: L + 8, h: Math.round(L * 0.45) + 8, ref: L };
    case 'bat': return { w: Math.round(L * 1.1) + 8, h: Math.round(L * 0.9) + 8, ref: L };
    case 'butterfly': return { w: L + 6, h: Math.round(L * 0.9) + 6, ref: L };
    case 'spider': return { w: Math.round(L * 1.2) + 8, h: Math.round(L * 0.65) + 6, ref: L };
    case 'ant': return { w: L + 8, h: Math.round(L * 0.65) + 8, ref: L };
    case 'kelp': return { w: Math.round(L * 0.45) + 8, h: L + 5, ref: L };
    case 'moss': return { w: L + 4, h: Math.round(L * 0.5) + 5, ref: L };
    case 'grass': return { w: Math.round(L * 0.55) + 6, h: L + 4, ref: L };
    case 'fern': return { w: Math.round(L * 0.9) + 6, h: L + 4, ref: L };
    case 'tree': return { w: Math.round(L * 0.85) + 6, h: L + 4, ref: L };
    default: return { w: L + m * 2, h: L + m * 2, ref: L };
  }
}
/** Body length in pixels: grows with log(size) so big animals have more pixels to work with. */
const lengthPx = (size: number) => Math.round(clamp(7 + 4.1 * Math.log2(size / 0.12), 7, 46));

// ---------------------------------------------------------------------------------- frames
function toCanvas(c8: C8, pal: Pal): HTMLCanvasElement {
  const cv = makeCanvas(c8.w, c8.h), x = cv.getContext('2d')!, img = x.createImageData(c8.w, c8.h);
  for (let i = 0; i < c8.px.length; i++) { const v = c8.px[i]; if (!v) continue; const col = pal[v]; img.data[i * 4] = hexR(col); img.data[i * 4 + 1] = hexG(col); img.data[i * 4 + 2] = hexB(col); img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0); return cv;
}

/** Membrane wings on walkers (dragons, griffins, winged horses): painted over the back and flapping with the pose. */
function addWings(c: C8, d: Design, p: Pose) {
  const bb = c.bbox(); const L = d.L; const rx = Math.round(bb.x0 + (bb.x1 - bb.x0) * (d.arch === 'biped' ? 0.42 : 0.5));
  let top = c.h; for (let y = 0; y < c.h; y++) if (c.get(rx, y)) { top = y; break; }
  const flap = Math.sin(p.ph) * L * 0.1, wl = L * 0.34, rootY = top + 1.5;
  const tipX = rx - wl * 0.6, tipY = Math.max(1, rootY - wl * 0.85 - flap);
  c.tri(rx + 1, rootY, rx - wl * 1.1, rootY - wl * 0.2 + flap * 0.4, tipX, tipY, P.ACCENT2);
  c.tri(rx + 1, rootY, tipX, tipY, rx + wl * 0.25, Math.max(1, rootY - wl * 0.6 - flap), P.SHADE);
  c.line(rx + 1, rootY, tipX, tipY, P.DARK); c.line(rx + 1, rootY, rx - wl * 1.1, rootY - wl * 0.2 + flap * 0.4, P.DARK);
}

function finish(c: C8, d: Design, pal: Pal) {
  shade(c);
  const g = d.g;
  if (g[G.PATTERN] > 0.78 && g[G.CAMO] < 0.5 && !d.producer) { const r = mulberry(hashGenome(g) ^ 77); for (let i = 0; i < c.px.length; i++) if ((c.px[i] === P.BASE || c.px[i] === P.LIGHT) && r() < 0.07) c.px[i] = P.ACCENT; }
  outline(c);
  void pal;
}

function deadFrame(src: C8, d: Design, pal: Pal, gore: boolean): C8 {
  const c = src.clone();
  if (!d.producer) c.flipV();
  // X eyes
  for (let i = 0; i < c.px.length; i++) if (c.px[i] === P.PUPIL || c.px[i] === P.EYE) c.px[i] = P.DARK;
  // exposed wound with organs and bone
  const bb = c.bbox(); const cx = Math.round((bb.x0 + bb.x1) / 2), cy = Math.round((bb.y0 + bb.y1) / 2), r = Math.max(1.5, (bb.x1 - bb.x0) * 0.12);
  if (gore && !d.producer && d.size >= 0.45) {
    c.disc(cx, cy + 1, r, r * 0.8, P.GORE); c.disc(cx - r * 0.3, cy + 1, r * 0.5, r * 0.4, P.ORGAN); c.set(cx + r * 0.4, cy, P.ORGAN); if (r > 2.2) { c.set(cx + 1, cy - 1, P.BONE); c.set(cx + 2, cy - 1, P.BONE); } c.set(cx - r, cy + 2, P.GORE);
    for (let i = 0; i < 3; i++) c.under(cx + i - 1, bb.y1 + 1, P.GORE);
  }
  shade(c, false); outline(c); return c;
}

function bonesFrame(src: C8, d: Design): C8 {
  const bb = src.bbox(); const c = new C8(src.w, src.h); const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0; const cy = Math.round((bb.y0 + bb.y1) / 2 + h * 0.15); const x0 = bb.x0 + 1, x1 = bb.x1 - 1;
  if (d.producer) { c.line(x0, bb.y1, x0 + w * 0.5, bb.y0, P.BONE); c.line(x0 + w * 0.5, bb.y0, x1, bb.y1, P.BONE); outline(c); return c; }
  const horiz = w >= h * 0.9;
  if (horiz) {
    c.line(x0 + w * 0.12, cy, x1 - w * 0.12, cy, P.BONE); const n = Math.max(3, Math.floor(w / 4));
    for (let i = 0; i < n; i++) { const x = x0 + w * 0.3 + (i / n) * w * 0.4, rh = (h * 0.28) * (1 - Math.abs(i / n - 0.4)); c.line(x, cy, x - 1, cy + rh, P.BONE); c.line(x, cy, x - 1, cy - rh * 0.6, P.BONE); }
    c.disc(x1 - w * 0.08, cy - 1, Math.max(1.6, h * 0.2), Math.max(1.5, h * 0.17), P.BONE); c.set(x1 - w * 0.08 + 1, cy - 1, P.DARK); c.line(x1 - w * 0.03, cy + 1, x1, cy + 2, P.BONE);
    for (let i = 0; i < w * 0.14; i++) c.set(x0 + i, cy + (i % 2), P.BONE);
  } else { c.line((x0 + x1) / 2, bb.y0 + 2, (x0 + x1) / 2, bb.y1 - 4, P.BONE); for (let i = 0; i < 4; i++) c.line((x0 + x1) / 2, bb.y0 + h * 0.3 + i * 2, (x0 + x1) / 2 + w * 0.25, bb.y0 + h * 0.3 + i * 2 + 1, P.BONE); c.disc((x0 + x1) / 2, bb.y0 + 2, Math.max(1.5, w * 0.2), Math.max(1.5, w * 0.2), P.BONE); }
  outline(c); return c;
}

const WALKERS = new Set(['quadruped', 'biped', 'frog', 'turtle', 'croc', 'spider', 'ant', 'snail']);
export function generateSprite(genome: ArrayLike<number>, template?: string): SpriteSet {
  const size = sizeFromGene(genome[G.SIZE]);
  const cl = classify(genome, template);
  const rng = mulberry(hashGenome(genome));
  const L = lengthPx(size);
  const design: Design = { g: genome, size, L, arch: cl.arch, variant: cl.variant, rng, producer: cl.producer };
  const pal = makePalette(genome, cl.producer);
  const lay = layout(cl.arch, L), painter = PAINTERS[cl.arch] ?? quadruped;
  const frames: HTMLCanvasElement[] = [];
  const poses: Pose[] = [0, 1, 2, 3].map((i) => ({ ph: (i / 4) * Math.PI * 2, atk: 0 }));
  const vrng = hashGenome(genome);
  let neutral: C8 | null = null;
  for (let f = 0; f < 5; f++) {
    design.rng = mulberry(vrng);
    const c = new C8(lay.w, lay.h);
    const pose = f < 4 ? poses[f] : { ph: 0.5, atk: 1 };
    painter(c, design, pose);
    if ((cl.arch === 'quadruped' || cl.arch === 'biped') && genome[G.WINGS] > 0.55 && genome[G.FLY] > 0.3) addWings(c, design, pose);
    if (f === 0) neutral = c.clone();
    finish(c, design, pal);
    frames.push(toCanvas(c, pal));
  }
  frames.push(toCanvas(deadFrame(neutral!, design, pal, true), pal));
  frames.push(toCanvas(bonesFrame(neutral!, design), pal));
  frames.push(toCanvas(deadFrame(neutral!, design, pal, false), pal));
  const dot = makeCanvas(2, 2); const dx = dot.getContext('2d')!; dx.fillStyle = '#fff'; dx.fillRect(0, 0, 2, 2); frames.push(dot);
  const glow = genome[G.BIOLUM] > 0.3;
  return { frames, basePx: lay.ref, color: mix(pal[P.BASE], 0x000000, 0.0), archetype: cl.arch + (design.variant ? ':' + design.variant : ''), glow, glowCol: pal[P.GLOW], foot: WALKERS.has(cl.arch) ? ((lay.h - 2) / lay.h - 0.5) * lay.h / lay.ref : 0 };
}
