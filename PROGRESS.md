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

## Next: Phase 2 — Simulation Core
Energy/metabolism, medium physics, genome traits, reproduction/mutation, carcasses + nutrient cycling, producers,
headless tuning harness (`npm run sim`).
