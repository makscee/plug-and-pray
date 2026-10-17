// The endless grid: chunks are made on demand by the generator (src/world/gen.ts).

import type { Chunk, Game, Res } from './types';

export const CHUNK = 16;

/** what a cell is; veins are walls holding a resource */
export const Cell = { wall: 0, floor: 1, vein: 10 } as const;
export const VEINS: Res[] = ['bone', 'glass', 'copper', 'ichor'];
export const veinOf = (c: number): Res | null => (c >= Cell.vein && c < Cell.vein + VEINS.length ? VEINS[c - Cell.vein] : null);

export type Generator = (seed: number, cx: number, cy: number) => Chunk;
let gen: Generator | null = null;
/** chunk hooks run once when a chunk is made: they place entities (src/world/spawn.ts) */
const onChunk: ((g: Game, c: Chunk) => void)[] = [];

export function setGenerator(f: Generator): void {
  gen = f;
}
export function chunkHook(f: (g: Game, c: Chunk) => void): void {
  onChunk.push(f);
}

const key = (cx: number, cy: number) => `${cx},${cy}`;

export function chunk(g: Game, cx: number, cy: number): Chunk {
  const k = key(cx, cy);
  let c = g.chunks.get(k);
  if (c) return c;
  if (!gen) throw new Error('no generator: import src/world');
  c = gen(g.seed, cx, cy);
  g.chunks.set(k, c);
  for (const f of onChunk) f(g, c);
  return c;
}

export function cell(g: Game, x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const cx = Math.floor(i / CHUNK);
  const cy = Math.floor(j / CHUNK);
  const c = chunk(g, cx, cy);
  return c.cells[(j - cy * CHUNK) * CHUNK + (i - cx * CHUNK)];
}

export function setCell(g: Game, x: number, y: number, v: number): void {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const cx = Math.floor(i / CHUNK);
  const cy = Math.floor(j / CHUNK);
  chunk(g, cx, cy).cells[(j - cy * CHUNK) * CHUNK + (i - cx * CHUNK)] = v;
}

export const open = (g: Game, x: number, y: number): boolean => cell(g, x, y) === Cell.floor;

/** make sure every chunk within r chunks of (x, y) exists, so spawns happen before you arrive */
export function ensure(g: Game, x: number, y: number, r = 1): void {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) chunk(g, cx + dx, cy + dy);
}

/** compass words and their unit steps */
export const DIRS: Record<string, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const dirAngle = (dx: number, dy: number): number => Math.atan2(dx, -dy);

/** cells on a straight line from a to b are all open (a simple sight test) */
export function clear(g: Game, ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (!open(g, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}
