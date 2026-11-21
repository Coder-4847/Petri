import { icon } from './icons';
import { BIOMES, ENV_KEYS, BIOME_BY_ID, type Env } from '../data/biomes';
import { ERAS } from '../data/eras';
import { css } from '../render/util';
import { settings, saveSettings } from './settings';
import { biomePreview } from './preview';
import { installSkin } from './skin';
import './style.css';

export interface ShellHooks {
  onSpeed(v: number): void;
  onBiome(id: string): void;
  onEnv(key: keyof Env, value: number): void;
  onSettings(): void;
  onResetEnv?(): void;
}

export interface LifeRow { id: number; name: string; color: number; role: string; size: number; pop: number; }

const SPEEDS: { v: number; label: string; ico?: string; name: string; tip: string }[] = [
  { v: 0, label: '', ico: 'pause', name: 'Paused', tip: '<b>Pause</b> — freeze time <kbd>Space</kbd>' },
  { v: 1, label: '1x', name: 'Real time', tip: '<b>1x</b> — watch individual creatures live <kbd>1</kbd>' },
  { v: 5, label: '5x', name: 'Fast', tip: '<b>5x</b> — faster, still individuals' },
  { v: 20, label: '20x', name: 'Very fast', tip: '<b>20x</b> — generations fly by' },
  { v: 100, label: '100x', name: 'Time-lapse', tip: '<b>100x time-lapse</b> — the population model takes over' },
  { v: 1000, label: '', ico: 'deep', name: 'Deep time', tip: '<b>Deep time</b> — millions of years in minutes' },
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

const FEED_ICON: Record<string, string> = { codex: 'book', species: 'star', extinct: 'skull', event: 'bolt', civ: 'city', era: 'sun', ok: 'heal', warn: 'help' };

/** DOM shell: HUD, dock, slide-up panels, notifications, tooltips, help and photo mode. */
export class Shell {
  root = document.getElementById('ui')!;
  private debugEl!: HTMLElement;
  private speedBtns: HTMLElement[] = [];
  private speedLabel!: HTMLElement;
  private eraEl!: HTMLElement;
  private panels = new Map<string, HTMLElement>();
  private openHooks = new Map<string, (open: boolean) => void>();
  private dock!: HTMLElement;
  private dockBtns = new Map<string, HTMLElement>();
  private dockOrder: string[] = [];
  private biomeBtns = new Map<string, HTMLElement>();
  private feed!: HTMLElement; private banner!: HTMLElement; private snackEl!: HTMLElement; private tipEl!: HTMLElement; private helpEl!: HTMLElement;
  private sliders = new Map<keyof Env, { input: HTMLInputElement; hint: HTMLElement; val: HTMLElement }>();
  private lifeEl!: HTMLElement; private lifeHead!: HTMLElement;
  private biomeId = 'reef';
  private worldName = 'Untitled';
  /** chronicle of notable events this session (shown in Stats) */
  chronicle: { when: string; kind: string; text: string }[] = [];
  timeLabel = '';
  speed = 1;
  onChronicle: (() => void) | null = null;

  constructor(private hooks: ShellHooks) {
    installSkin();
    this.root.innerHTML = '';
    this.buildTop(); this.buildDock(); this.buildBiomePanel(); this.buildTweakPanel(); this.buildLifePanel(); this.buildSettingsPanel();
    this.feed = el('div', 'feed'); this.root.appendChild(this.feed);
    this.banner = el('div', 'banner'); this.root.appendChild(this.banner);
    this.snackEl = el('div', 'snack'); this.root.appendChild(this.snackEl);
    this.debugEl = el('div', 'debug'); this.root.appendChild(this.debugEl); this.debugEl.style.display = settings.debug ? '' : 'none';
    const ph = el('div', 'photo-hint'); ph.textContent = 'Photo mode · press H to show the interface'; this.root.appendChild(ph);
    this.buildTips(); this.buildHelp();
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (document.querySelector('.title.open, .choice.open, .ending.open')) { if (e.key === 'Escape') this.closePanels(); return; }
    if (e.key === '`') { settings.debug = !settings.debug; this.debugEl.style.display = settings.debug ? '' : 'none'; saveSettings(); this.syncSettingsUi(); }
    else if (e.key === ' ') { e.preventDefault(); this.setSpeed(this.speed === 0 ? 1 : 0); }
    else if (e.key === 'Escape') { this.closePanels(); this.helpEl.classList.remove('open'); }
    else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('photo');
    else if (e.key === '?' || e.key === '/') this.helpEl.classList.toggle('open');
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === '[' || e.key === ']') { const i = SPEEDS.findIndex((s) => s.v === this.speed); const n = Math.max(0, Math.min(SPEEDS.length - 1, i + (e.key === ']' ? 1 : -1))); this.setSpeed(SPEEDS[n].v); }
    else if (/^[1-9]$/.test(e.key)) { const id = this.dockOrder[+e.key - 1]; if (id) this.togglePanel(id); }
  }

  // ------------------------------------------------------------------ HUD
  private buildTop() {
    const bar = el('div', 'hud-top');
    const brand = el('div', 'hud-brand px'); brand.dataset.tip = '<b>Biomes</b> — travel to another part of the planet';
    brand.innerHTML = `<div class="logo">PETRI</div><div class="where"><b id="hud-world">Untitled</b><span id="hud-biome">Coral Reef</span></div>`;
    brand.onclick = () => this.togglePanel('biomes');
    const era = el('div', 'hud-era px');
    era.innerHTML = `<div class="era-line"><span><span class="era-k">Era</span><b id="era-n">${ERAS[0].name}</b></span><span class="era-t" id="era-t"></span></div><div class="era-bar">${ERAS.map((e, i) => `<div class="era-seg${i >= 9 ? ' civ' : ''}" data-tip="<b>${e.name}</b><br>${e.blurb}"><i></i></div>`).join('')}</div>`;
    this.eraEl = era;
    const time = el('div', 'hud-time px');
    for (const s of SPEEDS) { const b = el('button', 'tb'); b.innerHTML = s.ico ? icon(s.ico, 14) : s.label; b.dataset.tip = s.tip; b.onclick = () => this.setSpeed(s.v); time.appendChild(b); this.speedBtns.push(b); }
    this.speedLabel = el('div', 'tlabel'); time.appendChild(this.speedLabel);
    const sys = el('div', 'hud-sys px');
    const mk = (ico: string, tip: string, fn: () => void) => { const b = el('button', 'tb'); b.innerHTML = icon(ico, 14); b.dataset.tip = tip; b.onclick = fn; sys.appendChild(b); };
    mk('camera', '<b>Photo mode</b> — hide the interface <kbd>H</kbd>', () => document.body.classList.toggle('photo'));
    mk('full', '<b>Fullscreen</b> <kbd>F</kbd>', toggleFullscreen);
    mk('help', '<b>Controls & shortcuts</b> <kbd>?</kbd>', () => this.helpEl.classList.toggle('open'));
    mk('gear', '<b>Settings</b>', () => this.togglePanel('settings'));
    bar.append(brand, era, el('div', 'spacer'), time, sys);
    this.root.appendChild(bar); this.setSpeed(1, false); this.setEra(0, 0);
  }

  setWorldName(n: string) { this.worldName = n; this.root.querySelector('#hud-world')!.textContent = n; }

  setSpeed(v: number, notify = true) {
    this.speed = v; SPEEDS.forEach((s, i) => this.speedBtns[i].classList.toggle('on', s.v === v));
    const s = SPEEDS.find((x) => x.v === v)!; this.speedLabel.innerHTML = `<b>${s.name}</b>${v >= 100 ? 'populations' : v === 0 ? 'time stopped' : 'individuals'}`;
    if (notify) this.hooks.onSpeed(v);
  }

  private lastEra = -1;
  setEra(index: number, progress: number, label?: string, next?: string) {
    const segs = this.eraEl.querySelectorAll<HTMLElement>('.era-seg');
    segs.forEach((s, i) => { s.classList.toggle('done', i < index); s.classList.toggle('now', i === index); (s.firstElementChild as HTMLElement).style.width = i === index ? `${Math.round(progress * 100)}%` : ''; });
    if (index !== this.lastEra) { this.lastEra = index; this.eraEl.querySelector('#era-n')!.textContent = ERAS[index].name; }
    this.timeLabel = label ?? '';
    this.eraEl.querySelector('#era-t')!.textContent = label ?? '';
    this.eraEl.dataset.tip = `<b>${ERAS[index].name}</b> — ${ERAS[index].blurb}${next ? `<br>Next: ${next} (${Math.round(progress * 100)}%)` : ''}`;
  }

  // ------------------------------------------------------------------ dock & panels
  private buildDock() {
    const dock = el('div', 'dock px'); this.dock = dock; this.root.appendChild(dock);
    this.addDockButton('biomes', 'globe', 'Biomes', '<b>Biomes</b> — 18 habitats, all evolving at once');
    this.addDockButton('tweak', 'sliders', 'Tweak', '<b>Tweak the world</b> — temperature, light, oxygen…');
    this.addDockButton('life', 'bug', 'Life', '<b>Life</b> — every species living here');
  }
  private addDockButton(id: string, ico: string, label: string, tip?: string) {
    if (id === 'codex' || id === 'civ') this.dock.appendChild(el('div', 'sep'));
    const n = this.dockOrder.length + 1; this.dockOrder.push(id);
    const b = el('button', 'db'); b.innerHTML = `${icon(ico, 20)}<span>${label}</span><kbd>${n}</kbd>`; b.dataset.tip = `${tip ?? `<b>${label}</b>`}<kbd>${n}</kbd>`;
    b.onclick = () => this.togglePanel(id); this.dock.appendChild(b); this.dockBtns.set(id, b);
  }
  /** Register a slide-up panel with a dock button. */
  addPanel(id: string, ico: string, label: string, panel: HTMLElement, onToggle?: (open: boolean) => void, tip?: string) {
    this.mountPanel(id, panel, onToggle); this.addDockButton(id, ico, label, tip);
  }
  private mountPanel(id: string, panel: HTMLElement, onToggle?: (open: boolean) => void) {
    panel.classList.add('panel'); this.root.appendChild(panel); this.panels.set(id, panel); if (onToggle) this.openHooks.set(id, onToggle);
    const x = el('button', 'px-close'); x.innerHTML = icon('x', 12); x.title = 'Close (Esc)'; x.onclick = () => this.closePanels(); panel.appendChild(x);
  }
  isOpen(id: string) { return this.panels.get(id)?.classList.contains('open') ?? false; }

  private buildBiomePanel() {
    const p = el('div', 'wide'); p.innerHTML = `<h3>Biomes <span class="sub">Every biome keeps living while you look elsewhere.</span></h3>`;
    const grid = el('div', 'biomes');
    for (const b of BIOMES) {
      const btn = el('button', 'biome');
      btn.insertAdjacentHTML('beforeend', `<div class="swh"></div><div class="nm">${b.name}</div><div class="bl">${b.blurb}</div>`);
      btn.onclick = () => { this.hooks.onBiome(b.id); this.setBiome(b.id); this.closePanels(); };
      grid.appendChild(btn); this.biomeBtns.set(b.id, btn);
    }
    p.appendChild(grid); this.mountPanel('biomes', p, (open) => { if (open) this.paintPreviews(); });
  }
  private previewsDone = false;
  private paintPreviews() {
    if (this.previewsDone) return; this.previewsDone = true;
    const ids = [...this.biomeBtns.keys()]; let i = 0;
    const step = () => { const t0 = performance.now(); while (i < ids.length && performance.now() - t0 < 24) { const id = ids[i++]; this.biomeBtns.get(id)!.querySelector('.swh')!.replaceWith(biomePreview(BIOME_BY_ID[id])); } if (i < ids.length) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  setBiome(id: string) {
    this.biomeId = id; this.biomeBtns.forEach((b, k) => b.classList.toggle('on', k === id));
    const h = this.root.querySelector('#hud-biome'); if (h) h.textContent = BIOME_BY_ID[id]?.name ?? id;
  }

  // ------------------------------------------------------------------ settings
  private settingEls = new Map<string, HTMLElement>();
  private qualityEl?: HTMLElement;
  private buildSettingsPanel() {
    const p = el('div', 'narrow'); p.innerHTML = `<h3>Settings</h3>`;
    const row = (key: 'gore' | 'debug' | 'encounters' | 'autosave' | 'music' | 'sfx' | 'hints' | 'daycycle', label: string, hint: string) => {
      const r = el('label', 'setting'); r.innerHTML = `<span><b>${label}</b><i>${hint}</i></span><button class="tog"></button>`;
      const b = r.querySelector('button')!; b.onclick = (e) => { e.preventDefault(); (settings as any)[key] = !(settings as any)[key]; saveSettings(); this.syncSettingsUi(); this.hooks.onSettings(); if (key === 'debug') this.debugEl.style.display = settings.debug ? '' : 'none'; };
      this.settingEls.set(key, b); p.appendChild(r);
    };
    const vol = el('div', 'setting'); vol.innerHTML = `<span><b>Volume</b><i>Music, ambience and effects.</i></span><input type="range" min="0" max="100" step="1">`;
    const vi = vol.querySelector('input')!; vi.value = String(Math.round(settings.volume * 100)); vi.oninput = () => { settings.volume = +vi.value / 100; saveSettings(); this.hooks.onSettings(); }; p.appendChild(vol);
    row('music', 'Music', 'Generative music that follows the era.'); row('sfx', 'Sound effects', 'Impacts, chimes, creatures and powers.');
    const q = el('div', 'setting'); q.innerHTML = `<span><b>Graphics</b><i>Lower on slow devices: fewer particles and glows.</i></span><span class="seg">${['Low', 'Medium', 'High'].map((n, i) => `<button data-q="${i}">${n}</button>`).join('')}</span>`;
    q.querySelectorAll<HTMLElement>('button').forEach((b) => (b.onclick = () => { settings.quality = +b.dataset.q!; saveSettings(); this.syncSettingsUi(); this.hooks.onSettings(); })); p.appendChild(q); this.qualityEl = q;
    row('daycycle', 'Day & night', 'A slow day–night cycle with stars, dusk and glowing creatures.');
    row('gore', 'Gore', 'Blood, gibs, bones and wounds when creatures are hurt or killed.');
    row('encounters', 'Random encounters', 'Storms, outbreaks, migrations and strangers now and then.');
    row('autosave', 'Autosave', 'Saves to the current slot every couple of minutes.');
    row('hints', 'Tips', 'Short hints while you learn the controls.');
    row('debug', 'Performance overlay', 'Frame rate, entity counts and simulation timing. Shortcut: `');
    this.mountPanel('settings', p); this.syncSettingsUi();
  }
  syncSettingsUi() { this.settingEls.forEach((b, k) => b.classList.toggle('on', (settings as any)[k])); this.qualityEl?.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', +b.dataset.q! === settings.quality)); }

  // ------------------------------------------------------------------ environment sliders
  private buildTweakPanel() {
    const p = el('div', ''); p.innerHTML = `<h3>Tweak the world <span class="sub">Life adapts over many generations.</span></h3>`;
    const grid = el('div', 'sliders');
    for (const key of ENV_KEYS) {
      const m = ENV_META[key];
      const row = el('div', 'slider'); row.dataset.tip = m.tip;
      row.innerHTML = `<div class="sl-top"><span class="sl-name">${m.label}</span><span class="sl-val"></span></div><input type="range" min="0" max="100" step="1"><div class="sl-hint"></div>`;
      const input = row.querySelector('input')!, hint = row.querySelector('.sl-hint') as HTMLElement, val = row.querySelector('.sl-val') as HTMLElement;
      input.addEventListener('input', () => { const v = +input.value / 100; this.hooks.onEnv(key, v); this.updateHint(key, v); });
      grid.appendChild(row); this.sliders.set(key, { input, hint, val });
    }
    p.appendChild(grid);
    const rs = el('div', 'sl-reset'); const rb = el('button', 'pbtn small'); rb.textContent = 'Restore natural values'; rb.onclick = () => { const def = BIOME_BY_ID[this.biomeId]; if (!def) return; for (const k of ENV_KEYS) { this.hooks.onEnv(k, def.env[k]); } this.setEnv(def.env, true); }; rs.appendChild(rb); p.appendChild(rs);
    this.mountPanel('tweak', p);
  }
  private updateHint(key: keyof Env, v: number) {
    const s = this.sliders.get(key)!, m = ENV_META[key], def = BIOME_BY_ID[this.biomeId]?.env[key] ?? 0.5;
    s.val.textContent = `${Math.round(v * 100)}%`;
    s.hint.textContent = Math.abs(v - def) < 0.04 ? 'Natural for this biome.' : v < def ? m.low : m.high;
    s.hint.classList.toggle('changed', Math.abs(v - def) >= 0.04);
  }
  setEnv(env: Env, force = false) { for (const key of ENV_KEYS) { const s = this.sliders.get(key); if (s && (force || document.activeElement !== s.input)) { s.input.value = String(Math.round(env[key] * 100)); this.updateHint(key, env[key]); } } }

  // ------------------------------------------------------------------ life panel
  private buildLifePanel() {
    const p = el('div', ''); p.innerHTML = `<h3>Life in this biome <span class="sub" id="life-sub"></span></h3><div class="life-head"><span>Species</span><span>Role</span><span>Size</span><span>Pop.</span></div><div class="life"></div>`;
    this.lifeEl = p.querySelector('.life')!; this.lifeHead = p.querySelector('#life-sub')!;
    this.mountPanel('life', p);
  }
  setLife(rows: LifeRow[], alive: number, ever: number) {
    if (!this.panels.get('life')!.classList.contains('open')) return;
    this.lifeHead.textContent = `${alive} species alive worldwide · ${Math.max(0, ever - alive)} extinct`;
    this.lifeEl.innerHTML = rows.length ? rows.map((r) => `<div class="life-row"><span class="nm"><i style="background:${css(r.color)}"></i>${r.name}</span><span class="rl">${r.role}</span><span>${r.size < 1 ? r.size.toFixed(2) : r.size.toFixed(1)}</span><span>${r.pop.toLocaleString()}</span></div>`).join('') : '<p class="note">Nothing alive here yet.</p>';
  }

  // ------------------------------------------------------------------ notifications
  private lastSpecies: { el: HTMLElement; n: number; t: number } | null = null;
  /** Route a notification: era changes become a banner; discoveries and events go to the feed; feedback to a snackbar. */
  toast(kind: string, text: string, sub?: string) {
    if (kind === 'ok' || kind === 'warn') { this.snack(text, kind === 'warn'); return; }
    this.chronicle.push({ when: this.timeLabel, kind, text: sub && kind !== 'species' ? `${text} — ${sub}` : text }); if (this.chronicle.length > 300) this.chronicle.shift(); this.onChronicle?.();
    if (kind === 'era') { this.showBanner(text.replace(/^A new era dawns: /, ''), sub ?? '', text.startsWith('A new era') ? 'A new era' : 'Milestone'); return; }
    if (kind === 'species' && this.lastSpecies && performance.now() - this.lastSpecies.t < 9000 && this.lastSpecies.el.isConnected) {
      // fold rapid discoveries into one line
      const m = /^(\d+) new species/.exec(text); this.lastSpecies.n += m ? +m[1] : 1; this.lastSpecies.t = performance.now();
      this.lastSpecies.el.querySelector('.ftx')!.innerHTML = `<b><span class="fn">${this.lastSpecies.n}</span> new species</b><span>${text.replace(/^.*notable: /, 'Most notable: ').replace(/^New species: /, 'Latest: ')}</span>`;
      return;
    }
    const f = el('div', `fi px ${kind}`);
    f.innerHTML = `<div class="fic">${icon(FEED_ICON[kind] ?? 'star', 12)}</div><div class="ftx"><b>${text}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    this.feed.appendChild(f); requestAnimationFrame(() => f.classList.add('in'));
    if (kind === 'species') { const m = /^(\d+) new species/.exec(text); this.lastSpecies = { el: f, n: m ? +m[1] : 1, t: performance.now() }; f.querySelector('.ftx')!.innerHTML = `<b><span class="fn">${this.lastSpecies.n}</span> new species</b><span>${text.replace(/^.*notable: /, 'Most notable: ').replace(/^New species: /, 'Latest: ')}</span>`; }
    while (this.feed.children.length > 4) this.feed.firstElementChild!.remove();
    setTimeout(() => { f.classList.remove('in'); setTimeout(() => f.remove(), 400); }, kind === 'civ' || kind === 'event' ? 7000 : 5500);
  }
  showBanner(title: string, sub: string, kicker = 'A new era') {
    this.banner.innerHTML = `<div class="bk">${kicker}</div><div class="bt">${title}</div><div class="bs">${sub}</div><div class="bline"></div>`;
    this.banner.classList.remove('in'); void this.banner.offsetWidth; this.banner.classList.add('in');
  }
  private snackT = 0;
  snack(text: string, warn = false) {
    this.snackEl.textContent = text; this.snackEl.classList.toggle('warn', warn); this.snackEl.classList.add('in');
    clearTimeout(this.snackT); this.snackT = window.setTimeout(() => this.snackEl.classList.remove('in'), 2600);
  }

  // ------------------------------------------------------------------ tooltips & help
  private buildTips() {
    this.tipEl = el('div', 'tip'); document.body.appendChild(this.tipEl);
    let cur: HTMLElement | null = null;
    document.addEventListener('pointerover', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') return;
      const t = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null;
      if (t === cur) return; cur = t;
      if (!t) { this.tipEl.classList.remove('in'); return; }
      this.tipEl.innerHTML = t.dataset.tip!; this.tipEl.classList.add('in'); this.placeTip(t);
    });
    document.addEventListener('pointerdown', () => { this.tipEl.classList.remove('in'); cur = null; });
  }
  private placeTip(t: HTMLElement) {
    const r = t.getBoundingClientRect(), tw = this.tipEl.offsetWidth, th = this.tipEl.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2, y = r.bottom + 8; if (y + th > innerHeight - 8) y = r.top - th - 8;
    x = Math.max(8, Math.min(innerWidth - tw - 8, x)); this.tipEl.style.left = `${x}px`; this.tipEl.style.top = `${y}px`;
  }
  private buildHelp() {
    this.helpEl = el('div', 'help');
    const keys: [string, string][] = [['Drag / WASD', 'Pan the camera'], ['Scroll / pinch / + −', 'Zoom from landscape to single cells'], ['Click', 'Inspect a creature (or use the active tool)'], ['Space', 'Pause / resume'], ['[ and ]', 'Slower / faster'], ['1 – 9', 'Open dock panels'], ['Esc', 'Close panels, cancel tools'], ['H', 'Photo mode (hide the interface)'], ['F', 'Fullscreen'], ['`', 'Performance overlay'], ['?', 'This help']];
    this.helpEl.innerHTML = `<div class="hbox px-accent"><h2>Controls</h2><div class="keys">${keys.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div><div style="margin-top:14px;text-align:right"><button class="pbtn pri">Got it</button></div></div>`;
    this.helpEl.onclick = (e) => { if (e.target === this.helpEl || (e.target as HTMLElement).closest('button')) this.helpEl.classList.remove('open'); };
    document.body.appendChild(this.helpEl);
  }

  togglePanel(id: string) {
    const p = this.panels.get(id); if (!p) return;
    const open = p.classList.contains('open');
    this.closePanels();
    if (!open) { p.classList.add('open'); this.dockBtns.get(id)?.classList.add('open'); this.openHooks.get(id)?.(true); }
  }
  closePanels() { this.panels.forEach((p, id) => { if (p.classList.contains('open')) this.openHooks.get(id)?.(false); p.classList.remove('open'); }); this.dockBtns.forEach((b) => b.classList.remove('open')); }

  setDebug(lines: [string, string][]) { if (settings.debug) this.debugEl.innerHTML = lines.map(([k, v]) => `${k.padEnd(9)}<b>${v}</b>`).join('\n'); }
}

function toggleFullscreen() { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); }
function el(tag: string, cls = ''): HTMLElement { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
