// sfc32: tiny, fast, serialisable PRNG. All simulation randomness goes through this
// so a given seed + player inputs always yields the same world.
export class RNG {
  a: number; b: number; c: number; d: number;
  constructor(seed = 1) {
    this.a = 0x9e3779b9; this.b = 0x243f6a88; this.c = 0xb7e15162; this.d = seed >>> 0;
    for (let i = 0; i < 15; i++) this.next();
  }
  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(n: number) { return (this.next() * n) | 0; }
  chance(p: number) { return this.next() < p; }
  /** approx normal(0,1) */
  gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508; }
  pick<T>(arr: readonly T[]): T { return arr[(this.next() * arr.length) | 0]; }
  state() { return [this.a, this.b, this.c, this.d]; }
  setState(s: number[]) { [this.a, this.b, this.c, this.d] = s; }
}

/** stable string hash -> 32-bit seed */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
