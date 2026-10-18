import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, spawnEnemy, tick } from '../src/core/game';
import { exec, way } from '../src/core/verbs';
import { chunk } from '../src/core/grid';
import type { Game } from '../src/core/types';
import { spot } from '../src/world/gen';
import { pieces, stage } from '../src/world/events';
import { fresh, lootMod } from '../src/world/spawn';
import { rng } from '../src/core/rng';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};

describe('r2 pace', () => {
  it('way.long takes the longest straight leg that stays on a shortest way', () => {
    const g = newGame(1);
    // the start chamber is open: 3 east and 3 south is a staircase to the pathfinder, one 3-cell leg here
    const [d, n] = way.long(g, g.player.x + 3, g.player.y + 3);
    expect(['e', 's']).toContain(d);
    expect(n).toBe(3);
  });

  it('listen names altars and machines, groups what lies together, and offers take only for items', () => {
    const g = newGame(1);
    const p = g.player;
    g.ents.push({ id: 9001, kind: 'prop', x: p.x + 0.5, y: p.y, data: { altar: true } });
    g.ents.push({ id: 9002, kind: 'item', x: p.x + 3, y: p.y, item: { kind: 'res', res: 'bone', n: 1 } });
    g.ents.push({ id: 9003, kind: 'item', x: p.x + 3.5, y: p.y, item: { kind: 'res', res: 'glass', n: 1 } });
    g.ents = g.ents.filter((e) => !(e.kind === 'item' && e.item?.kind === 'mod' && Math.hypot(e.x - p.x, e.y - p.y) < 10));
    exec(g, 'listen');
    const t = text(g);
    expect(t).toContain('an altar, breathing slow, within reach.');
    expect(t).not.toMatch(/altar[^\n]*take/);
    expect(t).toMatch(/things lying still ×\d/);
  });

  it('set pieces never hand out a module you hold, if a reroll can help it', () => {
    const g = newGame(5);
    const r = rng(7);
    for (let k = 0; k < 40; k++) {
      const it = fresh(g, lootMod(r, 3), r, 3);
      if (it.kind === 'mod') g.player.inv.push(it);
    }
    const ids = g.player.inv.flatMap((i) => (i.kind === 'mod' ? [i.mod] : []));
    // far fewer repeats than 40 plain rolls give
    const plain = rng(7);
    const raw = Array.from({ length: 40 }, () => lootMod(plain, 3)).flatMap((i) => (i.kind === 'mod' ? [i.mod] : []));
    expect(ids.length - new Set(ids).size).toBeLessThan(raw.length - new Set(raw).size);
  });

  it('a set piece waits while the body walks, and its finds stay on the map until taken', () => {
    const g = newGame(3);
    const [sx, sy] = spot(3, 2, 0, 9);
    chunk(g, 2, 0);
    [g.player.x, g.player.y] = [sx, sy];
    g.player.hp = g.player.maxHp = 1e9;
    g.player.path = Array.from({ length: 50 }, () => [sx, sy] as [number, number]);
    let fired = false;
    for (let k = 0; k < 20 * 200; k++) {
      // keep it walking in place
      if (g.player.path.length < 10) g.player.path.push([sx, sy]);
      tick(g, 0.05);
      if (g.events.some((e) => e.type === 'set')) fired = true;
    }
    expect(fired).toBe(false);
    g.player.path = [];
    run(g, 2);
    stage(g, 'reliquary', sx, sy + 1, rng(1));
    expect(pieces(g).some((o) => o.name === 'open reliquary')).toBe(true);
  });

  it('an elite that turns to you is named with how hard it hits; unstuck is instant with nothing on you', () => {
    const g = newGame(1);
    const p = g.player;
    const e = spawnEnemy(g, 'warden', p.x + 4, p.y);
    e.enemy!.data.elite = true;
    e.enemy!.data.noticed = true;
    run(g, 0.2);
    expect(text(g)).toMatch(/the choir warden turns to you\. it hits [\d.]+, it has \d+ hp/);
    g.ents = g.ents.filter((x) => !x.enemy);
    [p.x, p.y] = [p.x + 3, p.y];
    exec(g, 'unstuck');
    run(g, 0.1);
    expect([p.x, p.y]).toEqual([8.5, 8.5]);
  });


  it('a setup installs what it wants from the inventory, taking out what it does not want', () => {
    const g = newGame(1);
    const P = g.player;
    P.inv.push({ kind: 'mod', mod: 'map-spool' }, { kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'install map spool');
    exec(g, 'install pinhole eye');
    run(g, 3);
    P.slots = P.installed.length;
    const map = P.installed.find((i) => i.mod === 'map-spool')!;
    expect(map).toBeTruthy();
    exec(g, 'save setup travel');
    exec(g, 'remove map spool');
    P.inv.push({ kind: 'mod', mod: 'rivet-sling' });
    exec(g, 'install rivet sling');
    expect(P.installed.some((i) => i.mod === 'map-spool')).toBe(false);
    exec(g, 'setup travel');
    expect(P.installed.some((i) => i.mod === 'map-spool')).toBe(true);
    expect(P.installed.some((i) => i.mod === 'rivet-sling')).toBe(false);
    expect(P.inv.some((i) => i.kind === 'mod' && i.mod === 'rivet-sling')).toBe(true);
  });
});
