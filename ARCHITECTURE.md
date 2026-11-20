# Petri — Architecture

Petri is a browser evolution sandbox: a side-view ecosystem simulation rendered in pixel art, from bacteria to civilisation.

```
src/
  shared/    constants (world size, mediums, GENES), RNG, worker<->main protocol
  data/      static content: biomes, eras (later: creature templates, god powers, endings)
  sim/       the simulation — pure TypeScript, runs inside a Web Worker, no DOM access
  render/    PixiJS v8 renderer — camera, terrain, water shader, parallax, particles, creature atlas
  ui/        DOM shell (top bar, dock, panels, debug overlay)
  audio/     procedural WebAudio (Phase 8)
  save/      IndexedDB save slots (Phase 6)
tools/       headless Node harness for tuning the simulation
```

## Threads

```
 main thread                               worker (sim/worker.ts)
 ───────────                               ─────────────────────
 UI + Pixi renderer   ── commands ──────▶  Sim: fixed 20 ticks/s accumulator
 (60 fps, interpolates) ◀── frames ──────  (speed multiplies ticks, never dt)
                        ◀── world/species/stats
```

* The sim advances in **fixed ticks** (`TICK_RATE = 20`). Speed only changes how many ticks run per wall-second,
  so the rules never change with speed. All randomness uses a seeded, serialisable `sfc32` RNG (`shared/rng.ts`).
* The worker posts **snapshots** (~30 Hz): a transferable `Float32Array` with `FRAME_STRIDE = 8` floats per visible
  creature (see `shared/protocol.ts`). The renderer interpolates positions between the last two snapshots.
* The renderer tells the worker which rectangle it can see (`view` message) so only visible entities are shipped.

## World model

Each biome is a **side-view cross-section** of `W×H = 384×192` cells. `medium[]` (Uint8) holds the material of each cell:
air, three kinds of water, soil, rock, sand, mud, ice, lava, snow, basalt. Gravity, buoyancy, swimming, flying,
drowning and falling all follow from which medium a creature is in. Terrain comes from `sim/terrain.ts`
(seeded noise + per-biome feature recipes in `data/biomes.ts`). Derived per-cell data: `light` (attenuated by water
depth and blocked by ground) and `roof` (cave detection). Coarse 8×8 fields (`nutrients`, `chem`) hold dissolved
nutrients and vent chemistry.

There is one `World` per biome, created lazily. The active biome runs the full individual-level simulation; the others
run the coarse population model (Phase 3) so everything stays alive offscreen.

## Entities (struct-of-arrays)

`EntityStore` keeps each field in its own typed array (position, energy, health, genome …). A creature is a *slot*;
`(slot, uid)` is a stable handle. `SpatialHash` (8-cell buckets, rebuilt each tick) answers neighbour queries.
A genome is `NG` floats in [0,1] (`G` in `shared/constants.ts`). Derived traits are cached per entity.

## Rendering

* `terrain.ts` paints solids into a 4-texel-per-cell canvas once per terrain change, and draws water/lava as a
  full-world mesh with a custom GLSL shader (depth tint, caustics, animated surface, lava).
  A second translucent pass is drawn *over* creatures for underwater haze.
* `background.ts` builds tileable parallax silhouettes on canvases (hills, mountains, kelp, clouds …).
* `creatures.ts` renders creatures with **ParticleContainers** (one per atlas page per layer). `atlas.ts` is a
  shelf-packing multi-page atlas; sprites are generated at runtime from genomes (`spritegen.ts`) — no art assets.
  At low zoom tiny creatures collapse to single coloured dots (LOD).
* `ambient.ts` pools bubbles, snow, rain, embers, fireflies, dust… per biome in world space.
* `lighting.ts` multiplies a vignette/ambient colour over the scene.

## Build / deploy

Vite + TypeScript, `base: './'`, deployed by `.github/workflows/deploy.yml` to GitHub Pages.
`npm run dev` · `npm run build` · `npm run sim` (headless ecology harness, Phase 2+).
