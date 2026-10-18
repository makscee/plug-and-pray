// Set-piece rooms (v2 variety): each floor has a pool of six, and a seed puts two of them on the floor's outer
// ring of chunks (never the boss room's). A set piece is one 9×9 chamber in its chunk's middle, carved in its
// own pattern, with a centrepiece you see from afar in every eye (src/sight/variety.ts), a line when you walk
// in, and what it holds (src/world/piecefill.ts). Pure: the generator reads it before any chunk exists.

import { hash } from '../core/rng';
import { floorOfChunk, HALF, inside, LAST, local, stairsChunk, STRIDE } from './floors';
import type { Res } from '../core/types';

export type Carve = 'box' | 'oval' | 'cross' | 'ribs' | 'pews' | 'ring' | 'niches';
export interface Hold {
  /** modules rolled this many tiers of distance deeper (a roll that is good on rare pieces) */
  mods?: number;
  res?: [Res, number][];
  card?: boolean;
  /** foes that live here (asleep until they sense you) */
  foes?: [string, number][];
  /** standing by the centrepiece mends you whole, once */
  heal?: boolean;
  /** the floor's gimmick foe sings here (src/world/gimmicks.ts) */
  cantor?: boolean;
}
export interface Piece {
  id: string;
  floor: number;
  name: string;
  /** said once when you walk in */
  line: string;
  carve: Carve;
  hold: Hold;
  /** its ink on the map */
  ink: string;
}

const P = (floor: number, id: string, name: string, carve: Carve, ink: string, line: string, hold: Hold): Piece => ({ id, floor, name, carve, ink, line, hold });

export const PIECES: Piece[] = [
  // the cradle: warm iron, wood and oil
  P(0, 'crib', 'the iron crib', 'box', '#d0a060', 'a cot of iron bars, big enough for you. you were made here, or something like you was.', { mods: 1, res: [['copper', 2]] }),
  P(0, 'kiln', 'the cooling kiln', 'oval', '#ff9050', 'a kiln, still warm. the ash in it has turned to glass.', { res: [['glass', 4], ['bone', 1]] }),
  P(0, 'loom', 'the rib loom', 'ribs', '#c8b090', 'a loom strung with gut and rib. half a body is still on it.', { card: true, res: [['bone', 3]] }),
  P(0, 'font', 'the oil font', 'cross', '#ffd060', 'a font of warm oil. stand at it and you mend whole, once.', { heal: true, res: [['copper', 1]] }),
  P(0, 'nest', 'the mite nest', 'niches', '#e08060', 'eggs in the walls, and they are hatching. what they guard is worth it.', { foes: [['mite', 4]], mods: 1, res: [['bone', 3]] }),
  P(0, 'bellframe', 'the bell frame', 'pews', '#b09070', 'a bell bigger than you hangs here, cracked through.', { mods: 0, res: [['copper', 3]] }),
  // the choir nave: pale stone, gold and candle light
  P(1, 'organ', 'the bone organ', 'pews', '#e8dcc0', 'pipes of bone rise into the dark. the draught still plays them, almost.', { mods: 1, res: [['bone', 2]] }),
  P(1, 'pews', 'the sleeping pews', 'pews', '#c0a080', 'rows of pews. the choir is still seated here, asleep.', { foes: [['mite', 5]], card: true, res: [['glass', 3]] }),
  P(1, 'lectern', 'the lectern', 'box', '#f0e0a0', 'a book open on a lectern. its last page is a map of somewhere.', { card: true, res: [['glass', 2], ['bone', 2]] }),
  P(1, 'saint', 'the kneeling saint', 'oval', '#f0f0ff', 'a stone saint on its knees, palms up. something rests in its hands.', { mods: 2, res: [['ichor', 1]] }),
  P(1, 'candles', 'the candle field', 'ribs', '#ffc860', 'a thousand candles, all lit, for no one.', { mods: 0, res: [['copper', 3]] }),
  P(1, 'loft', 'the choir loft', 'ring', '#d8a0ff', 'stalls in a ring. a cantor still sings from them, and the foes near it rage.', { cantor: true, mods: 1, res: [['bone', 3]] }),
  // the ossuary: blue bone and cold
  P(2, 'bonepile', 'the bone heap', 'oval', '#c8d0d8', 'the dead, sorted by size. the smallest pile is the newest.', { res: [['bone', 7]], foes: [['walker', 1]] }),
  P(2, 'skullwall', 'the skull wall', 'niches', '#a8b8c8', 'skulls mortared into the walls, every one turned to you.', { res: [['ichor', 1], ['glass', 3]] }),
  P(2, 'sarcophagus', 'the sarcophagus', 'box', '#9098a8', 'a stone coffin with a glass lid. it is not empty, and it is not asleep.', { mods: 2, foes: [['walker', 1]] }),
  P(2, 'chandelier', 'the bone chandelier', 'ribs', '#ffe0a0', 'a chandelier of ribs and candles. under its warmth you mend whole, once.', { heal: true, res: [['bone', 2]] }),
  P(2, 'well', 'the dry well', 'ring', '#8090a0', 'a well with no water. something echoes up from below.', { card: true, mods: 1, res: [['copper', 2]] }),
  P(2, 'charnel', 'the charnel racks', 'pews', '#b0b8c0', 'racks of shelves, a sleeper on each. one shelf is empty.', { mods: 1, res: [['bone', 3]], foes: [['hum', 1]] }),
  // the furnace: iron and fire
  P(3, 'forge', 'the god\'s forge', 'box', '#ff8040', 'an anvil the size of a cart. the hammer on it is still warm.', { mods: 2, res: [['copper', 3]] }),
  P(3, 'crucible', 'the crucible', 'oval', '#ffb040', 'a bowl of molten brass, slowly cooling. ichor floats on it.', { res: [['ichor', 2], ['copper', 2]] }),
  P(3, 'bellows', 'the great bellows', 'cross', '#c06030', 'bellows as tall as a house, breathing on their own.', { mods: 1, foes: [['pyre', 1]] }),
  P(3, 'slag', 'the slag heap', 'oval', '#806050', 'a heap of slag. copper glints all through it.', { res: [['copper', 6], ['glass', 1]] }),
  P(3, 'chains', 'the chain hall', 'pews', '#a09080', 'chains hang from the dark, swinging though there is no wind.', { mods: 1, res: [['glass', 3]] }),
  P(3, 'frost', 'the frost shrine', 'ring', '#a0e0ff', 'a shrine of rime in the heat. at its cold you mend whole, once.', { heal: true, res: [['glass', 2]] }),
];
export const PIECE = Object.fromEntries(PIECES.map((p) => [p.id, p])) as Record<string, Piece>;

/** a set piece's chamber in local cells of its chunk, inclusive; its centrepiece stands in the middle */
export const PIECE_ROOM: [number, number, number, number] = [4, 4, 12, 12];
export const PIECE_MID: [number, number] = [8, 8];
/** how many set pieces a floor gets */
export const PER_FLOOR = 2;

/** the floor's set pieces: [id, chunk x, chunk y], two pieces of its pool in two outer-ring chunks, by seed */
export function piecesOf(seed: number, f: number): [string, number, number][] {
  if (f >= LAST) return [];
  const pool = PIECES.filter((p) => p.floor === f);
  const [bx, by] = stairsChunk(seed, f);
  const ring: [number, number][] = [];
  for (let y = -HALF; y <= HALF; y++)
    for (let x = -HALF; x <= HALF; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) !== HALF) continue;
      const [cx, cy] = [f * STRIDE + x, y];
      if (!inside(cx, cy)) continue; // v3: the small floors have no corners
      // never the boss room, nor the chunks beside it (its approach stays plain)
      if (Math.abs(cx - bx) + Math.abs(cy - by) <= 1) continue;
      ring.push([cx, cy]);
    }
  const out: [string, number, number][] = [];
  const ids = pool.map((p) => p.id);
  for (let k = 0; k < PER_FLOOR && ids.length && ring.length; k++) {
    const id = ids.splice(hash(seed, 141, f, k) % ids.length, 1)[0];
    // the second keeps away from the first (not a neighbour)
    const ok = ring.filter(([x, y]) => !out.some(([, ox, oy]) => Math.abs(ox - x) <= 1 && Math.abs(oy - y) <= 1));
    const from = ok.length ? ok : ring;
    const [cx, cy] = from[hash(seed, 142, f, k) % from.length];
    ring.splice(ring.findIndex(([x, y]) => x === cx && y === cy), 1);
    out.push([id, cx, cy]);
  }
  return out;
}

/** the set piece in a chunk, if one is there */
export function pieceAt(seed: number, cx: number, cy: number): Piece | null {
  const f = floorOfChunk(cx);
  if (Math.max(...local(cx, cy).map(Math.abs)) !== HALF) return null;
  const hit = piecesOf(seed, f).find(([, x, y]) => x === cx && y === cy);
  return hit ? PIECE[hit[0]] : null;
}

/** the chamber's shape for the generator (src/world/gen.ts carveRoom): the patterned ones start as a box */
export const shapeOf = (p: Piece): 'box' | 'oval' | 'cross' | 'ribs' => (p.carve === 'oval' || p.carve === 'cross' || p.carve === 'ribs' ? p.carve : 'box');

/** walls a pattern puts back inside the box (local cells): pews in rows, a ring of stalls, niches round the edge.
 *  The conduits are carved after, so a door always gets through */
export function patternWalls(p: Piece): [number, number][] {
  const [x0, y0, x1, y1] = PIECE_ROOM;
  const [mx, my] = PIECE_MID;
  const out: [number, number][] = [];
  if (p.carve === 'pews')
    // two rows of pews either side of an aisle down the middle
    for (const y of [y0 + 2, y0 + 4, y1 - 2]) for (let x = x0 + 1; x <= x1 - 1; x++) if (Math.abs(x - mx) > 1) out.push([x, y]);
  if (p.carve === 'ring')
    // a ring of stalls round the centrepiece, open at the four doors
    for (let y = my - 2; y <= my + 2; y++) for (let x = mx - 2; x <= mx + 2; x++) if (Math.max(Math.abs(x - mx), Math.abs(y - my)) === 2 && x !== mx && y !== my) out.push([x, y]);
  if (p.carve === 'niches')
    // the edge bites in: every other cell of the border is wall
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if ((x === x0 || x === x1 || y === y0 || y === y1) && (x + y) % 2 === 0) out.push([x, y]);
  return out;
}
