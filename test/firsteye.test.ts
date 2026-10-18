// v3 (Maks 10-18): the first eye lies in the open on the walk to the keeper, 60-80% of the way, on every seed
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { CHUNK, Cell, cell } from '../src/core/grid';
import { firstEye, EYE_BAND, EYE_MIN } from '../src/world/spawn';
import { bossRoom, inRoom, inside, origin } from '../src/world/floors';
import '../src/mods';
import '../src/world';

/** steps over open floor from (ax, ay) to (bx, by) in the live game, or -1 */
function steps(g: ReturnType<typeof newGame>, [ax, ay]: number[], [bx, by]: number[]): number {
  const key = (x: number, y: number) => `${x},${y}`;
  const goal = key(Math.floor(bx), Math.floor(by));
  const seen = new Map([[key(Math.floor(ax), Math.floor(ay)), 0]]);
  const q: [number, number][] = [[Math.floor(ax), Math.floor(ay)]];
  for (let k = 0; k < q.length; k++) {
    const [x, y] = q[k];
    const d = seen.get(key(x, y))!;
    if (key(x, y) === goal) return d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [nx, ny] = [x + dx, y + dy];
      if (seen.has(key(nx, ny)) || !inside(Math.floor(nx / CHUNK), Math.floor(ny / CHUNK)) || cell(g, nx + 0.5, ny + 0.5) !== Cell.floor) continue;
      seen.set(key(nx, ny), d + 1);
      q.push([nx, ny]);
    }
  }
  return -1;
}

describe('v3: the first eye', () => {
  it('lies on open floor, walkable from the start, out of the keeper\'s room, 70-90% of the way to it', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = newGame(seed);
      const e = g.ents.find((x) => x.item?.kind === 'mod' && x.item.mod === 'pinhole-eye')!;
      expect(e, `seed ${seed}`).toBeTruthy();
      expect(e.data?.sealed).toBeFalsy();
      expect(cell(g, e.x, e.y), `seed ${seed}`).toBe(Cell.floor);
      expect(inRoom(seed, 0, e.x, e.y)).toBe(false);
      const there = steps(g, origin(0), [e.x, e.y]);
      expect(there, `seed ${seed}`).toBeGreaterThan(0);
      const [x0, y0, x1, y1] = bossRoom(seed, 0);
      const room = steps(g, origin(0), [(x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2]);
      expect(room).toBeGreaterThan(there);
      const f = firstEye(seed);
      expect(f.along).toBeGreaterThanOrEqual(EYE_BAND[0]);
      expect(there / f.way, `seed ${seed}`).toBeGreaterThanOrEqual(0.69);
      expect(there, `seed ${seed}`).toBeGreaterThanOrEqual(Math.min(EYE_MIN, f.way - 1));
      expect(there / f.way, `seed ${seed}`).toBeLessThanOrEqual(0.95);
    }
  });
});
