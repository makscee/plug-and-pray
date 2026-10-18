import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/body';
import { newGame } from '../src/core/game';
import { addItem, exec } from '../src/core/verbs';
import { size, slotsUsed } from '../src/core/mods';
import { makeRoom } from '../src/body';

// v2 asks: a module that takes two slots fills two
describe('modules that take two slots', () => {
  it('fill two slots, and need two free', () => {
    const g = newGame(1);
    g.player.slots = 4;
    g.player.core = 20;
    expect(size({ mod: 'saints-lens' })).toBe(2);
    expect(size({ mod: 'spark-finger' })).toBe(1);
    for (const mod of ['spark-finger', 'map-spool', 'saints-lens']) addItem(g, { kind: 'mod', mod });
    exec(g, 'install spark finger');
    exec(g, 'install map spool');
    exec(g, "install saint's lens");
    expect(slotsUsed(g)).toBe(4);
    addItem(g, { kind: 'mod', mod: 'halo' });
    const n = g.log.length;
    exec(g, 'install halo');
    expect(JSON.stringify(g.log.slice(n))).toContain('no free slot');
  });

  it('a swap takes out as many as it needs', () => {
    const g = newGame(1);
    g.player.slots = 4;
    g.player.core = 20;
    for (const mod of ['pinhole-eye', 'map-spool', 'halo', 'censer', 'saints-lens']) addItem(g, { kind: 'mod', mod });
    for (const m of ['pinhole eye', 'map spool', 'halo', 'censer']) exec(g, `install ${m}`);
    const n = g.log.length;
    exec(g, "install saint's lens");
    expect(JSON.stringify(g.log.slice(n))).toContain('takes 2 slots, 0 free');
    const room = makeRoom(g, { mod: 'saints-lens' }, false);
    expect(typeof room).not.toBe('string');
    exec(g, "swap in saint's lens");
    expect(g.player.installed.some((i) => i.mod === 'saints-lens')).toBe(true);
    expect(slotsUsed(g)).toBeLessThanOrEqual(4);
  });
});
