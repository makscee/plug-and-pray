// What a new chunk holds: loot by distance, enemies, printers. The start chamber is fixed:
// you wake holding an eye, legs, a map and the spark finger (src/tune/start.ts), and in the
// four chunks around it (which one holds what turns with the seed, `opening`): the dawn eye; the card reader, a
// first memory card and an ember cell; a printer with a second weapon beside it; a reliquary (shop).

import { CHUNK, chunk, chunkHook, Cell } from '../core/grid';
import { spawn, tickHooks } from '../core/game';
import { BETTER, MODS, rarityKey } from '../core/mods';
import { hash, rng, type Rng } from '../core/rng';
import { RES, type Chunk, type Game, type Item } from '../core/types';
import { floors, generate, rooms } from './gen';
import { nextLog } from './vectors';
import { COLD, ZONES, zoneFar } from './zones';
import { farOf, floorAt, floorOfChunk, HALF, inRoom, inside, isArrival, origin, stairsChunk, STRIDE } from './floors';

/** v3 (Maks 10-18: "my first eye was behind a wall and I couldn't get it"): the first eye lies in the open, on the
 *  walk from where you wake to the keeper's room, EYE_BAND of the way along it (by seed), so it comes at the mid to
 *  end of the cradle. The way is found over the cradle's open floor as generated (no wall to break on it) */
export const EYE_BAND: [number, number] = [0.5, 0.7];
/** and never nearer the start than this many steps (a short way to the keeper put it a minute out) */
export const EYE_MIN = 16;
/** v3r1 floor 1 (the eye 4 cells from the door: its pickup and the keeper's door card collided): at least this
 *  many steps before the keeper's door, so sight comes a while before the fight */
export const EYE_GAP = 10;
const eyeSpots = new Map<number, { at: [number, number]; way: number; along: number }>();
export function firstEye(seed: number): { at: [number, number]; way: number; along: number } {
  const hit = eyeSpots.get(seed);
  if (hit) return hit;
  // the cradle's cells, world coords, from its chunks as the generator makes them
  const [ox, oy] = [-HALF * CHUNK, -HALF * CHUNK];
  const W = (2 * HALF + 1) * CHUNK;
  const open = new Uint8Array(W * W);
  for (let cy = -HALF; cy <= HALF; cy++)
    for (let cx = -HALF; cx <= HALF; cx++) {
      if (!inside(cx, cy)) continue;
      const c = generate(seed, cx, cy);
      for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) if (c.cells[j * CHUNK + i] === Cell.floor) open[(cy * CHUNK + j - oy) * W + cx * CHUNK + i - ox] = 1;
    }
  const [sx, sy] = origin(0).map(Math.floor);
  const from = new Int32Array(W * W).fill(-1);
  const start = (sy - oy) * W + sx - ox;
  from[start] = start;
  const q = [start];
  let end = -1;
  for (let k = 0; k < q.length && end < 0; k++) {
    const i = q[k];
    const [x, y] = [(i % W) + ox, Math.floor(i / W) + oy];
    if (inRoom(seed, 0, x + 0.5, y + 0.5)) end = i;
    else
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [nx, ny] = [x + dx - ox, y + dy - oy];
        const n = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= W || !open[n] || from[n] >= 0) continue;
        from[n] = i;
        q.push(n);
      }
  }
  const way: number[] = [];
  for (let i = end; i >= 0 && i !== start; i = from[i]) way.push(i);
  way.push(start);
  way.reverse();
  // the last cell is the room's own door cell: the eye lies before it, never in the room
  const along = EYE_BAND[0] + rng(hash(seed, 181))() * (EYE_BAND[1] - EYE_BAND[0]);
  const i = way[Math.max(1, Math.min(way.length - 1 - EYE_GAP, Math.max(EYE_MIN, Math.round((way.length - 1) * along))))] ?? start;
  const out = { at: [(i % W) + ox + 0.5, Math.floor(i / W) + oy + 0.5] as [number, number], way: way.length - 1, along };
  eyeSpots.set(seed, out);
  return out;
}
/** the chunk the first eye lies in */
export function eyeChunk(seed: number): [number, number] {
  const [x, y] = firstEye(seed).at;
  return [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
}
import { placeCache } from './cache';

/** the furnace's own kit: tier 2, but it rolls only there, so the last zone still brings modules you have not seen */
export const FURNACE_KIT = ['heat-lance', 'reliquary-saw', 'heart-shard', 'saints-lens'];

/** v2 maps and radars come from the floors' kits (src/world/floors.ts KIT) and aimed prints, not random loot,
 *  so each floor brings its finder and the random pool stays as it was */
export const kitOnly = (m: { params: Record<string, unknown> }): boolean => !!m.params.finds || (m.params.what === 'map' && Number(m.params.detail) >= 2);

/** a module for a chunk this far out (in chunks): tiers open up with distance; uniques never roll.
 *  60% of rolls come from the zone's own tier (the furnace: its own kit), so each zone brings new modules */
export function lootMod(r: Rng, far: number, family?: string, cradle = false): Item {
  const z = zoneFar(far);
  const maxTier = ZONES[z].tier;
  // r2 econ: an aimed print (`print weapon`) rolls within one family
  // v2 balance (r1 pace): the cradle is melee only; the first ranged weapon is the choir nave's (its kit).
  // v2-view: and it rolls no eye: the first is the one find by the landing (the pinhole)
  const pool = Object.values(MODS).filter((m) => m.tier <= maxTier && m.family !== 'unique' && (z >= 3 || !FURNACE_KIT.includes(m.id)) && (family ? m.family === family : !kitOnly(m)) && !(cradle && (ranged(m) || (!family && m.family === 'camera'))));
  const own = pool.filter((m) => (z >= 3 ? FURNACE_KIT.includes(m.id) : m.tier === maxTier));
  const m = r.pick(maxTier >= 1 && own.length && r.chance(0.6) ? own : pool);
  const item: Item = { kind: 'mod', mod: m.id };
  const nums = Object.entries(m.params).filter(([k, v]) => typeof v === 'number' && BETTER[k]);
  if (nums.length && r.chance(0.25)) {
    const [key] = r.pick(nums);
    const good = r.chance(0.5);
    item.roll = { key, mult: rollMult(key, good), tag: good ? 'attuned' : 'cracked' };
  }
  // v2 rarity: one more draw; deeper (and a printer or reliquary's reach) rolls finer
  const [fine, rare] = RARITY_ODDS[z];
  const k = r();
  // v3 modules: fine is level II now (src/core/mods.ts levels); rare stays a rarity
  if (rarityKey(item) && k < rare + fine) k < rare ? (item.rarity = 'rare') : (item.level = 2);
  return item;
}

/** the chance a chunk's loot roll is a module, not a pile (v3 modules: was 0.55; none now: modules come from caches, keepers, set pieces and events) */
export const LOOSE_MOD = 0;

/** a weapon that reaches past arm's length (the cradle rolls none) */
export const ranged = (m: { family: string; params: Record<string, unknown> }): boolean => m.family === 'weapon' && Number(m.params.range ?? 1.3) >= 3;

/** per zone: the chance a rolled module is fine, and rare (v2 rarity: fine ×1.15 on its key number, rare ×1.3) */
export const RARITY_ODDS: [number, number][] = [[0.12, 0.03], [0.2, 0.07], [0.25, 0.12], [0.28, 0.18], [0.3, 0.22]]; // v2 floors: the heart is a fifth

/** a module the body already has, carried or installed */
const held = (g: Game, it: Item) => it.kind === 'mod' && (g.player.inv.some((i) => i.kind === 'mod' && i.mod === it.mod) || g.player.installed.some((i) => i.mod === it.mod));
/** a loot roll, rolled again (up to `tries` times, from `r`) while it is a module you already have
 *  (playtest r2 pace: psalm ×2, spool ×3; a find you hold reads as noise) */
export function fresh(g: Game, it: Item, r: Rng, far: number, tries = 4): Item {
  for (let k = 0; k < tries && held(g, it); k++) it = lootMod(r, far, undefined, !g.floor);
  return it;
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
export const SECOND = ['choir-bell', 'censer-flail']; // v2 balance: melee only (the rivet sling reaches 4)

/** which way a number is better: moved to src/core/mods.ts (v2 rarity reads it too) */
export { BETTER };
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

/** the arrival cache of a floor: its kit as a choice (src/world/cache.ts) and a little to spend, in the chamber you land in */
function cache(g: Game, c: Chunk, f: number): void {
  placeCache(g, c.cx, c.cy, f);
  const r = rng(hash(g.seed, 12, f));
  if (f > 0 && f < ZONES.length - 1) spawn(g, { kind: 'item', x: c.cx * CHUNK + 10.5, y: c.cy * CHUNK + 6.5, item: { kind: 'res', res: r.pick(['bone', 'glass', 'copper'] as const), n: 3 + f } });
  // v3 econ: the print → recycle loop paid the deep floors' power and upgrades; the cache pays a share of it now
  if (f > 0 && f < ZONES.length - 1) spawn(g, { kind: 'item', x: c.cx * CHUNK + 11.5, y: c.cy * CHUNK + 6.5, item: { kind: 'res', res: 'bone', n: 2 + 2 * f } });
}

export function fill(g: Game, c: Chunk): void {
  const at = (x: number, y: number) => [c.cx * CHUNK + x + 0.5, c.cy * CHUNK + y + 0.5] as const;
  const f = floorOfChunk(c.cx);
  if (isArrival(c.cx, c.cy)) {
    // v3 econ (v3r2: floor 1 was the same pile every run): the halo waits where you land on the cold floor (3), where
    // a lamp is what lets you mend, not on floor 1 where it was the first thing recycled
    if (f === COLD) {
      const [ex, ey] = at(8, 8);
      spawn(g, { kind: 'item', x: ex, y: ey, item: { kind: 'mod', mod: 'halo' } });
    }
    cache(g, c, f);
    // the first eye's chunk is made now, so the goal and the map can point at it from the start
    if (f === 0) chunk(g, ...eyeChunk(g.seed));
    return;
  }
  // the boss room holds only its boss (src/world/floors.ts); the heart only its arena
  const [sx, sy] = stairsChunk(g.seed, f);
  if ((c.cx === sx && c.cy === sy) || f === ZONES.length - 1) return;
  const r = rng(hash(g.seed, 11, c.cx, c.cy));
  const far = farOf(c.cx, c.cy);
  const o = opening(g.seed);
  if (is(c, o.eye)) {
    // v2r2 ux: on the way to the first eye (two chunks out, src/world/secrets.ts), a couple of finds to walk over
    // (the old first eye's draw is kept, so the chunk stays as it was)
    cellIn(r, c, g.seed);
    const re = rng(hash(g.seed, 71, c.cx, c.cy));
    for (const res of ['bone', 'glass'] as const) {
      const [x, y] = cellIn(re, c, g.seed);
      spawn(g, { kind: 'item', x, y, item: { kind: 'res', res, n: 2 } });
    }
  }
  if (is(c, o.reader)) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'mod', mod: 'card-reader' }, data: { opener: true } });
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
    // v2r3 fun: the nave's printers wanted copper the floor never gave: two lie by each, a print's worth
    if (f === 1) spawn(g, { kind: 'item', x: x - 0.3, y, item: { kind: 'res', res: 'copper', n: 2 } });
  }
  // a reliquary (shop printer) one chunk out, then now and then further out; its own rng keeps the rest of the chunk as it was
  const rs = rng(hash(g.seed, 57, c.cx, c.cy));
  // v2: every floor past the cradle has a reliquary one chunk from where you land (the cradle's is `opening`)
  const landShop = f > 0 && is(c, [f * STRIDE + o.shop[0], o.shop[1]]);
  if (is(c, o.shop) || landShop || (far >= 2 && rs.chance(0.1))) {
    const [x, y] = is(c, o.shop) ? shopAt(g.seed, c) : cellIn(rs, c, g.seed);
    spawn(g, { kind: 'printer', x, y, data: { far, shop: true } });
  }
  // the first eye's chunk is made with the landing: a card there would come before the reader's opener
  const [ex, ey] = eyeChunk(g.seed);
  if (far >= 1.5 && r.chance(0.18) && !(f === 0 && c.cx === ex && c.cy === ey)) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'card', card: nextLog(g) } });
  }
  if (far >= 3 && r.chance(0.3)) {
    const [x, y] = cellIn(r, c, g.seed);
    spawn(g, { kind: 'item', x, y, item: { kind: 'res', res: 'ichor', n: 1 } });
  }
  const loot = r.int(1, 2) + (far >= 4 ? 1 : 0);
  // a repeat of what you hold rolls again half the time, from its own rng (the chunk stays as it was)
  const again = rng(hash(g.seed, 14, c.cx, c.cy));
  for (let k = 0; k < loot; k++) {
    const [x, y] = cellIn(r, c, g.seed);
    // v3 modules (Maks 10-18: "inventory quickly got bloated"): a loose module is rare; finds are events (caches, set pieces, keepers)
    const it: Item = r.chance(LOOSE_MOD) ? lootMod(r, far, undefined, f === 0) : { kind: 'res', res: r.pick(RES.slice(0, 3)), n: r.int(1, 2) };
    spawn(g, { kind: 'item', x, y, item: again.chance(0.5) ? fresh(g, it, again, far) : it });
  }
  // enemies: the fight slice's own chunk hook (src/fight/spawn.ts)
}

chunkHook(fill);

// v2r3 fun: one card reader a floor at most (floor 1 lay five, all dead loot). A later one, from any roll (chunk
// loot, drops, set pieces), folds into bone as it appears: on the cradle (its opener's reader is the one), while
// you hold a reader, or while another lies on the same floor
const swept = new WeakMap<Game, number>();
tickHooks.push((g) => {
  const from = swept.get(g) ?? 0;
  if (g.nextId <= from) return;
  swept.set(g, g.nextId);
  const p = g.player;
  const reader = (it: Item | undefined) => it?.kind === 'mod' && it.mod === 'card-reader';
  for (const e of g.ents) {
    if (e.id < from || e.kind !== 'item' || !reader(e.item) || e.data?.opener || e.data?.mimic) continue;
    const f = floorAt(e.x);
    const held = p.inv.some(reader) || p.installed.some((i) => i.mod === 'card-reader');
    const other = g.ents.some((o) => o !== e && o.kind === 'item' && reader(o.item) && floorAt(o.x) === f);
    if (f === 0 || held || other) e.item = { kind: 'res', res: 'bone', n: 2 };
  }
});
