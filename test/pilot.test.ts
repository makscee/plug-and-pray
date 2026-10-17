import { describe, expect, it } from 'vitest';
import '../src/mods';
import { hurt, newGame, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { route } from '../src/mods/pilot';

const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
const give = (g: Game, ...mods: string[]) => {
  g.player.slots = 8;
  g.player.core = 20;
  for (const mod of mods) {
    g.player.inv.push({ kind: 'mod', mod });
    exec(g, `install ${mod.replace('-', ' ')}`);
  }
  run(g, 2);
};
const seeRoom = (g: Game) => {
  for (let y = 5; y <= 11; y++) for (let x = 5; x <= 11; x++) g.seen.add(`${x},${y}`);
};
const said = (g: Game, s: string) => JSON.stringify(g.log).includes(s);

describe('pilots and waypoints', () => {
  it('routes only over seen floor', () => {
    const g = newGame(1);
    expect(route(g, 8, 8, 10, 10, 40).path).toEqual([]);
    seeRoom(g);
    const r = route(g, 8, 8, 10, 10, 40);
    expect(r.whole).toBe(true);
    expect(r.path.length).toBe(4);
  });

  it('goto walks there and lets go when struck', () => {
    const g = newGame(1);
    give(g, 'wayfinder-moth');
    seeRoom(g);
    exec(g, 'goto 10 10');
    run(g, 3);
    expect([Math.floor(g.player.x), Math.floor(g.player.y)]).toEqual([10, 10]);
    expect(said(g, 'the pilot sets you down')).toBe(true);
    exec(g, 'goto 5 5');
    run(g, 0.3);
    hurt(g, 0.1);
    run(g, 0.1);
    expect(said(g, 'struck. the pilot lets go.')).toBe(true);
    expect(g.player.path.length).toBeLessThanOrEqual(1);
  });

  it('a waypoint log notes where you woke and what lies near; mark adds your spot', () => {
    const g = newGame(1);
    give(g, 'waystone-log', 'stepper-relay');
    g.ents.push({ id: 9998, kind: 'printer', x: 6.5, y: 6.5, data: { far: 0, made: 0 } });
    run(g, 1);
    exec(g, 'mark den');
    const log = g.player.installed.find((i) => i.mod === 'waystone-log')!;
    const names = (log.data.points as { name: string }[]).map((p) => p.name);
    expect(names).toContain('where you woke');
    expect(names).toContain('printer');
    expect(names).toContain('den');
  });
});
