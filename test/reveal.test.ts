import { describe, expect, it } from 'vitest';
import '../src/mods';
import { Cell, ensure, setCell } from '../src/core/grid';
import { newGame, tick } from '../src/core/game';
import { addItem, exec } from '../src/core/verbs';
import { see } from '../src/sight/reveal';

describe('map reveal', () => {
  it('sees open floor and the wall that stops it, not what lies past the wall', () => {
    const g = newGame(1);
    ensure(g, 8, 8, 2);
    // a sealed 5x1 corridor with a room behind its east wall
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 12; x++) setCell(g, x, y, Cell.wall);
    for (let x = 3; x <= 7; x++) setCell(g, x, 4, Cell.floor);
    for (let x = 9; x <= 11; x++) setCell(g, x, 4, Cell.floor);
    g.player.x = 3.5;
    g.player.y = 4.5;
    g.seen.clear();
    see(g, 8);
    expect(g.seen.has('7,4')).toBe(true);
    expect(g.seen.has('8,4')).toBe(true); // the wall face
    expect(g.seen.has('10,4')).toBe(false); // behind it
  });

  it('with no eye the map spool only remembers where you walked; an eye writes its cone', () => {
    const g = newGame(1);
    addItem(g, { kind: 'mod', mod: 'map-spool' });
    exec(g, 'install map spool');
    for (let k = 0; k < 60; k++) tick(g, 1 / 30);
    expect(g.seen.size).toBeLessThanOrEqual(9);
    addItem(g, { kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'install pinhole eye');
    for (let k = 0; k < 60; k++) tick(g, 1 / 30);
    expect(g.seen.size).toBeGreaterThan(20);
  });
});
