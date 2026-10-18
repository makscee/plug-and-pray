// The Thaw Engine ending as numbers, no DOM: how warm the light is, how far each window has melted and
// whether the end card shows, at `t` seconds after the engine turned over. src/end/index.ts draws it.

import { RES, type Game, type Res } from '../core/types';

/** seconds: the light floods over LIGHT, windows melt from MELT_AT (staggered), the card shows at CARD */
export const LIGHT = 4;
export const MELT_AT = 1.2;
export const MELT = 3;
export const STAGGER = 0.35;
export const CARD = 6.5;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => x * x * (3 - 2 * x);

/** 0..1: the heart's light filling the screen */
export function light(t: number): number {
  return ease(clamp(t / LIGHT));
}

/** 0..1: window number `i` melting (the console last, it is the oldest part of you) */
export function melt(t: number, i: number): number {
  return clamp((t - MELT_AT - i * STAGGER) / MELT);
}

/** the heartbeat, 0..1: slow at first, quickening as it warms */
export function beat(t: number): number {
  const rate = 0.7 + 0.9 * light(t);
  return Math.pow(Math.max(0, Math.sin(t * rate * Math.PI * 2)), 6);
}

export function card(t: number): boolean {
  return t >= CARD;
}

/** m:ss of game time */
export function clock(s: number): string {
  const n = Math.max(0, Math.round(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/** the end card's run line */
export function summary(g: Game): string {
  const s = g.stats;
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  return `${n(s.far, 'cell')} out · ${n(s.mods.length, 'module')} found · ${s.kills} put down · ${clock(g.t)}`;
}

// r2 econ: the Engine weighs what you bring. Waking it takes every resource you carry, and the end card
// tallies them line by line, then grades the thaw by the total (so "temper now or carry it in" is a choice).

/** the grades, best first: [the least total that earns it, its name] */
export const GRADES: [number, string][] = [[40, 'spring'], [15, 'the god stirs'], [0, 'a cold waking']];
export const gradeOf = (total: number): string => GRADES.find(([n]) => total >= n)![1];

export interface Offering {
  lines: [Res, number][];
  total: number;
  grade: string;
}

/** what the player carries, weighed: the tally the Engine would take now */
export function weigh(g: Game): Offering {
  const lines = RES.map((r): [Res, number] => [r, g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === r ? i.n : 0), 0)]).filter(([, n]) => n > 0);
  const total = lines.reduce((n, [, k]) => n + k, 0);
  return { lines, total, grade: gradeOf(total) };
}

const offered = new WeakMap<Game, Offering>();
/** the Engine takes it all: weighs what you carry, empties your resources, remembers the tally */
export function offer(g: Game): Offering {
  const o = weigh(g);
  g.player.inv = g.player.inv.filter((i) => i.kind !== 'res');
  offered.set(g, o);
  return o;
}
export const offeringOf = (g: Game): Offering | undefined => offered.get(g);

/** seconds after the card shows: a tally line every TALLY_STEP, then the total and the grade */
export const TALLY_AT = 0.8;
export const TALLY_STEP = 0.45;
/** how many tally rows show at `t` (the lines, then one more for the total and grade) */
export function tallyShown(t: number, lines: number): number {
  return Math.max(0, Math.min(lines + 1, Math.floor((t - CARD - TALLY_AT) / TALLY_STEP + 1e-6) + 1));
}
