// Title screen and the "Worlds" panel share one slot list: five save slots with thumbnail, era and playtime.
import { SLOTS, fmtTime, type SaveMeta } from './saves';
import { BIOMES } from '../data/biomes';

export interface SlotHooks {
  newGame(slot: number, name: string, biome: string): void;
  load(slot: number): void;
  saveHere(slot: number): void;
  exportSlot(slot: number): void;
  importInto(slot: number, file: File): void;
  remove(slot: number): void;
  playWithoutSaving(): void;
}

export class SlotList {
  el = document.createElement('div');
  private creating = -1;
  constructor(private hooks: SlotHooks, private mode: 'menu' | 'panel') { this.el.className = 'slots'; }

  render(slots: (SaveMeta | null)[], current: number) {
    this.el.innerHTML = '';
    for (let i = 1; i <= SLOTS; i++) {
      const m = slots[i - 1]; const card = document.createElement('div'); card.className = 'slot' + (i === current ? ' cur' : '') + (m ? '' : ' empty');
      const th = m ? `<img src="${m.thumb}" alt="">` : `<div class="th-empty">empty</div>`;
      card.innerHTML = `<div class="th">${th}</div><div class="si"><div class="sn">${m ? esc(m.name) : `Slot ${i}`}${i === current ? ' <em>current</em>' : ''}</div><div class="sm">${m ? `${esc(m.eraName)} · ${fmtTime(m.playtime)} · ${m.species} species<br>${new Date(m.savedAt).toLocaleString()}` : 'Start a new world here.'}</div><div class="sb"></div></div>`;
      const bar = card.querySelector('.sb') as HTMLElement;
      const btn = (label: string, fn: () => void, cls = '') => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = (e) => { e.stopPropagation(); fn(); }; bar.appendChild(b); };
      if (m) {
        btn(this.mode === 'menu' ? 'Play' : 'Load', () => this.hooks.load(i), 'pri');
        if (this.mode === 'panel') btn('Save here', () => { if (confirm(`Overwrite “${m.name}”?`)) this.hooks.saveHere(i); });
        btn('Export', () => this.hooks.exportSlot(i));
        btn('Delete', () => { if (confirm(`Delete “${m.name}”? This cannot be undone.`)) this.hooks.remove(i); }, 'dim');
      } else if (this.mode === 'panel') btn('Save here', () => this.hooks.saveHere(i), 'pri');
      else btn('New world', () => { this.creating = i; this.render(slots, current); }, 'pri');
      btn('Import', () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.petri,application/gzip,application/json'; inp.onchange = () => { if (inp.files?.[0]) this.hooks.importInto(i, inp.files[0]); }; inp.click(); }, 'dim');
      if (this.creating === i) {
        const f = document.createElement('div'); f.className = 'sf';
        f.innerHTML = `<input maxlength="28" placeholder="Name your world" value="World ${i}"><select><option value="random">Start in: random biome</option>${BIOMES.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select><button class="pri">Begin</button>`;
        const go = () => { const name = (f.querySelector('input') as HTMLInputElement).value.trim() || `World ${i}`; this.creating = -1; this.hooks.newGame(i, name, (f.querySelector('select') as HTMLSelectElement).value); };
        (f.querySelector('button') as HTMLElement).onclick = go; (f.querySelector('input') as HTMLInputElement).onkeydown = (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); };
        card.querySelector('.si')!.appendChild(f);
      }
      this.el.appendChild(card);
    }
  }
}

export class TitleScreen {
  el = document.createElement('div');
  list: SlotList;
  constructor(hooks: SlotHooks) {
    this.el.className = 'title';
    this.el.innerHTML = `<div class="tt-box"><div class="tt-logo">PETRI</div><div class="tt-sub">An evolution sandbox. Every biome starts as a drop of microbes — see what they become.</div><div class="tt-slots"></div><div class="tt-foot"><button class="tt-skip">Play without saving</button></div></div>`;
    this.list = new SlotList(hooks, 'menu'); this.el.querySelector('.tt-slots')!.appendChild(this.list.el);
    (this.el.querySelector('.tt-skip') as HTMLElement).onclick = () => hooks.playWithoutSaving();
  }
  show(slots: (SaveMeta | null)[], current: number) { this.list.render(slots, current); this.el.classList.add('open'); }
  hide() { this.el.classList.remove('open'); }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
