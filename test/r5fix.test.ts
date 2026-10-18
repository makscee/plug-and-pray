import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/tune/hints';
import { cells, newGame } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game, Inst } from '../src/core/types';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const cmds = (g: Game) => g.log.flatMap((l) => l.flatMap((s) => (typeof s === 'string' || !s.cmd ? [] : [s.cmd])));
const put = (g: Game, mod: string, on = true): Inst => {
  const i: Inst = { uid: g.nextId++, mod, on, readyAt: 0, data: {} };
  g.player.installed.push(i);
  return i;
};

describe('r5 fixes', () => {
  it('a carried reader with no bone: where offers no dead read card, and the swap button reads', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'card-reader' }, { kind: 'card', card: 'log-cantor' });
    exec(g, 'where');
    expect(text(g)).toContain('wants a bone');
    expect(cmds(g)).not.toContain('read card');
    const swap = cmds(g).find((c) => c.startsWith('swap in card reader'));
    expect(swap).toBeTruthy();
    exec(g, swap!);
    g.t += 2;
    exec(g, 'where');
    expect(cmds(g)).toContain('read card');
    exec(g, 'read card');
    expect(g.cards).toContain('log-cantor');
  });

  it('full slots that will not give way: read card offers to take the lightest out by hand', () => {
    const g = newGame(1);
    g.player.installed = [];
    g.player.slots = 3;
    put(g, 'spark-finger');
    put(g, 'map-spool');
    put(g, 'halo');
    g.player.inv.push({ kind: 'mod', mod: 'card-reader' }, { kind: 'card', card: 'log-cantor' });
    exec(g, 'read card');
    const by = cmds(g).find((c) => c.startsWith('remove '));
    expect(by).toBe('remove halo; install card reader');
  });

  it('power short and the swap rule finds nothing: a button that keeps the weapon on', () => {
    const g = newGame(1);
    g.player.installed = [];
    g.player.slots = 6;
    g.player.core = 3;
    put(g, 'pinhole-eye');
    put(g, 'spark-finger');
    put(g, 'map-spool');
    put(g, 'halo');
    g.player.inv.push({ kind: 'mod', mod: 'dawn-eye' });
    exec(g, 'install dawn eye');
    const b = cmds(g).find((c) => c.startsWith('off '));
    expect(b).toBeTruthy();
    expect(b).not.toContain('spark');
    for (const c of b!.split(';')) exec(g, c);
    expect(g.player.installed.find((i) => i.mod === 'dawn-eye')!.on).toBe(true);
    expect(g.player.installed.find((i) => i.mod === 'spark-finger')!.on).toBe(true);
  });

  it('1 cell, not 1 cells', () => {
    expect(cells(1)).toBe('1 cell');
    expect(cells(3)).toBe('3 cells');
  });
});
