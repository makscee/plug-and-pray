import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, tick } from '../src/core/game';
import { chunk } from '../src/core/grid';
import { exec } from '../src/core/verbs';
import { plan } from '../src/world/vectors';
import { zoneOf, zoneAt, ZONES } from '../src/world/zones';
import { MAX_CORE } from '../src/world/altar';

describe('zones', () => {
  it('rings out from where you woke, one shard per zone past the cradle, the engine in the furnace', () => {
    expect([zoneOf(0, 0), zoneOf(1, 1), zoneOf(2, 0), zoneOf(4, 0), zoneOf(6, 0)]).toEqual([0, 0, 1, 2, 3]);
    for (let seed = 1; seed <= 30; seed++) {
      const p = plan(seed);
      expect(p.shards.map(([cx, cy]) => zoneOf(cx, cy))).toEqual([1, 2, 3]);
      expect(zoneOf(...p.engine)).toBe(3);
    }
  });

  it('chunks carry their zone, and an elite guards each shard', () => {
    const g = newGame(3);
    const p = plan(3);
    const c = chunk(g, ...p.shards[1]);
    expect(c.zone).toBe(2);
    expect(g.ents.some((e) => e.enemy?.type === 'abbot' && e.enemy.data.elite)).toBe(true);
    expect(ZONES[2].name).toBe('the ossuary');
  });

  it('the ossuary is cold: no mending without a lamp', () => {
    const g = newGame(1);
    const P = g.player;
    [P.x, P.y] = [4 * 16 + 8.5, 8.5];
    expect(zoneAt(P.x, P.y)).toBe(2);
    P.hp = 5;
    for (let k = 0; k < 100; k++) tick(g, 0.1);
    expect(P.hp).toBeLessThanOrEqual(5);
  });

  it('an altar sells power and flesh for good, at a climbing price', () => {
    const g = newGame(1);
    const altar = (() => {
      chunk(g, 1, 1);
      return g.ents.find((e) => e.data?.altar)!;
    })();
    expect(altar).toBeTruthy();
    [g.player.x, g.player.y] = [altar.x, altar.y];
    g.player.inv.push({ kind: 'res', res: 'bone', n: 40 }, { kind: 'res', res: 'glass', n: 40 }, { kind: 'res', res: 'copper', n: 10 });
    const core = g.player.core;
    exec(g, 'offer power');
    exec(g, 'offer flesh');
    tick(g, 0.1);
    expect(g.player.core).toBe(core + 1);
    expect(g.player.maxHp).toBe(12);
    expect(MAX_CORE).toBeGreaterThan(core);
  });
});
