// Gentle first-run tips. Each is shown once (remembered in localStorage) and can all be switched off in Settings.
import { settings, saveSettings } from './settings';

interface Hint { id: string; at: number; text: string; when?: (c: HintCtx) => boolean }
export interface HintCtx { speed: number; panelOpen: boolean; modal: boolean }
const HINTS: Hint[] = [
  { id: 'move', at: 4, text: 'Drag to pan, scroll or pinch to zoom. Zoom in close to watch single creatures.' },
  { id: 'speed', at: 40, text: 'Use the speed buttons at the top right. In time-lapse and deep time, whole populations evolve.', when: (c) => c.speed <= 5 },
  { id: 'tweak', at: 85, text: 'Open Tweak to change temperature, humidity, light and more. Life adapts over many generations.' },
  { id: 'inspect', at: 130, text: 'Click any creature to inspect it. The Codex unlocks new species to place as life evolves.' },
  { id: 'biomes', at: 190, text: 'Every biome keeps evolving while you look elsewhere. Visit the Biomes panel to explore them all.' },
  { id: 'powers', at: 260, text: 'Powers can bless a struggling species or wipe out a thriving one. Try a meteor, or a mutagen.' },
  { id: 'save', at: 330, text: 'Your world autosaves. Open Worlds to save to another slot or export a file.' },
];
const KEY = 'petri.hints.v1';

export class Hints {
  el = document.createElement('div');
  private seen = new Set<string>();
  private showing = false;
  private timer = 0;
  constructor() {
    try { for (const id of JSON.parse(localStorage.getItem(KEY) ?? '[]')) this.seen.add(id); } catch { /* ignore */ }
    this.el.className = 'hint-card'; document.getElementById('ui')?.appendChild(this.el);
  }
  private persist() { try { localStorage.setItem(KEY, JSON.stringify([...this.seen])); } catch { /* ignore */ } }
  /** Call about once a second with the seconds played in this session. */
  tick(sec: number, ctx: HintCtx) {
    if (!settings.hints || this.showing || ctx.modal) return;
    const h = HINTS.find((x) => !this.seen.has(x.id) && sec >= x.at && (!x.when || x.when(ctx)));
    if (!h) return;
    this.seen.add(h.id); this.persist(); this.showing = true;
    this.el.innerHTML = `<div class="hc-t">Tip</div><div class="hc-x">${h.text}</div><div class="hc-b"><button data-a="ok">Got it</button><button data-a="off">Turn tips off</button></div>`;
    this.el.classList.add('in');
    const close = () => { this.el.classList.remove('in'); clearTimeout(this.timer); window.setTimeout(() => { this.showing = false; }, 600); };
    this.el.querySelector('[data-a=ok]')!.addEventListener('click', close);
    this.el.querySelector('[data-a=off]')!.addEventListener('click', () => { settings.hints = false; saveSettings(); close(); });
    this.timer = window.setTimeout(close, 12000);
  }
}
