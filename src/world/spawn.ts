// What a new chunk holds: loot by distance, enemies, printers. The start chamber is fixed:
// the pinhole eye at your feet, the stepper relay across the chamber, the spark finger one chunk east.

import { CHUNK, chunkHook, Cell } from '../core/grid';
import { spawn } from '../core/game';
import { MODS } from '../core/mods';
import { hash, rng, type Rng } from '../core/rng';
import { RES, type Chunk, type Game, type Item } from '../core/types';
import { room } from './gen';

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
  const [x0, y0, x1, y1] = room(seed, c.cx, c.cy);
  for (let k = 0; k < 20; k++) {
    const x = r.int(x0, x1);
    const y = r.int(y0, y1);
    if (c.cells[y * CHUNK + x] === Cell.floor) return [c.cx * CHUNK + x + 0.5, c.cy * CHUNK + y + 0.5];
  }
  return [c.cx * CHUNK + x0 + 0.5, c.cy * CHUNK + y0 + 0.5];
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
  const loot = r.int(1, 2);
  for (let k = 0; k < loot; k++) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: r.chance(0.55) ? lootMod(r, far) : { kind: 'res', res: r.pick(RES.slice(0, 3)), n: r.int(1, 3) } });
  }
  // enemies: the fight slice's own chunk hook (src/fight/spawn.ts)
}

chunkHook(fill);
