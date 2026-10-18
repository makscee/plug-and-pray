import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, tick } from '../src/core/game';
import { chunk } from '../src/core/grid';
import { exec } from '../src/core/verbs';
import { origin } from '../src/world/floors';
import { zoneOf, zoneAt, ZONES } from '../src/world/zones';
import { MAX_CORE } from '../src/world/altar';

describe('zones', () => {
  it('v2: the zones are the floors, side by side on the grid', () => {
    expect([zoneOf(0, 0), zoneOf(2, 2), zoneOf(-2, 1), zoneOf(16, 0), zoneOf(33, -2), zoneOf(48, 0), zoneOf(64, -1)]).toEqual([0, 0, 0, 1, 2, 3, 4]);
    expect(zoneAt(origin(3)[0], origin(3)[1])).toBe(3);
    expect(ZONES.map((z) => z.name)).toEqual(['the cradle', 'the choir nave', 'the ossuary', 'the furnace', 'the heart']);
  });

  it('chunks carry their zone', () => {
    const g = newGame(3);
    expect(chunk(g, 33, 1).zone).toBe(2);
    expect(ZONES[2].name).toBe('the ossuary');
  });

  it('the ossuary is cold: no mending without a lamp', () => {
    const g = newGame(1);
    const P = g.player;
    g.floor = 2;
    [P.x, P.y] = origin(2);
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
