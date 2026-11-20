import { W, H, TICK_RATE, K_FREE } from '../shared/constants';
import { FRAME_STRIDE, type ToWorker } from '../shared/protocol';
import { BIOMES, BIOME_INDEX } from '../data/biomes';
import { ERAS } from '../data/eras';
import { World } from './world';
import { stepWorld, cosmeticStep, type Ctx } from './ecology';
import { SpeciesRegistry } from './species';
import { RNG } from '../shared/rng';
import { seedMicrobes } from './seed';
import { collapseWorld, expandWorld, stepCoarse, COARSE_STEP, ensureCoarse, maybeDisperse } from './coarse';
import { radiate, livingIn } from './radiation';
import { newEraState, evaluateEras, type EraState } from './eras';
import { placeTemplate, applyPower, pickEntity, inspect, foodWeb, unlockedTemplates, scanDiscoveries } from './tools';
import { runEncounter } from './encounters';
import { newCiv, startCiv, stepCiv, answerCiv, summary as civSummary, civEra, YEARS_PER_TICK, type CivState } from './civ';
import { countThinkers, applyEnding, civPressure, civProgress } from './civfx';
import { ENDINGS } from '../data/civ';
import { snapshot, restore, type SaveData } from './save';

type Post = (msg: any, transfer?: Transferable[]) => void;
export interface Timed { tick: number; world: number; key: string; delta: number }

/**
 * The simulation host (runs inside a Web Worker).
 *
 * Every biome exists from the start. The active biome is simulated as individuals (full model) at
 * normal speeds and as populations (coarse model, with cosmetic individuals drawn for show) in
 * time-lapse / deep time. Biomes you are not looking at always run the coarse model, so the whole
 * planet keeps evolving. Switching speed or biome collapses / rebuilds individuals as needed.
 */
export class Sim {
  worlds: World[] = [];
  active = 0;
  speed = 1; // 0 paused · 1 · 5 · 20 (individuals) · 100 · 1000 (deep time, populations)
  acc = 0; coarseAcc = 0; cosmeticAcc = 0;
  last = 0;
  seed = 1;
  view = { x0: 0, y0: 0, x1: W, y1: H, zoom: 4 };
  rng = new RNG(1);
  ctx: Ctx = { sp: new SpeciesRegistry(this.rng), events: [] };
  era: EraState = newEraState();
  simMs = 0; tps = 0; tpsCount = 0; tpsT = 0;
  lastFrame = 0; lastStats = 0; lastEra = 0; lastToast = 0; lastCosmetic = 0;
  sentTerrain = -1;
  debt: number[] = [];
  totalTicks = 0; // simulated ticks in the active biome since the start
  newSpecies: number[] = []; extinctNames: { name: string; peak: number }[] = [];
  history: { t: number; kind: string; text: string }[] = [];
  started = false;
  /** codex templates the player has discovered (per save) */
  found = new Set<string>();
  timed: Timed[] = [];
  config = { encounters: true };
  civ: CivState = newCiv(this.rng); civTicks = 0; thinkers = 0; lastCiv = 0; lastPressure = 0; resumeSpeed = 1;
  codexDirty = true; lastCodex = 0; nextEncounter = 0; lastScan = 0; lastCodexKey = '';

  constructor(public post: Post) {}

  get world(): World { return this.worlds[this.active]; }

  /** Create every biome and seed microbes everywhere. */
  start(seed: number, biome: string) {
    this.seed = seed; this.rng = new RNG(seed);
    this.ctx = { sp: new SpeciesRegistry(this.rng), events: [], era: undefined };
    this.era = newEraState(); this.ctx.era = this.era;
    this.hookRegistry(); this.civ = newCiv(this.rng); this.civTicks = 0; this.thinkers = 0; this.found = new Set(); this.timed = []; this.codexDirty = true; this.history = [];
    this.worlds = BIOMES.map((_, i) => { const w = new World(i, seed); w.ctxRef = this.ctx; return w; });
    this.ctx.worlds = this.worlds;
    this.active = BIOME_INDEX[biome] ?? 0;
    this.debt = this.worlds.map(() => 0);
    for (let i = 0; i < this.worlds.length; i++) seedMicrobes(this.worlds[i], this.ctx, i === this.active);
    this.newSpecies.length = 0;
    this.sentTerrain = -1; this.totalTicks = 0; this.started = true; this.last = performance.now();
  }

  hookRegistry() {
    this.ctx.sp.onNew = (id) => this.newSpecies.push(id);
    this.ctx.sp.onExtinct = (id) => { const s = this.ctx.sp.list[id]; this.extinctNames.push({ name: s.name, peak: s.peak }); };
  }

  /** Build empty worlds (no seeding) so a save can be poured into them. */
  restoring(seed: number) {
    this.seed = seed; this.rng = new RNG(seed);
    this.ctx = { sp: new SpeciesRegistry(this.rng), events: [] }; this.ctx.era = this.era;
    this.worlds = BIOMES.map((_, i) => { const w = new World(i, seed); w.ctxRef = this.ctx; return w; });
    this.ctx.worlds = this.worlds; this.civ = newCiv(this.rng); this.civTicks = 0; this.newSpecies.length = 0; this.extinctNames.length = 0; this.started = true; this.last = performance.now();
  }

  /** Nudge an environment value for a while, then put it back. */
  timedEnv(key: string, delta: number, ticks: number) {
    const w = this.world; const before = (w.env as any)[key] as number; const next = Math.max(0, Math.min(1, before + delta));
    (w.env as any)[key] = next; w.recomputeLight(); w.terrainVersion++;
    this.timed.push({ tick: w.tick + ticks, world: w.idx, key, delta: next - before });
  }
  private runTimed() {
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i], w = this.worlds[t.world];
      if (w.tick >= t.tick) { (w.env as any)[t.key] = Math.max(0, Math.min(1, (w.env as any)[t.key] - t.delta)); w.recomputeLight(); w.terrainVersion++; this.timed.splice(i, 1); }
    }
  }

  private sendCodex(force = false) {
    const list = unlockedTemplates(this.ctx, this.era.reached, this.found);
    const key = list.join(',');
    if (!force && key === this.lastCodexKey) return;
    const fresh = this.lastCodexKey ? list.filter((id) => !this.lastCodexKey.split(',').includes(id)) : [];
    this.lastCodexKey = key; this.post({ t: 'codex', unlocked: list, fresh });
  }

  handle(m: ToWorker) {
    switch (m.t) {
      case 'init': this.start(m.seed, m.biome); break;
      case 'speed': this.speed = m.v; break;
      case 'biome': this.switchBiome(m.id); break;
      case 'view': this.view = { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1, zoom: m.zoom }; break;
      case 'spawn': { const w = this.world; const r = placeTemplate(w, this.ctx, (m as any).tpl, (m as any).x, (m as any).y, (m as any).n ?? 1); this.post({ t: 'spawned', ...r, tpl: (m as any).tpl }); break; }
      case 'power': { const r = applyPower(this.world, this.ctx, (m as any).id, (m as any).x, (m as any).y); this.post({ t: 'powered', ...r, id: (m as any).id }); break; }
      case 'inspect': {
        const mm = m as any; let slot = mm.slot, uid = mm.uid;
        if (mm.x !== undefined) { const p = pickEntity(this.world, mm.x, mm.y, mm.zoom ?? 4); if (!p) { this.post({ t: 'inspect', none: true }); break; } slot = p.slot; uid = p.uid; }
        this.post({ t: 'inspect', data: inspect(this.world, this.ctx, slot, uid) }); break;
      }
      case 'web': this.post({ t: 'web', ...foodWeb(this.world, this.ctx), biome: this.world.def.id }); break;
      case 'dev': { // QA helpers (not wired to the UI): jump to the civilization stage
        const mm = m as any;
        if (mm.what === 'civ') { this.era.reached = Math.max(this.era.reached, 8); const w = this.world; let x = 100; while (x < 380 && w.waterTop[x] >= 0) x++; placeTemplate(w, this.ctx, 'hominid', x, w.surfaceY[x] - 2, 14); }
        if (mm.what === 'civstate') Object.assign(this.civ, mm.patch);
        break;
      }
      case 'answer': this.answerChoice((m as any).index ?? 0); break;
      case 'cfg': this.config = { ...this.config, ...(m as any).config }; break;
      case 'save': this.post({ t: 'savedata', data: snapshot(this), slot: (m as any).slot, token: (m as any).token }); break;
      case 'load': restore(this, (m as any).data as SaveData); this.lastCodexKey = ''; this.codexDirty = true; this.post({ t: 'loaded', biome: this.world.def.id }); break;
      case 'env': { const w = this.world; (w.env as any)[m.key] = m.value; w.recomputeLight(); w.terrainVersion++; break; }
    }
  }

  switchBiome(id: string) {
    const i = BIOME_INDEX[id]; if (i === undefined || i === this.active || !this.started) return;
    const old = this.world;
    if (old.mode === 'full') collapseWorld(old, this.ctx); else this.clearCosmetic(old);
    this.active = i; this.sentTerrain = -1; if (this.world.dust > 0) this.world.recomputeLight();
    const nw = this.world; if (nw.mode === 'coarse' && this.speed < 100) expandWorld(nw, this.ctx, false); else if (nw.mode === 'coarse') expandWorld(nw, this.ctx, true, 1800);
  }

  private clearCosmetic(w: World) { if (!w.ents) return; for (let i = 0; i < w.ents.hi; i++) if (w.ents.kind[i] !== K_FREE) w.ents.release(i); }

  /** Make the active world's model match the current speed. */
  private syncMode(w: World) {
    const wantCoarse = this.speed >= 100;
    if (wantCoarse && w.mode === 'full') { collapseWorld(w, this.ctx); expandWorld(w, this.ctx, true, 1800); this.lastCosmetic = performance.now(); }
    else if (!wantCoarse && w.mode === 'coarse') { expandWorld(w, this.ctx, false); }
  }

  /** Called from the worker's timer. */
  loop() {
    if (!this.started) return;
    const now = performance.now();
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.25) dt = 0.25;
    const w = this.world;
    this.syncMode(w);
    let activeTicks = 0;
    const budget = now + 10;
    if (this.speed > 0) {
      if (w.mode === 'full') {
        this.acc += dt * TICK_RATE * this.speed;
        let n = 0;
        while (this.acc >= 1 && performance.now() < budget) {
          const t0 = performance.now();
          stepWorld(w, this.ctx);
          this.simMs = this.simMs * 0.95 + (performance.now() - t0) * 0.05;
          this.acc -= 1; n++; activeTicks++;
          if (w.tick % 25 === 0) { radiate(w, this.ctx, 0.5, this.era.reached); maybeDisperse(w, this.ctx, 0.5); }
        }
        if (this.acc > 4) this.acc = 4;
        this.tpsCount += n;
      } else {
        // population model: one coarse step = COARSE_STEP ticks of simulated time
        this.coarseAcc += dt * TICK_RATE * this.speed / COARSE_STEP;
        let n = 0;
        while (this.coarseAcc >= 1 && performance.now() < budget) {
          const t0 = performance.now();
          stepCoarse(w, this.ctx, 1);
          this.simMs = this.simMs * 0.95 + (performance.now() - t0) * 0.05;
          this.coarseAcc -= 1; n++; activeTicks += COARSE_STEP;
        }
        if (this.coarseAcc > 8) this.coarseAcc = 8;
        this.tpsCount += n * COARSE_STEP;
        // cosmetic individuals drift in real time and are refreshed from the populations
        this.cosmeticAcc += dt * TICK_RATE;
        let c = 0; while (this.cosmeticAcc >= 1 && c++ < 4) { cosmeticStep(w); this.cosmeticAcc -= 1; }
        if (now - this.lastCosmetic > 1400) { expandWorld(w, this.ctx, true, 1800); this.lastCosmetic = now; }
      }
      this.totalTicks += activeTicks; this.civTicks += activeTicks;
      this.catchUpInactive(activeTicks, now + 14);
    }
    if (now - this.tpsT > 1000) { this.tps = this.tpsCount * 1000 / (now - this.tpsT); this.tpsCount = 0; this.tpsT = now; }
    if (now - this.lastEra > 1000) { this.lastEra = now; this.updateEra(); this.runTimed(); this.updateCiv(now); }
    if (this.civ.active && !this.civ.pending && this.civTicks > 0) this.advanceCiv();
    if (now - this.lastScan > 4000) { this.lastScan = now; const fresh = scanDiscoveries(this.ctx, this.found); if (fresh.length) this.codexDirty = true; this.sendCodex(this.codexDirty); this.codexDirty = false; }
    if (this.config.encounters && this.speed > 0 && this.speed <= 20 && w.mode === 'full') {
      if (!this.nextEncounter) this.nextEncounter = now + 60000 + this.rng.next() * 60000;
      else if (now > this.nextEncounter) { this.nextEncounter = now + (70000 + this.rng.next() * 90000) / Math.sqrt(this.speed); runEncounter(this); }
    }
    if (now - this.lastFrame > 30) { this.lastFrame = now; this.sendFrame(w); }
    if (now - this.lastStats > 500) { this.lastStats = now; this.sendStats(w); this.flushNotices(now); }
  }

  /** Biomes you aren't watching keep evolving at reduced fidelity (round robin, small time budget). */
  private catchUpInactive(ticks: number, until: number) {
    if (ticks <= 0) return;
    const n = this.worlds.length;
    for (let i = 0; i < n; i++) if (i !== this.active) this.debt[i] = Math.min(6, this.debt[i] + ticks / COARSE_STEP);
    for (let guard = 0; guard < 40 && performance.now() < until; guard++) {
      let bi = -1, bd = 1;
      for (let i = 0; i < n; i++) if (i !== this.active && this.debt[i] >= bd) { bd = this.debt[i]; bi = i; }
      if (bi < 0) break;
      stepCoarse(this.worlds[bi], this.ctx, 1); this.debt[bi] -= 1;
    }
  }

  /** Once per second: start civilization when thinkers exist, keep eras in sync, apply slow feedback on the world. */
  private updateCiv(now: number) {
    const c = this.civ; const th = countThinkers(this);
    this.thinkers = th.n;
    if (!c.started && this.era.reached >= 8 && th.n >= 8) {
      startCiv(c, th.best); this.history.push({ t: this.totalTicks, kind: 'civ', text: `${th.best} begin to farm and settle` });
      this.post({ t: 'toast', kind: 'era', text: 'Civilization dawns', sub: `${th.best} are learning to farm, build and remember.` });
    }
    if (c.active || c.finished) {
      const before = this.era.reached, e = Math.max(this.era.reached, civEra(c));
      this.era.reached = e; this.era.progress = civProgress(c);
      if (e > before) { this.era.history.push({ era: e, tick: this.totalTicks }); this.history.push({ t: this.totalTicks, kind: 'era', text: ERAS[e].name }); this.post({ t: 'toast', kind: 'era', text: `A new era dawns: ${ERAS[e].name}`, sub: ERAS[e].blurb }); }
    }
    if (c.active && now - this.lastPressure > 2000) { this.lastPressure = now; civPressure(this, c); for (const w of this.worlds) if (w.dust > 0 && w !== this.world) w.dust = Math.max(0, w.dust - 0.02); }
  }

  /** Run the civilization for the years that have passed since last time, and surface its events. */
  private advanceCiv() {
    const years = this.civTicks * YEARS_PER_TICK; this.civTicks = 0;
    const evs = stepCiv(this.civ, this.rng, years, this.thinkers);
    this.handleCivEvents(evs);
  }
  private handleCivEvents(evs: ReturnType<typeof stepCiv>) {
    for (const ev of evs) {
      if (ev.t === 'note') this.post({ t: 'toast', kind: ev.kind === 'bad' ? 'extinct' : ev.kind === 'good' ? 'ok' : 'event', text: ev.text });
      else if (ev.t === 'choice') { this.resumeSpeed = this.speed || 1; this.speed = 0; this.post({ ...ev, year: Math.round(this.civ.year) }); }
      else if (ev.t === 'ending') {
        const def = ENDINGS[ev.id]; applyEnding(this, def); this.resumeSpeed = this.speed || 1; this.speed = 0;
        this.history.push({ t: this.totalTicks, kind: 'ending', text: def.title });
        this.post({ t: 'ending', id: ev.id, def, summary: civSummary(this.civ), choices: this.civ.choices.slice(-12), species: this.ctx.sp.list.length, alive: this.liveSpecies() });
      }
    }
  }
  private liveSpecies() { const sp = this.ctx.sp; let n = 0; for (let i = 0; i < sp.list.length; i++) if (sp.count[i] > 0) n++; return n; }
  private answerChoice(index: number) {
    if (!this.civ.pending) return;
    this.handleCivEvents(answerCiv(this.civ, this.rng, index));
    if (this.civ.ending) { this.handleCivEvents([{ t: 'ending', id: this.civ.ending }]); this.civ.finished = true; this.civ.active = false; return; }
    this.speed = this.resumeSpeed; this.post({ t: 'resume', speed: this.speed });
  }

  private updateEra() {
    const before = this.era.reached;
    const { advanced } = evaluateEras(this.era, this.ctx.sp, this.totalTicks);
    if (advanced) {
      for (let e = before + 1; e <= this.era.reached; e++) {
        this.post({ t: 'toast', kind: 'era', text: `A new era dawns: ${ERAS[e].name}`, sub: ERAS[e].blurb });
        this.history.push({ t: this.totalTicks, kind: 'era', text: ERAS[e].name });
      }
    }
  }

  /** Turn speciation / extinction / radiation events into a few calm notifications. */
  private flushNotices(now: number) {
    const sp = this.ctx.sp;
    for (const ev of this.ctx.events.splice(0)) if (ev.t === 'radiation') { const s = sp.list[ev.id]; this.history.push({ t: this.totalTicks, kind: 'radiation', text: s.name }); }
    if (now - this.lastToast < 2500) return;
    if (this.newSpecies.length) {
      const ids = this.newSpecies.splice(0);
      // headline the most striking newcomer (largest body)
      let best = ids[0], bs = -1; for (const id of ids) { const g = sp.founders[id]; const sz = 0.12 * Math.pow(250, g[0]); if (sz > bs) { bs = sz; best = id; } }
      const s = sp.list[best];
      this.post({ t: 'toast', kind: 'species', text: ids.length > 1 ? `${ids.length} new species — most notable: ${s.name}` : `New species: ${s.name}`, id: best });
      this.lastToast = now;
    } else if (this.extinctNames.length) {
      const big = this.extinctNames.filter((x) => x.peak >= 40);
      const ex = this.extinctNames.splice(0);
      if (big.length) { this.post({ t: 'toast', kind: 'extinct', text: `Extinct: ${big[0].name}${big.length > 1 ? ` and ${big.length - 1} more` : ''}` }); this.lastToast = now; }
      void ex;
    }
  }

  sendFrame(w: World) {
    if (this.sentTerrain !== w.terrainVersion) {
      this.sentTerrain = w.terrainVersion;
      this.post({ t: 'world', biome: w.def.id, medium: w.medium.slice(), surfaceY: w.surfaceY, waterTop: w.waterTop, vents: w.vents, light: w.light.slice(), version: w.terrainVersion, env: { ...w.env } });
    }
    const sp = this.ctx.sp;
    if (sp.dirty.size) { const list = [...sp.dirty].map((id) => sp.list[id]); sp.dirty.clear(); this.post({ t: 'species', list }); }
    if (!w.ents) { this.post({ t: 'frame', tick: w.tick, data: new Float32Array(0), n: 0, events: [] }); return; }
    const e = w.ents, v = this.view;
    const mx = 6, x0 = v.x0 - mx, x1 = v.x1 + mx, y0 = v.y0 - mx, y1 = v.y1 + mx;
    let n = 0;
    const out = new Float32Array(e.alive * FRAME_STRIDE + FRAME_STRIDE);
    for (let i = 0; i < e.hi; i++) {
      const k = e.kind[i]; if (k === K_FREE) continue;
      const x = e.x[i], y = e.y[i];
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const o = n * FRAME_STRIDE;
      out[o] = i; out[o + 1] = e.uid[i]; out[o + 2] = x; out[o + 3] = y; out[o + 4] = e.species[i];
      const hp = k === 3 ? Math.max(0, Math.min(15, ((e.energy[i] / Math.max(0.01, e.maxE[i])) * 15) | 0)) : Math.max(0, Math.min(15, (e.health[i] * 15) | 0));
      out[o + 5] = ((e.anim[i] | 0) & 15) | (e.facing[i] < 0 ? 16 : 0) | (k << 5) | (e.hurt[i] > 0 ? 128 : 0) | (e.flags[i] & 1 ? 256 : 0) | (hp << 9) | ((e.state[i] & 7) << 13);
      out[o + 6] = e.size[i]; out[o + 7] = Math.atan2(e.vy[i], Math.abs(e.vx[i]) + 0.001) * 0.6 * (e.facing[i] < 0 ? -1 : 1);
      n++;
    }
    const events = w.mode === 'full' ? this.ctx.events.filter((x) => x.t !== 'radiation') : [];
    this.post({ t: 'frame', tick: w.tick, data: out.subarray(0, n * FRAME_STRIDE), n, events }, [out.buffer]);
  }

  sendStats(w: World) {
    const pops: Record<number, number> = {};
    for (const l of livingIn(w, this.ctx)) pops[l.id] = Math.round(l.pop);
    let ents = 0; for (const l of Object.values(pops)) ents += l;
    const sp = this.ctx.sp; let alive = 0, ever = sp.list.length; for (let i = 0; i < ever; i++) if (sp.count[i] > 0) alive++;
    ensureCoarse(w);
    this.post({ t: 'stats', stats: { tick: this.totalTicks, biome: w.def.id, mode: w.mode, entities: ents, species: alive, speciesEver: ever, counts: pops, simMs: this.simMs, tps: this.tps, env: { ...w.env },
      civ: this.civ.started ? civSummary(this.civ) : null, era: { reached: this.era.reached, progress: this.era.progress, clock: this.era.clock, leader: this.era.leader } } });
  }
}
