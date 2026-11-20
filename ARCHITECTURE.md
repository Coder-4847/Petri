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

## Simulation rules (sim/ecology.ts)

Per tick, per entity: **stress** (temperature, salinity, pressure, desiccation, toxins, oxygen — each compared with the
creature's tolerance genes) → **perception** (staggered every 4th tick via the spatial hash: nearest food, nearest threat,
herd vector, food gradient, density) → **behaviour** (flee › hunt/forage › wander, with habitat look-ahead and foraging memory)
→ **locomotion** (swim / walk / fly / burrow / fall by medium, buoyancy, step-climbing, fall damage, drowning and
suffocation via a breath reserve) → **energy** (basal metabolism ∝ mass^0.75 × complexity × brain × stress, plus movement) →
**interaction** (graze, scavenge, bite, parasitise, fight back) → **health / death** → **reproduction**.

* Producers are regrowing resources: grazers bite *energy* and leave a residual, so plants/plankton are depleted but not
  exterminated; a separate seed reserve means grazing can't stop seeding. Rooted plants share a 1-D ground strip,
  floating ones share 2-D water; carrying density reflects that.
* Reproduction is gated on energy *affordability*, local food abundance, local crowding and a cooldown (`rcd`, separate
  from the eat cooldown `cd`). Offspring inherit via `mutate`/`crossover`; `SpeciesRegistry.classify` splits a new species
  when the genome drifts past `SPECIATION_DIST` from the founder.
* Dead animals convert *in place* to carcasses (handles stay valid), which sink, decay into the nutrient field
  and are scavenged. Carcass value ≈ stored energy, so bodies that grew for free aren't an energy source.
* `tools/harness.ts` runs the real sim headlessly: `npx tsx tools/harness.ts reef4 60000 reef 7 --diag`.
  `tools/physics.ts` checks drowning / suffocation / falling.

## Two simulation models, one world

Every biome exists from the first moment (`Sim.start`) and starts microbial (`sim/seed.ts`).

* **Full model** (`ecology.ts`): individuals. Used for the active biome at 1x–20x.
* **Coarse model** (`coarse.ts`): each species is a population count + a mean genome. Habitat is sampled at ~28
  representative points (water depth bands, land surface, high air, soil pores, vents); species spread over them by
  stress-tolerance and breathing/locomotion fit. Producers share light and nutrients (similar sizes compete hardest,
  taller plants shade shorter ones), herbivores share producer energy, predators use a saturating functional
  response with satiation and refugia, decomposers eat the detritus pool. One coarse step = 50 ticks. Used for every
  biome you are not watching and for 100x / deep-time on the active biome (individuals are then redrawn cosmetically).
* `collapseWorld` / `expandWorld` convert between them without changing registry counts (checked: diff = 0).
* **Evolution** has three layers: point/macro mutation + `SPECIATION_DIST` in the full model; payoff-guided
  adaptation of tolerance genes (so sliders steer evolution) in the coarse model; and **adaptive radiation**
  (`radiation.ts`): a library of ecological blueprints (colonial algae → copepods → jawed fish → insects, moss, trees →
  amphibians, reptiles → megafauna → warm-blooded birds and mammals → clever social hominids). A blueprint needs a
  suitable living ancestor and food; it spawns a small daughter lineage that keeps its parent's tolerances, and the
  population dynamics decide whether it survives. This works in both models at any speed.
* **Eras** (`eras.ts`) are milestone scores over living species (size, locomotion, jaws, limbs, lungs, endothermy,
  intelligence ...); the timeline bar shows progress toward the next one.
* Tools: `tools/evo.ts` (deep-time experiments, `--env=humidity=0.1@3000`), `tools/simtest.ts` (drive the real Sim host).

### Phase 5 additions
- **Dispersal**: `maybeDisperse` seeds viable species from neighbouring biomes into others (coarse model), so consumers
  spread across the planet without moving individuals between worlds.
- **Biome looks**: `BIOME_LOOK` in `data/biomes.ts` tweaks colour/camouflage genes of radiation daughters.
- **Vent chemistry**: `chemAt` gives a diffuse chemistry field around vents so chemosynthesisers are not confined to the vent cells.
- **Caves**: a cell is roofed only if solid lies above it and within 45 cells below (never in `noFloor` biomes).

## Player tools & saves (Phase 6)
- `sim/tools.ts`: `placeTemplate` (habitat rules), `applyPower`, `pickEntity`/`inspect`, `foodWeb`, codex unlocks
  (`unlockedTemplates` by era + `scanDiscoveries` by genetic similarity). `sim/encounters.ts`: weighted random events.
  Temporary env changes are stored as `timed` entries (`{tick, world, key, delta}`) so they survive saving.
- Worker messages added: `spawn`, `power`, `inspect` (by position or slot/uid), `web`, `cfg`, `save`, `load`;
  replies `spawned`, `powered`, `inspect`, `web`, `codex`, `savedata`, `loaded`.
- `sim/save.ts`: a snapshot is plain structured-clone data (typed arrays, Maps, objects): registry, era, worlds
  (fields, coarse state, entity arrays when in the full model, terrain only if edited by a crater). Restoring rebuilds
  worlds from the seed and pours the data in. `ui/saves.ts` stores slots in IndexedDB and exports gzip JSON with tagged typed arrays.
- UI: `ui/menu.ts` (title + slot list), `ui/codex.ts`, `ui/inspector.ts`, `ui/stats.ts`, `ui/toolbar.ts` (active tool chip + reticle).
  `Shell.addPanel` registers new dock panels.

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
