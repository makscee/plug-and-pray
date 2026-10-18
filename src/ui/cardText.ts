// Item card text (Maks 10-18: "prioritize what is important about module mechanics"): per module, ONE
// line saying what it does for you in play, and one "good for / tradeoff" line. The key numbers come
// from the module's params (so rolls, rarity and levels show), the noise stats go to a dim footer.
// Pure (no DOM), so vitest reads it. Keyed by module id; a module missing here falls back to describe.ts.

import { def, label, param, RARITY_MULT, rarityKey, rarityOf, size, BETTER, type Modish } from '../core/mods';
import { perkText } from '../mods/uniques';
import { does as describeDoes } from '../mods/describe';

export interface CardText {
  /** the mechanic: what it does for you in play */
  does: string;
  /** good for / the tradeoff */
  good: string;
}

export const CARD_TEXT: Record<string, CardText> = {
  // ---- eyes
  'pinhole-eye': { does: 'a dim grey view of what is ahead', good: 'free to run (0 power) · short, slow and grey: swap it out early' },
  'dawn-eye': { does: 'a clear colour view: you see what things are', good: 'the honest all-rounder · needs light to see far in the dark' },
  'vidicon-tube': { does: 'a colour view that smears when you move', good: 'cheap colour at 1 power · ghosts trail behind moving things' },
  'saints-lens': { does: 'a sharp, far, fast colour view', good: 'the best plain eye · 4 power and 2 slots' },
  'carrion-eye': { does: 'black & white view; reads scratched walls, sees mimics breathe', good: 'spotting scripture and mimics · needs only half the light' },
  'bat-psalter': { does: 'sonar view: sees in the dark and finds hollow walls to break', good: 'the dark ossuary and secrets · loud: everything hears you' },
  'ember-iris': { does: 'heat view: warm things through walls, warm handprints show caches', good: 'seeing foes before they see you · blind in the furnace, walls are vague' },
  'lattice-eye': { does: 'outline view: sees in the dark and reads scratched walls', good: 'dark halls without a lamp · 3 power, no colours' },
  'fog-of-saints': { does: 'a soft, slow colour view that reaches far', good: 'colour for 1 power · 2 frames a second, blurred' },
  'ninth-eye': { does: 'a wide, far colour view that sees the hidden (the hum) in full', good: 'the best eye there is · 3 power' },
  'pilgrim-scope': { does: 'a wide, quick colour view: the first-person eye', good: 'aiming with the reins · 2 power' },
  'martyr-scope': { does: 'a wider, sharper first-person colour view', good: 'floor 4 fights with the reins · 3 power' },
  // ---- scanners: through-wall senses on the view
  'heat-choir': { does: 'shows warm things through walls, all round you', good: 'knowing what waits behind a corner · short reach' },
  lodestone: { does: 'shows metal and memory cards through walls; mimics wake early', good: 'finding cards and mimics · 1 power' },
  'bone-listener': { does: 'shows hidden flesh through walls, ahead of you', good: 'finding the hum and hidden things · only ahead' },
  'conduit-dowser': { does: 'shows passages through walls and puts them on your map', good: 'finding the way on a maze floor · slow refresh' },
  'marrow-rod': { does: 'shows veins through walls, ahead of you', good: 'finding copper and glass to drain · only ahead' },
  'watchers-bell': { does: 'shows every enemy and card through walls, all round you', good: 'never being surprised · 2 power' },
  // ---- radars: marks on the map
  'thread-bell': { does: 'marks every heart near you on the map, roughly', good: 'free (0 power) warning of what is close · short reach' },
  'sounding-knell': { does: 'marks "something" far off on the map: a find, a cache or a guard', good: 'finding things to walk to · loud, and only roughly where' },
  'hollow-tap': { does: 'marks hollow walls and warm plates (caches) on the map', good: 'cache hunting · not what is inside' },
  'vein-fork': { does: 'marks veins far off on the map, and names the ore', good: 'farming copper and glass for shops' },
  'pulse-choir': { does: 'marks every heart far off on the map, roughly', good: 'seeing packs before they see you · 2 power' },
  'plumb-line': { does: 'marks the way down and its keeper on the map, the whole floor', good: 'going straight for the stairs · slow' },
  'bone-glass': { does: 'marks sealed caches far off on the map, and names what is inside', good: 'picking which cache is worth breaking · 2 power' },
  // ---- lamps
  halo: { does: 'lights the cells around you so eyes see in the dark', good: 'colour eyes in dark halls · things see you farther' },
  censer: { does: 'a flickering light around you; warmth against the cold', good: 'the ossuary · it gutters, and things see you farther' },
  'cold-star': { does: 'a big steady light around you', good: 'seeing far with a colour eye in the dark · everything sees you' },
  // ---- legs and walkers
  'stepper-relay': { does: 'walk cell by cell: go <dir> <n>, arrows, map clicks', good: 'your legs · without legs you crawl' },
  'servo-gait': { does: 'walk with the arrow keys, cell to cell, fast', good: 'quick hands-on moving · 1 power' },
  'gyro-heart': { does: 'walk free with wasd, q and e turn', good: 'smooth moving and dodging · 2 power' },
  'tunnel-tongue': { does: 'dig: eats the plain wall in front of you', good: 'making shortcuts and escapes · not through ore' },
  'wayfinder-moth': { does: 'walks you to a spot you pick: goto, waypoints, map clicks', good: 'crossing known ground hands-off' },
  'psalm-of-roads': { does: 'walks you far to a spot you pick, around enemies it sees', good: 'long safe walks · 2 power' },
  sleepwalker: { does: 'walks you to a near spot you pick, slowly', good: 'free (0 power) auto-walk · slow, short plans' },
  // ---- weapons
  'spark-finger': { does: 'zaps the nearest foe next to you, by itself', good: 'a cheap first weapon · very short reach' },
  'nail-psalm': { does: 'shoots a nail at the nearest foe you see, fast', good: 'steady ranged damage for 1 power' },
  'ember-spit': { does: 'shoots a stream of weak sparks', good: 'chewing through packs at range · weak per hit vs armour' },
  'bone-lance': { does: 'shoots one heavy spear', good: 'big single targets and bosses · slow between shots' },
  'choir-bell': { does: 'hits everything within 2 cells at once', good: 'swarms of mites · you must let them close' },
  'rivet-sling': { does: 'flicks iron at anything in sight, by itself', good: 'an easy first ranged weapon · slow' },
  'censer-flail': { does: 'hits everything close at once, and keeps you warm', good: 'swarms in the cold ossuary · 2 power, short reach' },
  'heat-lance': { does: 'shoots a heavy needle that goes far', good: 'killing bosses from a distance · 3 power' },
  'reliquary-saw': { does: 'shreds whatever is next to you, fast', good: 'melee damage · 3 power, you must stand close' },
  // ---- body
  'lead-lung': { does: 'you mend faster, and still mend in the cold', good: 'long fights and the ossuary' },
  'frost-coat': { does: 'every hit on you is softer; mite bites do nothing', good: 'swarms of small biters' },
  'mirror-ward': { does: 'throws the next hit back, then rests', good: 'big slow hitters and bosses · 2 power' },
  'reliquary-ribs': { does: 'more max hp', good: 'surviving everything a little longer' },
  'ossuary-plate': { does: 'every hit on you is much softer', good: 'bosses and heavy hitters · 2 power' },
  'overclock-coil': { does: 'all your weapons fire faster', good: 'more damage from every weapon · 3 power, loud' },
  'suture-moth': { does: 'heals you once when you drop below half hp, then rests', good: 'a second wind in hard fights' },
  'rime-hood': { does: 'keeps the furnace heat off you', good: 'the furnace · elsewhere cold: no mending without light' },
  'thorn-mantle': { does: 'whatever hits you up close takes damage back', good: 'swarms that bite a lot' },
  // ---- mind
  'map-spool': { does: 'a map of what your eyes saw; on floor 1 a click walks you there', good: 'not getting lost · plain inks' },
  'survey-spool': { does: 'a map with veins and finds in their own colours; click to walk', good: 'routing to loot · 2 power' },
  'illuminated-atlas': { does: 'a map with pictures and notes on hover; click to walk', good: 'reading a floor at a glance · 2 power' },
  'glass-diorama': { does: 'a 3D map of the halls with every thing in them; click to walk', good: 'seeing everything nearby · 3 power, smaller span' },
  'waystone-log': { does: 'notes the places that matter as you pass, each with go', good: 'walking back to printers and readers' },
  'pilgrims-rosary': { does: 'notes twice as many places, finds and veins too, each with go', good: 'a long memory of the floor' },
  'card-reader': { does: 'reads memory cards: they point to finds', good: 'turning cards into loot · 1 power' },
  ledger: { does: 'kills drop loot more often', good: 'farming bone and copper while you fight' },
  'drowned-compass': { does: 'points to what the cards promised', good: 'free (0 power) guide to card finds' },
  'clock-of-hours': { does: 'shows where enemies will be a moment ahead', good: 'dodging and aiming · 2 power' },
  'saints-reins': { does: 'tab: the mouse looks, a click shoots, wasd walks', good: 'first-person aiming · its own socket' },
  'martyrs-reins': { does: 'first-person control, firing faster, wider view, shift dashes', good: 'floor 4 fights · its own socket' },
  // ---- power and slots
  'ember-cell': { does: 'more power for your modules', good: 'quiet power · takes a slot' },
  'votive-battery': { does: 'more power for your modules', good: 'a big boost · it whispers: things notice you' },
  'heart-shard': { does: 'a lot more power for your modules', good: 'running many modules · everything hears it' },
  'slot-board': { does: 'one more slot, for good', good: 'always worth it · used up when installed' },
  // ---- tools
  'leech-needle': { does: 'drains a vein next to you for resources', good: 'copper and glass for shops · loud: wakes things' },
  'bone-auger': { does: 'drains veins fast, twice the yield', good: 'quick resources · very loud' },
  // ---- the end
  'thaw-engine': { does: 'install it to end the run', good: 'the heart: the ending' },
  // ---- uniques: the perk is the mechanic
  'leech-psalm': { does: 'bites what comes close; every kill mends you 1 hp', good: 'staying alive in swarms' },
  'vitus-chain': { does: 'each hit leaps on to 2 more foes nearby, at half', good: 'packs: one shot hits three' },
  'penitent-heels': { does: 'arrow-key legs that leave ash: foes on it move at half speed', good: 'kiting chasers' },
  'unrolled-reel': { does: 'a map that also shows loot within 16 cells, through walls', good: 'finding every module on a floor' },
  'ignis-lantern': { does: 'a light that burns foes standing in it', good: 'chip damage on everything near · light makes you seen' },
  'saints-last-lens': { does: 'a far colour view that sees through one wall', good: 'seeing foes and rooms behind walls · 4 power, 2 slots' },
  'kiln-heart': { does: 'power that grows the deeper you go: +5 in the furnace', good: 'late floors' },
  'drowned-bell': { does: 'hits everything within 2 cells and slows it to half for 2 s', good: 'swarms and escapes' },
  'last-rite': { does: 'a blow that would kill you leaves you at 1 hp, once per 90 s', good: 'a second chance in boss fights' },
  'vey-mirror': { does: 'throws the next hit back at every foe within 2.5 cells', good: 'surrounded by a pack' },
};

const n = (v: number) => (Math.round(v * 10) / 10).toString();
const FILTER: Record<string, string> = { color: 'colour', gray: 'grey', '1bit': 'b&w', heat: 'heat', sonar: 'sonar', edge: 'outlines' };

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
  return parts.join(' · ');
}

/** the flavour: its first sentence, at most one short line */
export function flavour(m: Modish): string {
  const t = def(m).text ?? '';
  const first = t.split(/(?<=\.)\s/)[0] ?? '';
  return first.length > 70 ? first.slice(0, 68).replace(/\s+\S*$/, '') + '…' : first;
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
    name: label(m),
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
