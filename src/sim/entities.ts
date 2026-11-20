import { NG, K_FREE } from '../shared/constants';

/**
 * Struct-of-arrays entity store. One instance per world.
 * Entities are addressed by slot index; `uid` makes a (slot, uid) pair a stable handle
 * that survives slot reuse.
 */
export class EntityStore {
  readonly cap: number;
  hi = 0; // high-water mark: slots >= hi have never been used
  alive = 0;
  private free: number[] = [];
  nextUid = 1;

  // kinematics
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array;
  // vitals
  energy: Float32Array; health: Float32Array; age: Float32Array; size: Float32Array; // size = current body length (cells)
  breath: Float32Array; stress: Float32Array; cd: Float32Array; hurt: Float32Array;
  // identity & behaviour
  kind: Uint8Array; state: Uint8Array; flags: Uint8Array; facing: Int8Array;
  species: Int32Array; uid: Int32Array; target: Int32Array; targetUid: Int32Array;
  parent: Int32Array; // parent uid (for lineage inspection)
  gen: Uint16Array;
  anim: Float32Array; // animation phase accumulator
  // cached derived traits (see traits.ts)
  maxE: Float32Array; bmr: Float32Array; spSwim: Float32Array; spWalk: Float32Array; spFly: Float32Array;
  sense: Float32Array; atk: Float32Array; def: Float32Array; maxSize: Float32Array; life: Float32Array;
  genome: Float32Array;

  constructor(cap: number) {
    this.cap = cap;
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f();
    this.energy = f(); this.health = f(); this.age = f(); this.size = f();
    this.breath = f(); this.stress = f(); this.cd = f(); this.hurt = f();
    this.kind = new Uint8Array(cap); this.state = new Uint8Array(cap); this.flags = new Uint8Array(cap); this.facing = new Int8Array(cap);
    this.species = new Int32Array(cap); this.uid = new Int32Array(cap);
    this.target = new Int32Array(cap).fill(-1); this.targetUid = new Int32Array(cap);
    this.parent = new Int32Array(cap); this.gen = new Uint16Array(cap);
    this.anim = f();
    this.maxE = f(); this.bmr = f(); this.spSwim = f(); this.spWalk = f(); this.spFly = f();
    this.sense = f(); this.atk = f(); this.def = f(); this.maxSize = f(); this.life = f();
    this.genome = new Float32Array(cap * NG);
  }

  /** Allocate a slot; returns -1 when full. */
  alloc(): number {
    let s: number;
    if (this.free.length) s = this.free.pop()!;
    else if (this.hi < this.cap) s = this.hi++;
    else return -1;
    this.alive++;
    this.uid[s] = this.nextUid++;
    this.target[s] = -1; this.flags[s] = 0; this.state[s] = 0; this.hurt[s] = 0; this.cd[s] = 0;
    return s;
  }
  release(s: number) {
    if (this.kind[s] === K_FREE) return;
    this.kind[s] = K_FREE; this.alive--; this.free.push(s);
  }
  /** True if handle (slot, uid) still refers to the same live entity. */
  valid(s: number, uid: number) { return s >= 0 && s < this.hi && this.kind[s] !== K_FREE && this.uid[s] === uid; }

  clear() {
    this.hi = 0; this.alive = 0; this.free.length = 0; this.kind.fill(0);
  }
}

/** Uniform spatial hash (linked cells) rebuilt every tick for neighbour queries. */
export class SpatialHash {
  readonly cs: number; readonly gw: number; readonly gh: number; readonly inv: number;
  head: Int32Array; next: Int32Array;
  constructor(w: number, h: number, cellSize: number, cap: number) {
    this.cs = cellSize; this.inv = 1 / cellSize;
    this.gw = Math.ceil(w / cellSize); this.gh = Math.ceil(h / cellSize);
    this.head = new Int32Array(this.gw * this.gh); this.next = new Int32Array(cap);
  }
  rebuild(e: EntityStore) {
    this.head.fill(-1);
    const { gw, gh, inv } = this;
    for (let i = 0; i < e.hi; i++) {
      if (e.kind[i] === K_FREE) continue;
      let cx = (e.x[i] * inv) | 0, cy = (e.y[i] * inv) | 0;
      if (cx < 0) cx = 0; else if (cx >= gw) cx = gw - 1;
      if (cy < 0) cy = 0; else if (cy >= gh) cy = gh - 1;
      const c = cy * gw + cx;
      this.next[i] = this.head[c]; this.head[c] = i;
    }
  }
}
