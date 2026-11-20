import { icon } from './icons';
import { BIOMES } from '../data/biomes';
import { ERAS } from '../data/eras';
import { css, mix } from '../render/util';
import './style.css';

export interface ShellHooks {
  onSpeed(v: number): void;
  onBiome(id: string): void;
  onStress(n: number): void;
}

const SPEEDS: { v: number; label: string; ico?: string; title: string }[] = [
  { v: 0, label: '', ico: 'pause', title: 'Pause' },
  { v: 1, label: '1x', title: 'Normal speed' },
  { v: 5, label: '5x', title: 'Fast' },
  { v: 20, label: '20x', title: 'Very fast' },
  { v: 100, label: '100x', title: 'Time-lapse' },
];

/** DOM shell: top bar, dock, slide-up panels and the debug overlay. */
export class Shell {
  root = document.getElementById('ui')!;
  private debugEl!: HTMLElement;
  private speedBtns: HTMLElement[] = [];
  private eraEl!: HTMLElement;
  private panels = new Map<string, HTMLElement>();
  private dockBtns = new Map<string, HTMLElement>();
  private biomeBtns = new Map<string, HTMLElement>();
  speed = 1;

  constructor(private hooks: ShellHooks) {
    this.root.innerHTML = '';
    this.buildTop(); this.buildDock(); this.buildBiomePanel();
    this.debugEl = el('div', 'debug'); this.root.appendChild(this.debugEl);
    const hint = el('div', 'hint'); hint.innerHTML = 'drag to pan · scroll to zoom · <b style="color:var(--dim);font-weight:400">`</b> debug'; this.root.appendChild(hint);
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') this.debugEl.style.display = this.debugEl.style.display === 'none' ? '' : 'none';
      if (e.key === ' ') { e.preventDefault(); this.setSpeed(this.speed === 0 ? 1 : 0); }
      if (e.key === 'Escape') this.closePanels();
    });
  }

  private buildTop() {
    const bar = el('div', 'topbar');
    bar.innerHTML = `<div class="logo">PETRI</div>`;
    const era = el('div', 'era-wrap');
    era.innerHTML = `<div class="era-name"><span>Era · <b id="era-n">${ERAS[0].name}</b></span><span id="era-t">3,800 Ma</span></div><div class="era-bar">${ERAS.map(() => '<div class="era-seg"><i></i></div>').join('')}</div>`;
    this.eraEl = era; bar.appendChild(era); bar.appendChild(el('div', 'spacer'));
    const sp = el('div', 'speed');
    for (const s of SPEEDS) {
      const b = el('button', 'btn'); b.title = s.title; b.innerHTML = s.ico ? icon(s.ico, 16) : s.label;
      b.onclick = () => this.setSpeed(s.v); sp.appendChild(b); this.speedBtns.push(b);
    }
    bar.appendChild(sp); this.root.appendChild(bar); this.setSpeed(1, false);
    this.setEra(0, 0);
  }

  setSpeed(v: number, notify = true) {
    this.speed = v; SPEEDS.forEach((s, i) => this.speedBtns[i].classList.toggle('on', s.v === v));
    if (notify) this.hooks.onSpeed(v);
  }

  setEra(index: number, progress: number, label?: string) {
    const segs = this.eraEl.querySelectorAll<HTMLElement>('.era-seg');
    segs.forEach((s, i) => { s.classList.toggle('done', i < index); s.classList.toggle('now', i === index); (s.firstElementChild as HTMLElement).style.width = i === index ? `${Math.round(progress * 100)}%` : ''; });
    this.eraEl.querySelector('#era-n')!.textContent = ERAS[index].name;
    this.eraEl.querySelector('#era-t')!.textContent = label ?? '';
  }

  private buildDock() {
    const dock = el('div', 'dock');
    const add = (id: string, ico: string, label: string, onClick: () => void) => {
      const b = el('button', 'btn'); b.innerHTML = `${icon(ico, 20)}<span>${label}</span>`; b.onclick = onClick; dock.appendChild(b); this.dockBtns.set(id, b);
    };
    add('biomes', 'globe', 'Biomes', () => this.togglePanel('biomes'));
    add('stress', 'bug', '5k test', () => this.hooks.onStress(5000));
    this.root.appendChild(dock);
  }

  private buildBiomePanel() {
    const p = el('div', 'panel'); p.innerHTML = `<h3>Biomes <span class="sub">Every biome keeps living while you look elsewhere.</span></h3>`;
    const grid = el('div', 'biomes');
    for (const b of BIOMES.filter((x) => x.enabled)) {
      const btn = el('button', 'biome');
      const c = document.createElement('canvas'); c.width = 24; c.height = 11; c.className = 'sw'; c.style.width = '100%'; c.style.imageRendering = 'pixelated';
      const x = c.getContext('2d')!;
      for (let i = 0; i < 11; i++) { x.fillStyle = css(mix(b.sky[0], b.sky[1], i / 10)); x.fillRect(0, i, 24, 1); }
      if (b.terrain.water > 0) { x.fillStyle = css(b.water[0]); x.fillRect(0, 3, 24, 4); x.fillStyle = css(b.water[1]); x.fillRect(0, 7, 24, 4); }
      const ground = b.pal[b.terrain.top]?.base ?? 0x7a5a3a; x.fillStyle = css(ground); x.fillRect(0, 8, 24, 3);
      btn.appendChild(c);
      btn.insertAdjacentHTML('beforeend', `<div class="nm">${b.name}</div><div class="bl">${b.blurb}</div>`);
      btn.onclick = () => { this.hooks.onBiome(b.id); this.setBiome(b.id); };
      grid.appendChild(btn); this.biomeBtns.set(b.id, btn);
    }
    p.appendChild(grid); this.root.appendChild(p); this.panels.set('biomes', p);
  }

  setBiome(id: string) { this.biomeBtns.forEach((b, k) => b.classList.toggle('on', k === id)); }

  togglePanel(id: string) {
    const open = this.panels.get(id)!.classList.contains('open');
    this.closePanels();
    if (!open) { this.panels.get(id)!.classList.add('open'); this.dockBtns.get(id)?.classList.add('open'); }
  }
  closePanels() { this.panels.forEach((p) => p.classList.remove('open')); this.dockBtns.forEach((b) => b.classList.remove('open')); }

  setDebug(lines: [string, string][]) { this.debugEl.innerHTML = lines.map(([k, v]) => `${k.padEnd(9)}<b>${v}</b>`).join('\n'); }
}

function el(tag: string, cls = ''): HTMLElement { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
