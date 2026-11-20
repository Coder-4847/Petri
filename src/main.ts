import { Renderer } from './render/renderer';
import { Shell } from './ui/shell';
import { settings } from './ui/settings';
import type { FromWorker } from './shared/protocol';

async function boot() {
  if (location.hash === '#gallery') { const { showGallery } = await import('./ui/gallery'); showGallery(); return; }
  const stage = document.getElementById('stage')!;
  const renderer = new Renderer();
  await renderer.init(stage);

  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  const send = (m: any) => worker.postMessage(m);
  let stats: any = null;

  const shell = new Shell({
    onSpeed: (v) => send({ t: 'speed', v }),
    onBiome: (id) => send({ t: 'biome', id }),
    onEnv: (key, value) => send({ t: 'env', key, value }),
    onSettings: () => renderer.setGore(settings.gore),
  });

  renderer.onViewChange = (v) => send({ t: 'view', ...v });
  renderer.setGore(settings.gore);

  const roleOf = (g: number[]) => (g[18] >= Math.max(g[21], g[22], g[23], g[20], g[24]) && g[18] > 0.35) || g[19] > 0.4 ? 'producer' : g[22] > 0.4 ? 'predator' : g[21] > 0.4 && g[22] > 0.25 ? 'omnivore' : g[21] > 0.4 ? 'grazer' : g[23] > 0.4 ? 'decomposer' : g[20] > 0.4 ? 'filter feeder' : 'consumer';
  let lastEnvBiome = '';
  function onStats(s: any) {
    stats = s;
    shell.setEra(s.era.reached, s.era.progress, `${s.era.clock >= 10 ? Math.round(s.era.clock).toLocaleString() : s.era.clock.toFixed(2)} Ma`);
    if (s.biome !== lastEnvBiome) { lastEnvBiome = s.biome; shell.setBiome(s.biome); shell.setEnv(s.env); }
    const rows = Object.entries(s.counts as Record<string, number>).filter(([, n]) => n > 0).map(([id, pop]) => { const i = renderer.creatures.info.get(+id); return i ? { id: +id, name: i.name, color: i.color, role: roleOf(i.genome), size: 0.12 * Math.pow(250, i.genome[0]), pop } : null; }).filter(Boolean) as any[];
    rows.sort((a, b) => b.size - a.size || b.pop - a.pop);
    shell.setLife(rows.slice(0, 60), s.species, s.speciesEver);
  }

  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data;
    switch (m.t) {
      case 'world': renderer.setWorld(m as any); shell.setBiome((m as any).biome); document.getElementById('boot')?.classList.add('gone'); break;
      case 'frame': renderer.creatures.onFrame((m as any).data, (m as any).n, (m as any).tick, performance.now()); if ((m as any).events?.length) renderer.fx.onEvents((m as any).events, renderer.cam.view()); break;
      case 'species': renderer.creatures.setSpecies((m as any).list); break;
      case 'stats': onStats((m as any).stats); break;
      case 'toast': shell.toast((m as any).kind, (m as any).text, (m as any).sub); break;
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

  send({ t: 'init', seed: (Math.random() * 1e9) | 0, biome: 'reef' });
  send({ t: 'speed', v: 1 });
  (window as any).petri = { renderer, send, worker };
}
boot().catch((e) => { console.error(e); document.querySelector('.boot-sub')!.textContent = 'Could not start: ' + e; });
