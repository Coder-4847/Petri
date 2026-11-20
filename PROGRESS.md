# Petri — Progress

## Phase 1: Foundation — DONE
- Vite + TS + PixiJS v8, GitHub Pages workflow, repo structure, ARCHITECTURE.md
- Worker-based fixed-timestep sim loop (speed 0/1/5/20/100x), snapshot protocol with interpolation
- Side-view world grid with mediums, procedural terrain (seeded), light/roof fields
- Biome framework: all 18 biomes are defined as data (terrain recipe, palette, ambient, parallax); 3 are enabled
  (Coral Reef, Kelp Forest, Open Ocean) + Grassland/Deep Ocean selectable ones in the switcher so far
- Camera with smooth log-space zoom (pointer, wheel, pinch, keys), view culling, cover-fit minimum zoom
- Water/lava shader (depth tint, caustics, surface waves, lava), parallax backgrounds, ambient particles, vignette
- UI shell: top bar (era timeline, speed), bottom dock, slide-up biome panel, debug overlay (`` ` ``)
- Stress test (dock "5k test"): 5,000 dummy sprites → ~4.3k visible, ~1 ms JS/frame, sim 2 ms/tick

### Notes
- Headless Chromium uses a software GPU, so fps there (~8) is not meaningful; JS cost per frame is shown as `js ms`.

## Phase 2: Simulation Core — DONE
- 55-gene genome (`shared/constants.ts`), trait decoding with allometric metabolism, mutation (point + macro "innovations"),
  crossover, genetic distance, procedural Latin names, species registry with speciation + extinction log
- Struct-of-arrays entities, spatial hash, per-biome `World` with nutrient/chem fields, light, roof detection
- Medium physics: swimming/walking/flying/burrowing, buoyancy, gravity, terminal velocity, fall damage, step climbing,
  drowning, suffocation, lava, temperature/salinity/pressure/desiccation/toxin/oxygen stress
- Behaviour: flee, hunt (with target leading), forage, wander (long runs when starving), herd cohesion/separation,
  foraging memory, habitat look-ahead; combat with counter-attacks; disease from crowding; parasites
- Producers (photo/chemosynthesis, seed reserve, crowding), carcasses (sink, rot, bones, nutrients), nutrient cycling
- Dev tools: `tools/harness.ts` (population curves, death causes, extinctions), `tools/physics.ts`
- Verified: producer + grazer coexist for 100 simulated minutes on multiple seeds; 3-level chains show a natural
  biomass pyramid (≈3000 plankton : 130 grazers : 30 fish) and predator–prey cycles; physics checks pass
  (a lion drowns in ~21 s and its carcass sinks, a stranded fish suffocates in ~8 s, a lion in the sky biome falls out)
- Preview communities per habitat are seeded in `sim/seed.ts` (replaced by the microbial start in Phase 3)

### Known issues / tuning notes
- Predators (fish, foxes) are fragile in the tiny well-mixed test arena: they ride the first prey boom and often go
  extinct after the first cycle. Expected to be much more robust with real, larger, evolved communities (Phase 3/5).
- Entity count of ~7–9k costs ~4–5 ms/tick; fine at 1x–5x, needs the coarse model / LOD at high speed (Phase 3, 8).
- Many newborn grazers starve (high turnover) — wasteful but regulating; revisit when profiling.

## Next: Phase 3 — Microbial Life and Evolution Engine
