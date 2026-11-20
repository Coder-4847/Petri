import { W, H, K_FREE, IS_SOLID } from '../shared/constants';
import type { World } from './world';

/** Phase 1 placeholder step: gentle random wandering. Replaced by the real ecology in Phase 2. */
export function stepWorld(w: World, _events: any[]) {
  w.tick++;
  if (!w.ents) return;
  const e = w.ents, m = w.medium, rng = w.rng;
  for (let i = 0; i < e.hi; i++) {
    if (e.kind[i] === K_FREE) continue;
    e.vx[i] += (rng.next() - 0.5) * 0.06; e.vy[i] += (rng.next() - 0.5) * 0.04;
    const nx = e.x[i] + e.vx[i] * 0.12, ny = e.y[i] + e.vy[i] * 0.12;
    if (nx < 1 || nx > W - 1 || ny < 1 || ny > H - 1 || IS_SOLID[m[(ny | 0) * W + (nx | 0)]]) { e.vx[i] = -e.vx[i]; e.vy[i] = -e.vy[i]; continue; }
    e.x[i] = nx; e.y[i] = ny;
    if (Math.abs(e.vx[i]) > 0.1) e.facing[i] = e.vx[i] < 0 ? -1 : 1;
    e.anim[i] += 0.2; if (e.anim[i] >= 4) e.anim[i] -= 4;
  }
}
