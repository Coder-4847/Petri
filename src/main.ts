import { Renderer } from './render/renderer';
import { Shell } from './ui/shell';
import type { FromWorker } from './shared/protocol';

async function boot() {
  const stage = document.getElementById('stage')!;
  const renderer = new Renderer();
  await renderer.init(stage);

  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  const send = (m: any) => worker.postMessage(m);
  let stats: any = null;

  const shell = new Shell({
    onSpeed: (v) => send({ t: 'speed', v }),
    onBiome: (id) => send({ t: 'biome', id }),
    onStress: (n) => send({ t: 'stress', n }),
  });

  renderer.onViewChange = (v) => send({ t: 'view', ...v });

  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data;
    switch (m.t) {
      case 'world': renderer.setWorld(m as any); shell.setBiome((m as any).biome); document.getElementById('boot')?.classList.add('gone'); break;
      case 'frame': renderer.creatures.onFrame((m as any).data, (m as any).n, (m as any).tick, performance.now()); break;
      case 'species': renderer.creatures.setSpecies((m as any).list); break;
      case 'stats': stats = (m as any).stats; break;
    }
  };

  setInterval(() => {
    shell.setDebug([
      ['fps', renderer.fps.toFixed(0)], ['draw', String(renderer.creatures.visible)],
      ['entities', stats ? String(stats.entities) : '-'], ['tick/s', stats ? stats.tps.toFixed(1) : '-'],
      ['sim ms', stats ? stats.simMs.toFixed(2) : '-'], ['zoom', renderer.cam.zoom.toFixed(1) + 'x'],
      ['js ms', renderer.cpuMs.toFixed(2)], ['gpu', renderer.app.renderer.name],
    ]);
  }, 250);

  send({ t: 'init', seed: (Math.random() * 1e9) | 0, biome: 'reef' });
  send({ t: 'speed', v: 1 });
  (window as any).petri = { renderer, send, worker };
}
boot().catch((e) => { console.error(e); document.querySelector('.boot-sub')!.textContent = 'Could not start: ' + e; });
