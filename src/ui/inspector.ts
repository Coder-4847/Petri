// Inspector card: click a creature to see what it is, how it is doing and where it came from.
import { css } from '../render/util';

export class Inspector {
  el = document.createElement('div');
  following = false;
  onClose: (() => void) | null = null;
  onFollow: ((on: boolean) => void) | null = null;
  private spriteBox!: HTMLElement; private body!: HTMLElement;
  current: { slot: number; uid: number } | null = null;

  constructor(private sprite: (species: number) => HTMLCanvasElement | null) {
    this.el.className = 'inspector';
    this.el.innerHTML = `<div class="in-top"><div class="in-sprite"></div><div class="in-id"></div><button class="in-x" title="Close">✕</button></div><div class="in-body"></div><div class="in-foot"><button class="in-follow">Follow</button></div>`;
    this.spriteBox = this.el.querySelector('.in-sprite')!; this.body = this.el.querySelector('.in-body')!;
    (this.el.querySelector('.in-x') as HTMLElement).onclick = () => this.close();
    const f = this.el.querySelector('.in-follow') as HTMLElement; f.onclick = () => this.setFollow(!this.following);
  }

  setFollow(on: boolean) { this.following = on; this.el.querySelector('.in-follow')!.classList.toggle('on', on); (this.el.querySelector('.in-follow') as HTMLElement).textContent = on ? 'Following' : 'Follow'; this.onFollow?.(on); }
  close() { this.current = null; this.el.classList.remove('open'); this.setFollow(false); this.onClose?.(); }
  show(slot: number, uid: number) { this.current = { slot, uid }; this.el.classList.add('open'); }

  update(d: any) {
    if (!this.current) return;
    if (d.gone) { this.el.querySelector('.in-id')!.innerHTML = `<b>Gone</b><i>This creature is no longer alive.</i>`; this.body.innerHTML = ''; return; }
    const cv = this.sprite(d.species);
    if (cv && this.spriteBox.dataset.sp !== String(d.species)) {
      this.spriteBox.dataset.sp = String(d.species); this.spriteBox.innerHTML = '';
      const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
      const k = Math.min(60 / cv.width, 44 / cv.height); const s = k >= 1 ? Math.floor(k) : k, w = Math.round(cv.width * s), h = Math.round(cv.height * s); x.drawImage(cv, (64 - w) >> 1, (48 - h) >> 1, w, h); this.spriteBox.appendChild(c);
    }
    const bar = (label: string, v: number, col: string) => `<div class="in-bar"><span>${label}</span><div><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;background:${col}"></i></div></div>`;
    this.el.querySelector('.in-id')!.innerHTML = `<b style="color:${css(d.color)}">${d.name}</b><i>${d.carcass ? 'carcass' : d.diet} · ${d.state}</i>`;
    const size = d.size < 1 ? d.size.toFixed(2) : d.size.toFixed(1);
    this.body.innerHTML = d.carcass ? `<div class="in-line">Dead body, being eaten and decomposed.</div>` :
      `${bar('Health', d.health, '#ff7a7a')}${bar('Energy', d.energy, '#f5c56b')}${bar('Age', d.age / Math.max(1, d.life), '#6fe3c1')}
      <div class="in-line">Size ${size} · generation ${d.gen} · ${d.population.toLocaleString()} of its kind</div>
      <div class="in-tags">${d.traits.map((t: string) => `<span>${t}</span>`).join('')}</div>
      ${d.lineage.length ? `<div class="in-line faint">Descended from ${d.lineage.map((n: string) => `<i>${n}</i>`).join(' ← ')}</div>` : ''}`;
  }
}
