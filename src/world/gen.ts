// The chunk generator: a chamber per chunk, joined to all four neighbours by conduits.
// Doors sit on chunk edges at offsets both sides agree on (a hash of the edge), so the endless
// grid is always connected. The world slice grows this: more chambers, shapes, veins, depth.

import { CHUNK, Cell, setGenerator } from '../core/grid';
import { hash, rng } from '../core/rng';
import type { Chunk } from '../core/types';

const door = (seed: number, axis: number, cx: number, cy: number) => 2 + (hash(seed, axis, cx, cy) % (CHUNK - 4));

/** the chamber of a chunk: [x0, y0, x1, y1] inclusive, local cells */
export function room(seed: number, cx: number, cy: number): [number, number, number, number] {
  if (cx === 0 && cy === 0) return [5, 5, 11, 11];
  const r = rng(hash(seed, 7, cx, cy));
  const w = r.int(3, 8);
  const h = r.int(3, 8);
  const x0 = r.int(2, CHUNK - 2 - w);
  const y0 = r.int(2, CHUNK - 2 - h);
  return [x0, y0, x0 + w - 1, y0 + h - 1];
}

export function generate(seed: number, cx: number, cy: number): Chunk {
  const cells = new Uint8Array(CHUNK * CHUNK);
  const set = (x: number, y: number, v: number) => (cells[y * CHUNK + x] = v);
  const [x0, y0, x1, y1] = room(seed, cx, cy);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, Cell.floor);
  const mx = (x0 + x1) >> 1;
  const my = (y0 + y1) >> 1;
  // conduits: from each door straight in, then along to the chamber's middle
  const carve = (ax: number, ay: number, horizontalFirst: boolean) => {
    let x = ax;
    let y = ay;
    set(x, y, Cell.floor);
    const stepX = () => { while (x !== mx) { x += Math.sign(mx - x); set(x, y, Cell.floor); } };
    const stepY = () => { while (y !== my) { y += Math.sign(my - y); set(x, y, Cell.floor); } };
    if (horizontalFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  };
  carve(0, door(seed, 1, cx, cy), true); // west
  carve(CHUNK - 1, door(seed, 1, cx + 1, cy), true); // east
  carve(door(seed, 2, cx, cy), 0, false); // north
  carve(door(seed, 2, cx, cy + 1), CHUNK - 1, false); // south
  // veins: a few wall cells beside floor hold a resource
  const r = rng(hash(seed, 9, cx, cy));
  const far = Math.hypot(cx, cy);
  for (let k = 0; k < 6; k++) {
    const x = r.int(1, CHUNK - 2);
    const y = r.int(1, CHUNK - 2);
    if (cells[y * CHUNK + x] !== Cell.wall) continue;
    const nextToFloor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cells[(y + dy) * CHUNK + x + dx] === Cell.floor);
    if (!nextToFloor) continue;
    const kind = r.chance(Math.min(0.25, far * 0.03)) ? 3 : r.int(0, 2);
    set(x, y, Cell.vein + kind);
  }
  return { cx, cy, cells };
}

setGenerator(generate);
