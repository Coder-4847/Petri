// Stats panel: population history by role, and a food-web diagram of who eats whom.
import { css } from '../render/util';

const ROLES = [
  { id: 'producer', label: 'Producers', col: '#7ad66f' }, { id: 'grazer', label: 'Grazers', col: '#f5c56b' }, { id: 'predator', label: 'Predators', col: '#ff7a7a' },
  { id: 'decomposer', label: 'Decomposers', col: '#b78cff' }, { id: 'other', label: 'Others', col: '#7fb4ff' },
];
const roleKey = (r: string) => (r === 'producer' ? 'producer' : r === 'grazer' || r === 'filter feeder' ? 'grazer' : r === 'predator' || r === 'omnivore' ? 'predator' : r === 'decomposer' ? 'decomposer' : 'other');

interface WebNode { id: number; name: string; pop: number; level: number; color: number; kind: number; size: number; diet: string }
interface WebEdge { from: number; to: number; w: number }
const N = 240;

export class Stats {
  el = document.createElement('div');
  private series: Record<string, number[]> = Object.fromEntries(ROLES.map((r) => [r.id, [] as number[]]));
  private species: number[] = [];
  private cv: HTMLCanvasElement; private label: HTMLElement;
  private tab: 'pop' | 'web' = 'pop';
  private web: { nodes: WebNode[]; edges: WebEdge[] } = { nodes: [], edges: [] };
  private pos = new Map<number, { x: number; y: number; r: number }>();
  private hover = -1;
  visible = false;
  requestWeb: (() => void) | null = null;
  private lastReq = 0;

  constructor() {
    this.el.innerHTML = `<h3>Statistics <span class="sub" id="st-sub"></span></h3><div class="cx-tabs"><button class="on" data-t="pop">Populations</button><button data-t="web">Food web</button></div><canvas class="st-cv" width="680" height="220"></canvas><div class="st-legend"></div><div class="st-label"></div>`;
    this.cv = this.el.querySelector('canvas')!; this.label = this.el.querySelector('.st-label')!;
    this.el.querySelectorAll<HTMLElement>('.cx-tabs button').forEach((b) => (b.onclick = () => { this.tab = b.dataset.t as any; this.el.querySelectorAll('.cx-tabs button').forEach((x) => x.classList.toggle('on', x === b)); this.draw(); if (this.tab === 'web') this.requestWeb?.(); }));
    this.cv.addEventListener('pointermove', (e) => { const r = this.cv.getBoundingClientRect(), x = (e.clientX - r.left) * (this.cv.width / r.width), y = (e.clientY - r.top) * (this.cv.height / r.height); let best = -1, bd = 1e9; for (const [id, p] of this.pos) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.r + 6 && d < bd) { bd = d; best = id; } } this.hover = best; this.draw(); });
    this.el.querySelector('.st-legend')!.innerHTML = ROLES.map((r) => `<span><i style="background:${r.col}"></i>${r.label}</span>`).join('');
  }

  setVisible(v: boolean) { this.visible = v; if (v) { this.draw(); if (this.tab === 'web') this.requestWeb?.(); } }

  /** Called with every stats message. `rows` = species counts with their roles. */
  push(rows: { role: string; pop: number }[], speciesAlive: number) {
    const sums: Record<string, number> = {}; for (const r of rows) sums[roleKey(r.role)] = (sums[roleKey(r.role)] ?? 0) + r.pop;
    for (const r of ROLES) { const a = this.series[r.id]; a.push(sums[r.id] ?? 0); if (a.length > N) a.shift(); }
    this.species.push(speciesAlive); if (this.species.length > N) this.species.shift();
    if (this.visible) { if (this.tab === 'pop') this.draw(); else if (performance.now() - this.lastReq > 2500) { this.lastReq = performance.now(); this.requestWeb?.(); } }
  }
  clear() { for (const k in this.series) this.series[k].length = 0; this.species.length = 0; this.web = { nodes: [], edges: [] }; }
  setWeb(w: { nodes: WebNode[]; edges: WebEdge[] }) { this.web = w; if (this.visible && this.tab === 'web') this.draw(); }

  private draw() {
    const c = this.cv, x = c.getContext('2d')!, W = c.width, H = c.height;
    x.clearRect(0, 0, W, H); x.fillStyle = '#0b0f16'; x.fillRect(0, 0, W, H);
    (this.el.querySelector('.st-legend') as HTMLElement).style.display = this.tab === 'pop' ? '' : 'none';
    if (this.tab === 'pop') this.drawPop(x, W, H); else this.drawWeb(x, W, H);
  }

  private drawPop(x: CanvasRenderingContext2D, W: number, H: number) {
    const n = this.series.producer.length; this.label.textContent = n < 2 ? 'Collecting data…' : `Population by role (log scale) · last ${Math.round(n * 0.5)} seconds · ${this.species[this.species.length - 1] ?? 0} species`;
    let max = 10; for (const r of ROLES) for (const v of this.series[r.id]) max = Math.max(max, v); const top = Math.log10(max + 1) * 1.05;
    x.strokeStyle = '#1a2230'; x.lineWidth = 1; x.fillStyle = '#566176'; x.font = '10px monospace';
    for (let e = 0; e <= Math.ceil(top); e++) { const y = H - 14 - (e / top) * (H - 28); x.beginPath(); x.moveTo(30, y + 0.5); x.lineTo(W, y + 0.5); x.stroke(); x.fillText(e === 0 ? '1' : '10^' + e, 2, y + 3); }
    for (const r of ROLES) {
      const a = this.series[r.id]; if (a.length < 2) continue; x.strokeStyle = r.col; x.lineWidth = 2; x.beginPath();
      a.forEach((v, i) => { const px = 30 + (i / (Math.max(a.length, 60) - 1)) * (W - 34), py = H - 14 - (Math.log10(v + 1) / top) * (H - 28); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
    }
  }

  private drawWeb(x: CanvasRenderingContext2D, W: number, H: number) {
    const { nodes, edges } = this.web; this.pos.clear();
    if (!nodes.length) { this.label.textContent = 'No food web yet — wait for some life to settle.'; return; }
    const bands = new Map<number, WebNode[]>(); let maxL = 0;
    for (const n of nodes) { const l = Math.min(5, Math.round(n.level)); maxL = Math.max(maxL, l); (bands.get(l) ?? bands.set(l, []).get(l)!).push(n); }
    for (const [l, list] of bands) {
      list.sort((a, b) => b.pop - a.pop);
      list.forEach((n, i) => { const px = 40 + ((i + 0.5) / list.length) * (W - 80), py = H - 28 - (maxL ? (l / maxL) * (H - 62) : 0); this.pos.set(n.id, { x: px, y: py, r: Math.max(4, Math.min(15, 2 + Math.log2(n.pop + 1) * 1.4)) }); });
    }
    const col = new Map(nodes.map((n) => [n.id, css(n.color)]));
    for (const e of edges) { const a = this.pos.get(e.from), b = this.pos.get(e.to); if (!a || !b) continue; const hot = this.hover === e.from || this.hover === e.to; x.strokeStyle = hot ? '#ffffff' : col.get(e.from)!; x.globalAlpha = hot ? 0.9 : 0.16 + e.w * 0.25; x.lineWidth = hot ? 2 : 1; x.beginPath(); x.moveTo(a.x, a.y); x.quadraticCurveTo((a.x + b.x) / 2 + (a.y - b.y) * 0.1, (a.y + b.y) / 2, b.x, b.y); x.stroke(); }
    x.globalAlpha = 1;
    for (const n of nodes) { const p = this.pos.get(n.id)!; x.fillStyle = col.get(n.id)!; x.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); x.strokeStyle = this.hover === n.id ? '#fff' : '#0b0f16'; x.lineWidth = 2; x.strokeRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
    const h = nodes.find((n) => n.id === this.hover);
    this.label.innerHTML = h ? `<i>${h.name}</i> · ${h.diet} · ${h.pop.toLocaleString()} individuals` : 'Arrows lead from eater to eaten. Higher up the chart = higher in the food chain. Hover a block for details.';
  }
}
