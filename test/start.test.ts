import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { open } from '../src/core/grid';
import { powerUsed, working } from '../src/core/mods';
import { startKit } from '../src/tune/start';

describe('accessible start (10-18)', () => {
  it('wakes holding a pinhole, legs, a map and the spark; installing them all leaves room to spare', () => {
    const g = newGame(1);
    startKit(g);
    expect(g.player.installed).toHaveLength(0);
    expect(g.player.inv.map((i) => (i.kind === 'mod' ? i.mod : ''))).toEqual(['pinhole-eye', 'stepper-relay', 'map-spool', 'spark-finger']);
    for (const m of ['pinhole eye', 'stepper relay', 'map spool', 'spark finger']) exec(g, 'install ' + m);
    for (let k = 0; k < 30; k++) tick(g, 0.05);
    expect(g.player.installed.every((i) => working(g, i))).toBe(true);
    expect(g.player.slots - g.player.installed.length).toBe(2);
    expect(g.player.core - powerUsed(g)).toBe(2);
    exec(g, 'go e 2');
    expect(g.player.path.length).toBeGreaterThan(0);
  });

  it('unstuck: out of a wall at once, else home after 3 s', () => {
    const g = newGame(1);
    startKit(g);
    Object.assign(g.player, { x: 1.5, y: 1.5 });
    expect(open(g, 1.5, 1.5)).toBe(false);
    exec(g, 'unstuck');
    expect(open(g, g.player.x, g.player.y)).toBe(true);
    exec(g, 'unstuck');
    for (let k = 0; k < 70; k++) tick(g, 0.05);
    expect([g.player.x, g.player.y]).toEqual([8.5, 8.5]);
  });
});
