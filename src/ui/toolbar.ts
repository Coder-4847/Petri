// Active player tool (inspect / place creature / god power): a status chip and a reticle that follows the pointer.
import { icon } from './icons';

export type Tool = { kind: 'inspect' } | { kind: 'spawn'; tpl: string; name: string; n: number; species?: number } | { kind: 'power'; id: string; name: string; radius: number; ico: string; large?: boolean };

export class ToolUI {
  tool: Tool = { kind: 'inspect' };
  chip = document.createElement('div');
  reticle = document.createElement('div');
  private zoom = () => 4;
  onChange: ((t: Tool) => void) | null = null;

  constructor(root: HTMLElement, stage: HTMLElement, zoom: () => number) {
    this.zoom = zoom;
    this.chip.className = 'toolchip'; root.appendChild(this.chip);
    this.reticle.className = 'reticle'; root.appendChild(this.reticle);
    stage.addEventListener('pointermove', (e) => this.move(e.clientX, e.clientY));
    stage.addEventListener('pointerleave', () => (this.reticle.style.display = 'none'));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.set({ kind: 'inspect' }); });
    this.render();
  }

  set(t: Tool) { this.tool = t; this.render(); this.onChange?.(t); }

  private move(x: number, y: number) {
    const t = this.tool; if (t.kind === 'inspect') { this.reticle.style.display = 'none'; return; }
    const r = t.kind === 'power' ? t.radius * this.zoom() : 14;
    this.reticle.style.cssText = `display:block;left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px`;
    this.reticle.classList.toggle('power', t.kind === 'power');
  }

  private render() {
    const t = this.tool;
    if (t.kind === 'inspect') { this.chip.classList.remove('on'); this.reticle.style.display = 'none'; return; }
    this.chip.classList.add('on');
    this.chip.innerHTML = t.kind === 'spawn'
      ? `${icon('paw', 16)}<span>Placing <b>${t.name}</b> ×${t.n} — click the world</span><button title="Stop (Esc)">${icon('x', 12)}</button>`
      : `${icon(t.ico, 16)}<span><b>${t.name}</b> — click the world to use it</span><button title="Stop (Esc)">${icon('x', 12)}</button>`;
    (this.chip.querySelector('button') as HTMLElement).onclick = () => this.set({ kind: 'inspect' });
  }
}
