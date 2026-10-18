// What you know of each cell (v2, Maks 10-18: "map should be explored depending on the eye ... one eye can
// see through wall but miss something inside there, so it can't for sure be empty"). Four states:
//   unseen   nothing has looked there
//   seen     an eye saw it plainly (g.seen): a floor drawn there is empty floor
//   through  an eye that sees through walls (heat, sonar) passed over it: its shape is a rumour, and it may
//            hide what that eye cannot show. The map hatches it, never draws it as known-empty
//   scanned  a scanner placed a mark there: what lies there is known, as well as the scanner can tell
// Marks are what scanners and radars find (src/mods/radar.ts): a blob ("something within r cells") or a cell.
// Pure (no three, no DOM): the eyes' tick, the map views and the tests share it.

import type { Game } from '../core/types';

export type Know = 'unseen' | 'seen' | 'through' | 'scanned';
/** what a mark is of: anything (a ping), a vein, a cache behind a wall or under the floor, a life, the way down, a boss */
export type MarkKind = 'thing' | 'vein' | 'cache' | 'life' | 'stairs' | 'boss';

export interface Mark {
  /** stable per thing: a re-ping replaces it */
  key: string;
  kind: MarkKind;
  /** centre, in cells (a cell's centre for a sure mark) */
  x: number;
  y: number;
  /** how unsure the place is: 0 the cell itself, else somewhere within r cells */
  r: number;
  /** what the finder could tell: "something", "a vein", or "copper vein", "sealed niche: frost coat" */
  what: string;
  /** a longer line for the annotated map's tooltip */
  info?: string;
  /** game time it was found; `ttl` s later it fades off the map (lives move) */
  at: number;
  ttl?: number;
  /** the module that found it */
  by: string;
}

interface Store {
  through: Set<string>;
  marks: Map<string, Mark>;
}
const stores = new WeakMap<Game, Store>();
function store(g: Game): Store {
  let s = stores.get(g);
  if (!s) stores.set(g, (s = { through: new Set(), marks: new Map() }));
  return s;
}

export const ck = (x: number, y: number) => `${x},${y}`;

/** what you know of cell (x, y) */
export function know(g: Game, x: number, y: number): Know {
  const k = ck(x, y);
  if (store(g).marks.has('c:' + k)) return 'scanned';
  if (g.seen.has(k)) return 'seen';
  if (store(g).through.has(k)) return 'through';
  return 'unseen';
}

/** an eye that sees through walls passed over (x, y): a rumour, unless it is already seen */
export function seeThrough(g: Game, x: number, y: number): void {
  const k = ck(x, y);
  if (!g.seen.has(k)) store(g).through.add(k);
}
export const throughCount = (g: Game): number => store(g).through.size;

/** place (or refresh) a mark. A sure mark (r 0) also makes its cell `scanned` */
export function mark(g: Game, m: Mark): void {
  const s = store(g);
  const old = s.marks.get(m.key);
  // a sharper finder's word stands: a vague ping never blurs what a scanner named
  if (old && old.r < m.r && old.what !== 'something' && (old.ttl === undefined || g.t - old.at < old.ttl)) return;
  s.marks.set(m.key, m);
  if (m.r === 0) s.marks.set('c:' + ck(Math.floor(m.x), Math.floor(m.y)), m);
}

/** forget a mark (the thing is gone: a cache opened, a vein drained, a foe dead) */
export function unmark(g: Game, key: string): void {
  const s = store(g);
  const m = s.marks.get(key);
  if (!m) return;
  s.marks.delete(key);
  const c = 'c:' + ck(Math.floor(m.x), Math.floor(m.y));
  if (s.marks.get(c) === m) s.marks.delete(c);
}

/** every live mark (stale lives drop off) */
export function marks(g: Game): Mark[] {
  const s = store(g);
  const out: Mark[] = [];
  for (const [k, m] of s.marks) {
    if (k.startsWith('c:')) continue;
    if (m.ttl !== undefined && g.t - m.at > m.ttl) {
      unmark(g, k);
      continue;
    }
    out.push(m);
  }
  return out;
}

/** the mark on or around cell (x, y): a sure one on the cell, else the nearest blob it falls in */
export function markAt(g: Game, x: number, y: number): Mark | undefined {
  let best: Mark | undefined;
  let bd = Infinity;
  for (const m of marks(g)) {
    const d = Math.hypot(m.x - (x + 0.5), m.y - (y + 0.5));
    const fits = m.r === 0 ? Math.floor(m.x) === x && Math.floor(m.y) === y : d <= m.r;
    if (fits && d < bd) [best, bd] = [m, d];
  }
  return best;
}

/** a cell that is wall in plain sight with seen floor on one side and rumoured floor straight across: a
 *  wall one cell thick between you and something (floor 1: dig or break through). [dx, dy] toward the far side */
export function thinWall(g: Game, x: number, y: number, isFloor: (x: number, y: number) => boolean): [number, number] | null {
  if (isFloor(x, y)) return null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (g.seen.has(ck(x - dx, y - dy)) && isFloor(x - dx, y - dy) && know(g, x + dx, y + dy) === 'through' && isFloor(x + dx, y + dy)) return [dx, dy];
  }
  return null;
}
