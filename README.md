# Petri

A pixel-art evolution sandbox that runs entirely in your browser. Every one of 18 biomes starts as a drop of microbes.
Food chains, speciation, extinctions and whole new body plans emerge from simple rules, from the first cells to
civilization and one of thirteen possible endings. You are a god-like observer with a toolbox.

No external art or audio: every sprite is generated from genes at runtime and every sound is synthesized with WebAudio.

## Playing

- **Look around**: drag to pan, scroll / pinch (or the + / − buttons on touch screens) to zoom from landscape down to single cells.
- **Time**: pause, 1x, 5x, 20x run individual creatures; 100x and deep time run populations while individuals are redrawn.
- **Biomes**: 18 cross-sections (coral reef to volcanic island to open sky). All of them keep evolving while you look elsewhere.
- **Tweak**: sliders for temperature, humidity, sunlight, oxygen, salinity, nutrients, toxins and gravity. Life adapts over generations.
- **Codex / spawn**: 96 creature templates plus every species your world evolves. Common ones unlock with the era, rarer ones when something similar evolves, legends and strangers only by chance.
- **Inspector**: click a creature for its diet, state, health, traits and ancestry; follow it with the camera.
- **Powers**: meteors and asteroids, mineral meteors, lightning storms, volcanoes, floods, ice ages, droughts, plagues, blessings, fertiliser and mutagen rain — each in a small and a large version.
- **Stats**: population by role and a live food web.
- **Society**: when a clever, social species thrives, civilization begins. Make the great decisions, watch the doom clock, reach an ending.
- **Worlds**: five save slots in IndexedDB (thumbnail, era, playtime, autosave), export/import as `.petri` files.

## Controls

Drag or WASD to pan · scroll / pinch to zoom · click to inspect · Space pause · [ ] speed · 1–8 panels · H photo mode · F fullscreen · ? help

## Develop

```
npm install
npm run dev        # dev server
npm run build      # typecheck + production build (static, relative base)
npm run preview    # serve the build
npx tsx tools/evo.ts grassland 20000 5   # headless deep-time experiment
```

Stack: Vite, TypeScript, PixiJS v8 (WebGL), a Web Worker for the simulation, IndexedDB for saves.
`ARCHITECTURE.md` explains the two simulation models and the rendering pipeline; `PROGRESS.md` records each phase.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub Pages
(enable *Settings → Pages → Source: GitHub Actions*). The build uses a relative base, so it works from any sub-path.

## Dev routes

`#gallery` (all sprites), `#gallery:myth,scifi` (one category), `#ending:asteroid` (preview an ending scene), `?quick=<biome>` (skip the title screen).
