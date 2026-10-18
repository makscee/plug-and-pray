import { describe, expect, it } from 'vitest';
import '../src/mods';
import { Cell, ensure, setCell } from '../src/core/grid';
import { newGame, tick } from '../src/core/game';
import { addItem, exec } from '../src/core/verbs';
import { look } from '../src/sight/reveal';
import { know, marks, thinWall } from '../src/sight/know';
import { secrets } from '../src/world/secrets';
import { ping } from '../src/mods/radar';
import type { Game } from '../src/core/types';
import { MODS } from '../src/core/mods';

/** a sealed corridor along y = 4 from x 3..7, a wall at x 8, a room behind it at x 9..11 */
function corridor(): Game {
  const g = newGame(1);
  ensure(g, 8, 8, 2);
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 14; x++) setCell(g, x, y, Cell.wall);
  for (let x = 3; x <= 7; x++) setCell(g, x, 4, Cell.floor);
  for (let x = 9; x <= 11; x++) setCell(g, x, 4, Cell.floor);
  Object.assign(g.player, { x: 3.5, y: 4.5, dir: Math.PI / 2 });
  g.seen.clear();
  return g;
}

describe('v2 map knowledge', () => {
  it('a plain eye sees its cone up to the first wall; nothing behind it, nothing behind you', () => {
    const g = corridor();
    look(g, { fov: 60, range: 10, rays: 24, through: 0 });
    expect(know(g, 7, 4)).toBe('seen');
    expect(know(g, 8, 4)).toBe('seen'); // the wall face
    expect(know(g, 10, 4)).toBe('unseen');
    g.player.x = 5.5;
    g.seen.clear();
    look(g, { fov: 60, range: 10, rays: 24, through: 0 });
    expect(know(g, 4, 4)).toBe('unseen'); // behind you
  });

  it('an eye that sees through walls marks what lies past them as a rumour, never seen', () => {
    const g = corridor();
    look(g, { fov: 60, range: 10, rays: 24, through: 99 });
    expect(know(g, 10, 4)).toBe('through');
    expect(g.seen.has('10,4')).toBe(false);
    // the wall between is one cell thick with seen floor before it: a dig here hint
    expect(thinWall(g, 8, 4, (x, y) => x >= 3 && x <= 11 && x !== 8 && y === 4)).toEqual([1, 0]);
  });

  it('range in the dark follows the eye range it is given (light), and the eyes write it from their tick', () => {
    const g = corridor();
    addItem(g, { kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'install pinhole eye');
    for (let k = 0; k < 60; k++) tick(g, 1 / 30);
    expect(know(g, 6, 4)).toBe('seen');
    expect(know(g, 10, 4)).toBe('unseen');
  });

  it('caches are marked only by a cache radar; the tap says "something", the bone glass names it', () => {
    const g = newGame(3);
    ensure(g, 8, 8, 2);
    const s = secrets(g).find((s) => s.kind === 'hollow' && !s.done);
    expect(s).toBeTruthy();
    Object.assign(g.player, { x: s!.x + 0.5 + s!.fx, y: s!.y + 0.5 + s!.fy });
    for (let k = 0; k < 30; k++) tick(g, 1 / 30);
    expect(marks(g).some((m) => m.kind === 'cache')).toBe(false);
    const tap = { uid: 1, mod: 'hollow-tap', on: true, readyAt: 0, data: {} };
    const got = ping(g, tap).find((m) => m.key === `cache:${s!.x},${s!.y}`)!;
    expect(got.what).toBe('something behind this wall');
    expect(s!.found).toBe(true); // a tapped shell can be broken
    expect(know(g, s!.x, s!.y)).toBe('scanned');
    const glass = { uid: 2, mod: 'bone-glass', on: true, readyAt: 0, data: {} };
    expect(ping(g, glass).find((m) => m.key === got.key)!.what).toMatch(/^sealed niche: /);
  });

  it('veins, lives and the knell each have their own radar', () => {
    const g = newGame(2);
    ensure(g, 8, 8, 2);
    const fork = ping(g, { uid: 1, mod: 'vein-fork', on: true, readyAt: 0, data: {} });
    expect(fork.length).toBeGreaterThan(0);
    expect(fork.every((m) => m.kind === 'vein' && / vein$/.test(m.what))).toBe(true);
    const knell = ping(g, { uid: 2, mod: 'sounding-knell', on: true, readyAt: 0, data: {} });
    expect(knell.every((m) => m.what === 'something' && m.r > 0)).toBe(true);
  });

  it('the map spool takes no clicks; the survey spool walks', () => {
    // the click gate lives in the view (DOM, src/world/mind.ts); the params say which maps take clicks
    expect(['map-spool', 'survey-spool', 'illuminated-atlas', 'glass-diorama'].map((id) => [!!MODS[id].params.click, MODS[id].params.detail])).toEqual([[false, 0], [true, 1], [true, 2], [true, 3]]);
  });
});
