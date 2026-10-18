import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import '../src/tune/hints';
import '../src/tune/door';
import { newGame, spawnEnemy, tick } from '../src/core/game';
import { chunk, open } from '../src/core/grid';
import { exec } from '../src/core/verbs';
import { label } from '../src/core/mods';
import type { Game } from '../src/core/types';
import { startKit } from '../src/tune/start';
import { doorOf, keeperCheck } from '../src/tune/door';
import { goalLine } from '../src/tune/hints';
import { makeRoom } from '../src/body';
import { lesson } from '../src/fight/death';
import { hurtHooks } from '../src/core/game';
import { bossAt, inRoom, stairsChunk } from '../src/world/floors';

const text = (g: Game, from = 0) => g.log.slice(from).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const kit = (g: Game) => {
  startKit(g);
  exec(g, 'install all');
  tick(g, 3);
};

describe('v2 flow', () => {
  it('the keeper door is outside the room, open, and where stops there', () => {
    const g = newGame(7);
    kit(g);
    const [cx, cy] = stairsChunk(g.seed, 0);
    expect(doorOf(g)).toBeNull(); // no chunk made yet: looking makes none
    chunk(g, cx, cy);
    const d = doorOf(g)!;
    expect(d).toBeTruthy();
    expect(inRoom(g.seed, 0, d.x, d.y)).toBe(false);
    // stand at the door: where weighs you against the keeper
    [g.player.x, g.player.y] = [d.x, d.y];
    const n = g.log.length;
    exec(g, 'where');
    expect(text(g, n)).toMatch(/the keeper: .*hp, hits up to/);
    expect(text(g, n)).toMatch(/you are not ready|ready\./);
    expect(goalLine(g)).toMatch(/keeper's door/);
  });

  it('the starting kit is not ready for the first keeper; no weapon on says so', () => {
    const g = newGame(7);
    kit(g);
    expect(keeperCheck(g, 0).ready).toBe(false);
    exec(g, 'off spark finger');
    expect(keeperCheck(g, 0).why.join()).toMatch(/no weapon/);
  });

  it('the goal line names the floor and the stairs direction', () => {
    const g = newGame(7);
    expect(goalLine(g)).toMatch(/install your kit/);
    kit(g);
    expect(goalLine(g)).toMatch(/^floor 1: find the way down \(stairs: unknown \/ [NESW]{1,2}\)$/);
  });

  it('where points at the card reader that has the card beside it', () => {
    const g = newGame(7);
    kit(g);
    exec(g, 'where');
    expect(text(g)).toMatch(/a card reader and a memory card lie together/);
  });

  it('an eye finds its power from another eye first', () => {
    const g = newGame(7);
    kit(g);
    g.player.inv.push({ kind: 'mod', mod: 'carrion-eye' }, { kind: 'mod', mod: 'fog-of-saints' });
    g.player.slots = 8;
    g.player.core = 5;
    exec(g, 'install carrion eye');
    tick(g, 2);
    // power full: carrion 2 + stepper + map + spark = 5
    const room = makeRoom(g, { mod: 'fog-of-saints' }, false);
    expect(typeof room).not.toBe('string');
    if (typeof room !== 'string') expect(room.off.map((i) => label(i))).toEqual(['carrion eye']);
  });

  it('unstuck folds you back to the last quiet spot, not the landing', () => {
    const g = newGame(7);
    kit(g);
    g.ents = g.ents.filter((e) => !e.enemy);
    // an open cell well off the landing, stood on quietly for a while
    let spot: [number, number] = [8.5, 8.5];
    for (let r = 6; r < 16 && spot[0] === 8.5 && spot[1] === 8.5; r++)
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (open(g, 8.5 + dx, 8.5 + dy)) spot = [8.5 + dx, 8.5 + dy];
    [g.player.x, g.player.y] = spot;
    for (let k = 0; k < 50; k++) tick(g, 0.1);
    const quiet = [g.player.x, g.player.y];
    expect(quiet).not.toEqual([8.5, 8.5]);
    // chased back to the landing: a foe near, so it is no quiet spot
    [g.player.x, g.player.y] = [8.5, 8.5];
    spawnEnemy(g, 'mite', 8.5, 17.5); // 9 cells: no quiet spot, yet no fight to flee
    exec(g, 'unstuck');
    for (let k = 0; k < 2; k++) tick(g, 0.05);
    expect([g.player.x, g.player.y]).toEqual(quiet);
  });

  it('a keeper death on floor 1 never says fight from range', () => {
    const g = newGame(7);
    kit(g);
    const [bx, by] = bossAt(g.seed, 0);
    const boss = { id: 999, kind: 'enemy', x: bx, y: by, enemy: { type: 'boss-bell', hp: 100, data: {} } } as never;
    for (const h of hurtHooks) h(g, 3, boss);
    expect(lesson(g)).not.toMatch(/from range/);
    expect(lesson(g)).toMatch(/up close/);
  });
});
