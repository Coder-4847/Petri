// The civilization layer: one global state that starts when hominids appear (era 9) and ends in one of the endings.
// It is deliberately simple: a handful of variables, dilemmas for the player, and hazards that need preparation.
import type { RNG } from '../shared/rng';
import { CHOICES, ENDINGS, type CivChoice, type Fx } from '../data/civ';

export const YEARS_PER_TICK = 0.25; // 20 ticks/s at 1x = 5 years per second
export const START_YEAR = -10000;

export interface Hazard { id: 'asteroid' | 'supervolcano' | 'solar' | 'rogue' | 'orbit'; year: number; warn: number; warned: boolean; done: boolean; plan: string }
export interface CivState {
  active: boolean; started: boolean; finished: boolean; ending: string | null;
  year: number; pop: number; tech: number; eco: number; climate: number; tension: number; stability: number; ai: number; disease: number;
  space: number; defense: number; shield: number; green: number; wisdom: number; medicine: number;
  flags: string[]; seen: Record<string, number>; nextChoice: number; nextPandemic: number;
  pending: { kind: 'choice' | 'hazard'; id: string } | null;
  hazards: Hazard[]; log: { year: number; text: string }[]; choices: { year: number; title: string; pick: string }[];
  sustained: number; peakPop: number; appliedTemp: number; appliedTox: number; name: string;
}
export type CivEvent = { t: 'choice'; id: string; title: string; text: string; options: { label: string; hint: string }[] } | { t: 'ending'; id: string } | { t: 'note'; text: string; kind: string };

export function newCiv(rng: RNG): CivState {
  const between = (a: number, b: number) => Math.round(a + rng.next() * (b - a));
  return {
    active: false, started: false, finished: false, ending: null, year: START_YEAR, pop: 1, tech: 0.005, eco: 1, climate: 0, tension: 0.05, stability: 0.7, ai: 0, disease: 0.1,
    space: 0, defense: 0, shield: 0, green: 0, wisdom: 0, medicine: 0, flags: [], seen: {}, nextChoice: START_YEAR + 150, nextPandemic: 0, pending: null,
    hazards: [
      { id: 'supervolcano', year: between(800, 4200), warn: 0, warned: false, done: false, plan: '' },
      { id: 'asteroid', year: between(2000, 3600), warn: -60, warned: false, done: false, plan: '' },
      { id: 'solar', year: between(2000, 3400), warn: 0, warned: false, done: false, plan: '' },
      { id: 'rogue', year: between(3000, 4600), warn: -150, warned: false, done: false, plan: '' },
      { id: 'orbit', year: between(3400, 5200), warn: -220, warned: false, done: false, plan: '' },
    ],
    log: [], choices: [], sustained: 0, peakPop: 1, appliedTemp: 0, appliedTox: 0, name: 'Hominids',
  };
}

export const startCiv = (c: CivState, name: string) => { c.active = true; c.started = true; c.name = name; c.log.push({ year: c.year, text: `${name} begin to farm and settle.` }); };
export const civEra = (c: CivState) => (c.tech >= 0.8 ? 11 : c.tech >= 0.5 ? 10 : 9);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const has = (c: CivState, f: string) => c.flags.includes(f);
const note = (c: CivState, ev: CivEvent[], text: string, kind = 'event') => { c.log.push({ year: Math.round(c.year), text }); if (c.log.length > 60) c.log.shift(); ev.push({ t: 'note', text, kind }); };
export const capacity = (c: CivState) => 4 * (1 + 2200 * c.tech * c.tech) * (0.35 + 0.65 * c.eco);

/** Advance the civilization by `years` (small steps so events fire in order). Returns events for the UI. */
export function stepCiv(c: CivState, rng: RNG, years: number, thinkers: number): CivEvent[] {
  const ev: CivEvent[] = [];
  if (!c.active || c.pending || c.finished) return ev;
  let left = years;
  while (left > 0 && !c.pending && !c.ending) {
    const dt = Math.min(left, 5); left -= dt; c.year += dt;
    const ind = clamp((c.tech - 0.4) / 0.4), K = capacity(c), pb = c.pop / 1000;
    // slow variables
    c.tech += dt * 0.000017 * (1 + 7 * c.tech) * (0.55 + 0.45 * c.stability) * (1 - 0.35 * c.tension);
    c.pop += dt * c.pop * 0.0013 * (1 - c.pop / K); if (c.pop > K * 1.05) c.pop -= (c.pop - K) * 0.02 * dt;
    c.peakPop = Math.max(c.peakPop, c.pop);
    c.eco = clamp(c.eco - dt * 0.000012 * (0.1 + pb) * (1 + 3 * ind) * (1 - 0.7 * c.green) + dt * 0.000012 * (1 - c.eco) * (0.3 + c.green));
    c.climate = clamp(c.climate + dt * 0.00014 * ind * (0.3 + pb * 0.8) * (has(c, 'coal') ? 1.3 : 0.7) * (1 - 0.8 * c.green) - dt * 0.00002 * c.climate);
    c.tension = clamp(c.tension + dt * (0.00002 + 0.00008 * clamp(c.pop / K) + (has(c, 'nukes') ? 0.00006 : 0)) - dt * 0.0003 * c.tension * (0.4 + c.stability * 0.6 + c.wisdom * 0.04));
    c.stability = clamp(c.stability + dt * 0.0001 * (0.6 - c.tension) - dt * 0.00004 * c.climate);
    c.disease = clamp(c.disease + dt * 0.00004 * clamp(c.pop / K) * (has(c, 'domestic') ? 1.4 : 1) - dt * 0.00008 * (c.disease - 0.1) * (0.5 + c.medicine * 2));
    c.green = clamp(c.green - dt * 0.00001);
    if (has(c, 'ai_open')) c.ai = clamp(c.ai + dt * 0.0012); else if (has(c, 'merge')) c.ai = clamp(c.ai + dt * 0.0009, 0, c.wisdom >= 4 ? 0.62 : 1); else if (has(c, 'ai_reg')) c.ai = clamp(c.ai + dt * 0.00008); else if (has(c, 'ai_ban')) c.ai = clamp(c.ai - dt * 0.0003); else if (c.tech > 0.75) c.ai = clamp(c.ai + dt * 0.00012);
    if (c.tech >= 0.62 && c.space > 0) c.space = clamp(c.space + dt * 0.0008 * (0.5 + c.tech) * (0.5 + 0.5 * c.stability));
    if (c.defense > 0) c.defense = clamp(c.defense + dt * 0.00003 * c.tech);

    // ---- endings that emerge from the state
    if (thinkers <= 0 && c.year > START_YEAR + 40 && !has(c, 'dev')) { c.ending = 'extinction'; break; }
    if (has(c, 'nukes') && rng.next() < c.tension * c.tension * 0.015 * (1 - 0.5 * c.stability) * Math.max(0.2, 1 - 0.06 * c.wisdom) * dt) { c.ending = 'nuclear'; break; }
    if (c.climate >= 0.999 || c.eco <= 0.03) { c.ending = 'climate'; break; }
    if (c.ai >= 0.999) { c.ending = 'ai'; break; }
    if (c.space >= 1) { c.ending = 'space'; break; }
    if (has(c, 'merge') && c.ai >= 0.55 && c.wisdom >= 4 && c.tech >= 0.85) { c.ending = 'transcend'; break; }
    if (civEra(c) >= 11 && c.eco >= 0.78 && c.climate <= 0.25) c.sustained += dt; else c.sustained = Math.max(0, c.sustained - dt);
    if (c.sustained >= 300) { c.ending = 'balance'; break; }

    // ---- pandemics
    if (c.year > c.nextPandemic && c.disease > 0.35 && rng.next() < 0.0015 * dt * c.disease) { c.pending = { kind: 'hazard', id: 'pandemic' }; c.nextPandemic = c.year + 300; ev.push(hazardEvent(c, 'pandemic')); break; }

    // ---- scheduled hazards
    for (const h of c.hazards) {
      if (h.done) continue;
      if (!h.warned && c.year >= h.year + h.warn && h.warn < 0) {
        h.warned = true;
        if (c.tech >= (h.id === 'asteroid' ? 0.55 : 0.7)) { c.pending = { kind: 'hazard', id: h.id }; ev.push(hazardEvent(c, h.id)); }
      }
      if (c.year >= h.year) { h.done = true; const r = resolveHazard(c, rng, h, ev); if (r) c.ending = r; if (c.ending || c.pending) break; }
    }
    if (c.ending || c.pending) break;
    // ---- dilemmas
    if (c.year >= c.nextChoice) {
      const pick = pickChoice(c, rng);
      if (pick) { c.pending = { kind: 'choice', id: pick.id }; c.seen[pick.id] = c.year; ev.push({ t: 'choice', id: pick.id, title: pick.title, text: pick.text, options: pick.options.map((o) => ({ label: o.label, hint: o.hint })) }); }
      c.nextChoice = c.year + (c.tech < 0.1 ? 450 : c.tech < 0.3 ? 260 : c.tech < 0.5 ? 130 : c.tech < 0.7 ? 90 : 70) * (0.7 + rng.next() * 0.6);
      break;
    }
  }
  if (c.ending) { ev.push({ t: 'ending', id: c.ending }); c.finished = true; c.active = false; c.log.push({ year: Math.round(c.year), text: ENDINGS[c.ending].title }); }
  return ev;
}

function pickChoice(c: CivState, rng: RNG): CivChoice | null {
  const ok = CHOICES.filter((d) => {
    const seen = c.seen[d.id];
    if (seen !== undefined && !(d.repeat && c.year - seen > d.repeat)) return false;
    if (d.minYear !== undefined && c.year < d.minYear) return false;
    if (d.minTech !== undefined && c.tech < d.minTech) return false;
    if (d.need && !d.need(c)) return false;
    if (d.repeat && seen !== undefined && d.id === 'rockets' && c.space > 0) return false;
    if (d.id === 'orbit' && c.space <= 0.1) return false;
    return true;
  });
  if (!ok.length) return null;
  // oldest topics first (they gate later ones), with some randomness
  return ok[Math.min(ok.length - 1, Math.floor(rng.next() * rng.next() * ok.length))];
}

function applyFx(c: CivState, f: Fx) {
  if (f.pop) c.pop = Math.max(0.1, c.pop * (1 + f.pop));
  for (const k of ['tech', 'eco', 'climate', 'tension', 'stability', 'ai', 'disease', 'space', 'defense', 'shield', 'green', 'wisdom', 'medicine'] as const) { const v = (f as any)[k]; if (v) (c as any)[k] = k === 'wisdom' ? c.wisdom + v : clamp((c as any)[k] + v); }
  if (f.flags) for (const fl of f.flags) if (!c.flags.includes(fl)) c.flags.push(fl);
}

/** Apply the player's answer to the pending dilemma. */
export function answerCiv(c: CivState, rng: RNG, index: number): CivEvent[] {
  const ev: CivEvent[] = []; const p = c.pending; if (!p) return ev;
  c.pending = null;
  if (p.kind === 'choice') {
    const d = CHOICES.find((x) => x.id === p.id)!; const o = d.options[Math.min(index, d.options.length - 1)];
    applyFx(c, o.fx); c.choices.push({ year: Math.round(c.year), title: d.title, pick: o.label }); note(c, ev, `${d.title}: ${o.label}`, 'civ');
  } else resolveWarning(c, rng, p.id, index, ev);
  return ev;
}

// ---- hazards
export interface HazardDef { title: string; text: string; options: { label: string; hint: string; key: string }[] }
const HAZARDS: Record<string, HazardDef> = {
  asteroid: { title: 'A rock with our name on it', text: 'Telescopes have found an asteroid on a collision course. Impact is about sixty years away.', options: [
    { key: 'deflect', label: 'Launch a deflection mission', hint: 'Success depends on how well we prepared' },
    { key: 'bunker', label: 'Build deep shelters and seed vaults', hint: 'Survive the impact; lose most of what we built' },
    { key: 'ignore', label: 'Trust the odds', hint: 'Space is big' } ] },
  rogue: { title: 'A wandering star', text: 'A dim star from deep space will pass through the outer system within a century and a half. The planets will not be the same afterwards.', options: [
    { key: 'ark', label: 'Build ark ships', hint: 'Needs a serious space programme' },
    { key: 'underground', label: 'Dig in and hope', hint: 'A very slim chance' },
    { key: 'ignore', label: 'Carry on', hint: 'It may not come close' } ] },
  orbit: { title: 'The planet is drifting', text: 'Tiny but steady orbital changes are pulling the Earth away from the Sun. In two centuries the oceans will freeze.', options: [
    { key: 'engine', label: 'Build orbital correction engines', hint: 'Needs very advanced technology' },
    { key: 'colonize', label: 'Move to other worlds', hint: 'Needs real colonies' },
    { key: 'ignore', label: 'Adapt as we can', hint: 'The ice is slow' } ] },
  pandemic: { title: 'A new plague', text: 'A pathogen is moving fast across the world and the first wave is already filling hospitals.', options: [
    { key: 'quarantine', label: 'Lock down and trace', hint: 'Costly, effective' },
    { key: 'cure', label: 'Crash cure programme', hint: 'Depends on medicine' },
    { key: 'ignore', label: 'Keep things open', hint: 'Economy first' } ] },
};
function hazardEvent(_c: CivState, id: string): CivEvent { const d = HAZARDS[id]; return { t: 'choice', id: 'hz:' + id, title: d.title, text: d.text, options: d.options.map((o) => ({ label: o.label, hint: o.hint })) }; }
export const hazardOptions = (id: string) => HAZARDS[id].options;

function resolveWarning(c: CivState, rng: RNG, id: string, index: number, ev: CivEvent[]) {
  const key = HAZARDS[id].options[Math.min(index, 2)].key;
  if (id === 'pandemic') {
    const m = c.medicine;
    const pEnd = key === 'ignore' ? c.disease * 0.35 * (1 - m) : key === 'quarantine' ? c.disease * 0.12 * (1 - m) : c.disease * 0.18 * (1 - Math.min(0.95, m * 1.6));
    if (rng.next() < pEnd) c.ending = 'pandemic'; else { c.pop *= key === 'ignore' ? 0.6 : 0.85; c.disease *= 0.5; c.medicine = clamp(c.medicine + 0.15); c.stability = clamp(c.stability - 0.05); note(c, ev, key === 'ignore' ? 'The pandemic killed millions before it faded.' : 'The pandemic was contained after a hard year.', 'civ'); }
    return;
  }
  const h = c.hazards.find((x) => x.id === id)!; h.plan = key;
  c.choices.push({ year: Math.round(c.year), title: HAZARDS[id].title, pick: HAZARDS[id].options.find((o) => o.key === key)!.label });
  note(c, ev, `${HAZARDS[id].title}: ${HAZARDS[id].options.find((o) => o.key === key)!.label}`, 'civ');
}

function resolveHazard(c: CivState, rng: RNG, h: Hazard, ev: CivEvent[]): string | null {
  const hit = (p: number) => rng.next() < p;
  switch (h.id) {
    case 'asteroid': {
      if (h.plan === 'deflect') { if (hit(clamp(0.3 + c.defense * 0.6 + (c.tech - 0.6) * 0.5, 0.05, 0.97))) { c.wisdom += 2; c.stability = clamp(c.stability + 0.1); note(c, ev, 'The asteroid was nudged aside. The sky holds.', 'good'); return null; } return 'asteroid'; }
      if (h.plan === 'bunker' && hit(0.62)) { c.pop *= 0.2; c.tech *= 0.65; c.eco = clamp(c.eco - 0.25); c.stability = 0.3; note(c, ev, 'The impact shook the world. Survivors climbed out of the shelters to rebuild.', 'bad'); return null; }
      if (!h.plan && c.defense >= 0.5 && hit(c.defense * 0.7)) { note(c, ev, 'An unseen asteroid was intercepted at the last minute.', 'good'); return null; }
      return 'asteroid';
    }
    case 'supervolcano': {
      const res = c.tech * 0.5 + c.eco * 0.2 + c.stability * 0.2 + (c.flags.includes('domestic') ? 0.05 : 0);
      if (hit(clamp(0.12 + res * 0.7, 0.1, 0.85))) { c.pop *= 0.45; c.tech *= 0.85; c.eco = clamp(c.eco - 0.15); note(c, ev, 'A supervolcano erupted. A long, cold, grey summer followed, but people endured.', 'bad'); return null; }
      return 'supervolcano';
    }
    case 'solar': {
      if (c.tech < 0.5) { note(c, ev, 'Auroras lit the sky from pole to pole. People talked about it for years.', 'event'); return null; }
      if (hit(clamp(c.shield + 0.12, 0, 0.95))) { note(c, ev, 'A huge solar storm hit. The hardened grid held.', 'good'); return null; }
      return 'solar';
    }
    case 'rogue': {
      if (h.plan === 'ark' && hit(clamp(c.space * 1.1, 0, 0.95))) return 'space';
      if (h.plan === 'underground' && hit(0.12 + c.tech * 0.15)) { c.pop *= 0.1; c.tech *= 0.5; note(c, ev, 'The star passed close. Almost nobody lived to see it leave.', 'bad'); return null; }
      return 'rogue';
    }
    case 'orbit': {
      if (h.plan === 'engine' && hit(clamp((c.tech - 0.8) * 2.5 + c.space * 0.5, 0.02, 0.95))) { c.wisdom += 2; note(c, ev, 'The correction engines fired. The planet is back on a warm path.', 'good'); return null; }
      if (h.plan === 'colonize' && hit(clamp(c.space * 0.9, 0, 0.95))) return 'space';
      return 'orbit';
    }
  }
  return null;
}

export function summary(c: CivState) {
  return { active: c.active, started: c.started, finished: c.finished, year: Math.round(c.year), pop: c.pop, tech: c.tech, eco: c.eco, climate: c.climate, tension: c.tension, stability: c.stability, ai: c.ai, disease: c.disease, space: c.space, defense: c.defense, shield: c.shield, name: c.name, era: civEra(c), ending: c.ending, log: c.log.slice(-10), peakPop: c.peakPop,
    watch: c.hazards.filter((h) => h.warned && !h.done).map((h) => ({ id: h.id, years: Math.round(h.year - c.year) })) };
}
