import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/body';
import '../src/tune/hints';
import { newGame } from '../src/core/game';
import { addItem, exec, findInst, instRef } from '../src/core/verbs';
import { makeRoom } from '../src/body';
import { answers } from '../src/world/zones';

const text = (g: ReturnType<typeof newGame>, from = 0) => JSON.stringify(g.log.slice(from));
const kit = (g: ReturnType<typeof newGame>) => {
  g.player.slots = 6;
  for (const mod of ['pinhole-eye', 'map-spool', 'stepper-relay', 'spark-finger']) addItem(g, { kind: 'mod', mod });
};

describe('ux (playtest r2)', () => {
  it('install all and take all work typed', () => {
    const g = newGame(1);
    kit(g);
    exec(g, 'install all');
    expect(g.player.installed.length).toBe(4);
    const n = g.log.length;
    exec(g, 'take all');
    expect(text(g, n)).not.toContain('no all');
  });

  it('install all stops at the first refusal', () => {
    const g = newGame(1);
    kit(g);
    g.player.slots = 2;
    exec(g, 'install all');
    expect(g.player.installed.length).toBe(2);
    expect(g.player.inv.filter((i) => i.kind === 'mod').length).toBe(2);
  });

  it('two of the same: the ordinal names the second', () => {
    const g = newGame(1);
    // (v3 modules: a second find upgrades the first; two copies come only from old saves and slots: `back`)
    addItem(g, { kind: 'mod', mod: 'spark-finger' }, true);
    addItem(g, { kind: 'mod', mod: 'spark-finger' }, true);
    exec(g, 'install spark finger');
    exec(g, 'install spark finger');
    const [a, b] = g.player.installed;
    expect(instRef(g, b)).toBe('spark finger 2');
    expect(findInst(g, ['spark', 'finger', '2'])).toBe(b);
    exec(g, `off ${instRef(g, b)}`);
    expect([a.on, b.on]).toEqual([true, false]);
  });

  it('swap in makes room by weight: never an eye, power or the last legs', () => {
    const g = newGame(1);
    kit(g);
    addItem(g, { kind: 'mod', mod: 'card-reader' });
    exec(g, 'install all');
    const p = g.player;
    p.slots = 5;
    // power 4/4 used; a censer (lamp, 1) takes the reader's slot and power (r3: never the map or the last weapon)
    addItem(g, { kind: 'mod', mod: 'censer' });
    const r = makeRoom(g, { mod: 'censer' }, false);
    expect(typeof r).toBe('object');
    if (typeof r === 'object') expect(['camera', 'gait'].includes(r.remove!.mod.split('-')[0])).toBe(false);
    expect(JSON.stringify(answers(g, 2))).toContain('swap in censer');
    exec(g, 'swap in censer');
    expect(p.installed.some((i) => i.mod === 'censer' && i.on)).toBe(true);
    expect(p.installed.some((i) => i.mod === 'pinhole-eye' && i.on)).toBe(true);
    expect(p.installed.some((i) => i.mod === 'stepper-relay' && i.on)).toBe(true);
    expect(p.installed.some((i) => i.mod === 'map-spool' && i.on)).toBe(true);
    expect(p.installed.some((i) => i.mod === 'spark-finger' && i.on)).toBe(true);
  });

  it('a power refusal offers a swap button', () => {
    const g = newGame(1);
    kit(g);
    exec(g, 'install all');
    g.player.slots = 6;
    addItem(g, { kind: 'mod', mod: 'lead-lung' });
    addItem(g, { kind: 'mod', mod: 'censer' });
    exec(g, 'install lead lung');
    const n = g.log.length;
    exec(g, 'install censer');
    expect(text(g, n)).toContain('swap in censer');
  });

  it('where says the hint again', () => {
    const g = newGame(1);
    exec(g, 'where');
    expect(text(g)).toContain('an eye glints');
  });
});
