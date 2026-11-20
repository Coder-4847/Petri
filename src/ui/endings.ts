// Ending screens: a short animated pixel scene (160x90, drawn procedurally) with an epilogue.
import { ENDINGS, type EndingDef } from '../data/civ';
import { fmtYear } from './civ';

const W = 160, H = 90;
type C = CanvasRenderingContext2D;
type Col = [number, number, number];
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const rgb = (c: number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: Col, b: Col, t: number): Col => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h % 360},${s}%,${l}%,${a})`;

function rect(c: C, x: number, y: number, w: number, h: number, col: string) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function disc(c: C, cx: number, cy: number, r: number, col: string) { c.fillStyle = col; for (let dy = -Math.round(r); dy <= Math.round(r); dy++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))); c.fillRect(Math.round(cx) - w, Math.round(cy) + dy, w * 2 + 1, 1); } }
function sky(c: C, top: Col, bot: Col, h = H) { for (let y = 0; y < h; y++) rect(c, 0, y, W, 1, rgb(mix(top, bot, y / h))); }
function stars(c: C, t: number, n = 70, a = 1, seed = 1) { for (let i = 0; i < n; i++) { const tw = 0.5 + 0.5 * Math.sin(t * (1 + hash(i + seed) * 2) + i); rect(c, hash(i * 3 + seed) * W, hash(i * 7 + seed) * H * 0.8, 1, 1, `rgba(255,255,255,${a * (0.25 + 0.6 * tw)})`); } }
/** City silhouette: columns with windows. `lit` is the fraction of windows on; `ruin` (0..1) breaks the tops. */
function skyline(c: C, base: number, seed: number, col: string, o: { lit?: number; ruin?: number; min?: number; max?: number; winCol?: string; t?: number } = {}) {
  let x = -2; let i = 0; const min = o.min ?? 10, max = o.max ?? 38;
  while (x < W) {
    const w = 5 + Math.floor(hash(i + seed) * 6), h0 = min + hash(i * 5 + seed) * (max - min); const h = h0 * (1 - (o.ruin ?? 0) * (0.2 + 0.7 * hash(i * 11 + seed)));
    rect(c, x, base - h, w, h + 1, col);
    if ((o.ruin ?? 0) > 0.3) for (let k = 0; k < 3; k++) rect(c, x + hash(i * 13 + k) * w, base - h - 1 + k, 1 + (k & 1), 1, col);
    for (let wy = base - h + 2; wy < base - 2; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) { const on = hash(wx * 9 + wy * 31 + seed) < (o.lit ?? 0); if (on) rect(c, wx, wy, 1, 1, o.winCol ?? '#ffd070'); }
    x += w + (hash(i * 17 + seed) > 0.6 ? 1 : 0); i++;
  }
}
function hills(c: C, base: number, amp: number, col: string, seed: number, f = 0.05) { for (let x = 0; x < W; x++) { const y = base + Math.sin(x * f + seed) * amp + Math.sin(x * f * 2.3 + seed * 2) * amp * 0.4; rect(c, x, y, 1, H - y, col); } }
function particles(c: C, t: number, n: number, col: string, vx: number, vy: number, seed = 1, size = 1) { for (let i = 0; i < n; i++) { const x = ((hash(i + seed) * W + t * vx * (0.5 + hash(i * 3 + seed))) % W + W) % W, y = ((hash(i * 7 + seed) * H + t * vy * (0.5 + hash(i * 5 + seed))) % H + H) % H; rect(c, x, y, size, size, col); } }

// ------------------------------------------------------------------ scenes
type Scene = (c: C, t: number) => void;
const SCENES: Record<string, Scene> = {
  asteroid: (c, t) => {
    const T = t % 11, hit = 4.2, p = Math.min(1, T / hit), after = Math.max(0, T - hit);
    sky(c, mix([40, 30, 70], [70, 20, 20], clamp(after / 3)), mix([230, 130, 90], [240, 90, 30], clamp(after / 2)));
    stars(c, t, 30, 1 - clamp(after / 2));
    skyline(c, 80, 3, '#1a1422', { lit: T < hit ? 0.55 : 0.1, ruin: clamp(after / 1.5), min: 12, max: 40 });
    rect(c, 0, 80, W, 10, '#0e0a12');
    if (T < hit) {
      const hx = 150 - 95 * p, hy = -8 + 86 * p;
      for (let k = 22; k > 0; k--) { const tx = hx + k * 1.15, ty = hy - k * 0.9; disc(c, tx, ty, Math.max(0.6, 3 - k * 0.12), k < 8 ? '#ffb040' : k < 15 ? '#e0502a' : 'rgba(110,50,40,.6)'); }
      disc(c, hx, hy, 3.5, '#fff2c0'); disc(c, hx, hy, 2, '#ffffff');
    } else {
      if (after < 0.5) rect(c, 0, 0, W, H, `rgba(255,248,230,${1 - after * 2})`);
      const r = after * 42; for (let a = 0; a < 80; a++) { const an = a / 80 * Math.PI; rect(c, 55 + Math.cos(an) * r, 80 - Math.sin(an) * r * 0.35, 2, 1, `rgba(255,170,70,${clamp(1 - after / 3)})`); }
      for (let k = 0; k < 18; k++) disc(c, 55 + (hash(k) - 0.5) * 28 * (1 + after * 0.5), 78 - after * 9 - hash(k + 9) * 20 * Math.min(1, after), 3 + hash(k + 3) * 6 + after * 1.5, `rgba(${70 + hash(k) * 40},${40 + hash(k) * 20},${34},0.8)`);
      particles(c, t, 40, '#ffb04a', 6, -12, 5);
    }
  },
  nuclear: (c, t) => {
    const T = t % 10, after = Math.max(0, T - 0.5);
    sky(c, mix([14, 16, 38], [90, 40, 30], clamp(after / 4)), mix([80, 70, 100], [255, 150, 60], clamp(after / 3)));
    stars(c, t, 30, 1 - clamp(after / 1.5));
    skyline(c, 80, 8, '#12101c', { lit: 0.5 * (1 - clamp(after / 1)), ruin: clamp((after - 0.8) / 1.5) * 0.8 });
    rect(c, 0, 80, W, 10, '#0b0910');
    if (T < 0.5) { rect(c, 0, 0, W, H, `rgba(255,255,255,${1 - T * 1.6})`); return; }
    const sh = Math.min(38, after * 11), cx = 100;
    rect(c, cx - 3, 80 - sh, 6, sh, '#7a5040'); rect(c, cx - 1, 80 - sh, 2, sh, '#d07a40');
    const cr = Math.min(17, 5 + after * 3);
    disc(c, cx, 80 - sh - 2, cr, '#5a4448'); disc(c, cx, 80 - sh - 3, cr * 0.8, '#a06a50'); disc(c, cx - 1, 80 - sh - 4, cr * 0.55, '#ffb050'); disc(c, cx - 2, 80 - sh - 5, cr * 0.28, '#fff0b0');
    for (let a = 0; a < 60; a++) { const an = a / 60 * Math.PI, r = after * 28; rect(c, cx + Math.cos(an) * r, 80 - Math.sin(an) * r * 0.1, 2, 1, `rgba(255,220,160,${clamp(1 - after / 4)})`); }
    particles(c, t, 30, 'rgba(60,50,60,0.8)', 2, -4, 9, 2);
  },
  climate: (c, t) => {
    sky(c, [150, 50, 40], [250, 175, 90]);
    const pulse = 1 + Math.sin(t) * 0.04; disc(c, 112, 34, 22 * pulse, 'rgba(255,200,120,.25)'); disc(c, 112, 34, 15 * pulse, '#ffd88a'); disc(c, 112, 34, 11 * pulse, '#fff0b8');
    hills(c, 66, 3, '#4a2a22', 3);
    skyline(c, 74, 4, '#2c1a1c', { lit: 0, min: 14, max: 34, ruin: 0.3 });
    for (let x = 6; x < 60; x += 14) { rect(c, x, 58, 1, 14, '#1a0e0e'); rect(c, x - 3, 62, 4, 1, '#1a0e0e'); rect(c, x + 1, 60, 4, 1, '#1a0e0e'); }
    const lvl = 64 + 4 * Math.sin(t * 0.2);
    for (let x = 0; x < W; x++) { const y = lvl + Math.sin(x * 0.18 + t * 2) * 1.1; rect(c, x, y, 1, H - y, x % 7 === 0 ? '#2a6a80' : '#245c74'); rect(c, x, y, 1, 1, '#9fd6e6'); }
    for (let i = 0; i < 6; i++) rect(c, (hash(i) * W + t * 8) % W, 30 + hash(i + 4) * 30, 8, 1, 'rgba(255,230,180,.12)');
  },
  supervolcano: (c, t) => {
    const dark = clamp(t * 0.07, 0, 0.7);
    sky(c, mix([40, 24, 36], [14, 10, 14], dark), mix([150, 70, 50], [60, 34, 30], dark));
    rect(c, 0, 0, W, H, `rgba(20,14,16,${dark * 0.5})`);
    for (let k = 0; k < 46; k++) { const ph = (t * 14 + k * 2.2) % 70, x = 80 + Math.sin(k * 1.7 + t * 0.6) * (3 + ph * 0.22), y = 42 - ph, r = 3 + ph * 0.17; disc(c, x, y, r, rgb(mix([210, 90, 40], [70, 62, 66], clamp(ph / 28)), clamp(1.1 - ph / 90))); }
    for (let x = 0; x < W; x++) { const y = 90 - Math.max(0, 44 - Math.abs(x - 80) * 0.85 + Math.sin(x * 0.7) * 1.2); if (y < 90) rect(c, x, y, 1, 90 - y, '#241a20'); }
    disc(c, 80, 47, 4, '#ff7a30'); rect(c, 76, 46, 8, 1, '#ffd080');
    for (let k = 0; k < 10; k++) { const ph = (t * 1.6 + k * 0.37) % 1, a = (hash(k) - 0.5) * 1.6; rect(c, 80 + a * 50 * ph, 46 - Math.sin(ph * Math.PI) * 30 + ph * ph * 40, 1, 1, '#ffb040'); }
    particles(c, t, 40, 'rgba(120,110,110,.7)', 6, 5, 3);
  },
  pandemic: (c, t) => {
    sky(c, [78, 92, 86], [150, 160, 140]);
    skyline(c, 76, 6, '#34403a', { lit: 0, min: 14, max: 36 }); skyline(c, 80, 12, '#222c28', { lit: 0, min: 8, max: 22 });
    rect(c, 0, 80, W, 10, '#1a2220'); for (let x = 0; x < W; x += 12) rect(c, x, 85, 6, 1, '#3a463e');
    rect(c, 36, 62, 1, 18, '#10161a'); rect(c, 34, 61, 5, 1, '#10161a'); if (Math.sin(t * 5 + Math.sin(t * 13)) > 0) disc(c, 36, 61, 1.5, '#d8e0a0');
    for (let i = 0; i < 7; i++) rect(c, 0, 30 + i * 8 + Math.sin(t * 0.5 + i) * 2, W, 3, 'rgba(210,225,205,.08)');
    particles(c, t, 70, 'rgba(190,230,120,.7)', 4, -1.5, 7); particles(c, t, 20, 'rgba(160,210,100,.9)', 7, 2, 21, 2);
  },
  ai: (c, t) => {
    rect(c, 0, 0, W, H, '#05060a');
    for (let i = 0; i < 20; i++) for (let j = 0; j < 11; j++) { const x = i * 8 + 2, y = j * 8 + 2, on = hash(i * 13 + j * 7 + Math.floor(t * 3 + hash(i + j) * 5)) > 0.72; rect(c, x, y, 6, 6, '#0b0e16'); rect(c, x + 1, y + 1, 1, 1, on ? (hash(i + j * 3) > 0.8 ? '#ff3a4a' : '#2aff8a') : '#14181f'); rect(c, x + 3, y + 1, 1, 1, on ? '#2a6aff' : '#12161c'); }
    rect(c, 0, ((t * 22) % (H + 12)) - 6, W, 1, 'rgba(255,60,80,.25)');
    const ex = Math.sin(t * 0.8) * 5, ey = Math.cos(t * 0.6) * 2;
    disc(c, 80, 45, 24, 'rgba(255,40,60,.12)'); disc(c, 80, 45, 19, '#1a070a'); disc(c, 80, 45, 16, '#ff2a3a'); disc(c, 80, 45, 12, '#a01022'); disc(c, 80 + ex, 45 + ey, 6, '#050205'); rect(c, 78 + ex, 43 + ey, 2, 2, '#ff9aa0');
  },
  orbit: (c, t) => {
    const p = (t % 13) / 13;
    rect(c, 0, 0, W, H, '#04060c'); stars(c, t, 90);
    disc(c, 8, 45, 16 - 9 * p, '#ffcf70'); disc(c, 8, 45, 12 - 7 * p, '#fff0b0'); for (let r = 0; r < 4; r++) disc(c, 8, 45, 22 - 9 * p + r * 3, `rgba(255,190,90,${0.05 - r * 0.01})`);
    for (let x = 40; x < W; x += 4) rect(c, x, 45 + Math.sin(x * 0.04) * 6, 1, 1, 'rgba(120,150,200,.35)');
    const px = 50 + 95 * p, py = 45 + Math.sin(px * 0.04) * 6;
    disc(c, px, py, 9, '#2a62b0'); disc(c, px - 1, py - 1, 7, '#3a78c8'); for (let k = 0; k < 6; k++) rect(c, px - 5 + hash(k) * 8, py - 4 + hash(k + 3) * 8, 3, 1, '#4a9a58');
    const ice = 1 + p * 8; for (let dy = 0; dy < ice; dy++) { const w = Math.round(Math.sqrt(Math.max(0, 81 - (9 - dy) * (9 - dy)))); rect(c, px - w, py - 9 + dy, w * 2 + 1, 1, '#eef6ff'); rect(c, px - w, py + 9 - dy, w * 2 + 1, 1, '#eef6ff'); }
    for (let dx = -9; dx <= 9; dx++) { const w = Math.round(Math.sqrt(Math.max(0, 81 - dx * dx))); rect(c, px + Math.max(-w, 3 - dx * 0.3), py - w * 0.2, 1, w * 0.4, 'rgba(0,0,10,.35)'); }
  },
  solar: (c, t) => {
    const T = t % 10; sky(c, [6, 8, 26], [24, 38, 70]); stars(c, t, 50);
    for (let x = 0; x < W; x++) for (let b = 0; b < 3; b++) { const y = 18 + b * 6 + Math.sin(x * 0.06 + t * (0.6 + b * 0.2) + b) * 6; rect(c, x, y, 1, 8, hsl(b === 1 ? 300 : 140, 80, 55, 0.12 + 0.05 * Math.sin(t + x * 0.1))); }
    const flare = T < 1.2 ? 1 : clamp(1 - (T - 1.2) * 0.3, 0.3, 1); disc(c, 12, 8, 6 + 4 * flare, `rgba(255,220,120,${0.25 * flare})`); disc(c, 12, 8, 6, '#fff0b0');
    for (let k = 0; k < 6; k++) rect(c, 12 + k * 4 * flare, 8 + k * 2.4 * flare, 3, 1, `rgba(255,230,150,${0.7 * flare})`);
    const off = clamp((T - 2) / 2);
    skyline(c, 80, 5, '#0c1020', { lit: 0.7 * (1 - off), min: 12, max: 42 });
    if (T > 2 && T < 4.2) for (let k = 0; k < 12; k++) if (hash(Math.floor(t * 18) + k) > 0.6) rect(c, hash(k * 3 + Math.floor(t * 9)) * W, 50 + hash(k) * 28, 1, 1, '#ffe27a');
    rect(c, 0, 80, W, 10, '#080a14');
    if (off >= 1) rect(c, 0, 0, W, H, 'rgba(0,0,8,.25)');
  },
  rogue: (c, t) => {
    const T = t % 13, grow = T / 13;
    sky(c, [8, 6, 16], mix([40, 16, 20], [110, 40, 34], grow)); stars(c, t, 60, 1 - grow * 0.6);
    const r = 3 + grow * 22; for (let k = 4; k > 0; k--) disc(c, 118, 30, r + k * 4, `rgba(255,${120 + k * 20},80,${0.05 + (4 - k) * 0.02})`); disc(c, 118, 30, r, '#ffb890'); disc(c, 118, 30, r * 0.75, '#fff0e0');
    skyline(c, 80, 9, '#160a0e', { lit: 0, min: 10, max: 34 });
    for (let x = 0; x < W; x++) { const y = 80 - 0.5; rect(c, x, y, 1, 1, `rgba(255,100,60,${0.35 + grow * 0.4})`); }
    rect(c, 0, 81, W, 9, '#0c0608');
    for (let i = 0; i < 6; i++) rect(c, 118 - r - 6 - i * 3, 30 + Math.sin(t * 2 + i) * 2, 1, 1, '#aab8ff');
  },
  extinction: (c, t) => {
    const rise = clamp(t * 0.05, 0, 1); sky(c, mix([20, 24, 50], [90, 120, 170], rise), mix([70, 70, 110], [250, 190, 140], rise));
    stars(c, t, 40, 1 - rise); disc(c, 112, 78 - rise * 18, 9, '#ffd890'); disc(c, 112, 78 - rise * 18, 6, '#fff2c8');
    hills(c, 70, 3, '#3a4c46', 1, 0.04); hills(c, 78, 2, '#2a3a34', 4, 0.07);
    for (let x = 0; x < W; x += 2) { const h = 3 + hash(x) * 4, sw = Math.sin(t * 1.4 + x * 0.3) * 1.2; rect(c, x + sw * 0.5, 80 - h + (x % 3), 1, h, '#4a6c52'); }
    for (let i = 0; i < 8; i++) rect(c, 40 + i * 3, 83 - Math.sin(i / 7 * Math.PI) * 4, 1, 3, '#d8d2bc'); rect(c, 38, 83, 26, 1, '#d8d2bc'); disc(c, 66, 83, 2, '#d8d2bc'); rect(c, 64, 82, 1, 1, '#2a2a2a');
    for (let k = 0; k < 5; k++) rect(c, 100 + k * 4, 84 + (k % 2), 3, 2, '#5a5a60');
    particles(c, t, 14, 'rgba(255,255,230,.7)', 3, -1, 4);
  },
  balance: (c, t) => {
    sky(c, [110, 190, 240], [255, 232, 180]); disc(c, 126, 22, 11, 'rgba(255,240,170,.35)'); disc(c, 126, 22, 8, '#fff2a0');
    for (let i = 0; i < 5; i++) { const bx = (t * 6 + i * 36) % (W + 20) - 10; rect(c, bx, 14 + i * 5 + Math.sin(t * 6 + i) * 1, 2, 1, '#2a3a40'); rect(c, bx + 2, 13 + i * 5 + Math.sin(t * 6 + i + 2), 2, 1, '#2a3a40'); }
    hills(c, 60, 4, '#8cc07a', 2, 0.03); hills(c, 68, 3, '#5aa05a', 5, 0.05);
    let x = 4; for (let i = 0; i < 9; i++) { const w = 7 + Math.floor(hash(i) * 4), h = 18 + hash(i + 4) * 26; rect(c, x, 78 - h, w, h, '#d4dccc'); rect(c, x, 78 - h, 1, h, '#a8b8a0'); for (let wy = 78 - h + 3; wy < 74; wy += 4) for (let wx = x + 2; wx < x + w - 1; wx += 3) rect(c, wx, wy, 1, 2, '#58b0b8'); disc(c, x + w / 2, 78 - h - 1, 3.5, '#3a8a46'); disc(c, x + w / 2 - 1, 78 - h - 3, 2, '#52a85a'); for (let g = 0; g < 3; g++) rect(c, x + 1 + g * 2, 78 - h * (0.3 + g * 0.2), 2, 1, '#3a8a46'); x += w + 8 + Math.floor(hash(i + 20) * 6); }
    rect(c, 0, 78, W, 12, '#4a8a4a'); for (let g = 0; g < W; g += 2) rect(c, g, 78 + (g % 3), 1, 1, '#6ab05c');
    for (let a = 0; a < 3; a++) { const ax = (t * 3 + a * 55) % (W + 16) - 8, by = 80 + a * 3; rect(c, ax, by - 3, 6, 3, '#a8703c'); rect(c, ax + 5, by - 5, 2, 3, '#a8703c'); rect(c, ax + 6, by - 7, 1, 2, '#5a3a1e'); const lg = Math.sin(t * 6 + a) > 0 ? 1 : 0; rect(c, ax + lg, by, 1, 2, '#6a4222'); rect(c, ax + 4 - lg, by, 1, 2, '#6a4222'); }
  },
  space: (c, t) => {
    const T = t % 14;
    if (T < 6.5) {
      const p = T / 6.5; sky(c, mix([90, 160, 230], [2, 4, 12], clamp(p * 1.3)), mix([200, 225, 250], [10, 20, 50], clamp(p * 1.2))); stars(c, t, 90, clamp(p * 1.5 - 0.3));
      hills(c, 78 + p * 40, 2, '#4a8a4a', 3); rect(c, 60, 82 + p * 40, 40, 14, '#6a6a72');
      const ry = 70 - p * p * 70; for (let k = 0; k < 28; k++) disc(c, 80 + Math.sin(k + t * 3) * (1 + k * 0.18), ry + 14 + k * 1.6, 2 + k * 0.1, `rgba(${220 - k * 3},${210 - k * 3},${210 - k * 3},${clamp(0.85 - k * 0.03)})`);
      rect(c, 78, ry, 5, 14, '#f0f2f6'); rect(c, 78, ry, 1, 14, '#c0c6d0'); rect(c, 79, ry - 3, 3, 3, '#e04a3a'); rect(c, 80, ry - 5, 1, 2, '#e04a3a'); rect(c, 76, ry + 10, 2, 5, '#e04a3a'); rect(c, 83, ry + 10, 2, 5, '#e04a3a'); rect(c, 79, ry + 14, 3, 4 + Math.sin(t * 40) * 2, '#ffb040'); rect(c, 80, ry + 14, 1, 7, '#fff0b0');
    } else {
      const p = (T - 6.5) / 7.5; rect(c, 0, 0, W, H, '#03050b'); stars(c, t, 100);
      disc(c, 150 - p * 20, 45, 4 + p * 14, 'rgba(255,220,130,.25)'); disc(c, 150 - p * 20, 45, 3 + p * 9, '#ffe49a'); disc(c, 150 - p * 20, 45, 2 + p * 6, '#fff8dc');
      disc(c, 12 - p * 10, 55, 4, '#3a78c8'); disc(c, 11 - p * 10, 54, 2, '#6aaee8');
      for (let s = 0; s < 4; s++) { const sx = 20 + p * 100 + s * 12, sy = 40 + s * 5 + Math.sin(t + s) * 1.5; rect(c, sx, sy, 7, 2, '#d8dde8'); rect(c, sx + 6, sy, 2, 2, '#e04a3a'); rect(c, sx - 3 - Math.sin(t * 20) * 1, sy, 3, 1, '#7ad8ff'); }
    }
  },
  transcend: (c, t) => {
    rect(c, 0, 0, W, H, '#07040f'); const hue = 250 + Math.sin(t * 0.2) * 60;
    for (let k = 0; k < 5; k++) rect(c, 20 + k * 30 + Math.sin(t + k) * 2, 0, 3, H, hsl(hue + k * 25, 80, 60, 0.07));
    for (let k = 0; k < 420; k++) { const a = k * 0.27 + t * 0.9, r = k * 0.19; rect(c, 80 + Math.cos(a) * r * 1.5, 45 + Math.sin(a) * r * 0.75, 1, 1, hsl(hue + k * 0.4, 90, 45 + (k % 5) * 6, 1 - k / 520)); }
    const pulse = 5 + Math.sin(t * 2) * 1.5; disc(c, 80, 45, pulse + 5, hsl(hue, 90, 70, 0.18)); disc(c, 80, 45, pulse, hsl(hue + 30, 90, 85, 0.95));
    particles(c, t, 50, 'rgba(255,255,255,.7)', 0, -10, 3);
  },
};

export interface EndingInfo { id: string; def?: EndingDef; summary?: { year: number; peakPop: number; name: string }; choices?: { title: string; pick: string }[]; alive?: number; species?: number }

export class EndingScreen {
  el = document.createElement('div');
  onContinue: (() => void) | null = null;
  onTitle: (() => void) | null = null;
  private raf = 0; private timers: number[] = [];
  constructor() { this.el.className = 'ending'; document.body.appendChild(this.el); }

  show(info: EndingInfo, canContinue = true) {
    const def = info.def ?? ENDINGS[info.id]; const scene = SCENES[info.id] ?? SCENES.extinction;
    const s = info.summary;
    this.el.innerHTML = `<div class="en-wrap"><canvas class="en-scene" width="${W}" height="${H}"></canvas><div class="en-title ${def.kind}">${def.title}</div><div class="en-text">${def.text.map((p) => `<p>${p}</p>`).join('')}</div>
      ${s ? `<div class="en-stats"><span><b>${s.name}</b> lasted until <b>${fmtYear(s.year)}</b></span><span>peak population <b>${s.peakPop >= 1000 ? (s.peakPop / 1000).toFixed(1) + ' billion' : Math.round(s.peakPop) + ' million'}</b></span>${info.alive !== undefined ? `<span><b>${info.alive}</b> of ${info.species} species still alive</span>` : ''}${info.choices?.length ? `<span><b>${info.choices.length}</b> great decisions</span>` : ''}</div>` : ''}
      <div class="en-btns">${canContinue ? '<button class="pri" data-a="go">Keep exploring this world</button>' : ''}<button data-a="title">Title screen</button></div></div>`;
    this.el.classList.add('open'); this.el.scrollTop = 0;
    const cv = this.el.querySelector('canvas')!, ctx = cv.getContext('2d')!; ctx.imageSmoothingEnabled = false;
    const t0 = performance.now(); cancelAnimationFrame(this.raf);
    const loop = () => { const t = (performance.now() - t0) / 1000; scene(ctx, t); const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.2, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.2)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); this.raf = requestAnimationFrame(loop); };
    loop();
    this.timers.forEach(clearTimeout); this.timers = [];
    this.el.querySelectorAll('.en-text p').forEach((p, i) => this.timers.push(window.setTimeout(() => p.classList.add('in'), 900 + i * 1700)));
    (this.el.querySelector('[data-a=go]') as HTMLElement | null)?.addEventListener('click', () => { this.hide(); this.onContinue?.(); });
    (this.el.querySelector('[data-a=title]') as HTMLElement).addEventListener('click', () => { this.hide(); this.onTitle?.(); });
  }
  hide() { cancelAnimationFrame(this.raf); this.timers.forEach(clearTimeout); this.el.classList.remove('open'); }
}
export const ENDING_IDS = Object.keys(SCENES);
