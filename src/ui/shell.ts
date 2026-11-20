import { icon } from './icons';
import { BIOMES, ENV_KEYS, BIOME_BY_ID, type Env } from '../data/biomes';
import { ERAS } from '../data/eras';
import { css, mix } from '../render/util';
import { settings, saveSettings } from './settings';
import './style.css';

export interface ShellHooks {
  onSpeed(v: number): void;
  onBiome(id: string): void;
  onEnv(key: keyof Env, value: number): void;
  onSettings(): void;
}

export interface LifeRow { id: number; name: string; color: number; role: string; size: number; pop: number; }

const SPEEDS: { v: number; label: string; ico?: string; title: string }[] = [
  { v: 0, label: '', ico: 'pause', title: 'Pause' },
  { v: 1, label: '1x', title: 'Normal speed' },
  { v: 5, label: '5x', title: 'Fast' },
  { v: 20, label: '20x', title: 'Very fast' },
  { v: 100, label: '100x', title: 'Time-lapse: the population model takes over' },
  { v: 1000, label: '', ico: 'deep', title: 'Deep time: millions of years pass' },
];

const ENV_META: Record<keyof Env, { label: string; tip: string; low: string; high: string }> = {
  temp: { label: 'Temperature', tip: 'How hot the world is.', low: 'Colder: favours cold-hardy, warm-blooded life and slows decay.', high: 'Hotter: favours heat-tolerant life and speeds up decay.' },
  humidity: { label: 'Humidity', tip: 'How much moisture is in the air and soil.', low: 'Drier: favours waterproof, desert-adapted lineages.', high: 'Wetter: lush growth; skin-breathers and soft bodies prosper.' },
  sunlight: { label: 'Sunlight', tip: 'How much light reaches the surface.', low: 'Darker: plants struggle; scavengers and chemosynthesis win.', high: 'Brighter: more photosynthesis fuels the whole food web.' },
  oxygen: { label: 'Oxygen', tip: 'How much breathable oxygen there is.', low: 'Thin: only low-oxygen specialists cope.', high: 'Rich: big, active animals can thrive.' },
  salinity: { label: 'Salinity', tip: 'How salty the water is.', low: 'Fresher: favours freshwater lineages.', high: 'Saltier: favours salt-tolerant lineages.' },
  nutrients: { label: 'Nutrients', tip: 'Dissolved minerals and fertiliser.', low: 'Poorer: sparse blooms, small food webs.', high: 'Richer: blooms, booms and crowded ecosystems.' },
  toxicity: { label: 'Toxins & radiation', tip: 'Poison and radiation in the environment.', low: 'Clean: calm, steady evolution.', high: 'Toxic: more mutations; only the tough survive.' },
  gravity: { label: 'Gravity', tip: 'How strongly everything is pulled down.', low: 'Light: falls hurt less, flight is easier.', high: 'Heavy: favours low, sturdy bodies.' },
};

/** DOM shell: top bar, dock, slide-up panels and the debug overlay. */
export class Shell {
  root = document.getElementById('ui')!;
  private debugEl!: HTMLElement;
  private speedBtns: HTMLElement[] = [];
  private eraEl!: HTMLElement;
  private panels = new Map<string, HTMLElement>();
  private dockBtns = new Map<string, HTMLElement>();
  private biomeBtns = new Map<string, HTMLElement>();
  private toasts!: HTMLElement;
  private sliders = new Map<keyof Env, { input: HTMLInputElement; hint: HTMLElement; val: HTMLElement }>();
  private lifeEl!: HTMLElement; private lifeHead!: HTMLElement;
  private biomeId = 'reef';
  speed = 1;

  constructor(private hooks: ShellHooks) {
    this.root.innerHTML = '';
    this.buildTop(); this.buildDock(); this.buildBiomePanel(); this.buildTweakPanel(); this.buildLifePanel(); this.buildSettingsPanel();
    this.toasts = el('div', 'toasts'); this.root.appendChild(this.toasts);
    this.debugEl = el('div', 'debug'); this.root.appendChild(this.debugEl); this.debugEl.style.display = settings.debug ? '' : 'none';
    const hint = el('div', 'hint'); hint.innerHTML = 'drag to pan · scroll to zoom · <b style="color:var(--dim);font-weight:400">`</b> debug'; this.root.appendChild(hint);
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') { settings.debug = this.debugEl.style.display === 'none'; this.debugEl.style.display = settings.debug ? '' : 'none'; saveSettings(); this.syncSettingsUi(); }
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
    bar.appendChild(sp);
    const gear = el('button', 'btn ghost'); gear.title = 'Settings'; gear.innerHTML = icon('gear', 16); gear.onclick = () => this.togglePanel('settings'); bar.appendChild(gear);
    this.root.appendChild(bar); this.setSpeed(1, false);
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
    add('tweak', 'sliders', 'Tweak', () => this.togglePanel('tweak'));
    add('life', 'bug', 'Life', () => this.togglePanel('life'));
    this.root.appendChild(dock);
  }

  private buildBiomePanel() {
    const p = el('div', 'panel'); p.innerHTML = `<h3>Biomes <span class="sub">Every biome keeps living while you look elsewhere.</span></h3>`;
    const grid = el('div', 'biomes');
    for (const b of BIOMES) {
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

  setBiome(id: string) { this.biomeId = id; this.biomeBtns.forEach((b, k) => b.classList.toggle('on', k === id)); }

  // ---- settings
  private settingEls = new Map<string, HTMLElement>();
  private buildSettingsPanel() {
    const p = el('div', 'panel narrow'); p.innerHTML = `<h3>Settings</h3>`;
    const row = (key: 'gore' | 'debug', label: string, hint: string) => {
      const r = el('label', 'setting'); r.innerHTML = `<span><b>${label}</b><i>${hint}</i></span><button class="tog"></button>`;
      const b = r.querySelector('button')!; b.onclick = () => { (settings as any)[key] = !(settings as any)[key]; saveSettings(); this.syncSettingsUi(); this.hooks.onSettings(); if (key === 'debug') this.debugEl.style.display = settings.debug ? '' : 'none'; };
      this.settingEls.set(key, b); p.appendChild(r);
    };
    row('gore', 'Gore', 'Blood, gibs, bones and wounds when creatures are hurt or killed.');
    row('debug', 'Debug overlay', 'Frame rate, entity counts and simulation timing. Shortcut: `');
    this.root.appendChild(p); this.panels.set('settings', p); this.syncSettingsUi();
  }
  syncSettingsUi() { this.settingEls.forEach((b, k) => b.classList.toggle('on', (settings as any)[k])); }

  // ---- environment sliders
  private buildTweakPanel() {
    const p = el('div', 'panel'); p.innerHTML = `<h3>Tweak the world <span class="sub">Life adapts to whatever you change. Changes steer evolution over many generations.</span></h3>`;
    const grid = el('div', 'sliders');
    for (const key of ENV_KEYS) {
      const m = ENV_META[key];
      const row = el('div', 'slider'); row.title = m.tip;
      row.innerHTML = `<div class="sl-top"><span class="sl-name">${m.label}</span><span class="sl-val"></span></div><input type="range" min="0" max="100" step="1"><div class="sl-hint"></div>`;
      const input = row.querySelector('input')!, hint = row.querySelector('.sl-hint') as HTMLElement, val = row.querySelector('.sl-val') as HTMLElement;
      input.addEventListener('input', () => { const v = +input.value / 100; this.hooks.onEnv(key, v); this.updateHint(key, v); });
      grid.appendChild(row); this.sliders.set(key, { input, hint, val });
    }
    p.appendChild(grid); this.root.appendChild(p); this.panels.set('tweak', p);
  }
  private updateHint(key: keyof Env, v: number) {
    const s = this.sliders.get(key)!, m = ENV_META[key], def = BIOME_BY_ID[this.biomeId]?.env[key] ?? 0.5;
    s.val.textContent = `${Math.round(v * 100)}%`;
    s.hint.textContent = Math.abs(v - def) < 0.04 ? 'Natural for this biome.' : v < def ? m.low : m.high;
    s.hint.classList.toggle('changed', Math.abs(v - def) >= 0.04);
  }
  setEnv(env: Env) { for (const key of ENV_KEYS) { const s = this.sliders.get(key); if (s && document.activeElement !== s.input) { s.input.value = String(Math.round(env[key] * 100)); this.updateHint(key, env[key]); } } }

  // ---- life panel
  private buildLifePanel() {
    const p = el('div', 'panel'); p.innerHTML = `<h3>Life in this biome <span class="sub" id="life-sub"></span></h3><div class="life-head"><span>Species</span><span>Role</span><span>Size</span><span>Pop.</span></div><div class="life"></div>`;
    this.lifeEl = p.querySelector('.life')!; this.lifeHead = p.querySelector('#life-sub')!;
    this.root.appendChild(p); this.panels.set('life', p);
  }
  setLife(rows: LifeRow[], alive: number, ever: number) {
    if (!this.panels.get('life')!.classList.contains('open')) return;
    this.lifeHead.textContent = `${alive} species alive worldwide · ${ever - alive} extinct`;
    this.lifeEl.innerHTML = rows.map((r) => `<div class="life-row"><span class="nm"><i style="background:${css(r.color)}"></i>${r.name}</span><span class="rl">${r.role}</span><span>${r.size < 1 ? r.size.toFixed(2) : r.size.toFixed(1)}</span><span>${r.pop}</span></div>`).join('');
  }

  // ---- toasts
  toast(kind: string, text: string, sub?: string) {
    const t = el('div', `toast ${kind}`); t.innerHTML = `<div class="tt">${text}</div>${sub ? `<div class="ts">${sub}</div>` : ''}`;
    this.toasts.appendChild(t); requestAnimationFrame(() => t.classList.add('in'));
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, kind === 'era' ? 7000 : 4500);
  }

  togglePanel(id: string) {
    const open = this.panels.get(id)!.classList.contains('open');
    this.closePanels();
    if (!open) { this.panels.get(id)!.classList.add('open'); this.dockBtns.get(id)?.classList.add('open'); }
  }
  closePanels() { this.panels.forEach((p) => p.classList.remove('open')); this.dockBtns.forEach((b) => b.classList.remove('open')); }

  setDebug(lines: [string, string][]) { this.debugEl.innerHTML = lines.map(([k, v]) => `${k.padEnd(9)}<b>${v}</b>`).join('\n'); }
}

function el(tag: string, cls = ''): HTMLElement { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
