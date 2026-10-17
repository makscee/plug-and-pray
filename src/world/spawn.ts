// What a new chunk holds: loot by distance, enemies, printers. The start chamber is fixed:
// the pinhole eye at your feet, the stepper relay across the chamber, the spark finger one chunk east,
// the card reader and a first memory card one chunk south, a printer one chunk west.

import { CHUNK, chunkHook, Cell } from '../core/grid';
import { spawn, spawnEnemy } from '../core/game';
import { MODS } from '../core/mods';
import { hash, rng, type Rng } from '../core/rng';
import { RES, type Chunk, type Game, type Item } from '../core/types';
import { floors, rooms } from './gen';
import { nextLog } from './vectors';

/** a module for a chunk this far out (in chunks): tiers open up with distance; uniques never roll */
export function lootMod(r: Rng, far: number): Item {
  const maxTier = far < 2 ? 0 : far < 4 ? 1 : 2;
  const pool = Object.values(MODS).filter((m) => m.tier <= maxTier && m.family !== 'unique');
  const m = r.pick(pool);
  const item: Item = { kind: 'mod', mod: m.id };
  const nums = Object.entries(m.params).filter(([, v]) => typeof v === 'number');
  if (nums.length && r.chance(0.25)) {
    const [key] = r.pick(nums);
    const good = r.chance(0.5);
    item.roll = { key, mult: good ? 1.4 : 0.7, tag: good ? 'attuned' : 'cracked' };
  }
  return item;
}

function cellIn(r: Rng, c: Chunk, seed: number): [number, number] {
  const [x0, y0, x1, y1] = r.pick(rooms(seed, c.cx, c.cy));
  for (let k = 0; k < 20; k++) {
    const x = r.int(x0, x1);
    const y = r.int(y0, y1);
    if (c.cells[y * CHUNK + x] === Cell.floor) return [c.cx * CHUNK + x + 0.5, c.cy * CHUNK + y + 0.5];
  }
  const [x, y] = r.pick(floors(c));
  return [c.cx * CHUNK + x + 0.5, c.cy * CHUNK + y + 0.5];
}

export function fill(g: Game, c: Chunk): void {
  const at = (x: number, y: number) => [c.cx * CHUNK + x + 0.5, c.cy * CHUNK + y + 0.5] as const;
  if (c.cx === 0 && c.cy === 0) {
    const [ex, ey] = at(8, 8);
    spawn(g, { kind: 'item', x: ex, y: ey, item: { kind: 'mod', mod: 'pinhole-eye' } });
    const [sx, sy] = at(10, 6);
    spawn(g, { kind: 'item', x: sx, y: sy, item: { kind: 'mod', mod: 'stepper-relay' } });
    return;
  }
  const r = rng(hash(g.seed, 11, c.cx, c.cy));
  const far = Math.hypot(c.cx, c.cy);
  if (c.cx === 1 && c.cy === 0) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'mod', mod: 'spark-finger' } });
  }
  if (c.cx === 0 && c.cy === 1) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'mod', mod: 'card-reader' } });
    spawn(g, { kind: 'item', x, y, item: { kind: 'card', card: nextLog(g) } });
  }
  const printer = (c.cx === -1 && c.cy === 0) || (far >= 1.5 && r.chance(0.15));
  if (printer) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'printer', x, y, data: { far, made: 0 } });
  }
  if (far >= 1.5 && r.chance(0.18)) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'card', card: nextLog(g) } });
  }
  const loot = r.int(1, 2) + (far >= 4 ? 1 : 0);
  for (let k = 0; k < loot; k++) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: r.chance(0.5) ? lootMod(r, far) : { kind: 'res', res: r.pick(far >= 3 ? RES : RES.slice(0, 3)), n: r.int(1, 3) } });
  }
  if (far >= 1.5 && r.chance(0.7)) {
    const n = r.int(1, 3);
    for (let k = 0; k < n; k++) {
      const [x, y] = cellIn(r, c, g.seed);
      spawnEnemy(g, 'mite', x, y);
    }
  }
}

chunkHook(fill);
