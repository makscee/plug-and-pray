import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, strike, tick } from '../src/core/game';
import { CHUNK, Cell, cell, chunk, open } from '../src/core/grid';
import { exec, VERBS } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { cacheNear } from '../src/world/cache';
import { bossAt, bossDown, bossRoom, FLOORS, goDown, inside, KIT, LAST, onBossDown, origin, stairsAt, stairsChunk, STRIDE } from '../src/world/floors';
import { variantOf } from '../src/fight/bosses';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
/** shortest open path length from a to b, or -1 */
function path(g: Game, [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const k = (x: number, y: number) => x + ',' + y;
  const d = new Map([[k(Math.floor(ax), Math.floor(ay)), 0]]);
  const q: [number, number][] = [[Math.floor(ax), Math.floor(ay)]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    if (x === Math.floor(bx) && y === Math.floor(by)) return d.get(k(x, y))!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [nx, ny] = [x + dx, y + dy];
      if (d.has(k(nx, ny)) || !open(g, nx + 0.5, ny + 0.5)) continue;
      d.set(k(nx, ny), d.get(k(x, y))! + 1);
      q.push([nx, ny]);
    }
  }
  return -1;
}

describe('v2 floors', () => {
  it('five floors, each with a stairs style but the heart, and a kit past the cradle', () => {
    expect(FLOORS.length).toBe(5);
    expect(FLOORS.map((f) => f.stairs)).toEqual(['rope', 'spiral', 'chute', 'lift', null]);
    expect(KIT[1].length).toBeGreaterThan(0);
  });

  it('a floor is bounded: rock outside it, and the landing joins the stairs (and the heart its arena)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = newGame(seed);
      for (let f = 0; f <= LAST; f++) {
        const to = f === LAST ? bossAt(seed, f) : stairsAt(seed, f);
        expect(path(g, origin(f), to), `seed ${seed} floor ${f}`).toBeGreaterThan(5);
      }
      // past the edge of floor 0 is solid rock, and it spawns nothing
      expect(inside(3, 0)).toBe(false);
      const c = chunk(g, 3, 0);
      expect(c.rock).toBe(true);
      expect(c.cells.every((v) => v === Cell.wall)).toBe(true);
      expect(g.ents.some((e) => Math.floor(e.x / CHUNK) === 3 && Math.floor(e.y / CHUNK) === 0)).toBe(false);
      // and no door opens onto it
      for (let y = 0; y < CHUNK; y++) expect(cell(g, 3 * CHUNK - 1, y)).not.toBe(Cell.floor);
    }
  });

  it('the stairs lie in an edge chunk, in front of them the boss room; you land in the middle', () => {
    for (let seed = 1; seed <= 20; seed++)
      for (let f = 0; f < LAST; f++) {
        const [cx, cy] = stairsChunk(seed, f);
        expect(Math.abs(cx - f * STRIDE) + Math.abs(cy)).toBe(2);
        expect(cx === f * STRIDE || cy === 0).toBe(true);
        const [x0, y0, x1, y1] = bossRoom(seed, f);
        const [sx, sy] = stairsAt(seed, f);
        expect(sx > x0 && sx < x1 + 1 && sy > y0 && sy < y1 + 1).toBe(true);
      }
    expect(origin(2)).toEqual([2 * STRIDE * CHUNK + 8.5, 8.5]);
  });

  it('stepping into the room wakes the boss; its death opens the stairs; descend takes you down', () => {
    const g = newGame(4);
    const [sx, sy] = stairsAt(4, 0);
    chunk(g, ...stairsChunk(4, 0));
    const st = g.ents.find((e) => e.data?.stairs)!;
    expect(st.data!.stairs).toBe('rope');
    expect(st.data!.open).toBe(false);
    // sealed: descend refuses
    [g.player.x, g.player.y] = [sx, sy];
    run(g, 0.1);
    const boss = g.ents.find((e) => e.enemy?.data.boss)!;
    expect(boss).toBeTruthy();
    expect(text(g)).toMatch(/wakes in the room before the way down/);
    exec(g, 'descend');
    expect(g.floor).toBe(0);
    expect(text(g)).toMatch(/sealed/);
    strike(g, boss, 999);
    expect(bossDown(g, 0)).toBe(true);
    expect(st.data!.open).toBe(true);
    expect(text(g)).toMatch(/THE WAY DOWN IS OPEN/);
    exec(g, 'descend');
    expect(g.floor).toBe(1);
    expect([g.player.x, g.player.y]).toEqual(origin(1));
    expect(text(g)).toMatch(/FLOOR 2: THE CHOIR NAVE/);
    // the floor above is left behind; its kit waits in a cache where you land (src/world/cache.ts)
    expect(g.ents.every((e) => Math.round(e.x / CHUNK / STRIDE) === 1)).toBe(true);
    const offer = cacheNear(g)?.offer.map((i) => (i.kind === 'mod' ? i.mod : '')) ?? [];
    expect(offer.length).toBe(3); // v3 modules: pick 2 of 3
    for (const m of offer) expect(KIT[1]).toContain(m);
  });

  it('the heart keeper\'s death is the thaw', () => {
    const g = newGame(2);
    g.player.inv.push({ kind: 'res', res: 'bone', n: 5 });
    onBossDown(g, LAST);
    expect(g.ended).toBe('thaw');
    expect(text(g)).toMatch(/drinks what you carry: 5/);
  });

  it('a boss of two (the forge twins) opens the way only when both fall', () => {
    for (let seed = 1; seed < 200; seed++) {
      const g = newGame(seed);
      if (!variantOf(g, 3).mate) continue;
      goDown(g, 3);
      chunk(g, ...stairsChunk(seed, 3));
      [g.player.x, g.player.y] = bossAt(seed, 3);
      run(g, 0.05);
      const bs = g.ents.filter((e) => e.enemy?.data.boss);
      expect(bs.length).toBe(2);
      strike(g, bs[0], 999);
      expect(bossDown(g, 3)).toBe(false);
      strike(g, bs[1], 999);
      expect(bossDown(g, 3)).toBe(true);
      return;
    }
    throw new Error('no seed rolled the twins');
  });

  it('the cradle\'s thin walls break with a weapon', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'spark-finger' });
    exec(g, 'install spark finger');
    for (const i of g.player.installed) i.readyAt = -1;
    // find a one-cell wall between two floor cells, east-west, inside the start chunks
    let spot: [number, number] | null = null;
    for (let y = -20; y < 30 && !spot; y++)
      for (let x = -20; x < 30 && !spot; x++)
        if (open(g, x + 0.5, y + 0.5) && cell(g, x + 1, y) === Cell.wall && open(g, x + 2.5, y + 0.5)) spot = [x, y];
    expect(spot).toBeTruthy();
    const [x, y] = spot!;
    [g.player.x, g.player.y, g.player.dir] = [x + 0.5, y + 0.5, Math.PI / 2];
    g.ents = g.ents.filter((e) => !e.enemy);
    expect(VERBS.break.when!(g)).toBe(true);
    exec(g, 'break');
    expect(cell(g, x + 1, y)).toBe(Cell.floor);
    expect(text(g)).toMatch(/the thin wall gives/);
  });
});
