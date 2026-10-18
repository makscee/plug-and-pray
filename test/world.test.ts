import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, spawnEnemy, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { CHUNK, Cell, chunk, setCell } from '../src/core/grid';
import type { Game } from '../src/core/types';
import { generate, rooms, spot } from '../src/world/gen';
import { CARDS } from '../src/world/cards';
import { eyeChunk, FURNACE_KIT, lootMod, opening, SECOND } from '../src/world/spawn';
import { MODS } from '../src/core/mods';
import { rng } from '../src/core/rng';
import { inside } from '../src/world/floors';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
const give = (g: Game, mod: string) => {
  g.player.inv.push({ kind: 'mod', mod });
  exec(g, `install ${mod.replace('-', ' ')}`);
  run(g, 2);
};
/** stand the player on (x, y), cell centre */
const at = (g: Game, x: number, y: number) => {
  g.player.x = x;
  g.player.y = y;
  g.player.path = [];
};

describe('the world', () => {
  it('deeper floors have more chambers, odd shapes, and every floor cell reaches a door', () => {
    let many = 0;
    let odd = 0;
    // v2: the four floors' 5x5 chunks (src/world/floors.ts); doors only toward chunks of the same floor
    for (const ox of [0, 16, 32, 48])
      for (let cy = -2; cy <= 2; cy++)
        for (let lx = -2; lx <= 2; lx++) {
          const cx = ox + lx;
          if (!inside(cx, cy)) continue; // v3: floors 1-2 are diamonds
          const rs = rooms(3, cx, cy);
          if (rs.length > 1) many++;
          if (rs.some((r) => r[4] !== 'box')) odd++;
          const c = generate(3, cx, cy);
          const k = c.cells.findIndex((v) => v === Cell.floor);
          const seen = new Set([`${k % CHUNK},${(k / CHUNK) | 0}`]);
          const q = [[k % CHUNK, (k / CHUNK) | 0]];
          while (q.length) {
            const [x, y] = q.pop()!;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= CHUNK || ny >= CHUNK || seen.has(`${nx},${ny}`) || c.cells[ny * CHUNK + nx] !== Cell.floor) continue;
              seen.add(`${nx},${ny}`);
              q.push([nx, ny]);
            }
          }
          const floor = c.cells.filter((v) => v === Cell.floor).length;
          expect(seen.size, `chunk ${cx},${cy}`).toBe(floor);
          // a door on each edge that has more floor beyond it, none onto the rock
          const edge = (f: (i: number) => number) => [...Array(CHUNK).keys()].some((i) => c.cells[f(i)] === Cell.floor);
          expect(edge((y) => y * CHUNK + CHUNK - 1), `east ${cx},${cy}`).toBe(inside(cx + 1, cy));
          expect(edge((y) => y * CHUNK), `west ${cx},${cy}`).toBe(inside(cx - 1, cy));
          expect(edge((x) => x), `north ${cx},${cy}`).toBe(inside(cx, cy - 1));
          expect(edge((x) => (CHUNK - 1) * CHUNK + x), `south ${cx},${cy}`).toBe(inside(cx, cy + 1));
        }
    expect(many).toBeGreaterThan(30);
    expect(odd).toBeGreaterThan(12);
  });

  it('the leech needle drains a vein into resources and wakes what is near', () => {
    const g = newGame(1);
    give(g, 'leech-needle');
    at(g, 8.5, 8.5);
    setCell(g, 9, 8, Cell.vein + 2); // copper beside you (a wall now)
    const m = spawnEnemy(g, 'mite', 6.5, 6.5);
    exec(g, 'drain');
    expect(g.player.inv.some((i) => i.kind === 'res' && i.res === 'copper' && i.n >= 1)).toBe(true);
    expect(m.enemy!.data.noticed).toBe(true);
    exec(g, 'drain');
    expect(text(g)).toMatch(/cooling|no vein/);
  });

  it('a printer prints a slot and a module for resources', () => {
    const g = newGame(1);
    chunk(g, -1, 0);
    const pr = g.ents.find((e) => e.kind === 'printer' && !e.data?.shop)!;
    expect(pr).toBeTruthy();
    at(g, pr.x, pr.y);
    run(g, 0.1);
    expect(text(g)).toContain('print slot');
    exec(g, 'print slot');
    expect(text(g)).toContain('wants');
    g.player.inv.push({ kind: 'res', res: 'bone', n: 10 }, { kind: 'res', res: 'copper', n: 5 }, { kind: 'res', res: 'glass', n: 8 });
    exec(g, 'print slot');
    expect(g.player.slots).toBe(4);
    const before = g.player.inv.filter((i) => i.kind === 'mod').length;
    exec(g, 'print module');
    expect(g.player.inv.filter((i) => i.kind === 'mod').length).toBe(before + 1);
  });

  it('past the way down a card places a printer or a cache in the chunk it points at', () => {
    const g = newGame(2);
    give(g, 'card-reader');
    g.player.inv.push({ kind: 'card', card: 'log-ferry' }, { kind: 'card', card: 'log-surveyor' });
    exec(g, 'read card');
    expect(g.vectors[0].what).toBe('way down');
    exec(g, 'read card');
    const v = g.vectors[1];
    expect(['printer', 'cache', 'ninth eye']).toContain(v.what);
    chunk(g, Math.floor(v.x / CHUNK), Math.floor(v.y / CHUNK));
    const there = g.ents.filter((e) => Math.hypot(e.x - v.x, e.y - v.y) < 0.01);
    expect(there.length).toBeGreaterThan(0);
  });

  it('card texts keep to 44 characters a line', () => {
    for (const c of Object.values(CARDS)) for (const l of c.lines) expect(l.length, l).toBeLessThanOrEqual(44);
  });

  it('the start area holds the reader and a card, a printer with a second weapon, turned per seed', () => {
    const sides = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const g = newGame(seed);
      const o = opening(seed);
      sides.add(o.eye.join());
      const inChunk = (e: { x: number; y: number }, [cx, cy]: [number, number]) => Math.floor(e.x / CHUNK) === cx && Math.floor(e.y / CHUNK) === cy;
      expect(g.ents.some((e) => e.item?.kind === 'mod' && e.item.mod === 'card-reader' && inChunk(e, o.reader))).toBe(true);
      expect(g.ents.some((e) => e.item?.kind === 'card' && inChunk(e, o.reader))).toBe(true);
      // v2r2 ux: the first eye two chunks out on the eye's side, made with the landing
      expect(g.ents.some((e) => e.item?.kind === 'mod' && e.item.mod === 'pinhole-eye' && inChunk(e, eyeChunk(seed)))).toBe(true);
      const pr = g.ents.find((e) => e.kind === 'printer' && !e.data?.shop && inChunk(e, o.printer))!;
      expect(pr).toBeTruthy();
      expect(g.ents.some((e) => e.item?.kind === 'mod' && SECOND.includes(e.item.mod) && Math.hypot(e.x - pr.x, e.y - pr.y) < 1)).toBe(true);
      expect(g.ents.some((e) => e.kind === 'printer' && e.data?.shop && inChunk(e, o.shop))).toBe(true);
    }
    expect(sides.size).toBeGreaterThan(1);
  });

  it('loot leans to the zone\'s own tier; the furnace keeps its own kit', () => {
    const r = rng(5);
    const tierOf = (far: number) => {
      const xs = Array.from({ length: 400 }, () => lootMod(r, far)).map((i) => (i.kind === 'mod' ? i.mod : ''));
      return xs;
    };
    const nave = tierOf(2.5);
    expect(nave.filter((id) => MODS[id].tier === 1).length / nave.length).toBeGreaterThan(0.6);
    const oss = tierOf(4.5);
    expect(oss.some((id) => FURNACE_KIT.includes(id))).toBe(false);
    const furnace = tierOf(7);
    expect(furnace.filter((id) => FURNACE_KIT.includes(id)).length / furnace.length).toBeGreaterThan(0.55);
  });

  it('past the cradle a set piece happens every 2-3 minutes', () => {
    const g = newGame(3);
    const [sx, sy] = spot(3, 17, 0, 9); // floor 2, the nave
    chunk(g, 17, 0);
    at(g, sx, sy);
    g.player.hp = g.player.maxHp = 1e9;
    const sets: string[] = [];
    for (let k = 0; k < 20 * 400; k++) {
      tick(g, 0.05);
      for (const e of g.events) if (e.type === 'set') sets.push(e.data as string);
      g.ents = g.ents.filter((e) => !e.enemy); // nothing keeps it busy
    }
    // 400 s: the first at 150 s, then every 100-160 s
    expect(sets.length).toBeGreaterThanOrEqual(2);
    expect(sets[0]).not.toBe(sets[1]);
  });
});
