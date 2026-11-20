// Drive the real Sim host (as the worker does) in Node and print what the renderer would see.
//   npx tsx tools/simtest.ts [biome] [speed] [seconds]
import { Sim } from '../src/sim/sim';
const [biome = 'swamp', speedArg = '1000', secsArg = '20'] = process.argv.slice(2);
const toasts: string[] = []; let stats: any = null, frames = 0, lastN = 0;
const sim = new Sim((m) => { if (m.t === 'toast') toasts.push(m.text); else if (m.t === 'stats') stats = m.stats; else if (m.t === 'frame') { frames++; lastN = m.n; } });
sim.handle({ t: 'init', seed: 11, biome } as any); sim.handle({ t: 'speed', v: +speedArg } as any);
const t0 = Date.now(); let nextLog = 0;
while (Date.now() - t0 < +secsArg * 1000) {
  sim.loop();
  const el = (Date.now() - t0) / 1000;
  if (el >= nextLog && stats) { nextLog += +secsArg / 8; console.log(`t=${el.toFixed(1)}s model=${stats.mode} ents=${stats.entities} species(alive)=${stats.species} ever=${stats.speciesEver} era=${stats.era.reached} ${(stats.era.progress * 100) | 0}% frameN=${lastN} tps=${stats.tps.toFixed(0)}`); }
}
console.log('toasts:', toasts.slice(-6).join(' | '));
