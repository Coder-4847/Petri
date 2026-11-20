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

## Phase 3: Microbial Life and Evolution Engine — DONE
- All 18 biomes exist from the start and are seeded with microbes that fit them (sunlit plankton/mats, vent chemosynthesisers,
  soil crust + bacteria on land, spore drifters in the sky, detritus feeders everywhere)
- Detritus field + decomposer microbes close the nutrient loop
- Population-level coarse model for offscreen biomes and deep time; seamless collapse/rebuild; verified consistent
- Speciation with procedural Latin names, lineage (`parent`), extinction log, adaptive radiation blueprints (28 body plans)
- Era milestones evaluated from real species traits; live era timeline with a cosmetic geological clock
- Speeds: pause / 1x / 5x / 20x (individuals) / 100x (populations) / deep time (~20,000 ticks per second)
- Environment (Tweak) panel with plain-language hints; Life panel; toasts for eras, speciation and extinction
- Verified slider steering (grassland, same seed): drier → humidity optimum 0.40→0.17 and waterproofing 0.47→0.74;
  hotter → temperature optimum 0.52→0.74; colder → 0.29; darker → chemosynthesis appears
- Verified progression: swamp reaches *Plants & Insects on Land* in ~10 s of deep time; grassland has reached *Megafauna*

### Known issues / tuning notes
- Era pace in deep time may be too brisk and varies a lot by seed/biome (intended: no two saves alike); revisit in Phase 8.
- Coarse step costs 1–3 ms with ~40 species per biome; inactive biomes run with time dilation at deep speeds.
- The individual model is calibrated on small test communities; radiation daughters in the full model sometimes fail to establish.
- Hominids/civilization need Phase 7 hooks (era index 9+).

## Phase 4: Procedural Pixel Creatures and Behavior — DONE
- `render/canvas8.ts` + `render/spritegen.ts`: genome → body plan classification → painter → shading, pattern, outline.
  19 painters: microbes (7 forms), colonies, mats, jellies, sessile animals (sponge/coral/anemone/clam), worms/eels,
  arthropods (trilobite, crustacean, beetle, scorpion, insect with wings), snails, squid, fish (jaws, armour, spines,
  bioluminescence, countershading), whales, quadrupeds (lizard, mammal, sauropod, cat, mammoth), bipeds (hominid,
  theropod), birds, kelp, moss, grass, ferns, trees. Proportions, fins, horns, plates, patterns, colours and eyes all
  come from genes, so every evolved species looks different.
- 9 frames per species: 4-frame move cycle, attack/feeding, dead (exposed organs and bone), bones, clean dead, LOD dot
- Carcasses: dead frame → decay tint → bleached skeleton; scavenged and decomposed by the sim
- `render/fx.ts`: blood spurts, gibs (organs, bone chips) with physics, blood clouds in water, lasting ground stains;
  settings panel with a gore toggle (default on, persisted)
- `data/templates.ts`: 42 templates (8 microbes, 6 plants/algae, 17 invertebrates, 11 fish/marine, 3 insects …)
- `#gallery` dev page shows every sprite and frame; behaviours (wander, sense, hunt, flee, herd, fight, eat, scavenge, rest)
  from Phase 2 drive the attack/feeding frames

### Known issues
- Blood clouds are low-res squares (fits the style, could be softer); plant "dead" frames are placeholders (plants vanish).
- Hit/kill events are sent for every creature in view; very dense fights cap at 500 events per frame.

## Phase 5: Full Biomes and Animal Roster — DONE
- All 18 biomes have a distinct look: depth-dithered terrain palettes, vent plumes (particles), brighter vent water,
  cave detection fixed (only roofed when solid is both above and within 45 cells below; never in the sky biome)
- `BIOME_LOOK` nudges hue/saturation/camouflage of radiating lineages toward their habitat (sand-coloured desert lizards,
  white tundra hares, …)
- ~87 templates: added amphibians, reptiles, dinosaurs, marine reptiles, pterosaurs, birds, mammals, ice-age megafauna,
  hominid and extra insects/arachnids; 27 sprite painters; gallery view `#gallery:bird,mammal,insect,extinct`
- Radiation engine has ~38 blueprints (frog, snake, turtle, croc, pterosaur, plesiosaur, armoured giant, butterfly,
  spider, social insect added)
- Coarse model: diffuse vent chemistry (`chemAt`), inter-biome dispersal, viability checks, 40-species cap per world
- `tools/planet.ts` runs all 18 biomes with dispersal: consumers appear in every biome except the vents, global era 4
  after 10k steps

### Known issues
- Vents stay producer/decomposer-only for a long time; consumers must arrive by dispersal.
- Largest animals only reach ~1–5 size units in deep-time runs; era pace beyond era 4 needs Phase 8 tuning.
- Slight column artifacts under lava pockets in the volcanic biome.

## Phase 6: Sandbox Tools, Codex, Saves — DONE
- **Title screen + 5 save slots** (IndexedDB): thumbnail, name, era, playtime, species count. New world (name + start biome),
  load, delete, export / import as gzip `.petri` files, "play without saving". Autosave every 2 min and when the tab hides.
  Verified: save → reload → load restores identical state (entities, species, tick).
- **Codex** (92 templates incl. 8 legends and 4 strangers): common creatures unlock by era, rarer ones when something
  genetically close evolves in the world, legends/strangers only through random encounters. Unlocks are per save.
- **Spawn tool**: pick from the codex, click the world to place 1/3/10. Habitat rules (salt/fresh water, open ground, air),
  warns when the biome is unsuitable; works in time-lapse too (introduces to the population model).
- **Inspector**: click a creature (name, diet, state, health/energy/age bars, traits, ancestry, follow camera).
- **God powers**: meteor (crater, dust, blast), lightning, plague, bless, fertilise, mutagen, with reticle + FX.
- **Random encounters** (toggle in settings): nutrient upwelling, storms, meteor showers, outbreaks, heat/cold spells
  (temporary env nudges that revert), migrations, strangers appearing (also unlock codex entries).
- **Stats panel**: population-by-role chart (log scale) and a live food-web diagram (eater → eaten, trophic levels).
- Winged walkers (dragon, griffin, winged horse) via a wing overlay on quadruped/biped painters.
- Fixed: closed UI panels were swallowing clicks meant for the world (`#ui > *` specificity).

### Known issues
- Powers and the inspector need individual-level time (1x–20x); in time-lapse they ask you to slow down.
- Mutagen mutates genomes in place but cached per-individual traits only refresh in offspring.
- Food-web edges are a heuristic from the same edibility rules the simulation uses (not a log of actual meals).

## Phase 7: Civilization, Choices, Endings — DONE
- **Civilization engine** (`sim/civ.ts`, `data/civ.ts`): starts when a clever, social species (era 9, "Hominids" → "Civilization")
  has 8+ individuals. One global state (population, technology, nature, climate stress, tension, stability, AI risk,
  disease, space, defence…) advances in "years" (5 years per second at 1x; 10,000 BCE → near future and beyond).
  Eras 9–11 follow technology (Civilization / Modern World / Near Future).
- **23 dilemmas** (agriculture, domestication, cities, writing, empires, plague, sail, science, coal, vaccines, atom, rockets,
  planetary watch, grid, wildlife, climate, AI, biotech, orbit…). Each pauses time and offers 2–4 options with a qualitative
  hint; effects are declarative. Some can return later if the player passed on them (rockets, watch, grid…).
- **13 endings** with animated pixel scenes (`ui/endings.ts`): asteroid, nuclear, climate, supervolcano, pandemic, runaway AI,
  orbit loss, solar flare, rogue star, extinction (bad); ecological balance, space colonisation, transcendence (good).
  Hazards are scheduled at random years, give a warning where technology allows, and can be averted by earlier
  decisions (planetary watch, hardened grid, space programme, vaccines…). Emergent endings follow from the state
  (nuclear war needs weapons and tension; climate needs sustained warming; AI needs an unrestrained path…).
- Consequences hit the real world: mass die-offs, dust, temperature and toxicity shifts, and the civilized species
  can be wiped; positive endings leave it intact. After an ending the player can keep exploring the sandbox.
- **Society panel**: population, age, bars for technology/nature/climate/tension/stability/AI/space, doom watch, history log.
- **Settlements** (`render/settlements.ts`): 14 pixel building types (hut, field, house, granary, mill, hall, brick house,
  factory, radio mast, office, cooling tower, skyscraper, solar field, eco-tower) placed on dry ground; number and style follow
  population and technology; they turn grey and slump after a civilization-ending catastrophe.
- Balance verified by simulation (`/tmp` scripts, 60–80 runs per strategy): every ending is reachable; careless play usually
  ends in a hazard, prepared play reaches balance or space; merging with AI needs wisdom for transcendence.
- QA hooks: worker message `dev` (`civ` jumps to hominids, `civstate` patches civ variables); `#ending:<id>` previews a scene.

### Known issues
- Pacing at deep-time speeds: a dilemma pauses the game, so very fast speeds produce frequent pauses late in the game.
- Settlements are cosmetic; they don't react to individual creatures. Night lighting for cities arrives in Phase 8.

## Next: Phase 8 — Polish, Audio, Performance, Release
