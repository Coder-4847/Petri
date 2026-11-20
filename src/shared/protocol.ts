// Messages exchanged between the main thread (render/UI) and the simulation worker.
import type { Env } from '../data/biomes';

export const FRAME_STRIDE = 8;
// Frame entry layout (Float32):
// 0 slot | 1 uid | 2 x | 3 y | 4 species | 5 packed(flags) | 6 size | 7 angle
// packed: bits 0-3 anim frame, bit 4 facing-left, bits 5-6 kind, bit 7 hurt flash,
//         bit 8 infected, bits 9-12 health(0..15), bits 13-14 state-class
export const P_FACING = 16, P_KIND_SHIFT = 5, P_HURT = 128, P_INFECT = 256, P_HP_SHIFT = 9, P_STATE_SHIFT = 13;

export interface SpeciesInfo {
  id: number;
  name: string;
  parent: number; // species id of ancestor, -1 for none
  born: number; // tick
  extinct: number; // tick of extinction, 0 if alive
  genome: number[]; // founder genome (used for sprite generation)
  template?: string; // template id when spawned from the codex
  count: number;
  peak: number;
  kind: number; // K_PRODUCER / K_ANIMAL
  color: number; // representative colour
}

export interface WorldStats {
  tick: number;
  biome: string;
  entities: number;
  species: number;
  counts: Record<number, number>;
  simMs: number;
  tps: number;
  env: Env;
}

export type ToWorker =
  | { t: 'init'; seed: number; biome: string }
  | { t: 'speed'; v: number }
  | { t: 'biome'; id: string }
  | { t: 'view'; x0: number; y0: number; x1: number; y1: number; zoom: number }
  | { t: 'stress'; n: number }
  | { t: 'env'; key: keyof Env; value: number }
  | { t: string; [k: string]: any };

export interface FrameMsg {
  t: 'frame';
  tick: number;
  data: Float32Array;
  n: number;
  events: any[];
}
export type FromWorker =
  | { t: 'ready' }
  | { t: 'world'; biome: string; medium: Uint8Array; surfaceY: Int16Array; waterTop: Int16Array; vents: { x: number; y: number }[]; light: Uint8Array; version: number; env: Env }
  | FrameMsg
  | { t: 'species'; list: SpeciesInfo[] }
  | { t: 'stats'; stats: WorldStats }
  | { t: string; [k: string]: any };
