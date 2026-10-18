// Who lives where: the fight slice's own chunk hook places enemies by distance (in chunks).
// Maks's playtest (10-18, "way more battles in the beginning"): mites wait in the start chunk's
// conduits (never in the chamber you wake in) and the first ring holds mites and a seraph lamp.
import { CHUNK, Cell, chunkHook } from '../core/grid';
import { spawn, spawnEnemy } from '../core/game';
import { hash, rng, type Rng } from '../core/rng';
import { lootMod } from '../world/spawn';
import { plan } from '../world/vectors';
import type { Chunk, Entity, Game } from '../core/types';
import { ZONES, zoneAt, zoneFar } from '../world/zones';

/** cells closer than this to where you wake hold no enemy (mites sense 6) */
const CALM = 7.5;

function floorCell(r: Rng, c: Chunk, elites: Entity[] = []): [number, number] | null {
  const cells: number[] = [];
  for (let k = 0; k < c.cells.length; k++) {
    const x = k % CHUNK;
    const y = (k / CHUNK) | 0;
    const calm = Math.hypot(c.cx * CHUNK + x + 0.5 - 8.5, c.cy * CHUNK + y + 0.5 - 8.5) < CALM;
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
  if (z === 0) return [['mite', 0.85, 2], ['mite', 0.35, 2], ['seraph', 0.25, 1]];
  // r1 pace: the nave's first ring (by the cradle's border) holds pairs, not threes: a step, not a cliff
  if (z === 1) return far < 2.5 ? [['mite', 0.8, 2], ['mite', 0.15, 2], ['seraph', 0.2, 1], ['mimic', 0.1, 1]] : [['mite', 0.8, 3], ['mite', 0.35, 3], ['seraph', 0.3, 1], ['mimic', 0.1, 1]];
  // r1 pace: a touch lighter than it was, so the furnace (below) is the hardest zone
  if (z === 2) return [['mite', 0.55, 3], ['walker', 0.5, 1], ['seraph', 0.3, 1], ['hum', 0.3, 1], ['mimic', 0.15, 1]];
  // r1 pace: the furnace is the hardest zone: hum packs and more mimics on top of its lamps and walkers
  return [['mite', 0.65, 4], ['mite', 0.3, 3], ['walker', 0.55, 1], ['pyre', 0.4, 1], ['hum', 0.25, 2], ['mimic', 0.3, 1]];
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
  // the engine's chunk holds only its own gauntlet (src/world/vectors.ts)
  const [ex, ey] = plan(g.seed).engine;
  if (c.cx === ex && c.cy === ey) return;
  const r = rng(hash(g.seed, 23, c.cx, c.cy));
  const far = Math.hypot(c.cx, c.cy);
  for (const [type, p, n] of table(far)) {
    if (!r.chance(p)) continue;
    const at = floorCell(r, c, g.ents.filter((e) => e.enemy?.data.elite));
    if (!at) continue;
    for (let k = 0; k < n; k++) {
      // a group stands together: a few tenths apart in its cell
      const [x, y] = [at[0] + (k - (n - 1) / 2) * 0.3, at[1]];
      if (type === 'mimic') spawn(g, { kind: 'item', x, y, item: lootMod(r, far), data: { mimic: true } });
      else foe(g, type, x, y);
    }
  }
}

chunkHook(fillFoes);
