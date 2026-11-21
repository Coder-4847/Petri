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
  private tab: 'pop' | 'sp' | 'web' | 'ext' | 'log' = 'pop';
  private spHist = new Map<number, { name: string; color: number; v: number[] }>(); private extinct: { name: string; tick: number; peak: number }[] = []; private diversity = 0;
  private chron: { when: string; kind: string; text: string }[] = []; private logEl!: HTMLElement;
  private web: { nodes: WebNode[]; edges: WebEdge[] } = { nodes: [], edges: [] };
  private pos = new Map<number, { x: number; y: number; r: number }>();
  private hover = -1;
  visible = false;
  requestWeb: (() => void) | null = null;
  private lastReq = 0;

  constructor() {
    this.el.innerHTML = `<h3>Statistics <span class="sub" id="st-sub"></span></h3><div class="cx-tabs"><button class="on" data-t="pop">By role</button><button data-t="sp">Top species</button><button data-t="web">Food web</button><button data-t="ext">Extinctions</button><button data-t="log">Chronicle</button></div><canvas class="st-cv" width="680" height="220"></canvas><div class="chron" style="display:none"></div><div class="st-legend"></div><div class="st-label"></div>`;
    this.cv = this.el.querySelector('canvas')!; this.label = this.el.querySelector('.st-label')!; this.logEl = this.el.querySelector('.chron')!;
    this.el.querySelectorAll<HTMLElement>('.cx-tabs button').forEach((b) => (b.onclick = () => { this.tab = b.dataset.t as any; this.el.querySelectorAll('.cx-tabs button').forEach((x) => x.classList.toggle('on', x === b)); this.draw(); if (this.tab === 'web') this.requestWeb?.(); }));
    this.cv.addEventListener('pointermove', (e) => { const r = this.cv.getBoundingClientRect(), x = (e.clientX - r.left) * (this.cv.width / r.width), y = (e.clientY - r.top) * (this.cv.height / r.height); let best = -1, bd = 1e9; for (const [id, p] of this.pos) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.r + 6 && d < bd) { bd = d; best = id; } } this.hover = best; this.draw(); });
    this.el.querySelector('.st-legend')!.innerHTML = ROLES.map((r) => `<span><i style="background:${r.col}"></i>${r.label}</span>`).join('');
  }

  setVisible(v: boolean) { this.visible = v; if (v) { this.draw(); if (this.tab === 'web') this.requestWeb?.(); } }

  /** Called with every stats message. `rows` = species counts with their roles. */
  push(rows: { role: string; pop: number; id?: number; name?: string; color?: number }[], speciesAlive: number, extinct?: { name: string; tick: number; peak: number }[]) {
    if (extinct) this.extinct = extinct;
    // Shannon diversity of the biome on screen
    let tot = 0; for (const r of rows) tot += r.pop; let hsh = 0; for (const r of rows) if (r.pop > 0) { const p = r.pop / tot; hsh -= p * Math.log(p); } this.diversity = hsh;
    const seen = new Set<number>();
    for (const r of rows) if (r.id !== undefined && r.pop >= 3) { let h = this.spHist.get(r.id); if (!h) { h = { name: r.name ?? '?', color: r.color ?? 0xffffff, v: new Array(this.species.length).fill(0) }; this.spHist.set(r.id, h); } h.v.push(r.pop); if (h.v.length > N) h.v.shift(); seen.add(r.id); }
    for (const [id, h] of this.spHist) if (!seen.has(id)) { h.v.push(0); if (h.v.length > N) h.v.shift(); if (h.v.every((x) => x === 0)) this.spHist.delete(id); }
    const sub = this.el.querySelector('#st-sub'); if (sub) sub.textContent = `Biodiversity ${hsh.toFixed(2)} · ${speciesAlive} species alive`;
    const sums: Record<string, number> = {}; for (const r of rows) sums[roleKey(r.role)] = (sums[roleKey(r.role)] ?? 0) + r.pop;
    for (const r of ROLES) { const a = this.series[r.id]; a.push(sums[r.id] ?? 0); if (a.length > N) a.shift(); }
    this.species.push(speciesAlive); if (this.species.length > N) this.species.shift();
    if (this.visible) { if (this.tab === 'pop' || this.tab === 'sp' || this.tab === 'ext') this.draw(); else if (performance.now() - this.lastReq > 2500) { this.lastReq = performance.now(); this.requestWeb?.(); } }
  }
  clear() { this.spHist.clear(); this.extinct = []; for (const k in this.series) this.series[k].length = 0; this.species.length = 0; this.web = { nodes: [], edges: [] }; }
  setWeb(w: { nodes: WebNode[]; edges: WebEdge[] }) { this.web = w; if (this.visible && this.tab === 'web') this.draw(); }

  setChronicle(list: { when: string; kind: string; text: string }[]) { this.chron = list; if (this.visible && this.tab === 'log') this.draw(); }
  private draw() {
    const isLog = this.tab === 'log' || this.tab === 'ext'; this.cv.style.display = isLog ? 'none' : ''; this.logEl.style.display = isLog ? '' : 'none';
    if (this.tab === 'ext') { (this.el.querySelector('.st-legend') as HTMLElement).style.display = 'none'; this.label.textContent = `${this.extinct.length} most recent extinctions, worldwide`; this.logEl.innerHTML = this.extinct.length ? [...this.extinct].reverse().map((e) => `<div><i>peak ${e.peak.toLocaleString()}</i><span><i>${e.name}</i></span></div>`).join('') : '<p class="note">No extinctions yet.</p>'; return; }
    if (isLog) { this.label.textContent = `${this.chron.length} events this session`; (this.el.querySelector('.st-legend') as HTMLElement).style.display = 'none'; this.logEl.innerHTML = this.chron.length ? [...this.chron].reverse().map((c) => `<div><i>${c.when}</i><span>${c.text}</span></div>`).join('') : '<p class="note">Nothing has happened yet. Give it time.</p>'; return; }
    const c = this.cv, x = c.getContext('2d')!, W = c.width, H = c.height;
    x.clearRect(0, 0, W, H); x.fillStyle = '#0b0f16'; x.fillRect(0, 0, W, H);
    const lg = this.el.querySelector('.st-legend') as HTMLElement; lg.style.display = this.tab === 'pop' || this.tab === 'sp' ? '' : 'none'; if (this.tab === 'pop') lg.innerHTML = ROLES.map((r) => `<span><i style="background:${r.col}"></i>${r.label}</span>`).join('');
    if (this.tab === 'pop') this.drawPop(x, W, H); else if (this.tab === 'sp') this.drawSpecies(x, W, H); else this.drawWeb(x, W, H);
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

  private drawSpecies(x: CanvasRenderingContext2D, W: number, H: number) {
    const top = [...this.spHist.values()].sort((a, b) => (b.v[b.v.length - 1] ?? 0) - (a.v[a.v.length - 1] ?? 0)).slice(0, 7);
    if (!top.length) { this.label.textContent = 'Collecting data…'; return; }
    let max = 10; for (const h of top) for (const v of h.v) max = Math.max(max, v); const tl = Math.log10(max + 1) * 1.05;
    x.strokeStyle = '#1a2230'; x.lineWidth = 1; x.fillStyle = '#566176'; x.font = '10px monospace';
    for (let e = 0; e <= Math.ceil(tl); e++) { const y = H - 14 - (e / tl) * (H - 28); x.beginPath(); x.moveTo(30, y + 0.5); x.lineTo(W, y + 0.5); x.stroke(); x.fillText(e === 0 ? '1' : '10^' + e, 2, y + 3); }
    for (const h of top) { x.strokeStyle = css(h.color); x.lineWidth = 2; x.beginPath(); h.v.forEach((v, i) => { const px = 30 + (i / (Math.max(h.v.length, 60) - 1)) * (W - 34), py = H - 14 - (Math.log10(v + 1) / tl) * (H - 28); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); }
    (this.el.querySelector('.st-legend') as HTMLElement).style.display = ''; (this.el.querySelector('.st-legend') as HTMLElement).innerHTML = top.map((h) => `<span><i style="background:${css(h.color)}"></i><em>${h.name}</em></span>`).join('');
    this.label.textContent = 'The seven most numerous species here (log scale).';
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
