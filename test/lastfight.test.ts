// v2r6 newcomer (lost every floor-2 keeper and half the floor-1 ones): a keeper mends once a fight, leaving its
// room is safe, "ready" at a bare 10 hp says risky, and your shots fly over the low pillars of the floor 1-2 rooms
import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import '../src/tune/door';
import { hurt, newGame, spawn, spawnEnemy, tick } from '../src/core/game';
import { chunk, clear, open } from '../src/core/grid';
import type { Entity, Game } from '../src/core/types';
import { outOf, spawnBoss, stageBoss, variantOf } from '../src/fight/bosses';
import { clearShot, fire, shots } from '../src/fight/shots';
import { targets } from '../src/fight/aim';
import { keeperCheck } from '../src/tune/door';
import { bossAt, bossRoom, inRoom, stairsChunk } from '../src/world/floors';

const run = (g: Game, s: number) => {
  for (let t = 0; t < s; t += 0.1) tick(g, 0.1);
};
/** a keeper awake in its room on floor `f`, you at its middle */
function room(seed: number, f: number): { g: Game; k: Entity } {
  const g = newGame(seed);
  g.floor = f;
  chunk(g, ...stairsChunk(seed, f));
  const [bx, by] = bossAt(seed, f);
  g.ents = g.ents.filter((e) => !e.enemy);
  const k = spawnBoss(g, f, bx, by);
  k.enemy!.data.noticed = true;
  return { g, k };
}
/** a cell well out of the room, west of it */
const outside = (g: Game, f: number): [number, number] => {
  const [x0, y0, , y1] = bossRoom(g.seed, f);
  return [x0 - 12.5, (y0 + y1) / 2];
};

describe('v2r6 last fight', () => {
  it('a floor 1-2 keeper mends once a fight, not after every retreat', () => {
    const { g, k } = room(5, 0);
    const max = Number(k.enemy!.data.maxHp);
    k.enemy!.hp = Math.round(max * 0.6);
    const hp0 = k.enemy!.hp;
    const p = g.player;
    // out: it mends once
    [p.x, p.y] = outside(g, 0);
    run(g, 10);
    const hp1 = k.enemy!.hp;
    expect(hp1).toBeGreaterThan(hp0);
    // back in for a moment, out again: no second mend
    [p.x, p.y] = [k.x + 2, k.y];
    run(g, 0.3);
    k.enemy!.hp = hp0;
    [p.x, p.y] = outside(g, 0);
    run(g, 12);
    expect(k.enemy!.hp).toBe(hp0);
  });

  it('out of the room (the door cell too), the keeper, its shots and its brood do not hit you', () => {
    const { g, k } = room(5, 1);
    const p = g.player;
    const [x0, y0, , y1] = bossRoom(g.seed, 1);
    // the door ring: just outside the room's cells
    [p.x, p.y] = [x0 - 0.5, Math.floor((y0 + y1) / 2) + 0.5];
    expect(inRoom(g.seed, 1, p.x, p.y)).toBe(false);
    expect(outOf(g, k)).toBe(true);
    const hp = p.hp;
    hurt(g, 2, k);
    expect(p.hp).toBe(hp);
    const lamp = spawnEnemy(g, 'seraph', k.x + 1, k.y);
    Object.assign(lamp.enemy!.data, { summoner: k.id, keeperRoom: 1 });
    hurt(g, 1, lamp);
    expect(p.hp).toBe(hp);
    // even after the keeper falls, its lamps stay leashed
    g.ents = g.ents.filter((e) => e !== k);
    hurt(g, 1, lamp);
    expect(p.hp).toBe(hp);
    // a shot of its in flight goes out
    g.ents.push(k);
    fire(g, { x: k.x, y: k.y, vx: -4, vy: 0, dmg: 2, range: 14, src: k, foe: true });
    tick(g, 0.05);
    expect(shots(g).filter((s) => s.data!.foe).length).toBe(0);
    // in the room it hits as before
    [p.x, p.y] = [k.x - 2, k.y];
    hurt(g, 1, k);
    expect(p.hp).toBeLessThan(hp);
  });

  it('a pillar of a floor 1-2 keeper room does not stop your shots; the deep rooms keep theirs', () => {
    for (const f of [1, 2]) {
      const { g, k } = room(5, f);
      const [x0, y0, x1, y1] = bossRoom(g.seed, f);
      let pillar: [number, number] | null = null;
      for (let y = y0 + 1; y < y1 && !pillar; y++) for (let x = x0 + 1; x < x1 && !pillar; x++) if (!open(g, x + 0.5, y + 0.5)) pillar = [x + 0.5, y + 0.5];
      expect(pillar).toBeTruthy();
      const [px, py] = pillar!;
      // a line across the pillar
      const [ax, ay, bx, by] = [px - 2, py, px + 2, py];
      expect(clear(g, ax, ay, bx, by)).toBe(false);
      expect(clearShot(g, ax, ay, bx, by)).toBe(f <= 1);
      // and Space aims at the keeper through it
      if (f <= 1) {
        [k.x, k.y] = [bx, by];
        [g.player.x, g.player.y] = [ax, ay];
        expect(targets(g, 6)).toContain(k);
      }
    }
  });

  it('the door says risky (still go in) on thin hp against the bell, ready with more', () => {
    let seed = 1;
    while (variantOf(newGame(seed), 0).id !== 'boss-bell') seed++;
    const g = newGame(seed);
    stageBoss(g, 0);
    g.ents = g.ents.filter((e) => !e.enemy);
    // the floor's kit at 12 hp: past "about 1 hp short", short of half the fight at a newcomer's pace
    // v5: keepers have 0.6 of their hp, so the bell's fight is short: 9 hp is ready (and no longer risky)
    g.player.maxHp = g.player.hp = 9;
    const c = keeperCheck(g, 0);
    expect(c.ready).toBe(true);
    expect(c.risky === '' || /retreat or two/.test(c.risky)).toBe(true);
    g.player.maxHp = g.player.hp = 30;
    expect(keeperCheck(g, 0).risky).toBe('');
  });
});
