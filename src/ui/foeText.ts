// v4 foes (Maks 10-18: "you just walk around and eat red dots, there should be some decisions behind it"):
// what each foe is, in a line; one concrete tip; whether it is worth the fight; what it wants you to hit it
// with; and its mark on the map. Plain data and small pure helpers, so the window (src/ui/foes.ts) and the
// map (src/sight/foes.ts) read the same thing and the tests can too.

/** how you best hurt it: `sweep` a weapon that hits all near at once, `big` one heavy blow (armour eats small
 *  ones), `reach` from afar (it stands still and fires down lines), `any` whatever you have */
export type Want = 'sweep' | 'big' | 'reach' | 'any';
/** the call: `fight` it pays, `avoid` it hurts and pays little, `either` your choice */
export type Worth = 'fight' | 'avoid' | 'either';
/** the map mark: dot (small fry), diamond (a lamp: stands still), square (heavy), triangle (a trick) */
export type Glyph = 'dot' | 'diamond' | 'square' | 'triangle';

export interface FoeText {
  /** one line: what it does */
  what: string;
  /** one concrete thing to do about it */
  tip: string;
  want: Want;
  worth: Worth;
  glyph: Glyph;
  /** its map colour */
  colour: string;
}

export const FOE_TEXT: Record<string, FoeText> = {
  mite: { what: 'the god\'s lice, in twos and threes; rears up, then bites', tip: 'fight it: weak, and it often drops bone. step back when it rears', want: 'sweep', worth: 'fight', glyph: 'dot', colour: '#ff4a30' },
  seraph: { what: 'a votive lamp that never moves; fires an orb down its row and column', tip: 'never stand in its row or column: come at it on a diagonal', want: 'reach', worth: 'either', glyph: 'diamond', colour: '#ffe070' },
  pyre: { what: 'a furnace lamp: fast orbs down its lines, three bolts at once', tip: 'walk round it on a diagonal, or past it out of its lines', want: 'reach', worth: 'avoid', glyph: 'diamond', colour: '#ff6a20' },
  walker: { what: 'a pilgrim in bone, slow and heavy; bone armour eats small hits; it lifts its arm before it hits', tip: 'slow: you can just walk away. fight it only with a big hitter', want: 'big', worth: 'avoid', glyph: 'square', colour: '#c8c0b0' },
  hum: { what: 'unseen; it keeps to the deep and bites from nowhere', tip: 'walk out of the ossuary and it lets you go; sonar or heat shows it', want: 'any', worth: 'avoid', glyph: 'dot', colour: '#9a7ad0' },
  mimic: { what: 'dressed as loot; it wakes and lunges when you come close', tip: 'the copper it wore is the prize: kill it fast, it is frail', want: 'any', worth: 'fight', glyph: 'triangle', colour: '#c070e0' },
  cantor: { what: 'still praying; it sings: foes near it hit half again as hard', tip: 'kill it first, between songs, then the rest', want: 'reach', worth: 'fight', glyph: 'triangle', colour: '#6cc8d4' },
  vent: { what: 'the floor glows, then bursts on a beat', tip: 'cross on the beat after a burst', want: 'any', worth: 'avoid', glyph: 'square', colour: '#ff4020' },
  warden: { what: 'an elite: draws breath, then rushes three cells down a line', tip: 'when it draws breath, step aside; it is open after a miss', want: 'any', worth: 'fight', glyph: 'square', colour: '#ff3a28' },
  abbot: { what: 'an elite in bone: lifts an arm, or both for a sweep two cells round', tip: 'one arm: step back. both arms: get two cells away. bring a big hitter', want: 'big', worth: 'fight', glyph: 'square', colour: '#ff3a28' },
  saint: { what: 'an elite lamp: burns down its lines, and down all four at once', tip: 'come at it on a diagonal; never cross its lines', want: 'reach', worth: 'fight', glyph: 'diamond', colour: '#ff3a28' },
};

/** a floor's keeper (boss-*): it guards the stairs */
export const KEEPER: FoeText = { what: 'the floor keeper, the god\'s last faithful: it guards the way down', tip: 'watch for the ⚠ before each move and step out of it; it is open after a miss', want: 'any', worth: 'fight', glyph: 'square', colour: '#ff3a28' };

export const foeText = (type: string): FoeText => FOE_TEXT[type] ?? (type.startsWith('boss-') ? KEEPER : { ...KEEPER, what: 'something moving', tip: 'watch it first', worth: 'either' });

/** how bad its blows are for you: blows it needs to stop you at your hp now */
export function danger(hit: number, hp: number): 'low' | 'mid' | 'high' {
  const blows = hp / Math.max(0.01, hit);
  return blows <= 3 ? 'high' : blows <= 7 ? 'mid' : 'low';
}

export interface Arm {
  name: string;
  damage: number;
  cooldown: number;
  range: number;
  sweep: boolean;
}

/** which of your weapons is best against what it wants; null with none */
export function bestArm(arms: Arm[], want: Want, armour = 0): Arm | null {
  if (!arms.length) return null;
  const dps = (a: Arm) => Math.max(0, a.damage - armour) / Math.max(0.1, a.cooldown);
  const score = (a: Arm) => (want === 'sweep' ? (a.sweep ? 100 : 0) + dps(a) : want === 'big' ? a.damage * 10 + dps(a) : want === 'reach' ? a.range * 10 + dps(a) : dps(a));
  return [...arms].sort((a, b) => score(b) - score(a))[0];
}

/** the short why of a weapon pick: what it does for you, or what it lacks against this foe */
export function why(a: Arm, want: Want): string {
  if (want === 'sweep') return a.sweep ? 'hits the whole pack at once' : 'no sweep on: a choir bell hits the pack at once';
  if (want === 'big') return a.damage >= 3 ? 'one heavy blow gets through armour' : 'small hits: its armour eats them';
  if (want === 'reach') return a.range >= 4 ? 'hits it from outside its lines' : 'short: close in on a diagonal';
  return 'the most hurt a second';
}
