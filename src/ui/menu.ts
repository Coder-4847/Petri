// Title screen (over a living demo world) and the save-slot list shared with the in-game Worlds panel.
import { SLOTS, fmtTime, type SaveMeta } from './saves';
import { BIOMES } from '../data/biomes';
import { biomePreview } from './preview';
import { icon } from './icons';

export interface SlotHooks {
  newGame(slot: number, name: string, biome: string): void;
  load(slot: number): void;
  saveHere(slot: number): void;
  exportSlot(slot: number): void;
  importInto(slot: number, file: File): void;
  remove(slot: number): void;
  playWithoutSaving(): void;
  settings?(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class SlotList {
  el = document.createElement('div');
  constructor(private hooks: SlotHooks, private mode: 'menu' | 'panel') { this.el.className = 'slots'; }

  render(slots: (SaveMeta | null)[], current: number) {
    this.el.innerHTML = '';
    for (let i = 1; i <= SLOTS; i++) {
      const m = slots[i - 1]; const card = document.createElement('div'); card.className = 'slot' + (i === current ? ' cur' : '') + (m ? '' : ' empty');
      const th = m?.thumb ? `<img src="${m.thumb}" alt="">` : `<div class="th-empty">${m ? 'no image' : 'EMPTY'}</div>`;
      card.innerHTML = `<div class="th">${th}</div><div class="si"><div class="sn">${m ? esc(m.name) : `Slot ${i}`}${i === current ? ' <em>CURRENT</em>' : ''}</div><div class="sm">${m ? `${esc(m.eraName)} · ${m.species} species<br>${fmtTime(m.playtime)} played · ${new Date(m.savedAt).toLocaleDateString()}` : this.mode === 'panel' ? 'Save your world here.' : 'An empty slot.'}</div><div class="sb"></div></div>`;
      const bar = card.querySelector('.sb') as HTMLElement;
      const btn = (label: string, fn: () => void, cls = '') => { const b = document.createElement('button'); b.textContent = label; b.className = `pbtn small ${cls}`; b.onclick = (e) => { e.stopPropagation(); fn(); }; bar.appendChild(b); };
      if (m) {
        btn(this.mode === 'menu' ? 'Play' : 'Load', () => this.hooks.load(i), 'pri');
        if (this.mode === 'panel') btn('Save here', () => { if (i === current || confirm(`Overwrite “${m.name}”?`)) this.hooks.saveHere(i); });
        btn('Export', () => this.hooks.exportSlot(i));
        btn('Delete', () => { if (confirm(`Delete “${m.name}”? This cannot be undone.`)) this.hooks.remove(i); });
      } else if (this.mode === 'panel') btn('Save here', () => this.hooks.saveHere(i), 'pri');
      btn('Import', () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.petri,application/gzip,application/json'; inp.onchange = () => { if (inp.files?.[0]) this.hooks.importInto(i, inp.files[0]); }; inp.click(); });
      this.el.appendChild(card);
    }
  }
}

export class TitleScreen {
  el = document.createElement('div');
  list: SlotList;
  private slots: (SaveMeta | null)[] = [];
  private biome = 'random'; private slotPick = 1;

  constructor(private hooks: SlotHooks) {
    this.el.className = 'title';
    this.el.innerHTML = `<div class="tt-wrap">
      <div class="tt-logo">PETRI</div>
      <div class="tt-sub">Every one of eighteen biomes begins as a drop of microbes.<br>Steer the planet, watch life invent itself, and guide whatever becomes clever enough to build.</div>
      <div class="tt-view on" data-v="main"><div class="tt-menu"></div></div>
      <div class="tt-view" data-v="new"><h2>New world</h2><div class="newform px">
        <div><label>Name</label><input type="text" maxlength="28" class="nf-name"></div>
        <div><label>Start watching in</label><div class="biomes nf-biomes"></div></div>
        <div><label>Save slot</label><div class="seg nf-slots"></div></div>
        <div class="row"><button class="pbtn tt-back">Back</button><button class="pbtn pri nf-go">Begin ${icon('play', 12)}</button></div>
      </div></div>
      <div class="tt-view" data-v="load"><h2>Your worlds</h2><div class="tt-slots"></div><button class="pbtn tt-back">Back</button></div>
      <div class="tt-view" data-v="howto"><h2>How to play</h2><div class="tt-howto px">
        <p><b>You are an observer with a few god-like tools.</b> Every biome starts as microbes. Mutations, predators, climate and chance do the rest.</p>
        <p><b>Time:</b> 1x–20x show individual creatures. 100x and deep time switch to whole populations so millions of years can pass. Speed up, then slow down to see what evolved.</p>
        <p><b>Steer:</b> the Tweak sliders change temperature, light, oxygen and more. Life adapts over generations. Powers can bless, mutate or smite.</p>
        <p><b>Explore:</b> click a creature to inspect it. The Codex fills up as new forms evolve, and lets you place creatures yourself.</p>
        <p><b>Civilization:</b> if a clever, social species thrives, it starts to farm and build. Its great decisions are yours, and thirteen endings wait.</p>
      </div><button class="pbtn tt-back">Back</button></div>
    </div><div class="tt-foot">PETRI · an evolution sandbox · v1.1<br>procedural art & sound — no assets</div>`;
    this.list = new SlotList(hooks, 'menu'); this.el.querySelector('.tt-slots')!.appendChild(this.list.el);
    this.el.querySelectorAll<HTMLElement>('.tt-back').forEach((b) => (b.onclick = () => this.view('main')));
    (this.el.querySelector('.nf-go') as HTMLElement).onclick = () => this.begin();
    (this.el.querySelector('.nf-name') as HTMLInputElement).onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') this.begin(); };
    this.buildBiomes();
  }

  private view(v: string) { this.el.querySelectorAll<HTMLElement>('.tt-view').forEach((x) => x.classList.toggle('on', x.dataset.v === v)); this.el.classList.toggle('sub-view', v !== 'main'); this.el.scrollTop = 0; }

  private buildMenu(current: number) {
    const menu = this.el.querySelector('.tt-menu')!; menu.innerHTML = '';
    const add = (label: string, fn: () => void, cls = '', small = '', ico = '') => { const b = document.createElement('button'); b.className = `pbtn ${cls}`; b.innerHTML = `${ico ? icon(ico, 14) : ''}<span>${label}</span>${small ? `<small>${esc(small)}</small>` : ''}`; b.onclick = fn; menu.appendChild(b); };
    const latest = this.slots.map((m, i) => ({ m, i: i + 1 })).filter((x) => x.m).sort((a, b) => b.m!.savedAt - a.m!.savedAt)[0];
    if (latest) add('Continue', () => this.hooks.load(latest.i), 'pri', `${latest.m!.name}`, 'play');
    add('New world', () => this.openNew(), latest ? '' : 'pri', '', 'seed');
    add('Load world', () => this.view('load'), '', `${this.slots.filter(Boolean).length}/${SLOTS}`, 'save');
    add('Settings', () => this.hooks.settings?.(), '', '', 'gear');
    add('How to play', () => this.view('howto'), '', '', 'help');
    void current;
  }

  private buildBiomes() {
    const grid = this.el.querySelector('.nf-biomes')!;
    const mk = (id: string, name: string, canvas: HTMLCanvasElement | null) => {
      const b = document.createElement('button'); b.className = 'biome' + (id === this.biome ? ' on' : ''); b.dataset.id = id;
      if (canvas) b.appendChild(canvas); else { const c = document.createElement('div'); c.className = 'sw'; c.style.cssText = 'display:grid;place-items:center;height:56px;color:var(--gold);font-size:24px'; c.textContent = '?'; b.appendChild(c); }
      b.insertAdjacentHTML('beforeend', `<div class="nm">${name}</div>`);
      b.onclick = () => { this.biome = id; grid.querySelectorAll('.biome').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.id === id)); };
      grid.appendChild(b);
    };
    mk('random', 'Surprise me', null);
    this.pendingBiomes = BIOMES.map((b) => () => mk(b.id, b.name, biomePreview(b)));
  }
  private pendingBiomes: (() => void)[] = [];

  private openNew() {
    this.view('new');
    const name = this.el.querySelector('.nf-name') as HTMLInputElement; name.value = `World ${this.slots.filter(Boolean).length + 1}`; setTimeout(() => { name.focus(); name.select(); }, 50);
    // previews are generated lazily, a few per frame
    const step = () => { const t0 = performance.now(); while (this.pendingBiomes.length && performance.now() - t0 < 20) this.pendingBiomes.shift()!(); if (this.pendingBiomes.length) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    const firstEmpty = this.slots.findIndex((s) => !s); this.slotPick = firstEmpty >= 0 ? firstEmpty + 1 : 0;
    const seg = this.el.querySelector('.nf-slots')!; seg.innerHTML = '';
    for (let i = 0; i <= SLOTS; i++) { const b = document.createElement('button'); b.textContent = i === 0 ? 'Don’t save' : `${i}${this.slots[i - 1] ? ' (used)' : ''}`; b.className = i === this.slotPick ? 'on' : ''; b.onclick = () => { this.slotPick = i; seg.querySelectorAll('button').forEach((x, k) => x.classList.toggle('on', k === i)); }; seg.appendChild(b); }
  }

  private begin() {
    const s = this.slotPick, m = s ? this.slots[s - 1] : null;
    if (m && !confirm(`Slot ${s} holds “${m.name}”. Replace it?`)) return;
    const name = (this.el.querySelector('.nf-name') as HTMLInputElement).value.trim() || 'Untitled';
    this.hooks.newGame(s, name, this.biome);
  }

  show(slots: (SaveMeta | null)[], current: number) { this.slots = slots; this.list.render(slots, current); this.buildMenu(current); this.view('main'); this.el.classList.add('open'); document.body.classList.add('title-mode'); }
  refresh(slots: (SaveMeta | null)[], current: number) { this.slots = slots; this.list.render(slots, current); this.buildMenu(current); }
  hide() { this.el.classList.remove('open'); document.body.classList.remove('title-mode'); }
  get isOpen() { return this.el.classList.contains('open'); }
}
