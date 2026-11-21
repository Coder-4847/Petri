// God powers: shared between the UI (panel, reticle radius) and the simulation (effects live in sim/powers.ts).
export interface PowerDef { id: string; name: string; icon: string; blurb: string; radius: number; /** false = acts on the whole biome at once, no target */ target: boolean; /** needs individual creatures (1x–20x) */ live: boolean; group: 'sky' | 'earth' | 'life' }
export const POWERS: PowerDef[] = [
  { id: 'meteor', name: 'Meteor', icon: 'meteor', blurb: 'A rock from the sky: a crater, a dust cloud and a lot of dead things.', radius: 14, target: true, live: true, group: 'sky' },
  { id: 'shower', name: 'Meteor shower', icon: 'star', blurb: 'A rain of small impacts scattered across the view.', radius: 0, target: false, live: true, group: 'sky' },
  { id: 'asteroid', name: 'Asteroid', icon: 'rock', blurb: 'Small: a regional catastrophe. Large: a planet-wide mass extinction.', radius: 26, target: true, live: false, group: 'sky' },
  { id: 'mineral', name: 'Mineral meteor', icon: 'gem', blurb: 'Seeds the ground with crystals and rich minerals. Sometimes something comes with it.', radius: 10, target: true, live: true, group: 'sky' },
  { id: 'lightning', name: 'Lightning', icon: 'bolt', blurb: 'A bolt from above. Large: a whole thunderstorm.', radius: 5, target: true, live: true, group: 'sky' },
  { id: 'volcano', name: 'Volcano', icon: 'volcano', blurb: 'Raises a smoking cone with lava. Ash dims the sky for a while.', radius: 12, target: true, live: true, group: 'earth' },
  { id: 'flood', name: 'Flood', icon: 'wave', blurb: 'Water rises over the land, then slowly drains away.', radius: 40, target: true, live: true, group: 'earth' },
  { id: 'iceage', name: 'Ice age', icon: 'snow', blurb: 'Temperatures plunge for a long time. Large: every biome freezes.', radius: 0, target: false, live: false, group: 'earth' },
  { id: 'drought', name: 'Drought', icon: 'sun', blurb: 'Hot, dry years. Plants wither; desert lineages win.', radius: 0, target: false, live: false, group: 'earth' },
  { id: 'plague', name: 'Plague', icon: 'plague', blurb: 'Infects creatures nearby; it spreads on its own. Large: a pandemic.', radius: 22, target: true, live: true, group: 'life' },
  { id: 'heal', name: 'Bless', icon: 'heal', blurb: 'Heals and feeds every creature in the circle.', radius: 22, target: true, live: true, group: 'life' },
  { id: 'fertilize', name: 'Fertilise', icon: 'seed', blurb: 'Pours nutrients into the ground and water.', radius: 34, target: true, live: true, group: 'life' },
  { id: 'mutagen', name: 'Mutagen rain', icon: 'dna', blurb: 'Scrambles genes: fast evolution, or a mess. Large: the whole biome.', radius: 24, target: true, live: true, group: 'life' },
];
export const POWER_BY_ID: Record<string, PowerDef> = Object.fromEntries(POWERS.map((p) => [p.id, p]));
