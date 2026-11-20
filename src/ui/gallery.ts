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
  const extra: any[] = [
    { id: 'x1', name: 'lizard', category: 'test', tpl: 'reptile', genes: { SIZE: 0.55, LIMBS: 0.7, WALK: 0.6, LUNGS: 0.85, GILLS: 0, CUTICLE: 0.55, CARN: 0.6, EYES: 0.6, TAIL: 0.6, HUE: 0.25, SAT: 0.7, PATTERN: 0.8, JAWS: 0.4 } },
    { id: 'x2', name: 'hare', category: 'test', tpl: 'mammal', genes: { SIZE: 0.45, LIMBS: 0.8, WALK: 0.8, LUNGS: 0.95, GILLS: 0, HERB: 0.9, ENDOTHERM: 0.7, EYES: 0.6, TAIL: 0.2, HUE: 0.08, SAT: 0.3 } },
    { id: 'x3', name: 'sauropod', category: 'test', tpl: 'sauropod', genes: { SIZE: 0.85, LIMBS: 0.85, WALK: 0.55, LUNGS: 0.9, GILLS: 0, HERB: 0.9, TAIL: 0.8, ARMOR: 0.2, HUE: 0.2, SAT: 0.4 } },
    { id: 'x4', name: 'theropod', category: 'test', tpl: 'theropod', genes: { SIZE: 0.78, LIMBS: 0.85, WALK: 0.75, LUNGS: 0.9, GILLS: 0, CARN: 0.92, JAWS: 0.85, TAIL: 0.7, EYES: 0.7, HUE: 0.05, SAT: 0.6, AGGR: 0.8 } },
    { id: 'x5', name: 'bird', category: 'test', tpl: 'bird', genes: { SIZE: 0.42, WINGS: 0.9, FLY: 0.8, ENDOTHERM: 0.6, LIMBS: 0.6, WALK: 0.45, EYES: 0.8, LUNGS: 0.95, GILLS: 0, CARN: 0.4, HERB: 0.4, TAIL: 0.5, HUE: 0.55, SAT: 0.8, PATTERN: 0.5 } },
    { id: 'x6', name: 'hominid', category: 'test', tpl: 'hominid', genes: { SIZE: 0.5, INTEL: 0.7, SOCIAL: 0.6, LIMBS: 0.9, WALK: 0.8, EYES: 0.8, LUNGS: 0.95, GILLS: 0, ENDOTHERM: 0.75, HERB: 0.5, CARN: 0.4, HUE: 0.07, SAT: 0.4 } },
    { id: 'x7', name: 'mammoth', category: 'test', tpl: 'mammoth', genes: { SIZE: 0.78, LIMBS: 0.85, WALK: 0.6, LUNGS: 0.95, GILLS: 0, HERB: 0.9, ENDOTHERM: 0.8, HORNS: 0.5, HUE: 0.07, SAT: 0.4 } },
    { id: 'x8', name: 'sabertooth', category: 'test', tpl: 'sabertooth', genes: { SIZE: 0.68, LIMBS: 0.85, WALK: 0.88, LUNGS: 0.95, GILLS: 0, CARN: 0.95, JAWS: 0.8, ENDOTHERM: 0.75, HUE: 0.1, SAT: 0.5, PATTERN: 0.8 } },
    { id: 'x9', name: 'small amphibian', category: 'test', tpl: 'amphibian', genes: { SIZE: 0.4, LIMBS: 0.65, WALK: 0.45, SWIM: 0.55, GILLS: 0.55, LUNGS: 0.6, CUTICLE: 0.25, CARN: 0.6, EYES: 0.6, TAIL: 0.5, HUE: 0.3, SAT: 0.8 } },
    { id: 'x10', name: 'horned grazer', category: 'test', tpl: 'mammal', genes: { SIZE: 0.6, LIMBS: 0.85, WALK: 0.8, LUNGS: 0.95, GILLS: 0, HERB: 0.9, ENDOTHERM: 0.7, HORNS: 0.7, EYES: 0.6, SOCIAL: 0.7, HUE: 0.1, SAT: 0.4 } },
    { id: 'x11', name: 'armoured dinosaur', category: 'test', tpl: 'reptile', genes: { SIZE: 0.75, LIMBS: 0.8, WALK: 0.5, LUNGS: 0.9, GILLS: 0, HERB: 0.9, ARMOR: 0.8, HORNS: 0.5, TAIL: 0.6, HUE: 0.15, SAT: 0.4 } },
    { id: 'x12', name: 'big bird', category: 'test', tpl: 'bird', genes: { SIZE: 0.65, WINGS: 0.9, FLY: 0.7, ENDOTHERM: 0.6, LIMBS: 0.7, WALK: 0.6, EYES: 0.9, LUNGS: 0.95, GILLS: 0, CARN: 0.85, JAWS: 0.5, HUE: 0.08, SAT: 0.5 } },
  ];
  for (const t of [...TEMPLATES.filter((x) => x.category === 'mammal' || x.category === 'fish' && false), ...extra]) {
    const g = genome(t.genes as any); const set = generateSprite(g, t.tpl);
    const card = document.createElement('div'); card.style.cssText = 'border:1px solid #232c3b;padding:8px;background:#10151d;font-size:12px;color:#aab6c6';
    card.innerHTML = `<div style="color:#dfe6ee;margin-bottom:6px">${t.name} <span style="color:#566176">· ${set.archetype} · ${set.basePx}px · ${t.category}</span></div>`;
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;background:linear-gradient(#2a6a9c,#0e3a5e);padding:6px';
    set.frames.slice(0, 7).forEach((f) => { const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d')!.drawImage(f, 0, 0); const sc = f.width > 40 ? 3 : 4; c.style.cssText = `image-rendering:pixelated;width:${f.width * sc}px;height:${f.height * sc}px`; row.appendChild(c); });
    card.appendChild(row); grid.appendChild(card);
  }
}
