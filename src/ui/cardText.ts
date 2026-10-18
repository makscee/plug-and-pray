// Item card text (Maks 10-18: "prioritize what is important about module mechanics"): per module, ONE
// line saying what it does for you in play, and one "good for / tradeoff" line. The key numbers come
// from the module's params (so rolls, rarity and levels show), the noise stats go to a dim footer.
// Pure (no DOM), so vitest reads it. Keyed by module id; a module missing here falls back to describe.ts.

import { def, label, LEVEL_STEP, levelKey, param, RARITY_MULT, rarityKey, rarityOf, size, BETTER, type Modish } from '../core/mods';
import { perkText } from '../mods/uniques';
import { does as describeDoes } from '../mods/describe';

export interface CardText {
  /** the mechanic: what it does for you in play */
  does: string;
  /** good for / the tradeoff */
  good: string;
}

export const CARD_TEXT: Record<string, CardText> = {
  // ---- eyes (each one is a first-person view: wasd + mouse look)
  'pinhole-eye': { does: 'a dim grey first-person view', good: 'your first sight · short, slow, grey' },
  'dawn-eye': { does: 'a clear colour view', good: 'the all-rounder · needs light in the dark' },
  'vidicon-tube': { does: 'a colour view that smears when you move', good: 'cheap colour · moving things leave ghosts' },
  'saints-lens': { does: 'a sharp, far, fast colour view', good: 'the best plain eye · takes 2 slots' },
  'carrion-eye': { does: 'a black & white view; reads wall scratches, spots mimics', good: 'scripture and mimics · needs half the light' },
  'bat-psalter': { does: 'a sonar view: sees in the dark, finds hollow walls', good: 'the dark ossuary, secrets · loud: foes hear you' },
  'ember-iris': { does: 'a heat view: warm things show through walls', good: 'seeing foes first · blind in the furnace' },
  'lattice-eye': { does: 'an outline view: sees in the dark, reads wall scratches', good: 'dark halls without a lamp · no colour' },
  'fog-of-saints': { does: 'a soft, slow colour view that reaches far', good: 'cheap far colour · blurry, 2 frames/s' },
  'ninth-eye': { does: 'a wide, far colour view; shows the hum', good: 'the best eye · rare' },
  'pilgrim-scope': { does: 'a wide, quick colour view', good: 'fights with the reins' },
  'martyr-scope': { does: 'a wider, sharper colour view', good: 'floor 4 fights with the reins' },
  // ---- scanners: through-wall senses on the view
  'heat-choir': { does: 'shows warm things through walls, all round', good: 'knowing what waits round a corner · short reach' },
  lodestone: { does: 'shows metal and memory cards through walls', good: 'finding cards · mimics wake early' },
  'bone-listener': { does: 'shows hidden flesh through walls, ahead', good: 'finding the hum · only ahead' },
  'conduit-dowser': { does: 'shows passages through walls and maps them', good: 'maze floors · slow refresh' },
  'marrow-rod': { does: 'shows veins through walls, ahead', good: 'finding copper and glass · only ahead' },
  'watchers-bell': { does: 'shows every foe and card through walls, all round', good: 'never being surprised' },
  // ---- radars: marks on the map
  'thread-bell': { does: 'marks hearts near you on the map, roughly', good: 'a free early warning · short reach' },
  'sounding-knell': { does: 'marks far finds, caches and guards on the map', good: 'finding where to walk · loud, rough' },
  'hollow-tap': { does: 'marks hollow walls and caches on the map', good: 'cache hunting · not what is inside' },
  'vein-fork': { does: 'marks far veins on the map, with the ore name', good: 'farming copper and glass for shops' },
  'pulse-choir': { does: 'marks every heart far off on the map, roughly', good: 'seeing packs before they see you' },
  'plumb-line': { does: 'marks the stairs and their keeper, whole floor', good: 'going straight down · slow refresh' },
  'bone-glass': { does: 'marks far caches and names what is inside', good: 'picking which cache to open' },
  // ---- lamps
  halo: { does: 'lights the cells around you', good: 'colour eyes in dark halls · foes see you farther' },
  censer: { does: 'a flickering light that keeps the cold off', good: 'the ossuary · foes see you farther' },
  'cold-star': { does: 'a big steady light around you', good: 'far sight in the dark · every foe sees you' },
  // ---- legs and walkers
  'stepper-relay': { does: 'walk cell by cell: go <dir> <n>, arrows, map clicks', good: 'your legs · without legs you crawl' },
  'servo-gait': { does: 'walk cell to cell with the arrow keys, fast', good: 'quick hands-on moving' },
  'gyro-heart': { does: 'walk free with wasd; q and e turn', good: 'smooth moving and dodging' },
  'tunnel-tongue': { does: 'digs through the plain wall in front of you', good: 'shortcuts and escapes · not through ore' },
  'wayfinder-moth': { does: 'walks you to a spot you pick (goto, map click)', good: 'crossing known ground hands-off' },
  'psalm-of-roads': { does: 'walks you far to a spot, around foes it sees', good: 'long safe walks' },
  sleepwalker: { does: 'walks you to a near spot you pick, slowly', good: 'free auto-walk · slow, short' },
  // ---- weapons
  'spark-finger': { does: 'zaps the nearest foe next to you, by itself', good: 'a cheap first weapon · very short reach' },
  'nail-psalm': { does: 'shoots a nail at the nearest foe in sight', good: 'steady ranged damage' },
  'ember-spit': { does: 'shoots a fast stream of weak sparks', good: 'packs at range · weak against armour' },
  'bone-lance': { does: 'shoots one heavy spear', good: 'big targets and bosses · slow to reload' },
  'choir-bell': { does: 'hits all foes within 2 cells at once', good: 'mite swarms · they must come close' },
  'rivet-sling': { does: 'flicks iron at a foe in sight, by itself', good: 'an easy first ranged weapon · slow' },
  'censer-flail': { does: 'hits all foes close by; keeps the cold off', good: 'swarms in the ossuary · short reach' },
  'heat-lance': { does: 'shoots a heavy, long-range needle', good: 'bosses from afar' },
  'reliquary-saw': { does: 'shreds the foe next to you, fast', good: 'melee damage · you must stand close' },
  // ---- body
  'lead-lung': { does: 'you mend faster, even in the cold', good: 'long fights and the ossuary' },
  'frost-coat': { does: 'every hit on you is softer; mite bites do nothing', good: 'swarms of small biters' },
  'mirror-ward': { does: 'throws the next hit back, then recharges', good: 'big slow hitters and bosses' },
  'reliquary-ribs': { does: 'more max hp', good: 'surviving a little longer' },
  'ossuary-plate': { does: 'every hit on you is much softer', good: 'bosses and heavy hitters' },
  'overclock-coil': { does: 'all your weapons fire faster', good: 'more damage from every weapon · loud' },
  'suture-moth': { does: 'heals you once below half hp, then recharges', good: 'a second wind in hard fights' },
  'rime-hood': { does: 'keeps the furnace heat off you', good: 'the furnace · elsewhere you mend only in light' },
  'thorn-mantle': { does: 'foes that hit you up close take damage back', good: 'swarms that bite a lot' },
  // ---- mind
  'map-spool': { does: 'a map of what your eyes saw; floor 1: click to walk', good: 'not getting lost' },
  'survey-spool': { does: 'a map with veins and finds coloured; click to walk', good: 'routing to loot' },
  'illuminated-atlas': { does: 'a map with icons and hover notes; click to walk', good: 'reading a floor at a glance' },
  'glass-diorama': { does: 'a 3D map of the halls and all in them; click to walk', good: 'seeing everything nearby · smaller span' },
  'waystone-log': { does: 'notes key places as you pass, each with go', good: 'walking back to printers and readers' },
  'pilgrims-rosary': { does: 'notes twice as many places, finds and veins too', good: 'a long memory of the floor' },
  'card-reader': { does: 'reads memory cards: they point to finds', good: 'turning cards into loot' },
  ledger: { does: 'kills drop loot more often', good: 'farming bone and copper while you fight' },
  'drowned-compass': { does: 'points to what your cards promised', good: 'a free guide to card finds' },
  'clock-of-hours': { does: 'shows where foes will be a moment ahead', good: 'dodging and aiming' },
  'saints-reins': { does: 'tab: mouse looks, click shoots, wasd walks', good: 'first-person aiming · its own socket' },
  'martyrs-reins': { does: 'first-person control; faster fire, wider view, shift dashes', good: 'floor 4 fights · its own socket' },
  // ---- power and slots
  'ember-cell': { does: 'more power for your modules', good: 'quiet power · takes a slot' },
  'votive-battery': { does: 'more power for your modules', good: 'a big boost · a little loud' },
  'heart-shard': { does: 'a lot more power for your modules', good: 'running many modules · very loud' },
  'slot-board': { does: 'one more slot, for good', good: 'always worth it · used up when installed' },
  // ---- tools
  'leech-needle': { does: 'drains a vein next to you for resources', good: 'copper and glass for shops · loud' },
  'bone-auger': { does: 'drains veins fast, twice the yield', good: 'quick resources · very loud' },
  // ---- the end
  'thaw-engine': { does: 'install it to end the run', good: 'the ending' },
  // ---- uniques: the perk is the mechanic
  'leech-psalm': { does: 'zaps foes next to you; each kill heals 1 hp', good: 'staying alive in swarms' },
  'vitus-chain': { does: 'each hit jumps to 2 more foes, at half damage', good: 'packs: one shot hits three' },
  'penitent-heels': { does: 'arrow-key legs that leave ash: foes on it go half speed', good: 'kiting chasers' },
  'unrolled-reel': { does: 'a map that shows loot within 16 cells, through walls', good: 'finding every module on a floor' },
  'ignis-lantern': { does: 'a light that burns foes standing in it', good: 'chip damage on all near · foes see you' },
  'saints-last-lens': { does: 'a far colour view that sees through one wall', good: 'foes and rooms behind walls · 2 slots' },
  'kiln-heart': { does: 'power that grows the deeper you go: +5 in the furnace', good: 'late floors' },
  'drowned-bell': { does: 'hits all foes within 2 cells; slows them to half for 2 s', good: 'swarms and escapes' },
  'last-rite': { does: 'a killing blow leaves you at 1 hp, once per 90 s', good: 'a second chance in boss fights' },
  'vey-mirror': { does: 'throws the next hit back at all foes within 2.5 cells', good: 'when a pack surrounds you' },
};

const n = (v: number) => (Math.round(v * 10) / 10).toString();
const FILTER: Record<string, string> = { color: 'colour', gray: 'grey', '1bit': 'b&w', heat: 'heat', sonar: 'sonar', edge: 'outlines' };

/** v3 econ (v3r2: the log said "damage 1.5 → 2", the card "1.1 → 1.4 dmg/s"): what a level step moves, in the
 *  card's own number: "1.1 → 1.4 dmg/s", with the real gain in % */
export function levelDiff(m: Modish, to: number): { text: string; pct: number } {
  const a = keyNums(m)[0], b = keyNums({ ...m, level: to })[0];
  // the gain from the real numbers, not the rounded ones on the card
  const key = levelKey(m);
  const x = key ? param<number>(m, key, 0) : 0, y = key ? param<number>({ ...m, level: to }, key, 0) : 0;
  const pct = x > 0 && y > 0 ? Math.round((Math.max(x, y) / Math.min(x, y) - 1) * 100) : 0;
  if (!a || !b || a === b) return { text: '', pct };
  // "sees 6 cells" → "sees 6 → 8.1 cells": the words round the number once
  const re = /^(.*?)([+−-]?[\d.]+)(.*)$/;
  const [, pa, xa, sa] = re.exec(a) ?? [], [, pb, xb, sb] = re.exec(b) ?? [];
  return { text: xa && xb && pa === pb && sa === sb ? `${pa}${xa} → ${xb}${sa}` : `${a} → ${b}`, pct };
}

/** v3-modules adds a level (1-3) on module instances; nothing when it is absent */
export function levelOf(m: Modish): number {
  const l = (m as { level?: number }).level;
  return typeof l === 'number' && l > 0 ? l : 0;
}
export const roman = (l: number): string => ['', 'I', 'II', 'III', 'IV', 'V'][l] ?? String(l);

/** the kind word under the name */
export function kindOf(m: Modish): string {
  const d = def(m);
  const p = <T extends number | string | boolean>(k: string) => param<T>(m, k, undefined as unknown as T);
  switch (d.family) {
    case 'camera': return 'eye';
    case 'scanner': return p('finds') ? 'radar' : 'scanner';
    case 'gait': return p('pilot') ? 'pilot' : p('dig') ? 'digger' : 'legs';
    case 'mind': { const w = p<string>('what'); return w === 'map' ? 'map' : w === 'reins' ? 'control' : w; }
    case 'power': return p('slots') ? 'slot board' : 'power';
    case 'unique': return 'the heart';
    default: return d.family;
  }
}

/** the 1-2 numbers that matter for the decision */
export function keyNums(m: Modish): string[] {
  const d = def(m);
  const p = (k: string) => param<number>(m, k, 0);
  const has = (k: string) => !!param(m, k, false);
  switch (d.family) {
    case 'camera': {
      const f = param<string>(m, 'filter', 'color');
      return [`sees ${n(p('range'))} cells`, FILTER[f] ?? f];
    }
    case 'scanner':
      if (has('finds')) return [p('range') > 200 ? 'whole floor' : `${n(p('range'))} cells`, `every ${n(p('every'))} s`];
      return [`${n(p('range'))} cells`, param<string>(m, 'shape', 'ring') === 'cone' ? 'ahead' : 'all round'];
    case 'lamp': return [`lights ${n(p('radius'))} cells`];
    case 'gait':
      if (has('pilot')) return [`${n(p('pace'))} cells/s`, `plans ${n(p('plan'))} cells`];
      if (has('keys')) return [`${n(p('pace'))} cells/s`];
      if (has('free')) return [`${n(p('speed'))} cells/s`];
      if (has('dig')) return [`a wall every ${n(p('cooldown'))} s`];
      return [];
    case 'weapon':
      return [`${n(p('damage') / Math.max(0.05, p('cooldown')))} dmg/s`, `reach ${n(p('range'))}${param<string>(m, 'aim', 'auto') === 'aimed' ? ', aimed' : ''}`];
    case 'body':
      if (has('hp')) return [`+${n(p('hp'))} max hp`];
      if (has('regen')) return [`+${n(p('regen'))} hp/s`];
      if (has('armour')) return [`−${n(p('armour'))} per hit`];
      if (has('ward')) return [`rests ${n(p('recharge'))} s`];
      if (has('haste')) return [`+${Math.round(p('haste') * 100)}% fire rate`];
      if (has('mend')) return [`+${n(p('mend'))} hp`, `every ${n(p('recharge'))} s`];
      if (has('heatproof')) return [`${Math.round(Math.min(1, p('heatproof')) * 100)}% heat off`];
      if (has('thorns')) return [`${n(p('thorns'))} dmg back`];
      return [];
    case 'mind': {
      const w = param<string>(m, 'what', '');
      if (w === 'map') return [`${n(p('span'))} cells across`];
      if (w === 'log') return [`keeps ${n(p('keep'))} places`];
      if (w === 'ledger') return [`${n(p('tithe') || 1)}× drops`];
      if (w === 'clock') return [`${n(p('ahead'))} s ahead`, `${n(p('range'))} cells`];
      if (w === 'reins' && p('big') >= 2) return [`+${Math.round(p('rate') * 100)}% fire`];
      return [];
    }
    case 'power':
      if (has('slots')) return [`+${n(p('slots'))} slot`];
      return [`+${Math.round(p('power'))}⚡︎`];
    case 'tool': return [`×${n(p('drain'))} yield`, `every ${n(p('cooldown'))} s`];
    default: return [];
  }
}

/** power and slot: always on the card */
export function costLine(m: Modish): string {
  const d = def(m);
  const slot = param<string>(m, 'what', '') === 'reins' ? 'own socket' : param(m, 'slots', 0) ? 'used up' : size(m) > 1 ? `${size(m)} slots` : '1 slot';
  return `${d.family === 'power' ? '0⚡︎' : `${d.power}⚡︎`} · ${slot}`;
}

/** the dim footer: warm-up, loudness, and what a roll or rarity changed (the rest of the noise is gone) */
export function footer(m: Modish): string {
  const d = def(m);
  const parts: string[] = [];
  if (d.warm) parts.push(`warms ${n(d.warm)} s`);
  const loud = param<number>(m, 'loud', 0);
  if (loud) parts.push(`loud +${n(loud)} cells`);
  if (m.roll) parts.push(`${m.roll.tag}: ${m.roll.key} ×${m.roll.mult}`);
  const r = rarityOf(m);
  const k = rarityKey(m);
  if (RARITY_MULT[r] && k) parts.push(`${r}: ${k} ${BETTER[k] === 'down' ? '−' : '+'}${Math.round((RARITY_MULT[r]! - 1) * 100)}%`);
  // v3 modules: what its level moved
  const lk = levelKey(m);
  const lv = levelOf(m);
  if (lv > 1 && lk) parts.push(`level ${roman(lv)}: ${lk} ${d.family === 'power' ? `+${lv - 1}` : `${BETTER[lk] === 'down' ? '−' : '+'}${Math.round(LEVEL_STEP * (lv - 1) * 100)}%`}`);
  return parts.join(' · ');
}

/** the flavour: its first sentence or clause, at most 6 words, or none (Maks 10-18: short, to the point) */
export function flavour(m: Modish): string {
  const t = def(m).text ?? '';
  const first = (t.split(/(?<=\.)\s/)[0] ?? '').trim();
  const words = (x: string) => x.split(/\s+/).filter(Boolean).length;
  if (words(first) <= 6) return first;
  const clause = first.split(/[,:;]/)[0].trim();
  return words(clause) <= 6 ? clause + '.' : '';
}

/** the mechanic line (a module not in CARD_TEXT says what describe.ts says, minus its family word) */
export function mechanic(m: Modish): string {
  const t = CARD_TEXT[m.mod];
  if (t) return t.does;
  return describeDoes(m).replace(/^[a-z ]+ · /, '');
}

/** everything a card shows, in order */
export interface Card {
  name: string;
  level: string;
  kind: string;
  rarity: string;
  does: string;
  nums: string[];
  cost: string;
  good: string;
  flavour: string;
  foot: string;
}
export function card(m: Modish): Card {
  const r = rarityOf(m);
  const perk = perkText(m);
  return {
    name: label({ ...m, level: undefined } as Modish),
    level: levelOf(m) ? roman(levelOf(m)) : '',
    kind: kindOf(m),
    rarity: perk ? 'unique' : r === 'common' ? '' : r,
    does: mechanic(m),
    nums: keyNums(m),
    cost: costLine(m),
    good: CARD_TEXT[m.mod]?.good ?? '',
    flavour: flavour(m),
    foot: footer(m),
  };
}

/** a one-line summary for tight places (module windows, kit tiles): the mechanic, then the key numbers */
export const short = (m: Modish): string => [mechanic(m), ...keyNums(m)].join(' · ');
