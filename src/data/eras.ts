export interface EraDef { id: string; name: string; blurb: string; ma: number; /* approx. start, millions of years ago */ }
export const ERAS: EraDef[] = [
  { id: 'microbial', name: 'Microbial', blurb: 'Single cells fill every sea, soil and spring.', ma: 3800 },
  { id: 'multicell', name: 'Multicellular', blurb: 'Cells cooperate. Bodies begin.', ma: 1000 },
  { id: 'marine', name: 'Early Marine Animals', blurb: 'The first mobile animals graze and hunt the seas.', ma: 580 },
  { id: 'fish', name: 'Fish & Armored Seas', blurb: 'Jaws, spines and armour: an arms race in the water.', ma: 480 },
  { id: 'landlife', name: 'Plants & Insects on Land', blurb: 'Green spreads over the shore; small legs follow.', ma: 430 },
  { id: 'herp', name: 'Amphibians & Reptiles', blurb: 'Backbones crawl onto land and stay.', ma: 360 },
  { id: 'mega', name: 'Megafauna', blurb: 'Giants walk the land.', ma: 230 },
  { id: 'mammal', name: 'Mammals & Birds', blurb: 'Warm blood, fur and feathers inherit the world.', ma: 66 },
  { id: 'hominid', name: 'Hominids', blurb: 'Clever, social, upright.', ma: 6 },
  { id: 'civ', name: 'Civilization', blurb: 'Tribes become villages, villages become cities.', ma: 0.01 },
  { id: 'modern', name: 'Modern World', blurb: 'Machines, networks and a changing climate.', ma: 0.0002 },
  { id: 'future', name: 'Near Future', blurb: 'The next hundred years decide everything.', ma: 0 },
];
