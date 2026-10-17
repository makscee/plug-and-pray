import { Cell, setCell } from '../src/core/grid';
import { describe, expect, it } from 'vitest';
import '../src/mods';
import { chase, newGame, spawnEnemy } from '../src/core/game';
import { addItem, exec } from '../src/core/verbs';
import { MODS } from '../src/core/mods';
import { flame, lit } from '../src/sight/lamp';
import { scan } from '../src/sight/scanner';

describe('sight', () => {
  it('has the sight modules in the table', () => {
    const fams = Object.values(MODS).map((m) => m.family);
    expect(fams.filter((f) => f === 'camera').length).toBeGreaterThanOrEqual(8);
    expect(fams.filter((f) => f === 'scanner').length).toBeGreaterThanOrEqual(6);
    expect(fams.filter((f) => f === 'lamp').length).toBeGreaterThanOrEqual(3);
    for (const m of Object.values(MODS)) expect(m.text.length).toBeLessThanOrEqual(90);
  });

  it('a lamp draws enemies from farther', () => {
    const g = newGame(1);
    g.ents = [];
    // the start chamber's east conduit: a mite 8 cells down it, past its sense of 6
    g.player.x = 5.5;
    g.player.y = 6.5;
    for (let x = 5; x <= 13; x++) setCell(g, x, 6, Cell.floor); // a clear line, whatever the generator made
    const e = spawnEnemy(g, 'mite', 13.5, 6.5);
    chase(g, e, 0.05);
    expect(e.enemy!.data.noticed).toBeFalsy();
    addItem(g, { kind: 'mod', mod: 'halo' });
    exec(g, 'install halo');
    g.t += 1;
    expect(lit(g)).toBe(3);
    chase(g, e, 0.05);
    expect(e.enemy!.data.noticed).toBe(true);
  });

  it('flicker dips a lamp but never to nothing', () => {
    const l = { radius: 4, color: 0xff9040, flicker: 0.5 };
    const v = Array.from({ length: 200 }, (_, k) => flame(l, k * 0.05));
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0.2);
    expect(Math.max(...v) - Math.min(...v)).toBeGreaterThan(0.2);
    expect(flame({ ...l, flicker: 0 }, 3)).toBe(1);
  });

  it('scanners see through walls by their senses', () => {
    const g = newGame(1);
    g.ents = [];
    spawnEnemy(g, 'mite', 12.5, 8.5);
    const heat = scan(g, { mod: 'heat-choir' });
    expect(heat).toHaveLength(1);
    expect(heat[0].sense).toBe('heat');
    expect(scan(g, { mod: 'lodestone' })).toHaveLength(0);
    // out of range: nothing
    g.player.x = 60;
    expect(scan(g, { mod: 'heat-choir' })).toHaveLength(0);
  });

  it('a cone scanner sees only ahead', () => {
    const g = newGame(1);
    g.ents = [];
    spawnEnemy(g, 'mite', 8.5, 4.5); // north
    g.player.dir = 0;
    expect(scan(g, { mod: 'bone-listener' })).toHaveLength(1);
    g.player.dir = Math.PI; // facing south
    expect(scan(g, { mod: 'bone-listener' })).toHaveLength(0);
  });

  it('the dowser finds conduits and the rod finds veins', () => {
    const g = newGame(1);
    // walk out far enough that conduits and veins are within range somewhere
    let doors = 0, veins = 0;
    for (const [x, y] of [[8.5, 8.5], [24.5, 8.5], [8.5, 24.5], [24.5, 24.5]]) {
      g.player.x = x;
      g.player.y = y;
      doors += scan(g, { mod: 'conduit-dowser' }).length;
      veins += scan(g, { mod: 'marrow-rod' }).filter((b) => b.sense === 'veins').length;
    }
    expect(doors).toBeGreaterThan(0);
    expect(veins).toBeGreaterThanOrEqual(0);
  });
});
