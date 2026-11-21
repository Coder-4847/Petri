import { Renderer } from './render/renderer';
import { Shell } from './ui/shell';
import { settings } from './ui/settings';
import { Codex } from './ui/codex';
import { Inspector } from './ui/inspector';
import { Stats } from './ui/stats';
import { ToolUI } from './ui/toolbar';
import { SlotList, TitleScreen, type SlotHooks } from './ui/menu';
import { listSlots, putSlot, getSlot, deleteSlot, exportBlob, importBlob, download, type SaveMeta } from './ui/saves';
import { POWERS, POWER_BY_ID } from './data/powers';
import { TEMPLATE_BY_ID } from './data/templates';
import { BIOMES } from './data/biomes';
import { ERAS } from './data/eras';
import { icon } from './ui/icons';
import { CivPanel, ChoiceModal, fmtYear } from './ui/civ';
import { EndingScreen } from './ui/endings';
import { ENDINGS } from './data/civ';
import { audio } from './audio/audio';
import { Hints } from './ui/hints';
import { IS_WATER, W } from './shared/constants';
import type { FromWorker } from './shared/protocol';

async function boot() {
  if (location.hash.startsWith('#gallery')) { const { showGallery } = await import('./ui/gallery'); showGallery(); return; }
  if (location.hash.startsWith('#ending')) { // dev preview of an ending scene: #ending:asteroid
    const es = new EndingScreen(); document.getElementById('boot')?.classList.add('gone');
    es.show({ id: location.hash.split(':')[1] || 'balance', summary: { year: 2431, peakPop: 9400, name: 'Hominids' }, alive: 412, species: 530, choices: [{ title: 'x', pick: 'y' }] }); return;
  }
  const stage = document.getElementById('stage')!;
  const renderer = new Renderer();
  try { await renderer.init(stage); } catch (e) {
    console.error(e); document.querySelector('.boot-sub')!.innerHTML = 'Petri needs WebGL, and this browser could not start it.<br>Try a recent Chrome, Firefox, Edge or Safari, or enable hardware acceleration.'; document.querySelector('.boot-cells')?.remove(); return;
  }

  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  const send = (m: any) => worker.postMessage(m);
  let stats: any = null;

  // ---- game session state
  let slot = 0; // 0 = playing without a save slot
  let slotName = 'Untitled';
  let playSec = 0;
  let inGame = false; let sessionSec = 0; let demo = false;
  const quickMode = new URLSearchParams(location.search).has('quick');
  let slots: (SaveMeta | null)[] = [];
  const refreshSlots = async () => { slots = await listSlots(); worldList.render(slots, slot); if (title.el.classList.contains('open')) title.list.render(slots, slot); };

  const shell = new Shell({
    onSpeed: (v) => send({ t: 'speed', v }),
    onBiome: (id) => send({ t: 'biome', id }),
    onEnv: (key, value) => send({ t: 'env', key, value }),
    onSettings: () => { renderer.setGore(settings.gore); send({ t: 'cfg', config: { encounters: settings.encounters } }); applyAudio(); renderer.setQuality(settings.quality); renderer.daynight.enabled = settings.daycycle; },
  });

  function applyAudio() { audio.volume = settings.volume; audio.music = settings.music; audio.sfx = settings.sfx; if (audio.ctx) { audio.setVolume(settings.volume); audio.setMusic(settings.music); audio.setSfx(settings.sfx); } }
  applyAudio(); renderer.setQuality(settings.quality); renderer.daynight.enabled = settings.daycycle;
  const wake = () => { audio.start(); applyAudio(); audio.setBiome(lastEnvBiome || 'reef'); };
  window.addEventListener('pointerdown', wake, { once: true }); window.addEventListener('keydown', wake, { once: true });
  document.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest?.('button')) audio.ui(); });
  setInterval(() => { const c = renderer.cam, x = c.x | 0, y = c.y | 0; audio.setUnderwater(x >= 0 && x < W && y >= 0 && IS_WATER[renderer.medium[y * W + x]] === 1); audio.setSpeed(shell.speed); }, 400);
  renderer.onViewChange = (v) => send({ t: 'view', ...v });
  renderer.setGore(settings.gore);

  // touch devices get zoom buttons (pinch also works)
  const zc = document.createElement('div'); zc.className = 'zoomctl'; zc.innerHTML = `<button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button>`;
  (zc.children[0] as HTMLElement).onclick = () => renderer.cam.zoomAt(renderer.cam.sw / 2, renderer.cam.sh / 2, 1.4); (zc.children[1] as HTMLElement).onclick = () => renderer.cam.zoomAt(renderer.cam.sw / 2, renderer.cam.sh / 2, 1 / 1.4);
  shell.root.appendChild(zc);

  const hints = new Hints();

  // ---- tools: inspect / place / powers
  const tool = new ToolUI(shell.root, stage, () => renderer.cam.zoom);
  const inspector = new Inspector((id) => renderer.creatures.spriteFrame(id));
  shell.root.appendChild(inspector.el);
  inspector.onFollow = (on) => {
    if (on && inspector.current) { renderer.follow = { ...inspector.current }; renderer.cam.focus(renderer.cam.tx, renderer.cam.ty, Math.max(renderer.cam.zoom, 8)); } else renderer.follow = null;
  };
  inspector.onClose = () => { renderer.follow = null; };
  renderer.onFollowEnd = () => inspector.setFollow(false);
  setInterval(() => { if (inspector.current) send({ t: 'inspect', slot: inspector.current.slot, uid: inspector.current.uid }); }, 250);

  renderer.onPick = (x, y) => {
    const t = tool.tool;
    if (t.kind === 'inspect') send({ t: 'inspect', x, y, zoom: renderer.cam.zoom });
    else if (t.kind === 'spawn') send(t.species !== undefined ? { t: 'spawnSpecies', id: t.species, x, y, n: t.n } : { t: 'spawn', tpl: t.tpl, x, y, n: t.n });
    else send({ t: 'power', id: t.id, x, y, large: t.large });
  };

  // ---- codex
  const codex = new Codex((tpl, n) => { tool.set({ kind: 'spawn', tpl, name: TEMPLATE_BY_ID[tpl].name, n }); shell.closePanels(); });
  codex.species = () => [...renderer.creatures.info.values()]; codex.sprite = (id) => renderer.creatures.spriteFrame(id);
  codex.onPickSpecies = (id, n) => { const info = renderer.creatures.info.get(id); tool.set({ kind: 'spawn', tpl: '', species: id, name: info?.name ?? 'species', n }); shell.closePanels(); };
  shell.addPanel('codex', 'book', 'Codex', codex.el, (open) => { if (open) { codex.open(); codex.clearFresh(); } }, '<b>Codex</b> — every creature you have discovered; place them in the world');

  // ---- powers
  const pw = document.createElement('div'); pw.classList.add('wide');
  pw.innerHTML = `<h3>Powers <span class="sub">Most powers need time running at 1x–20x.</span></h3><div class="pw-size"><span>Scale</span><span class="seg"><button data-l="0" class="on">Small</button><button data-l="1">Large</button></span></div><div class="pw-groups"></div>`;
  let powerLarge = false;
  pw.querySelectorAll<HTMLElement>('.pw-size button').forEach((b) => (b.onclick = () => { powerLarge = b.dataset.l === '1'; pw.querySelectorAll('.pw-size button').forEach((x) => x.classList.toggle('on', x === b)); }));
  const groups: Record<string, string> = { sky: 'From the sky', earth: 'Earth & climate', life: 'Life' };
  for (const gid of Object.keys(groups)) {
    const sec = document.createElement('div'); sec.innerHTML = `<div class="pw-h">${groups[gid]}</div><div class="powers"></div>`; pw.querySelector('.pw-groups')!.appendChild(sec);
    for (const p of POWERS.filter((q) => q.group === gid)) {
      const b = document.createElement('button'); b.className = 'power'; b.innerHTML = `<span class="pico">${icon(p.icon, 20)}</span><span><b>${p.name}</b><i>${p.blurb}</i></span>`;
      b.onclick = () => {
        shell.closePanels();
        if (!p.target) { const v = renderer.cam.view(); send({ t: 'power', id: p.id, x: (v.x0 + v.x1) / 2, y: (v.y0 + v.y1) / 2, large: powerLarge }); return; }
        tool.set({ kind: 'power', id: p.id, name: p.name + (powerLarge ? ' (large)' : ''), radius: p.radius * (powerLarge ? 2.2 : 1), ico: p.icon, large: powerLarge });
      };
      sec.querySelector('.powers')!.appendChild(b);
    }
  }
  shell.addPanel('powers', 'bolt', 'Powers', pw, undefined, '<b>Powers</b> — meteors, volcanoes, floods, ice ages, plagues, blessings');

  // ---- stats & food web
  const statsUi = new Stats(); statsUi.requestWeb = () => send({ t: 'web' });
  shell.addPanel('stats', 'chart', 'Stats', statsUi.el, (open) => statsUi.setVisible(open), '<b>Statistics</b> — populations, food web and chronicle');
  shell.onChronicle = () => statsUi.setChronicle(shell.chronicle);

  // ---- civilization
  const civPanel = new CivPanel(); shell.addPanel('civ', 'city', 'Society', civPanel.el, undefined, '<b>Society</b> — the civilization, its dangers and its history');
  const choiceModal = new ChoiceModal(); choiceModal.onAnswer = (i) => send({ t: 'answer', index: i });
  const endings = new EndingScreen();
  endings.onContinue = () => { send({ t: 'speed', v: 1 }); shell.setSpeed(1, false); };
  endings.onTitle = async () => { await refreshSlots(); title.show(slots, slot); };

  // ---- worlds (save slots)
  const hooks: SlotHooks = {
    newGame: (s, name, biome) => newGame(s, name, biome),
    load: (s) => loadSlot(s),
    saveHere: (s) => requestSave(s, false),
    exportSlot: async (s) => { const m = slots[s - 1], d = await getSlot(s); if (m && d) download(await exportBlob(m, d), `${m.name.replace(/[^\w-]+/g, '_')}.petri`); },
    importInto: async (s, f) => {
      try { const { meta, data } = await importBlob(f); await putSlot({ ...meta, slot: s, savedAt: Date.now() }, data); await refreshSlots(); shell.toast('ok', `Imported “${meta.name}” into slot ${s}`); }
      catch (e) { shell.toast('warn', 'Could not import that file', String((e as Error).message ?? e)); }
    },
    remove: async (s) => { await deleteSlot(s); if (slot === s) slot = 0; await refreshSlots(); },
    playWithoutSaving: () => newGame(0, 'Untitled', 'random'),
    settings: () => shell.togglePanel('settings'),
  };
  const worldList = new SlotList(hooks, 'panel');
  const wp = document.createElement('div'); wp.classList.add('worlds');
  wp.innerHTML = `<h3>Worlds <span class="sub" id="wd-sub"></span></h3><p class="note">Five save slots live in this browser. Export a slot to keep it as a file or move it to another device.</p>`;
  wp.appendChild(worldList.el);
  const toTitle = document.createElement('button'); toTitle.className = 'pbtn'; toTitle.textContent = 'Back to title screen'; toTitle.style.marginTop = '10px';
  toTitle.onclick = async () => { if (slot && inGame) requestSave(slot, true); send({ t: 'speed', v: 1 }); shell.setSpeed(1, false); shell.closePanels(); await refreshSlots(); title.show(slots, slot); };
  wp.appendChild(toTitle);
  shell.addPanel('worlds', 'save', 'Worlds', wp, (open) => { if (open) { refreshSlots(); wp.querySelector('#wd-sub')!.textContent = slot ? `Playing “${slotName}” in slot ${slot}` : 'Not saving — pick a slot to keep this world'; } });

  const title = new TitleScreen(hooks);
  document.body.appendChild(title.el);

  // ---- saving
  let saveToken = 0; const pendingSaves = new Map<number, boolean>();
  function requestSave(target: number, auto: boolean) {
    if (!inGame) return;
    const token = ++saveToken; pendingSaves.set(token, auto); send({ t: 'save', slot: target, token });
  }
  function thumb(): string {
    try {
      const src = renderer.app.renderer.extract.canvas(renderer.app.stage) as HTMLCanvasElement;
      const c = document.createElement('canvas'); c.width = 192; c.height = 108; const x = c.getContext('2d')!;
      const ar = src.width / src.height, tw = 16 / 9; let sw = src.width, sh = src.height, sx = 0, sy = 0;
      if (ar > tw) { sw = src.height * tw; sx = (src.width - sw) / 2; } else { sh = src.width / tw; sy = (src.height - sh) / 2; }
      x.drawImage(src, sx, sy, sw, sh, 0, 0, 192, 108); return c.toDataURL('image/jpeg', 0.72);
    } catch { return ''; }
  }
  async function storeSave(target: number, data: unknown, auto: boolean) {
    const eraIdx = stats?.era?.reached ?? 0;
    const prev = slots[target - 1];
    const name = target === slot ? slotName : prev?.name ?? slotName;
    const meta: SaveMeta = { slot: target, name, thumb: thumb(), playtime: Math.round(playSec), era: eraIdx, eraName: ERAS[eraIdx].name, savedAt: Date.now(), biome: stats?.biome ?? '', seed: 0, species: stats?.species ?? 0 };
    try { await putSlot(meta, data); slot = target; slotName = name; await refreshSlots(); shell.toast('ok', auto ? 'Autosaved' : `Saved to slot ${target}`); }
    catch (e) { shell.toast('warn', 'Could not save', String((e as Error).message ?? e)); }
  }

  // ---- starting / loading
  function resetViews() { choiceModal.hide(); endings.hide(); renderer.creatures.reset(); renderer.follow = null; inspector.close(); statsUi.clear(); tool.set({ kind: 'inspect' }); }
  function newGame(s: number, name: string, biome: string) {
    slot = s; slotName = name; playSec = 0; inGame = true; demo = false; resetViews(); shell.setWorldName(name);
    const b = biome === 'random' ? BIOMES[(Math.random() * BIOMES.length) | 0].id : biome;
    send({ t: 'cfg', config: { encounters: settings.encounters } });
    send({ t: 'init', seed: (Math.random() * 1e9) | 0, biome: b }); send({ t: 'speed', v: 1 }); shell.setSpeed(1, false);
    title.hide(); shell.setBiome(b);
    if (s) setTimeout(() => requestSave(s, true), 2500);
    if (settings.hints && !quickMode) setTimeout(() => hints.welcome(), 900);
  }
  async function loadSlot(s: number) {
    const data = await getSlot(s), meta = slots[s - 1]; if (!data || !meta) { shell.toast('warn', 'That slot is empty'); return; }
    slot = s; slotName = meta.name; playSec = meta.playtime; inGame = true; demo = false; resetViews(); shell.setWorldName(meta.name);
    send({ t: 'cfg', config: { encounters: settings.encounters } });
    send({ t: 'load', data }); send({ t: 'speed', v: 1 }); shell.setSpeed(1, false); title.hide();
  }

  // ---- stats
  let lastEnvBiome = '';
  const roleOf = (g: number[]) => (g[18] >= Math.max(g[21], g[22], g[23], g[20], g[24]) && g[18] > 0.35) || g[19] > 0.4 ? 'producer' : g[22] > 0.4 ? 'predator' : g[21] > 0.4 && g[22] > 0.25 ? 'omnivore' : g[21] > 0.4 ? 'grazer' : g[23] > 0.4 ? 'decomposer' : g[20] > 0.4 ? 'filter feeder' : 'consumer';
  function onStats(s: any) {
    stats = s;
    shell.setEra(s.era.reached, s.era.progress, s.civ ? fmtYear(s.civ.year) : `${s.era.clock >= 10 ? Math.round(s.era.clock).toLocaleString() : s.era.clock.toFixed(2)} million years ago`, s.era.reached < 11 ? s.era.leader : undefined);
    civPanel.update(s.civ); audio.setEra(s.era.reached);
    renderer.settlements.set(s.civ ? { pop: s.civ.pop, tech: s.civ.tech } : null, !!(s.civ?.finished && s.civ.ending && ENDINGS[s.civ.ending]?.wipeCiv));
    if (s.biome !== lastEnvBiome) { lastEnvBiome = s.biome; shell.setBiome(s.biome); shell.setEnv(s.env); }
    const rows = Object.entries(s.counts as Record<string, number>).filter(([, n]) => n > 0).map(([id, pop]) => { const i = renderer.creatures.info.get(+id); return i ? { id: +id, name: i.name, color: i.color, role: roleOf(i.genome), size: 0.12 * Math.pow(250, i.genome[0]), pop } : null; }).filter(Boolean) as any[];
    statsUi.push(rows, s.species, s.extinct);
    rows.sort((a, b) => b.size - a.size || b.pop - a.pop);
    shell.setLife(rows.slice(0, 60), s.species, s.speciesEver);
  }

  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data as any;
    switch (m.t) {
      case 'world': renderer.setWorld(m); audio.setBiome(m.biome); shell.setBiome(m.biome); document.getElementById('boot')?.classList.add('gone'); break;
      case 'frame': renderer.creatures.onFrame(m.data, m.n, m.tick, performance.now()); if (m.events?.length) { const v = renderer.cam.view(); renderer.fx.onEvents(m.events, v); for (const ev of m.events) { if (ev.t === 'boom') audio.boom(); else if (ev.t === 'bolt') audio.bolt(); else if (ev.t === 'glow') audio.shimmer(); else audio.worldEvent(ev, v); } } break;
      case 'species': renderer.creatures.setSpecies(m.list); break;
      case 'stats': onStats(m.stats); break;
      case 'toast': if (title.isOpen || demo) break; shell.toast(m.kind, m.text, m.sub); audio.toast(m.kind); break;
      case 'spawned': shell.toast(m.ok && !m.warn ? 'ok' : 'warn', m.msg); if (m.ok) audio.pop(); break;
      case 'powered': if (!m.ok) shell.toast('warn', m.msg); else if (POWER_BY_ID[m.id] && !POWER_BY_ID[m.id].target) shell.snack(`${m.msg} begins`); break;
      case 'codex': codex.setUnlocked(m.unlocked, m.fresh); if (m.fresh?.length && !demo) shell.toast('codex', `New in the codex: ${m.fresh.map((id: string) => TEMPLATE_BY_ID[id]?.name).filter(Boolean).slice(0, 3).join(', ')}`); break;
      case 'inspect':
        if (m.none) { if (tool.tool.kind === 'inspect') inspector.close(); break; }
        if (!inspector.current || inspector.current.uid !== m.data.uid) { if (m.data.gone) break; inspector.show(m.data.slot, m.data.uid); inspector.setFollow(false); }
        inspector.update(m.data); break;
      case 'web': statsUi.setWeb(m); break;
      case 'savedata': { const auto = pendingSaves.get(m.token) ?? false; pendingSaves.delete(m.token); storeSave(m.slot, m.data, auto); break; }
      case 'choice': if (demo) { send({ t: 'answer', index: 0 }); break; } shell.setSpeed(0, false); shell.closePanels(); choiceModal.show(m); audio.choice(); break;
      case 'resume': shell.setSpeed(m.speed, false); break;
      case 'ending': if (demo) break; shell.setSpeed(0, false); shell.closePanels(); endings.show({ id: m.id, def: m.def, summary: m.summary, choices: m.choices, alive: m.alive, species: m.species, ma: m.ma }); audio.ending(m.def.kind === 'good'); break;
      case 'loaded': shell.setBiome(m.biome); lastEnvBiome = ''; break;
    }
  };

  setInterval(() => {
    shell.setDebug([
      ['fps', renderer.fps.toFixed(0)], ['draw', String(renderer.creatures.visible)],
      ['entities', stats ? String(stats.entities) : '-'], ['model', stats ? stats.mode : '-'], ['tick/s', stats ? stats.tps.toFixed(1) : '-'],
      ['sim ms', stats ? stats.simMs.toFixed(2) : '-'], ['zoom', renderer.cam.zoom.toFixed(1) + 'x'],
      ['js ms', renderer.cpuMs.toFixed(2)], ['gpu', renderer.app.renderer.name],
    ]);
  }, 250);

  // playtime and autosave
  setInterval(() => { if (inGame && !document.hidden) { playSec += 1; hints.tick(sessionSec++, { speed: shell.speed, panelOpen: false, modal: document.querySelector('.choice.open,.ending.open,.title.open,.panel.open') !== null }); } }, 1000);
  setInterval(() => { if (inGame && slot && settings.autosave && !title.el.classList.contains('open')) requestSave(slot, true); }, 120000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && inGame && slot && settings.autosave) requestSave(slot, true); });

  // ---- title screen over a living demo world
  const DEMO = ['grassland', 'reef', 'forest', 'savanna', 'mountains', 'rainforest', 'kelp'];
  function startDemo() {
    demo = true; inGame = false; slot = 0; resetViews();
    const b = DEMO[(Math.random() * DEMO.length) | 0];
    send({ t: 'cfg', config: { encounters: false } }); send({ t: 'init', seed: (Math.random() * 1e9) | 0, biome: b });
    send({ t: 'speed', v: 1000 }); setTimeout(() => { if (demo) send({ t: 'speed', v: 5 }); }, 6000);
  }
  let panDir = 1, lastPan = performance.now();
  const pan = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - lastPan) / 1000); lastPan = now;
    if (title.isOpen && !renderer.follow) { const c = renderer.cam; c.tx += panDir * dt * 3; c.x = c.tx; const hw = c.sw / 2 / c.zoom; if (c.tx > W - hw - 2) panDir = -1; else if (c.tx < hw + 2) panDir = 1; }
    requestAnimationFrame(pan);
  };
  requestAnimationFrame(pan);
  await refreshSlots();
  startDemo();
  title.show(slots, slot);
  document.getElementById('boot')?.classList.add('gone');
  (window as any).petri = { renderer, send, worker, tool, newGame, loadSlot, requestSave, audio };
  const quick = new URLSearchParams(location.search).get('quick');
  if (quick) { demo = false; newGame(0, 'Quick', quick); }
}
boot().catch((e) => { console.error(e); document.querySelector('.boot-sub')!.textContent = 'Could not start: ' + e; });
