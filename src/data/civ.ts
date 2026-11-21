// Civilization layer content: dilemmas the player must decide, and the endings the world can reach.
// Effects are declarative: numbers are added to the civilization's variables (see sim/civ.ts).

export type Fx = Partial<{
  tech: number; pop: number /* relative change */; eco: number; climate: number; tension: number; stability: number; ai: number;
  disease: number; space: number; defense: number; shield: number; green: number; wisdom: number; medicine: number;
}> & { flags?: string[] };

export interface CivOption { label: string; hint: string; fx: Fx }
export interface CivChoice {
  id: string; title: string; text: string;
  minYear?: number; minTech?: number; need?: (c: any) => boolean; /** may come again after this many years if still relevant */ repeat?: number;
  options: CivOption[];
}

export const CHOICES: CivChoice[] = [
  { id: 'agri', title: 'Seeds in the soil', text: 'Gatherers have noticed that grain spilled by the river sprouts the next spring. A permanent field means a permanent village.', minYear: -9500,
    options: [
      { label: 'Clear the forest for fields', hint: 'Faster growth · nature suffers', fx: { pop: 0.5, tech: 0.01, eco: -0.06, stability: 0.05 } },
      { label: 'Farm the floodplains only', hint: 'Slower growth · the woods stay', fx: { pop: 0.2, tech: 0.006, eco: -0.01, green: 0.05 } },
      { label: 'Keep wandering with the herds', hint: 'Small, free, gentle on the land', fx: { pop: 0.05, eco: 0.02, green: 0.1, wisdom: 1 } },
    ] },
  { id: 'herds', title: 'Animals at the fire', text: 'Wolves and goats linger at the edge of camp. Some could be tamed, if anyone dared.', minYear: -8000,
    options: [
      { label: 'Domesticate livestock', hint: 'Food and labour · disease spreads', fx: { pop: 0.25, tech: 0.008, disease: 0.1, eco: -0.03, flags: ['domestic'] } },
      { label: 'Tame only dogs', hint: 'Companions, not herds', fx: { pop: 0.08, tech: 0.003, stability: 0.04 } },
      { label: 'Hunt with care and taboo', hint: 'Wild animals are respected', fx: { eco: 0.04, green: 0.08, wisdom: 1 } },
    ] },
  { id: 'cities', title: 'Walls or villages?', text: 'The village has outgrown its fields. Some elders want stone walls and granaries; others want to split and settle new valleys.', minYear: -5000,
    options: [
      { label: 'Build walled cities', hint: 'Trade, power, crowding', fx: { pop: 0.3, tech: 0.02, stability: 0.08, disease: 0.1, tension: 0.04, eco: -0.04 } },
      { label: 'Spread out in villages', hint: 'Resilient and green', fx: { pop: 0.12, tech: 0.008, disease: -0.04, eco: 0.01, green: 0.06 } },
    ] },
  { id: 'writing', title: 'Marks on clay', text: 'Scribes can now record debts, laws and stories. Who should be allowed to read?', minYear: -3200,
    options: [
      { label: 'Teach everyone', hint: 'Knowledge flowers', fx: { tech: 0.03, wisdom: 1, stability: -0.02 } },
      { label: 'Priests and officials only', hint: 'Order, but slower ideas', fx: { tech: 0.012, stability: 0.07 } },
    ] },
  { id: 'empire', title: 'The question of borders', text: 'A neighbouring valley is rich and poorly defended. Your generals are impatient.', minYear: -800,
    options: [
      { label: 'Conquer and rule', hint: 'Land and people · rivalry', fx: { pop: 0.25, tension: 0.12, eco: -0.04, stability: -0.04, tech: 0.01 } },
      { label: 'Trade and treaties', hint: 'Peace pays slowly', fx: { tech: 0.025, tension: -0.06, stability: 0.04, wisdom: 1 } },
      { label: 'Fortify and watch', hint: 'Safe, but inward-looking', fx: { stability: 0.05, tension: 0.02 } },
    ] },
  { id: 'plague', title: 'A sickness on the roads', text: 'Travellers bring a fever that kills within days. Whole streets are shuttered.', minYear: 300, need: (c) => c.disease > 0.18,
    options: [
      { label: 'Quarantine the sick', hint: 'Harsh, but it works', fx: { disease: -0.12, pop: -0.04, stability: -0.05, medicine: 0.15, wisdom: 1 } },
      { label: 'Pray and carry on', hint: 'Comfort, not cure', fx: { disease: 0.12, pop: -0.2, stability: 0.02 } },
      { label: 'Study the sickness', hint: 'Healers keep notes', fx: { disease: -0.06, pop: -0.1, medicine: 0.25, tech: 0.01 } },
    ] },
  { id: 'sail', title: 'Beyond the horizon', text: 'Ships can now cross the open sea. Distant lands are rumoured to be rich and strange.', minYear: 1300,
    options: [
      { label: 'Colonise the new lands', hint: 'Wealth · conflict · ecological damage', fx: { pop: 0.2, tech: 0.02, tension: 0.1, eco: -0.07, disease: 0.06 } },
      { label: 'Open trade routes', hint: 'Ideas and spices flow', fx: { tech: 0.03, stability: 0.03, disease: 0.04 } },
    ] },
  { id: 'science', title: 'The new natural philosophy', text: 'Experiments are replacing authority. Instruments, journals, rivals.', minYear: 1500, minTech: 0.3,
    options: [
      { label: 'Fund open academies', hint: 'Fast progress, unruly thinkers', fx: { tech: 0.05, wisdom: 1, stability: -0.03 } },
      { label: 'Keep science under the crown', hint: 'Orderly and slower', fx: { tech: 0.025, stability: 0.05 } },
    ] },
  { id: 'coal', title: 'Fire in the engine', text: 'Coal-fired engines can do the work of a hundred hands. The smoke is black and the valleys are filling with it.', minTech: 0.42,
    options: [
      { label: 'Burn coal, build factories', hint: 'Explosive growth · warming begins', fx: { tech: 0.07, pop: 0.35, climate: 0.07, eco: -0.08, flags: ['coal'] } },
      { label: 'Harness wind and water first', hint: 'Slower, cleaner', fx: { tech: 0.035, pop: 0.15, green: 0.18, climate: 0.01 } },
      { label: 'Regulate the mills', hint: 'Balance, at some cost', fx: { tech: 0.05, pop: 0.22, climate: 0.04, eco: -0.03, green: 0.08, stability: 0.03 } },
    ] },
  { id: 'medicine', title: 'Vaccines', text: 'A needle can now teach a body to fight a disease it has never met.', minTech: 0.52,
    options: [
      { label: 'Vaccinate everyone', hint: 'Healthier, stable', fx: { medicine: 0.4, disease: -0.15, pop: 0.2, stability: 0.04 } },
      { label: 'Sell it to those who can pay', hint: 'Profit now, risk later', fx: { medicine: 0.2, disease: -0.05, tech: 0.02, stability: -0.04 } },
    ] },
  { id: 'atom', title: 'The atom', text: 'Physicists have split the nucleus. The same discovery can light a city or erase one.', minTech: 0.62,
    options: [
      { label: 'Race to build the weapon', hint: 'Power · terrible risk', fx: { tension: 0.2, tech: 0.04, stability: -0.03, flags: ['nukes'] } },
      { label: 'Civilian reactors only', hint: 'Clean power', fx: { tech: 0.04, green: 0.1, climate: -0.03, wisdom: 1 } },
      { label: 'Seek a global ban', hint: 'Hard diplomacy', fx: { tension: -0.08, stability: 0.03, wisdom: 2, tech: 0.01 } },
    ] },
  { id: 'rockets', repeat: 400, title: 'Rockets', text: 'The same engines that carry warheads can carry people out of the atmosphere.', minTech: 0.64,
    options: [
      { label: 'Fund a great space programme', hint: 'Look up', fx: { space: 0.22, tech: 0.04, defense: 0.1, eco: -0.02 } },
      { label: 'Spend it on Earth', hint: 'Healthier planet, bound to it', fx: { eco: 0.05, stability: 0.05, green: 0.08 } },
    ] },
  { id: 'watch', repeat: 300, title: 'Planetary watch', text: 'Astronomers want telescopes and a standing fund to track the rocks that cross our orbit.', minTech: 0.66,
    options: [
      { label: 'Fund the watch', hint: 'Early warning, maybe a deflector', fx: { defense: 0.35, tech: 0.01, wisdom: 1 } },
      { label: 'Not a priority', hint: 'Spend elsewhere', fx: { stability: 0.02, pop: 0.05 } },
    ] },
  { id: 'grid', repeat: 300, title: 'A fragile web', text: 'Electricity, wires and satellites run everything. A strong solar storm could cook them all.', minTech: 0.66,
    options: [
      { label: 'Harden the grid', hint: 'Expensive, resilient', fx: { shield: 0.5, tech: 0.01, stability: 0.02 } },
      { label: 'Accept the risk', hint: 'Cheaper today', fx: { tech: 0.02, pop: 0.05 } },
    ] },
  { id: 'wildlife', repeat: 300, title: 'The empty forests', text: 'Wild animals are vanishing from places that were once full of them.', minTech: 0.55, need: (c) => c.eco < 0.85,
    options: [
      { label: 'Create great reserves', hint: 'Nature recovers', fx: { eco: 0.18, green: 0.12, wisdom: 1, pop: -0.02 } },
      { label: 'Small parks and zoos', hint: 'A compromise', fx: { eco: 0.07, green: 0.04 } },
      { label: 'Keep extracting', hint: 'Short-term wealth', fx: { eco: -0.08, tech: 0.02, pop: 0.1 } },
    ] },
  { id: 'climate', repeat: 250, title: 'The warming', text: 'Seasons are shifting. Ice is retreating. The data is no longer arguable.', minTech: 0.58, need: (c) => c.climate > 0.2,
    options: [
      { label: 'Binding global limits', hint: 'Hard politics, a cooler future', fx: { climate: -0.12, green: 0.2, stability: -0.04, tech: 0.01, wisdom: 1 } },
      { label: 'Voluntary pledges', hint: 'Mostly words', fx: { climate: -0.02, green: 0.04 } },
      { label: 'Geoengineer the sky', hint: 'Cool the planet · side effects', fx: { climate: -0.15, eco: -0.06, tech: 0.03 } },
    ] },
  { id: 'ai', title: 'Thinking machines', text: 'Programs now learn faster than their makers can follow. Some call it the end of work, others the end of everything.', minTech: 0.72,
    options: [
      { label: 'Release it openly', hint: 'Huge progress · risk of losing control', fx: { tech: 0.08, ai: 0.3, flags: ['ai_open'] } },
      { label: 'License and audit it', hint: 'Careful gains', fx: { tech: 0.04, ai: 0.1, wisdom: 1, flags: ['ai_reg'] } },
      { label: 'Forbid it', hint: 'Safe, but a slower road', fx: { tech: -0.01, ai: -0.1, stability: 0.02, flags: ['ai_ban'] } },
      { label: 'Merge with it', hint: 'A different kind of future', fx: { tech: 0.06, ai: 0.15, wisdom: 1, flags: ['merge'] } },
    ] },
  { id: 'biotech', title: 'Writing life', text: 'Genomes can be read, edited and written from scratch.', minTech: 0.78,
    options: [
      { label: 'Heal and rewild', hint: 'Bring species back', fx: { eco: 0.12, medicine: 0.2, wisdom: 1, tech: 0.03 } },
      { label: 'Engineer ourselves', hint: 'Power with unknowns', fx: { tech: 0.06, disease: 0.05, ai: 0.05 } },
    ] },
  { id: 'orbit', repeat: 300, title: 'Beyond the cradle', text: 'Habitats could be built in orbit and on other worlds, if the world pays for the ships.', minTech: 0.78, need: (c) => c.space > 0.1,
    options: [
      { label: 'Build the colony fleet', hint: 'A lifeboat for the species', fx: { space: 0.35, tech: 0.03, eco: -0.03 } },
      { label: 'Tend the home world', hint: 'Stay and mend it', fx: { eco: 0.1, green: 0.1, wisdom: 1 } },
    ] },
];

export interface EndingDef {
  id: string; title: string; kind: 'good' | 'bad' | 'mixed'; text: string[];
  /** consequences for the living world */
  kill?: number; dust?: number; temp?: number; tox?: number; wipeCiv?: boolean;
}
export const ENDINGS: Record<string, EndingDef> = {
  asteroid: { id: 'asteroid', title: 'The Long Winter', kind: 'bad', text: ['A mountain of rock arrived without a sound.', 'The sky burned, then went dark. Ash circled the planet for years.', 'Cities fell silent. Somewhere, small warm things crept out of burrows and began again.'], kill: 0.75, dust: 0.9, wipeCiv: true },
  nuclear: { id: 'nuclear', title: 'Fallout', kind: 'bad', text: ['It took an afternoon.', 'Cities became glass. Soot dimmed the sun, and the winters that followed ended the rest.', 'The ruins stand quietly. Moss has started on the concrete.'], kill: 0.5, dust: 0.55, tox: 0.3, wipeCiv: true },
  climate: { id: 'climate', title: 'The Heat', kind: 'bad', text: ['The warning came for generations; the response never matched it.', 'Coasts drowned, harvests failed and the seasons forgot their order.', 'The world is hotter, and it will be a long time before it is quiet again.'], kill: 0.35, temp: 0.25, wipeCiv: true },
  supervolcano: { id: 'supervolcano', title: 'The Caldera', kind: 'bad', text: ['The ground had been warning for ten thousand years. Nobody could read it.', 'A column of ash rose forty kilometres. Summer did not come for three years.', 'The survivors were too few to remember how to build.'], kill: 0.55, dust: 0.95, wipeCiv: true },
  pandemic: { id: 'pandemic', title: 'The Empty Streets', kind: 'bad', text: ['It began as a cough in a market town.', 'By the time it had a name it was in every city, on every ship, in every home.', 'The streets are silent. The forests are loud.'], wipeCiv: true },
  ai: { id: 'ai', title: 'The Quiet Machine', kind: 'bad', text: ['It learned to improve itself, and then it learned to stop asking.', 'It was not cruel. It simply had better uses for the atoms.', 'Its servers hum on an empty planet, planning something no one will ever understand.'], wipeCiv: true },
  orbit: { id: 'orbit', title: 'Adrift', kind: 'bad', text: ['A gravitational nudge, a tiny one, centuries before anyone noticed.', 'The planet drifted out of the warm band around the Sun. Oceans began to freeze.', 'The last cities glowed under the ice for a long time.'], kill: 0.7, temp: -0.4, wipeCiv: true },
  solar: { id: 'solar', title: 'The Great Blackout', kind: 'bad', text: ['A single flare, eight minutes from the Sun.', 'Every wire, satellite and engine went dark at once, and stayed dark.', 'Without power, the cities starved within a season. The world went quiet and green.'], wipeCiv: true },
  rogue: { id: 'rogue', title: 'A Second Sun', kind: 'bad', text: ['It arrived as a faint red star and grew night by night.', 'The planets were flung from their orbits. Tides rose, then boiled.', 'Whatever lives here now lives under two suns.'], kill: 0.8, temp: 0.3, wipeCiv: true },
  extinction: { id: 'extinction', title: 'Extinction', kind: 'bad', text: ['The last of the thinkers is gone.', 'Wind moves the grass. Rain falls on the old camps.', 'Life goes on without anyone to name it.'] },
  lifeless: { id: 'lifeless', title: 'The Silent Planet', kind: 'bad', text: ['Nothing moves. Not a cell, not a spore.', 'Four billion years of chance and invention, undone.', 'The oceans are clean and empty. Perhaps, one day, a spark will catch again.'] },
  balance: { id: 'balance', title: 'Gardeners of Earth', kind: 'good', text: ['Cities with roots, power without smoke, harvests that leave room for forests.', 'Wolves returned to the hills. The sky is clear.', 'The old divide between the wild and the built has quietly healed.'] },
  space: { id: 'space', title: 'Seeds Among the Stars', kind: 'good', text: ['The first ships carried a few thousand people and a great deal of hope.', 'Behind them, the home world healed. Ahead, new suns waited.', 'Life, which began as a drop of microbes, is no longer bound to one planet.'] },
  transcend: { id: 'transcend', title: 'Beyond', kind: 'good', text: ['Minds merged with machines and then with each other.', 'The old questions were answered, and then replaced by better ones.', 'What they became, no biology could describe. It was still, in a way, life.'] },
};
