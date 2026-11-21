// Pixel-art UI skin: 9-slice frames drawn as tiny SVGs (crisp at any scale) and exposed as CSS variables.

type Px = (x: number, y: number) => string | null;

function svg(w: number, h: number, px: Px): string {
  let r = '';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = px(x, y); if (c) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" shape-rendering="crispEdges">${r}</svg>`)}")`;
}

/** 12x12 frame: notched corners, dark outline, bevel highlight top-left, shade bottom-right, solid fill. */
function frame(edge: string, hi: string, lo: string, fill: string, accent?: string) {
  const S = 12;
  return svg(S, S, (x, y) => {
    const m = S - 1;
    const corner = (x === 0 || x === m) && (y === 0 || y === m);
    if (corner) return null;
    if (x === 0 || y === 0 || x === m || y === m) return edge;
    if ((x === 1 && (y === 1 || y === m - 1)) || (x === m - 1 && (y === 1 || y === m - 1))) return edge; // rounder corners
    if (accent && y === 1) return accent;
    if (y === 1 || x === 1) return hi;
    if (y === m - 1 || x === m - 1) return lo;
    return fill;
  });
}

export function installSkin() {
  const root = document.documentElement.style;
  root.setProperty('--frame', frame('#04060b', '#2f3d5c', '#0a0e19', '#111827'));
  root.setProperty('--frame-hi', frame('#04060b', '#3c4f78', '#0c1222', '#18223a'));
  root.setProperty('--frame-accent', frame('#04060b', '#2f3d5c', '#0a0e19', '#111827', '#6fe3c1'));
  root.setProperty('--frame-gold', frame('#04060b', '#5a4a26', '#0a0e19', '#141a2a', '#ffd166'));
  root.setProperty('--btn', frame('#04060b', '#3a4a6c', '#121a2c', '#1d2740'));
  root.setProperty('--btn-hover', frame('#04060b', '#4c6290', '#162038', '#263452'));
  root.setProperty('--btn-on', frame('#04060b', '#b8ffe8', '#2a9078', '#6fe3c1'));
  root.setProperty('--btn-gold', frame('#04060b', '#fff0b8', '#b88a2a', '#ffd166'));
  root.setProperty('--btn-bad', frame('#04060b', '#ffb0a8', '#9a2a2a', '#e8574f'));
  root.setProperty('--well', frame('#04060b', '#070a12', '#26324c', '#0a0f1a'));
}
