import { NG, K_PRODUCER } from '../shared/constants';
import type { RNG } from '../shared/rng';
import type { SpeciesInfo } from '../shared/protocol';
import { distance, kindOf, speciesName } from './genes';
import { hsl2rgbNum } from './color';
import { G } from '../shared/constants';

export const MAX_SPECIES = 4096;
/** Genetic distance (from the species founder) at which a lineage is considered a new species. */
export const SPECIATION_DIST = 0.085;

export interface ExtinctionRecord { id: number; name: string; tick: number; peak: number; }

/** Global registry of every species ever seen in this world-history, across all biomes. */
export class SpeciesRegistry {
  list: SpeciesInfo[] = [];
  founders: Float32Array[] = [];
  count = new Int32Array(MAX_SPECIES); // living individuals across all biomes
  taken = new Set<string>();
  extinctions: ExtinctionRecord[] = [];
  /** species added/changed since the last flush to the renderer */
  dirty = new Set<number>();
  /** hook: called when a brand-new species appears (id) */
  onNew: ((id: number) => void) | null = null;
  onExtinct: ((id: number) => void) | null = null;
  disabled = false; // stop speciation (used by harness tests)

  constructor(private rng: RNG) {}

  create(parent: number, genome: ArrayLike<number>, go: number, tick: number, template?: string, name?: string): number {
    if (this.list.length >= MAX_SPECIES) return parent >= 0 ? parent : 0;
    const g = new Float32Array(NG); for (let i = 0; i < NG; i++) g[i] = genome[go + i];
    const id = this.list.length;
    const col = hsl2rgbNum(g[G.HUE], 0.35 + g[G.SAT] * 0.5, 0.5);
    const info: SpeciesInfo = {
      id, name: name ?? speciesName(g, this.rng, this.taken), parent, born: tick, extinct: 0, genome: Array.from(g), template,
      count: 0, peak: 0, kind: kindOf(g), color: col,
    };
    if (name) this.taken.add(name);
    this.list.push(info); this.founders.push(g); this.dirty.add(id);
    this.onNew?.(id);
    return id;
  }

  /** Decide which species a newborn belongs to: the parent's, or a new one if it drifted far enough. */
  classify(parent: number, genome: ArrayLike<number>, go: number, tick: number): number {
    if (this.disabled) return parent;
    const f = this.founders[parent];
    if (!f) return parent;
    if (distance(genome, f, go, 0) > SPECIATION_DIST) return this.create(parent, genome, go, tick);
    return parent;
  }

  add(id: number, n: number, tick: number) {
    const c = (this.count[id] += n);
    const s = this.list[id];
    if (c > s.peak) s.peak = c;
    if (c <= 0 && n < 0 && !s.extinct) {
      this.count[id] = 0; s.extinct = tick; s.count = 0; this.dirty.add(id);
      this.extinctions.push({ id, name: s.name, tick, peak: s.peak });
      this.onExtinct?.(id);
    } else if (n > 0 && s.extinct) { s.extinct = 0; this.dirty.add(id); }
  }
  isProducer(id: number) { return this.list[id].kind === K_PRODUCER; }
}
