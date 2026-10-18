// What a new chunk holds: loot by distance, enemies, printers. The start chamber is fixed:
// you wake holding an eye, legs, a map and the spark finger (src/tune/start.ts); a halo at your feet, and in the
// four chunks around it (which one holds what turns with the seed, `opening`): the dawn eye; the card reader, a
// first memory card and an ember cell; a printer with a second weapon beside it; a reliquary (shop).

import { CHUNK, chunkHook, Cell } from '../core/grid';
import { spawn } from '../core/game';
import { MODS } from '../core/mods';
import { hash, rng, type Rng } from '../core/rng';
import { RES, type Chunk, type Game, type Item } from '../core/types';
import { floors, rooms } from './gen';
import { nextLog } from './vectors';
import { ZONES, zoneFar } from './zones';

/** the furnace's own kit: tier 2, but it rolls only there, so the last zone still brings modules you have not seen */
export const FURNACE_KIT = ['heat-lance', 'reliquary-saw', 'heart-shard', 'saints-lens'];

/** a module for a chunk this far out (in chunks): tiers open up with distance; uniques never roll.
 *  60% of rolls come from the zone's own tier (the furnace: its own kit), so each zone brings new modules */
export function lootMod(r: Rng, far: number, family?: string): Item {
  const z = zoneFar(far);
  const maxTier = ZONES[z].tier;
  // r2 econ: an aimed print (`print weapon`) rolls within one family
  const pool = Object.values(MODS).filter((m) => m.tier <= maxTier && m.family !== 'unique' && (z === 3 || !FURNACE_KIT.includes(m.id)) && (!family || m.family === family));
  const own = pool.filter((m) => (z === 3 ? FURNACE_KIT.includes(m.id) : m.tier === maxTier));
  const m = r.pick(maxTier >= 1 && own.length && r.chance(0.6) ? own : pool);
  const item: Item = { kind: 'mod', mod: m.id };
  const nums = Object.entries(m.params).filter(([k, v]) => typeof v === 'number' && BETTER[k]);
  if (nums.length && r.chance(0.25)) {
    const [key] = r.pick(nums);
    const good = r.chance(0.5);
    item.roll = { key, mult: rollMult(key, good), tag: good ? 'attuned' : 'cracked' };
  }
  return item;
}

type Room = 'eye' | 'reader' | 'printer' | 'shop';
/** the four chunks around the start, one per seed-shuffled room: the dawn eye, the reader, the printer, the shop */
export function opening(seed: number): Record<Room, [number, number]> {
  const r = rng(hash(seed, 61));
  const sides: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let k = sides.length - 1; k > 0; k--) {
    const j = r.int(0, k);
    [sides[k], sides[j]] = [sides[j], sides[k]];
  }
  return { eye: sides[0], reader: sides[1], printer: sides[2], shop: sides[3] };
}
const is = (c: Chunk, [cx, cy]: [number, number]) => c.cx === cx && c.cy === cy;

/** the second weapons the cradle printer keeps beside it (one per seed) */
export const SECOND = ['rivet-sling', 'choir-bell', 'censer-flail'];

/** which way a number is better: up (damage, range) or down (cooldown, lag). Keys left out never roll:
 *  picture-only ones (res, fps, colors, flicker) and flags (slots, chill) */
export const BETTER: Record<string, 'up' | 'down'> = {
  range: 'up', damage: 'up', radius: 'up', hp: 'up', regen: 'up', armour: 'up', mend: 'up', thorns: 'up', haste: 'up',
  heatproof: 'up', glow: 'up', drain: 'up', power: 'up', speed: 'up', pace: 'up', plan: 'up', span: 'up', reveal: 'up',
  keep: 'up', tithe: 'up', fov: 'up', ahead: 'up',
  cooldown: 'down', recharge: 'down', noise: 'down', lag: 'down', blur: 'down', refresh: 'down', loud: 'down',
};
/** a good roll (attuned) moves a number its better way by ×1.4 or ×0.7; a bad one (cracked) the other way */
export const rollMult = (key: string, good: boolean): number => ((BETTER[key] === 'down') === good ? 0.7 : 1.4);

export function cellIn(r: Rng, c: Chunk, seed: number): [number, number] {
  const [x0, y0, x1, y1] = r.pick(rooms(seed, c.cx, c.cy));
  for (let k = 0; k < 20; k++) {
    const x = r.int(x0, x1);
    const y = r.int(y0, y1);
    if (c.cells[y * CHUNK + x] === Cell.floor) return [c.cx * CHUNK + x + 0.5, c.cy * CHUNK + y + 0.5];
  }
  const [x, y] = r.pick(floors(c));
  return [c.cx * CHUNK + x + 0.5, c.cy * CHUNK + y + 0.5];
}

/** where the reliquary by the start stands, a cell centre (the secrets beside it need it before it spawns) */
export const shopAt = (seed: number, c: Chunk): [number, number] => cellIn(rng(hash(seed, 57, c.cx, c.cy)), c, seed);

export function fill(g: Game, c: Chunk): void {
  const at = (x: number, y: number) => [c.cx * CHUNK + x + 0.5, c.cy * CHUNK + y + 0.5] as const;
  if (c.cx === 0 && c.cy === 0) {
    const [ex, ey] = at(8, 8);
    spawn(g, { kind: 'item', x: ex, y: ey, item: { kind: 'mod', mod: 'halo' } });
    return;
  }
  const r = rng(hash(g.seed, 11, c.cx, c.cy));
  const far = Math.hypot(c.cx, c.cy);
  const o = opening(g.seed);
  if (is(c, o.eye)) {
    // the first upgrade: a clear colour eye one chunk out (the run starts with the pinhole)
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'mod', mod: 'dawn-eye' } });
  }
  if (is(c, o.reader)) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'mod', mod: 'card-reader' } });
    spawn(g, { kind: 'item', x, y, item: { kind: 'card', card: nextLog(g) } });
    // module pass: the first generator lies with the reader, so the first colour eye or second weapon has its power
    spawn(g, { kind: 'item', x: x + 0.3, y, item: { kind: 'mod', mod: 'ember-cell' } });
  }
  const printer = is(c, o.printer) || (far >= 1.5 && r.chance(0.15));
  if (printer) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'printer', x, y, data: { far, made: 0 } });
    // r1 pace: a second weapon by the cradle printer on every seed (its own rng: the chunk stays as it was)
    if (is(c, o.printer)) spawn(g, { kind: 'item', x: x + 0.3, y, item: { kind: 'mod', mod: rng(hash(g.seed, 63)).pick(SECOND) } });
  }
  // a reliquary (shop printer) one chunk out, then now and then further out; its own rng keeps the rest of the chunk as it was
  const rs = rng(hash(g.seed, 57, c.cx, c.cy));
  if (is(c, o.shop) || (far >= 2 && rs.chance(0.1))) {
    const [x, y] = is(c, o.shop) ? shopAt(g.seed, c) : cellIn(rs, c, g.seed);
    spawn(g, { kind: 'printer', x, y, data: { far, shop: true } });
  }
  if (far >= 1.5 && r.chance(0.18)) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'card', card: nextLog(g) } });
  }
  if (far >= 3 && r.chance(0.3)) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'res', res: 'ichor', n: 1 } });
  }
  const loot = r.int(1, 2) + (far >= 4 ? 1 : 0);
  for (let k = 0; k < loot; k++) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: r.chance(0.55) ? lootMod(r, far) : { kind: 'res', res: r.pick(RES.slice(0, 3)), n: r.int(1, 2) } });
  }
  // enemies: the fight slice's own chunk hook (src/fight/spawn.ts)
}

chunkHook(fill);
