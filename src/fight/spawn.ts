// Who lives where: the fight slice's own chunk hook places enemies by distance (in chunks).
// Maks's playtest (10-18, "way more battles in the beginning"): mites wait in the start chunk's
// conduits (never in the chamber you wake in) and the first ring holds mites and a seraph lamp.
import { CHUNK, Cell, chunkHook } from '../core/grid';
import { spawn, spawnEnemy } from '../core/game';
import { hash, rng, type Rng } from '../core/rng';
import { lootMod } from '../world/spawn';
import type { Chunk, Entity, Game } from '../core/types';
import { ZONES, zoneAt, zoneFar } from '../world/zones';
import { farOf, floorOfChunk, isArrival, LAST, origin, stairsChunk } from '../world/floors';

/** cells closer than this to where you wake hold no enemy (mites sense 6) */
const CALM = 7.5;

function floorCell(r: Rng, c: Chunk, elites: Entity[] = []): [number, number] | null {
  const cells: number[] = [];
  const [hx, hy] = origin(floorOfChunk(c.cx));
  for (let k = 0; k < c.cells.length; k++) {
    const x = k % CHUNK;
    const y = (k / CHUNK) | 0;
    const calm = Math.hypot(c.cx * CHUNK + x + 0.5 - hx, c.cy * CHUNK + y + 0.5 - hy) < CALM;
    const wx = c.cx * CHUNK + x + 0.5;
    const wy = c.cy * CHUNK + y + 0.5;
    const guarded = elites.some((e) => Math.hypot(e.x - wx, e.y - wy) < 6);
    if (c.cells[k] === Cell.floor && x > 1 && y > 1 && x < CHUNK - 2 && y < CHUNK - 2 && !calm && !guarded) cells.push(k);
  }
  if (!cells.length) return null;
  const k = r.pick(cells);
  return [c.cx * CHUNK + (k % CHUNK) + 0.5, c.cy * CHUNK + ((k / CHUNK) | 0) + 0.5];
}

/** what a chunk this far out holds: [enemy, chance, how many]; a row may repeat (another group).
 *  By zone (src/world/zones.ts): the cradle has mites and a seraph; the choir nave swarms and seraph lines
 *  and mimics; the ossuary walkers and the hum; the furnace furnace-seraphs, walkers and hum packs. */
export function table(far: number): [string, number, number][] {
  if (far === 0) return [['mite', 1, 2]]; // the start chunk's conduits
  const z = zoneFar(far);
  if (z >= ZONES.length - 1) return []; // the heart: its keeper alone (src/world/floors.ts)
  if (z === 0) return [['mite', 0.85, 2], ['mite', 0.2, 2], ['seraph', 0.25, 1]]; // v2 balance: melee only now, so one second pack in five (was 0.35)
  // r1 pace: the nave's first ring (by the cradle's border) holds pairs, not threes: a step, not a cliff
  if (z === 1) return far < 2.8 ? [['mite', 0.8, 2], ['mite', 0.15, 2], ['seraph', 0.2, 1], ['mimic', 0.1, 1]] : [['mite', 0.8, 3], ['mite', 0.2, 3], ['seraph', 0.3, 1], ['mimic', 0.1, 1]];
  // r1 pace: a touch lighter than it was, so the furnace (below) is the hardest zone
  // v5 ("2 times shorter"): fewer filler packs on floors 2-4 (mites 0.55 → 0.4 here, the furnace's second pack 0.3 → 0.1)
  if (z === 2) return [['mite', 0.4, 3], ['walker', 0.5, 1], ['seraph', 0.3, 1], ['hum', 0.3, 1], ['mimic', 0.15, 1]];
  // r1 pace: the furnace is the hardest zone: hum packs and more mimics on top of its lamps and walkers
  // v2 floors: the whole furnace floor is crossed now (it was a stretch to the engine): a little lighter
  return [['mite', 0.6, 3], ['mite', 0.1, 3], ['walker', 0.5, 1], ['pyre', 0.4, 1], ['hum', 0.2, 2], ['mimic', 0.2, 1]];
}

/** a foe made for its zone: hp scaled here, its damage by `FOE.damage` in the hurt hook */
export function foe(g: Game, type: string, x: number, y: number): Entity {
  const e = spawnEnemy(g, type, x, y);
  const zone = zoneAt(x, y);
  const z = ZONES[zone].foe;
  // the nave's mites keep 1 hp: the starter spark kills one a blow (r2: 1.2 hp took two, a swarm killed you)
  if (!(type === 'mite' && zone <= 1)) e.enemy!.hp = Math.round(e.enemy!.hp * z.hp * 10) / 10;
  e.enemy!.data.mult = z.damage;
  return e;
}

export function fillFoes(g: Game, c: Chunk): void {
  // the boss room holds only its boss (src/world/floors.ts); you land on a new floor in quiet
  const f = floorOfChunk(c.cx);
  const [sx, sy] = stairsChunk(g.seed, f);
  if ((c.cx === sx && c.cy === sy) || (f > 0 && isArrival(c.cx, c.cy))) return;
  const r = rng(hash(g.seed, 23, c.cx, c.cy));
  const far = farOf(c.cx, c.cy);
  // the heart's hall (src/world/floors.ts HEART_APPROACH): the furnace's mix stands between you and its keeper
  const rows = f === LAST && !isArrival(c.cx, c.cy) ? table(7.5) : table(far);
  for (const [type, p, n] of rows) {
    if (!r.chance(p)) continue;
    const at = floorCell(r, c, g.ents.filter((e) => e.enemy?.data.elite));
    if (!at) continue;
    for (let k = 0; k < n; k++) {
      // a group stands together: a few tenths apart in its cell
      const [x, y] = [at[0] + (k - (n - 1) / 2) * 0.3, at[1]];
      // v3 modules (fewer, bigger finds): most mimics dress as a pile of copper now; a third still wear a module
      if (type === 'mimic') {
        const it = lootMod(r, far, undefined, far < 2);
        spawn(g, { kind: 'item', x, y, item: rng(hash(g.seed, 177, Math.floor(x), Math.floor(y))).chance(0.35) ? it : { kind: 'res', res: 'copper', n: 3 }, data: { mimic: true } });
      }
      else foe(g, type, x, y);
    }
  }
}

chunkHook(fillFoes);
