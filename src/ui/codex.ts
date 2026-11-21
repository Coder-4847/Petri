// The codex: every creature template, grouped by kind. Unlocked ones can be placed in the world.
import { TEMPLATES, type Category } from '../data/templates';
import { generateSprite } from '../render/spritegen';
import { genome } from '../sim/genes';
import type { SpeciesInfo } from '../shared/protocol';

const dietOf = (g: number[]) => g[18] > 0.35 || g[19] > 0.35 ? 'makes its own food' : g[22] > 0.4 && g[21] > 0.3 ? 'omnivore' : g[22] > 0.4 ? 'hunter' : g[21] > 0.4 ? 'grazer' : g[23] > 0.4 ? 'scavenger' : g[20] > 0.4 ? 'filter feeder' : 'forager';
const sizeOf = (g: number[]) => 0.12 * Math.pow(250, g[0]);

const TABS: { id: Category | 'all' | 'evolved'; label: string }[] = [
  { id: 'evolved', label: 'Your species' }, { id: 'all', label: 'All' }, { id: 'microbe', label: 'Microbes' }, { id: 'plant', label: 'Plants' }, { id: 'invertebrate', label: 'Sea life' }, { id: 'insect', label: 'Insects' },
  { id: 'fish', label: 'Fish' }, { id: 'amphibian', label: 'Amphibians' }, { id: 'reptile', label: 'Reptiles' }, { id: 'dinosaur', label: 'Dinosaurs' }, { id: 'bird', label: 'Birds' },
  { id: 'mammal', label: 'Mammals' }, { id: 'extinct', label: 'Lost' }, { id: 'myth', label: 'Legends' }, { id: 'scifi', label: 'Strangers' },
];

export class Codex {
  el = document.createElement('div');
  count = 3;
  private unlocked = new Set<string>();
  private fresh = new Set<string>();
  private grid!: HTMLElement; private detail!: HTMLElement; private head!: HTMLElement;
  private tab: string = 'all';
  private cards = new Map<string, HTMLElement>();
  private built = false;
  selected = '';

  /** supplied by main: the species registry as known to the renderer, and sprite frames */
  species: () => SpeciesInfo[] = () => [];
  sprite: (id: number) => HTMLCanvasElement | null = () => null;
  onPickSpecies: ((id: number, n: number) => void) | null = null;
  private evo = document.createElement('div');

  constructor(private onPick: (tpl: string, n: number) => void) {
    this.el.innerHTML = `<h3>Codex <span class="sub" id="cx-sub"></span></h3><div class="cx-tabs"></div><div class="cx-count">Place <button data-n="1">1</button><button data-n="3" class="on">3</button><button data-n="10">10</button> at a time</div><div class="cx-grid"></div><div class="cx-detail">Pick an unlocked creature, then click the world to place it.</div>`;
    this.evo.className = 'cx-grid'; this.evo.style.display = 'none'; this.el.querySelector('.cx-grid')!.after(this.evo);
    this.grid = this.el.querySelector('.cx-grid')!; this.detail = this.el.querySelector('.cx-detail')!; this.head = this.el.querySelector('#cx-sub')!;
    const tabs = this.el.querySelector('.cx-tabs')!;
    for (const t of TABS) { const b = document.createElement('button'); b.textContent = t.label; b.dataset.id = t.id; if (t.id === 'all') b.className = 'on'; b.onclick = () => { this.tab = t.id; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.filter(); }; tabs.appendChild(b); }
    this.el.querySelectorAll<HTMLElement>('.cx-count button').forEach((b) => (b.onclick = () => { this.count = +b.dataset.n!; this.el.querySelectorAll('.cx-count button').forEach((x) => x.classList.toggle('on', x === b)); }));
  }

  /** Build the cards the first time the panel opens (sprite generation is the slow part). */
  open() {
    if (!this.built) { this.built = true; this.build(); }
    this.refresh(); if (this.tab === 'evolved') this.buildEvolved();
  }

  private build() {
    for (const t of TEMPLATES) {
      const card = document.createElement('button'); card.className = 'cx-card'; card.dataset.cat = t.category;
      const cv = document.createElement('canvas'); cv.width = 56; cv.height = 40; card.appendChild(cv);
      try {
        const set = generateSprite(genome(t.genes), t.tpl); const f = set.frames[0];
        const sc = Math.min(52 / f.width, 36 / f.height); const k = sc >= 1 ? Math.floor(sc) : sc;
        const x = cv.getContext('2d')!; x.imageSmoothingEnabled = false; const w = Math.round(f.width * k), h = Math.round(f.height * k); x.drawImage(f, (56 - w) >> 1, 40 - h - 1, w, h);
      } catch { /* leave blank */ }
      card.insertAdjacentHTML('beforeend', `<span class="cx-nm"></span>`);
      card.onmouseenter = card.onfocus = () => this.showDetail(t.id);
      card.onclick = () => { if (!this.unlocked.has(t.id)) { this.showDetail(t.id); return; } this.selected = t.id; this.onPick(t.id, this.count); };
      this.grid.appendChild(card); this.cards.set(t.id, card);
    }
    this.filter();
  }

  private showDetail(id: string) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    this.detail.innerHTML = this.unlocked.has(id)
      ? `<b>${t.name}</b> <i>${t.sci}</i> <span class="rar r${t.rarity}">${['common', 'uncommon', 'rare', 'legendary'][t.rarity - 1]}</span><br>${t.blurb}`
      : `<b>???</b> <span class="rar r${t.rarity}">${['common', 'uncommon', 'rare', 'legendary'][t.rarity - 1]}</span><br>${t.unlock}`;
  }

  private filter() {
    const evo = this.tab === 'evolved'; this.grid.style.display = evo ? 'none' : ''; this.evo.style.display = evo ? '' : 'none';
    if (evo) { this.buildEvolved(); return; }
    this.cards.forEach((c) => (c.style.display = this.tab === 'all' || c.dataset.cat === this.tab ? '' : 'none'));
  }

  /** The species your world has produced: biggest and most successful first, extinct ones greyed. */
  private buildEvolved() {
    const all = this.species().filter((s) => s.peak >= 3);
    const list = all.sort((a, b) => (b.extinct ? 0 : 1) - (a.extinct ? 0 : 1) || sizeOf(b.genome) * Math.log(2 + b.peak) - sizeOf(a.genome) * Math.log(2 + a.peak)).slice(0, 140);
    const byId = new Map(this.species().map((s) => [s.id, s]));
    this.evo.innerHTML = list.length ? '' : '<p class="note" style="grid-column:1/-1">No species have evolved yet. Give it time, or speed up.</p>';
    for (const s of list) {
      const card = document.createElement('button'); card.className = 'cx-card' + (s.extinct ? ' locked' : '');
      const cv = document.createElement('canvas'); cv.width = 56; cv.height = 40; card.appendChild(cv);
      const f = this.sprite(s.id); if (f) { const x = cv.getContext('2d')!; x.imageSmoothingEnabled = false; const k0 = Math.min(52 / f.width, 36 / f.height), k = k0 >= 1 ? Math.floor(k0) : k0, w = Math.round(f.width * k), h = Math.round(f.height * k); x.drawImage(f, (56 - w) >> 1, 40 - h - 1, w, h); }
      card.insertAdjacentHTML('beforeend', `<span class="cx-nm"><i>${s.name}</i></span>`);
      const par = s.parent >= 0 ? byId.get(s.parent)?.name : null;
      card.onmouseenter = card.onfocus = () => { this.detail.innerHTML = `<b><i>${s.name}</i></b> <span class="rar ${s.extinct ? '' : 'r3'}">${s.extinct ? 'extinct' : 'alive'}</span><br>${dietOf(s.genome)} · size ${sizeOf(s.genome) < 1 ? sizeOf(s.genome).toFixed(2) : sizeOf(s.genome).toFixed(1)} · peak population ${s.peak.toLocaleString()}${par ? ` · descended from <i>${par}</i>` : ' · a founding lineage'}`; };
      card.onclick = () => { if (s.extinct) return; this.onPickSpecies?.(s.id, this.count); };
      this.evo.appendChild(card);
    }
  }

  setUnlocked(list: string[], fresh: string[] = []) { this.unlocked = new Set(list); fresh.forEach((f) => this.fresh.add(f)); if (this.built) this.refresh(); this.head.textContent = `${this.unlocked.size} of ${TEMPLATES.length} discovered`; }

  private refresh() {
    for (const t of TEMPLATES) {
      const c = this.cards.get(t.id); if (!c) continue; const u = this.unlocked.has(t.id);
      c.classList.toggle('locked', !u); c.classList.toggle('fresh', this.fresh.has(t.id)); c.classList.toggle('sel', this.selected === t.id);
      (c.querySelector('.cx-nm') as HTMLElement).textContent = u ? t.name : '???';
    }
    this.head.textContent = `${this.unlocked.size} of ${TEMPLATES.length} discovered`;
  }
  clearFresh() { this.fresh.clear(); }
  select(id: string) { this.selected = id; if (this.built) this.refresh(); }
}
