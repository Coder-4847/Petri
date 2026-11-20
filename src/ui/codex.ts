// The codex: every creature template, grouped by kind. Unlocked ones can be placed in the world.
import { TEMPLATES, type Category } from '../data/templates';
import { generateSprite } from '../render/spritegen';
import { genome } from '../sim/genes';

const TABS: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'microbe', label: 'Microbes' }, { id: 'plant', label: 'Plants' }, { id: 'invertebrate', label: 'Sea life' }, { id: 'insect', label: 'Insects' },
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

  constructor(private onPick: (tpl: string, n: number) => void) {
    this.el.innerHTML = `<h3>Codex <span class="sub" id="cx-sub"></span></h3><div class="cx-tabs"></div><div class="cx-count">Place <button data-n="1">1</button><button data-n="3" class="on">3</button><button data-n="10">10</button> at a time</div><div class="cx-grid"></div><div class="cx-detail">Pick an unlocked creature, then click the world to place it.</div>`;
    this.grid = this.el.querySelector('.cx-grid')!; this.detail = this.el.querySelector('.cx-detail')!; this.head = this.el.querySelector('#cx-sub')!;
    const tabs = this.el.querySelector('.cx-tabs')!;
    for (const t of TABS) { const b = document.createElement('button'); b.textContent = t.label; b.dataset.id = t.id; if (t.id === 'all') b.className = 'on'; b.onclick = () => { this.tab = t.id; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.filter(); }; tabs.appendChild(b); }
    this.el.querySelectorAll<HTMLElement>('.cx-count button').forEach((b) => (b.onclick = () => { this.count = +b.dataset.n!; this.el.querySelectorAll('.cx-count button').forEach((x) => x.classList.toggle('on', x === b)); }));
  }

  /** Build the cards the first time the panel opens (sprite generation is the slow part). */
  open() {
    if (!this.built) { this.built = true; this.build(); }
    this.refresh();
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

  private filter() { this.cards.forEach((c) => (c.style.display = this.tab === 'all' || c.dataset.cat === this.tab ? '' : 'none')); }

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
