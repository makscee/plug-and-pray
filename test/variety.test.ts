import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import { hurt, newGame, spawnEnemy, tick } from '../src/core/game';
import { CHUNK, open } from '../src/core/grid';
import type { Game } from '../src/core/types';
import { fire } from '../src/fight/shots';
import { goDown, LAST, origin, stairsChunk, STRIDE } from '../src/world/floors';
import { landing, LANDINGS } from '../src/world/gen';
import { SPOT } from '../src/world/cache';
import { PIECE, PIECE_MID, piecesOf } from '../src/world/pieces';
import { pieceProps } from '../src/world/piecefill';
import { CANTOR, VENT, vents } from '../src/world/gimmicks';
import { DODGE } from '../src/fight/dodge';

const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
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

describe('v2 variety: layouts', () => {
  it('the landing turns with the seed, and always keeps where you land and the cache open', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 24; seed++)
      for (let f = 0; f < LAST; f++) {
        seen.add(landing(seed, f).join());
        const g = newGame(seed);
        if (f) goDown(g, f);
        const [x, y] = origin(f);
        expect(open(g, x, y)).toBe(true);
        const [cx, cy] = [f * STRIDE * CHUNK + SPOT[0] + 0.5, SPOT[1] + 0.5];
        expect(path(g, [x, y], [cx, cy]), `seed ${seed} floor ${f}`).toBeGreaterThan(0);
      }
    expect(seen.size).toBe(LANDINGS.length + 1);
  });

  it('the way down turns with the seed: all four edges', () => {
    const at = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) at.add(stairsChunk(seed, 0).join());
    expect(at.size).toBe(4);
  });

  it('two set pieces per floor, from that floor\'s pool, reachable from the landing', () => {
    const ids = new Set<string>();
    for (let seed = 1; seed <= 8; seed++)
      for (let f = 0; f < LAST; f++) {
        const ps = piecesOf(seed, f);
        expect(ps.length).toBe(2);
        expect(ps[0][0]).not.toBe(ps[1][0]);
        const g = newGame(seed);
        if (f) goDown(g, f);
        for (const [id, cx, cy] of ps) {
          ids.add(id);
          expect(PIECE[id].floor).toBe(f);
          expect([cx, cy]).not.toEqual(stairsChunk(seed, f));
          const mid: [number, number] = [cx * CHUNK + PIECE_MID[0] + 0.5, cy * CHUNK + PIECE_MID[1] + 0.5];
          expect(path(g, origin(f), mid), `${id} seed ${seed}`).toBeGreaterThan(0);
          expect(pieceProps(g).some((e) => e.data!.piece === id)).toBe(true);
        }
      }
    expect(ids.size).toBeGreaterThan(14);
  });
});

describe('v2 variety: floor tricks', () => {
  it('a choir seraph sidesteps the first shot, then is spent', () => {
    // a seed whose nave landing is the plain square, so there is room to step aside
    let seed = 1;
    while (landing(seed, 1) !== LANDINGS[0]) seed++;
    const g = newGame(seed);
    goDown(g, 1);
    g.ents = g.ents.filter((e) => !e.enemy);
    const p = g.player;
    const [x, y] = [p.x, p.y - 3];
    const s = spawnEnemy(g, 'seraph', x, y);
    s.enemy!.readyAt = 999;
    const shoot = () => fire(g, { x: p.x, y: p.y - 0.3, vx: 0, vy: -12, dmg: 1, range: 8, src: null, foe: false });
    shoot();
    run(g, 0.6);
    expect(s.enemy!.hp).toBe(3);
    expect(Math.abs(s.x - x)).toBeGreaterThan(0.6);
    // spent: the next shot down its new line lands
    shoot().x = s.x;
    run(g, 0.6);
    expect(s.enemy!.hp).toBeLessThan(3);
    expect(Number(s.enemy!.data.dodgeAt)).toBeGreaterThan(g.t - DODGE.every);
  });

  it('a singing cantor makes the foes near it hit harder', () => {
    const g = newGame(3);
    goDown(g, 1);
    g.ents = g.ents.filter((e) => !e.enemy);
    const p = g.player;
    const m = spawnEnemy(g, 'mite', p.x + 1, p.y);
    const c = spawnEnemy(g, 'cantor', p.x + 2, p.y);
    c.enemy!.data.noticed = true;
    // find a moment it sings, and one it rests
    let hp = p.hp;
    const at = (sing: boolean) => {
      for (let k = 0; k < 200; k++) {
        const t = (g.t + c.id * 1.7) % (CANTOR.sing + CANTOR.rest);
        if ((t < CANTOR.sing) === sing && t > 0.2 && t < CANTOR.sing + CANTOR.rest - 0.2) return;
        g.t += 0.1;
      }
    };
    at(false);
    hp = p.hp;
    hurt(g, 1, m);
    const rest = hp - p.hp;
    at(true);
    hp = p.hp;
    hurt(g, 1, m);
    expect(hp - p.hp).toBeCloseTo(rest * CANTOR.mult, 5);
  });

  it('the furnace vents burn you on the beat, not between', () => {
    const g = newGame(5);
    goDown(g, 3);
    let v = vents(g)[0];
    for (let k = 0; !v && k < 25; k++) {
      open(g, g.player.x + ((k % 5) - 2) * CHUNK, g.player.y + (Math.floor(k / 5) - 2) * CHUNK);
      v = vents(g)[0];
    }
    expect(v).toBeTruthy();
    g.ents = g.ents.filter((e) => !e.enemy);
    const p = g.player;
    p.inv = [];
    p.installed = [];
    [p.x, p.y] = [v.x, v.y];
    // the rest of the beat: only the heat's sear; then the burst
    g.t = Math.ceil(g.t / VENT.every) * VENT.every + 0.1;
    run(g, 0.05);
    p.hp = p.maxHp;
    let before = p.hp;
    run(g, VENT.every - VENT.burst - 0.4);
    expect(before - p.hp).toBeLessThan(0.8);
    p.hp = p.maxHp;
    before = p.hp;
    run(g, 0.7);
    expect(before - p.hp).toBeGreaterThan(0.8);
  });
});
