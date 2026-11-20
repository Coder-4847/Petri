// Civilization panel (dock) and the modal for dilemmas.
import { icon } from './icons';

export interface CivSummary {
  active: boolean; started: boolean; finished: boolean; year: number; pop: number; tech: number; eco: number; climate: number; tension: number; stability: number; ai: number;
  disease: number; space: number; defense: number; shield: number; name: string; era: number; ending: string | null; log: { year: number; text: string }[]; peakPop: number; watch: { id: string; years: number }[];
}

export const fmtYear = (y: number) => (y < 0 ? `${Math.abs(y).toLocaleString()} BCE` : `${y.toLocaleString()} CE`);
const fmtPop = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} billion` : m >= 1 ? `${m.toFixed(m >= 10 ? 0 : 1)} million` : `${Math.round(m * 1000)} thousand`);
const WATCH: Record<string, string> = { asteroid: 'Asteroid on approach', rogue: 'Wandering star', orbit: 'Orbit drifting' };

export class CivPanel {
  el = document.createElement('div');
  private body: HTMLElement;
  constructor() { this.el.innerHTML = `<h3>Civilization <span class="sub" id="cv-sub"></span></h3><div class="cv-body"></div>`; this.body = this.el.querySelector('.cv-body')!; this.update(null); }

  update(c: CivSummary | null) {
    const sub = this.el.querySelector('#cv-sub')!;
    if (!c) { sub.textContent = ''; this.body.innerHTML = `<p class="note">No civilization yet. When a clever, social species evolves and its numbers grow, it will start to farm, build and remember. Speed up time, steer evolution with the Tweak sliders, and be patient.</p>`; return; }
    sub.textContent = `${c.name} · ${fmtYear(c.year)}${c.finished ? ' · ended' : ''}`;
    const bar = (label: string, v: number, col: string, tip: string, invert = false) => `<div class="cv-bar" title="${tip}"><span>${label}</span><div><i style="width:${Math.round(Math.min(1, Math.max(0, v)) * 100)}%;background:${col}"></i></div><b class="${invert && v > 0.7 ? 'bad' : ''}"></b></div>`;
    const watch = c.watch.length ? `<div class="cv-watch">${c.watch.map((w) => `<span>${icon('bolt', 12)} ${WATCH[w.id] ?? w.id} · ~${w.years} yr</span>`).join('')}</div>` : '';
    this.body.innerHTML = `<div class="cv-grid">
      <div class="cv-stat"><span>Population</span><b>${fmtPop(c.pop)}</b></div>
      <div class="cv-stat"><span>Age</span><b>${fmtYear(c.year)}</b></div>
      <div class="cv-stat"><span>Era</span><b>${['', '', '', '', '', '', '', '', '', 'Early', 'Modern', 'Near future'][c.era] || ''}</b></div>
    </div>
    ${bar('Technology', c.tech, '#7fb4ff', 'How advanced the civilization is.')}
    ${bar('Nature', c.eco, '#7ad66f', 'Health of forests, seas and wildlife.')}
    ${bar('Climate stress', c.climate, '#ff9a5a', 'Warming from industry. At 100% the climate collapses.', true)}
    ${bar('Tension', c.tension, '#ff7a7a', 'Rivalry between powers. Dangerous with nuclear weapons.', true)}
    ${bar('Stability', c.stability, '#f5c56b', 'How well society holds together.')}
    ${c.tech > 0.6 ? bar('AI risk', c.ai, '#b78cff', 'How far machine intelligence has outgrown control.', true) : ''}
    ${c.space > 0 ? bar('Space', c.space, '#6fe3c1', 'Progress toward settling other worlds. At 100% life escapes the home planet.') : ''}
    ${watch}
    <div class="cv-log">${[...c.log].reverse().map((l) => `<div><i>${fmtYear(l.year)}</i> ${l.text}</div>`).join('')}</div>`;
  }
}

export class ChoiceModal {
  el = document.createElement('div');
  onAnswer: ((i: number) => void) | null = null;
  constructor() { this.el.className = 'choice'; document.body.appendChild(this.el); }
  show(m: { title: string; text: string; year: number; options: { label: string; hint: string }[] }) {
    this.el.innerHTML = `<div class="ch-card"><div class="ch-year">${fmtYear(m.year)}</div><h2>${m.title}</h2><p>${m.text}</p><div class="ch-opts">${m.options.map((o, i) => `<button data-i="${i}"><b>${o.label}</b><i>${o.hint}</i></button>`).join('')}</div></div>`;
    this.el.querySelectorAll<HTMLElement>('.ch-opts button').forEach((b) => (b.onclick = () => { this.hide(); this.onAnswer?.(+b.dataset.i!); }));
    this.el.classList.add('open');
  }
  hide() { this.el.classList.remove('open'); }
}
