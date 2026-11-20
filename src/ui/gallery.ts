import { TEMPLATES } from '../data/templates';
import { genome } from '../sim/genes';
import { generateSprite } from '../render/spritegen';

/** Developer page (#gallery): every template's generated frames, magnified. */
export function showGallery() {
  document.getElementById('boot')?.remove();
  const root = document.getElementById('ui')!; root.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#0b0f16;pointer-events:auto;padding:12px';
  document.getElementById('stage')!.style.display = 'none';
  root.innerHTML = '<div style="color:#6fe3c1;letter-spacing:3px;margin:4px 0 10px">PETRI · SPRITE GALLERY</div>';
  const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:10px'; root.appendChild(grid);
  const cats = location.hash.split(':')[1]?.split(',');
  for (const t of TEMPLATES.filter((x) => !cats || cats.includes(x.category))) {
    const g = genome(t.genes); const set = generateSprite(g, t.tpl);
    const card = document.createElement('div'); card.style.cssText = 'border:1px solid #232c3b;padding:8px;background:#10151d;font-size:12px;color:#aab6c6';
    card.innerHTML = `<div style="color:#dfe6ee;margin-bottom:6px">${t.name} <span style="color:#566176">· ${set.archetype} · ${set.basePx}px · ${t.category}</span></div>`;
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;background:linear-gradient(#2a6a9c,#0e3a5e);padding:6px';
    set.frames.slice(0, 7).forEach((f) => { const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d')!.drawImage(f, 0, 0); const sc = f.width > 40 ? 3 : 4; c.style.cssText = `image-rendering:pixelated;width:${f.width * sc}px;height:${f.height * sc}px`; row.appendChild(c); });
    card.appendChild(row); grid.appendChild(card);
  }
}
