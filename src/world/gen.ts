// The chunk generator: chambers joined by bending conduits, and to all four neighbours.
// Doors sit on chunk edges at offsets both sides agree on (a hash of the edge), so the endless
// grid is always connected. Farther out: more chambers, odder shapes (ribbed, oval, cross), more veins.
// Floor that no door reaches is walled up again, so nothing spawns in a sealed pocket.

import { CHUNK, Cell, setGenerator } from '../core/grid';
import { hash, rng, type Rng } from '../core/rng';
import type { Chunk } from '../core/types';

const door = (seed: number, axis: number, cx: number, cy: number) => 2 + (hash(seed, axis, cx, cy) % (CHUNK - 4));

export type Shape = 'box' | 'ribs' | 'oval' | 'cross';
/** a chamber: [x0, y0, x1, y1] inclusive, local cells, and its shape */
export type Room = [number, number, number, number, Shape];

/** the chambers of a chunk, the first one the biggest; the start chunk is one plain chamber */
export function rooms(seed: number, cx: number, cy: number): Room[] {
  if (cx === 0 && cy === 0) return [[5, 5, 11, 11, 'box']];
  const r = rng(hash(seed, 7, cx, cy));
  const far = Math.hypot(cx, cy);
  const want = 1 + (far >= 2 ? 1 : 0) + (far >= 4 ? r.int(0, 1) : 0) + (far >= 6 ? 1 : 0);
  const odd = Math.min(0.85, far * 0.13);
  const out: Room[] = [];
  for (let tries = 0; out.length < want && tries < 40; tries++) {
    const big = out.length === 0;
    const w = r.int(3, big ? 8 : 5);
    const h = r.int(3, big ? 8 : 5);
    const x0 = r.int(2, CHUNK - 2 - w);
    const y0 = r.int(2, CHUNK - 2 - h);
    const x1 = x0 + w - 1;
    const y1 = y0 + h - 1;
    if (out.some(([a, b, c, d]) => x0 <= c + 2 && x1 >= a - 2 && y0 <= d + 2 && y1 >= b - 2)) continue;
    const shape: Shape = w >= 5 && h >= 5 && r.chance(odd) ? r.pick(['ribs', 'oval', 'cross'] as const) : 'box';
    out.push([x0, y0, x1, y1, shape]);
  }
  return out;
}

/** the first chamber (kept for callers that want one) */
export function room(seed: number, cx: number, cy: number): [number, number, number, number] {
  const [x0, y0, x1, y1] = rooms(seed, cx, cy)[0];
  return [x0, y0, x1, y1];
}

export const middle = ([x0, y0, x1, y1]: Room): [number, number] => [(x0 + x1) >> 1, (y0 + y1) >> 1];

function carveRoom(set: (x: number, y: number, v: number) => void, [x0, y0, x1, y1, shape]: Room): void {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let on = true;
      // ribs: the top and bottom walls bite in every other cell, pillars stand in rows
      if (shape === 'ribs') on = !(((y === y0 || y === y1) && (x - x0) % 2 === 1) || ((x - x0) % 2 === 0 && (y - y0) % 2 === 0 && x > x0 && x < x1 && y > y0 && y < y1 && x !== Math.floor(mx) && y !== Math.floor(my)));
      if (shape === 'oval') on = ((x - mx) / (w / 2)) ** 2 + ((y - my) / (h / 2)) ** 2 <= 1.05;
      if (shape === 'cross') on = Math.abs(x - mx) <= w / 6 + 0.5 || Math.abs(y - my) <= h / 6 + 0.5;
      if (on) set(x, y, Cell.floor);
    }
}

/** a conduit from a to b with a bend or two (farther out it wanders more) */
function carveConduit(set: (x: number, y: number, v: number) => void, r: Rng, a: [number, number], b: [number, number], bends: number): void {
  let [x, y] = a;
  set(x, y, Cell.floor);
  const pts: [number, number][] = [];
  for (let k = 0; k < bends; k++) pts.push([r.int(Math.min(x, b[0]), Math.max(x, b[0])), r.int(Math.min(y, b[1]), Math.max(y, b[1]))]);
  pts.push(b);
  for (const [tx, ty] of pts) {
    const xFirst = r.chance(0.5);
    const stepX = () => { while (x !== tx) { x += Math.sign(tx - x); set(x, y, Cell.floor); } };
    const stepY = () => { while (y !== ty) { y += Math.sign(ty - y); set(x, y, Cell.floor); } };
    if (xFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  }
}

export function generate(seed: number, cx: number, cy: number): Chunk {
  const cells = new Uint8Array(CHUNK * CHUNK);
  const set = (x: number, y: number, v: number) => (cells[y * CHUNK + x] = v);
  const get = (x: number, y: number) => cells[y * CHUNK + x];
  const r = rng(hash(seed, 8, cx, cy));
  const far = Math.hypot(cx, cy);
  const rs = rooms(seed, cx, cy);
  for (const rm of rs) carveRoom(set, rm);
  const bends = far < 1 ? 0 : far < 3 ? 1 : 2;
  // chambers in a chain
  for (let k = 1; k < rs.length; k++) carveConduit(set, r, middle(rs[k]), middle(rs[k - 1]), bends);
  // doors: step two cells in from the edge, then wander to the nearest chamber
  const doors: [[number, number], [number, number]][] = [
    [[0, door(seed, 1, cx, cy)], [1, 0]], // west
    [[CHUNK - 1, door(seed, 1, cx + 1, cy)], [-1, 0]], // east
    [[door(seed, 2, cx, cy), 0], [0, 1]], // north
    [[door(seed, 2, cx, cy + 1), CHUNK - 1], [0, -1]], // south
  ];
  for (const [[dx, dy], [ix, iy]] of doors) {
    set(dx, dy, Cell.floor);
    set(dx + ix, dy + iy, Cell.floor);
    const from: [number, number] = [dx + ix * 2, dy + iy * 2];
    const near = rs.map(middle).sort((a, b) => Math.hypot(a[0] - from[0], a[1] - from[1]) - Math.hypot(b[0] - from[0], b[1] - from[1]))[0];
    carveConduit(set, r, from, near, bends);
  }
  // odd stubs far out: dead-end conduits that go nowhere
  if (far >= 3)
    for (let k = 0; k < Math.min(3, Math.floor(far / 3)); k++) carveConduit(set, r, middle(r.pick(rs)), [r.int(1, CHUNK - 2), r.int(1, CHUNK - 2)], 1);
  // wall up what no door reaches
  const reach = new Uint8Array(CHUNK * CHUNK);
  const q: [number, number][] = [doors[0][0]];
  reach[doors[0][0][1] * CHUNK + doors[0][0][0]] = 1;
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= CHUNK || ny >= CHUNK || reach[ny * CHUNK + nx] || get(nx, ny) !== Cell.floor) continue;
      reach[ny * CHUNK + nx] = 1;
      q.push([nx, ny]);
    }
  }
  for (let i = 0; i < cells.length; i++) if (cells[i] === Cell.floor && !reach[i]) cells[i] = Cell.wall;
  // veins: wall cells beside floor hold a resource; more of them, and more ichor, farther out
  const vr = rng(hash(seed, 9, cx, cy));
  const tries = Math.min(18, 6 + Math.round(far * 1.5));
  for (let k = 0; k < tries; k++) {
    const x = vr.int(1, CHUNK - 2);
    const y = vr.int(1, CHUNK - 2);
    if (get(x, y) !== Cell.wall) continue;
    const nextToFloor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => get(x + ox, y + oy) === Cell.floor);
    if (!nextToFloor) continue;
    const kind = vr.chance(Math.min(0.25, far * 0.03)) ? 3 : vr.int(0, 2);
    set(x, y, Cell.vein + kind);
  }
  return { cx, cy, cells };
}

/** floor cells of a chunk, local; deterministic order */
export function floors(c: Chunk): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) if (c.cells[y * CHUNK + x] === Cell.floor) out.push([x, y]);
  return out;
}

/** a floor cell inside one of the chunk's chambers (world coordinates, cell centre); pure: the same
 *  seed, chunk and salt always give the same cell, generated or not (vectors point at it ahead) */
export function spot(seed: number, cx: number, cy: number, salt: number, c: Chunk = generate(seed, cx, cy)): [number, number] {
  const r = rng(hash(seed, 13, cx, cy, salt));
  const rs = rooms(seed, cx, cy);
  for (let k = 0; k < 30; k++) {
    const [x0, y0, x1, y1] = r.pick(rs);
    const x = r.int(x0, x1);
    const y = r.int(y0, y1);
    if (c.cells[y * CHUNK + x] === Cell.floor) return [cx * CHUNK + x + 0.5, cy * CHUNK + y + 0.5];
  }
  const [x, y] = r.pick(floors(c));
  return [cx * CHUNK + x + 0.5, cy * CHUNK + y + 0.5];
}

setGenerator(generate);
