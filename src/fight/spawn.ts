// Who lives where: the fight slice's own chunk hook places enemies by distance (in chunks).
// Maks's playtest (10-18, "way more battles in the beginning"): mites wait in the start chunk's
// conduits (never in the chamber you wake in) and the first ring holds mites and a seraph lamp.
import { CHUNK, Cell, chunkHook } from '../core/grid';
import { spawn, spawnEnemy } from '../core/game';
import { hash, rng, type Rng } from '../core/rng';
import { lootMod } from '../world/spawn';
import type { Chunk, Game } from '../core/types';

/** cells closer than this to where you wake hold no enemy (mites sense 6) */
const CALM = 7.5;

function floorCell(r: Rng, c: Chunk): [number, number] | null {
  const cells: number[] = [];
  for (let k = 0; k < c.cells.length; k++) {
    const x = k % CHUNK;
    const y = (k / CHUNK) | 0;
    const calm = Math.hypot(c.cx * CHUNK + x + 0.5 - 8.5, c.cy * CHUNK + y + 0.5 - 8.5) < CALM;
    if (c.cells[k] === Cell.floor && x > 1 && y > 1 && x < CHUNK - 2 && y < CHUNK - 2 && !calm) cells.push(k);
  }
  if (!cells.length) return null;
  const k = r.pick(cells);
  return [c.cx * CHUNK + (k % CHUNK) + 0.5, c.cy * CHUNK + ((k / CHUNK) | 0) + 0.5];
}

/** what a chunk this far out holds: [enemy, chance, how many]; a row may repeat (another group) */
export function table(far: number): [string, number, number][] {
  const t: [string, number, number][] = [];
  if (far === 0) return [['mite', 1, 2]]; // the start chunk's conduits
  if (far < 1.5) return [['mite', 0.85, 2], ['mite', 0.35, 2], ['seraph', 0.25, 1]]; // the first ring
  t.push(['mite', far < 3 ? 0.6 : 0.45, 3]);
  t.push(['mimic', far < 3 ? 0.08 : 0.15, 1]); // tuning #1328: was 0.15 everywhere
  if (far >= 2.5) t.push(['seraph', 0.3, 1]); // tuning #1328: was 2 (seraphs killed runs at the first shard)
  if (far >= 3.5) t.push(['walker', 0.25, 1]); // tuning #1328: was 2.8, 0.3
  if (far >= 4) t.push(['hum', 0.25, 1]); // tuning #1328: was 3.5
  return t;
}

export function fillFoes(g: Game, c: Chunk): void {
  const r = rng(hash(g.seed, 23, c.cx, c.cy));
  const far = Math.hypot(c.cx, c.cy);
  for (const [type, p, n] of table(far)) {
    if (!r.chance(p)) continue;
    const at = floorCell(r, c);
    if (!at) continue;
    for (let k = 0; k < n; k++) {
      // a group stands together: a few tenths apart in its cell
      const [x, y] = [at[0] + (k - (n - 1) / 2) * 0.3, at[1]];
      if (type === 'mimic') spawn(g, { kind: 'item', x, y, item: lootMod(r, far), data: { mimic: true } });
      else spawnEnemy(g, type, x, y);
    }
  }
}

chunkHook(fillFoes);
