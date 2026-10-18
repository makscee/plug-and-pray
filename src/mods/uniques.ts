// Uniques (v2 rarity, docs/modules.md): named relics, each a module family's body with one perk that changes
// how you play. They never roll as loot (tier 3): one lies in the cradle's outer ring, each elite gives one up,
// and reliquaries past the cradle keep one now and then. The perks live where their family's code is
// (weapon.ts chain and slow, sense.ts and scene.ts xray, body.ts mirror) and in src/mods/relics.ts (the rest).
import './table';
import { MODS, mod, param, type Modish } from '../core/mods';
import { open } from '../core/grid';
import { hash, rng } from '../core/rng';
import type { Game, Item } from '../core/types';

export interface Unique {
  id: string;
  base: string;
  title: string;
  perk: string;
  /** what the perk does, in plain words (describe, info) */
  does: string;
  text: string;
  /** found early (the cradle's relic): cheap, and a help from the first minute */
  early?: boolean;
}

export const UNIQUES: Unique[] = [
  { id: 'leech-psalm', base: 'spark-finger', title: 'the leech psalm', perk: 'leech', early: true, does: 'every kill while it is on mends 1 hp', text: 'it sings over every death and drinks the last note.' },
  { id: 'vitus-chain', base: 'rivet-sling', title: 'the chain of saint vitus', perk: 'chain', early: true, does: 'each hit leaps on to 2 more foes within 3 cells, at half', text: 'each rivet dances on to the next, and the next.' },
  { id: 'penitent-heels', base: 'servo-gait', title: "the penitent's heels", perk: 'trail', early: true, does: 'leaves ash where you walk: foes on it move at half speed for 5 s (grey on the map)', text: 'they leave ash where they walk. what follows wades.' },
  { id: 'unrolled-reel', base: 'map-spool', title: "the pilgrim's unrolled reel", perk: 'loot', early: true, does: 'what lies on floors within 16 cells shows on your map, through walls', text: 'it remembers floors you never walked, and what lies on them.' },
  { id: 'ignis-lantern', base: 'censer', title: 'the lantern of saint ignis', perk: 'burn', early: true, does: 'foes in its light burn: 0.5 dmg every 1.5 s', text: 'it does not only light the dark. it burns what stands in it.' },
  { id: 'saints-last-lens', base: 'saints-lens', title: "the saint's last lens", perk: 'xray', does: 'sees through one wall: foes behind it show faint, and the rooms behind go on your map', text: 'the last thing the saint saw was through a wall. it still looks there.' },
  { id: 'kiln-heart', base: 'ember-cell', title: 'the kiln heart', perk: 'kiln', does: '+1 more power for each zone deeper you stand: +5 in the furnace', text: 'a coal from the god\'s own furnace. the deeper and hotter, the brighter.' },
  { id: 'drowned-bell', base: 'choir-bell', title: 'the bell of the drowned choir', perk: 'slow', does: 'what it rings moves at half speed for 2 s', text: 'it rings under black water. whatever hears it moves like it is drowning.' },
  { id: 'last-rite', base: 'reliquary-ribs', title: "the abbot's last rite", perk: 'rite', does: 'a blow that would end you leaves you at 1 hp instead, then it sleeps 90 s', text: 'a prayer folded into the ribs. it is said once, at the end, and then again.' },
  { id: 'vey-mirror', base: 'mirror-ward', title: 'the mirror of saint vey', perk: 'all', does: 'the ward throws the hit back at every foe within 2.5 cells', text: 'it gives the blow back to everyone who stood near.' },
];
/** the ninth eye (placed by a card's vector, src/world/vectors.ts) is a unique too: it sees the hidden */
export const NINTH = { id: 'ninth-eye', perk: 'hidden', does: 'sees the hidden (the hum) in full colour' };

for (const u of UNIQUES) {
  const b = MODS[u.base];
  mod({ ...b, id: u.id, name: u.title, tier: 3, params: { ...b.params, perk: u.perk }, text: u.text });
}
MODS[NINTH.id].params.perk = NINTH.perk;

/** a module's perk ('' for none) */
export const perk = (m: Modish): string => (MODS[m.mod] ? param<string>(m, 'perk', '') : '');
/** what a unique's perk does, or '' */
export function perkText(m: Modish): string {
  if (m.mod === NINTH.id) return NINTH.does;
  return UNIQUES.find((u) => u.id === m.mod)?.does ?? '';
}
export const isUnique = (id: string): boolean => id === NINTH.id || UNIQUES.some((u) => u.id === id);
/** the item for a unique: rarity and title ride along */
export const uniqueItem = (id: string): Item => ({ kind: 'mod', mod: id, rarity: 'unique', title: MODS[id].name });

/** uniques dealt so far, per game: each one shows up once a run (until the deck runs out) */
const dealt = new WeakMap<Game, Set<string>>();
/** the next unique from this run's deck (seeded): `early` deals only the cheap ones */
export function dealUnique(g: Game, early = false): Item {
  let s = dealt.get(g);
  if (!s) dealt.set(g, (s = new Set()));
  const r = rng(hash(g.seed, 71));
  const deck = UNIQUES.map((u) => [r(), u] as const).sort((a, b) => a[0] - b[0]).map(([, u]) => u);
  const held = (id: string) => g.player.inv.some((i) => i.kind === 'mod' && i.mod === id) || g.player.installed.some((i) => i.mod === id);
  const u = deck.find((u) => !s!.has(u.id) && (!early || u.early)) ?? deck.find((u) => !held(u.id)) ?? deck[0];
  s.add(u.id);
  return uniqueItem(u.id);
}

/** a straight line that crosses at most one wall, a cell or so thick (the saint's last lens) */
export function throughOne(g: Game, ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3);
  let runs = 0;
  let len = 0;
  let inWall = false;
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const shut = !open(g, ax + (bx - ax) * t, ay + (by - ay) * t);
    if (shut && !inWall) runs++;
    if (shut) len++;
    inWall = shut;
    // samples are a third of a cell: one wall cell, crossed on a slant, takes up to five
    if (runs > 1 || len > 5) return false;
  }
  return true;
}
