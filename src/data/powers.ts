// God powers: shared between the UI (panel, reticle radius) and the simulation (effects live in sim/tools.ts).
export interface PowerDef { id: string; name: string; icon: string; blurb: string; radius: number }
export const POWERS: PowerDef[] = [
  { id: 'meteor', name: 'Meteor', icon: 'meteor', blurb: 'A rock from the sky: a crater and a lot of dead things.', radius: 14 },
  { id: 'lightning', name: 'Lightning', icon: 'bolt', blurb: 'A single bolt. Dreadful to whatever stands under it.', radius: 5 },
  { id: 'plague', name: 'Plague', icon: 'plague', blurb: 'Infects creatures nearby. It spreads on its own.', radius: 22 },
  { id: 'heal', name: 'Bless', icon: 'heal', blurb: 'Heals and feeds every creature in the circle.', radius: 22 },
  { id: 'fertilize', name: 'Fertilise', icon: 'seed', blurb: 'Pours nutrients into the ground and water.', radius: 34 },
  { id: 'mutagen', name: 'Mutagen', icon: 'dna', blurb: 'Scrambles genes in the circle: fast evolution, or a mess.', radius: 24 },
];
