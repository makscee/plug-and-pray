// v3r1 floor 1 fixes: the eye takes a weapon not the map, descend after the keeper with no eye, the ember cell named
import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import { newGame } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game, Inst } from '../src/core/types';
import { ensure } from '../src/core/grid';
import { onBossDown, stairsAt, stairsOf } from '../src/world/floors';

const inst = (g: Game, mod: string): Inst => {
  const i: Inst = { uid: g.nextId++, mod, on: true, readyAt: 0, data: {} };
  g.player.installed.push(i);
  return i;
};
const text = (g: Game, n: number) => g.log.slice(n).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const fresh = (core: number) => {
  const g = newGame(81);
  g.player.installed = [];
  g.player.inv = [];
  g.player.slots = 6;
  g.player.core = core;
  for (const m of ['stepper-relay', 'map-spool', 'spark-finger', 'choir-bell']) inst(g, m);
  return g;
};

describe('v3r1 floor 1', () => {
  it('swap in pinhole eye turns a spare weapon off, never the map', () => {
    const g = fresh(6);
    g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'swap in pinhole eye');
    const p = g.player;
    expect(p.installed.find((i) => i.mod === 'map-spool')!.on).toBe(true);
    expect(p.installed.find((i) => i.mod === 'pinhole-eye')?.on).toBe(true);
    expect(p.installed.filter((i) => i.on && (i.mod === 'spark-finger' || i.mod === 'choir-bell')).length).toBe(1);
  });

  it('a refused eye names the ember cell you carry, with a link', () => {
    const g = fresh(4);
    g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' }, { kind: 'mod', mod: 'ember-cell' });
    const n = g.log.length;
    exec(g, 'swap in pinhole eye');
    expect(text(g, n)).toMatch(/install your ember cell first/);
    expect(g.log.slice(n).some((l) => l.some((s) => typeof s !== 'string' && s.cmd === 'install ember cell'))).toBe(true);
    expect(g.player.installed.find((i) => i.mod === 'map-spool')!.on).toBe(true);
  });

  it('descend, after the keeper falls, with no eye: the way down counts as found, and it says how to get there', () => {
    const g = newGame(81);
    const [sx, sy] = stairsAt(g.seed, 0);
    ensure(g, sx, sy);
    onBossDown(g, 0);
    const st = stairsOf(g, 0)!;
    expect(g.seen.has(`${Math.floor(st.x)},${Math.floor(st.y)}`)).toBe(true);
    const n = g.log.length;
    exec(g, 'descend');
    const t = text(g, n);
    expect(t).not.toMatch(/not found the way down/);
    expect(t).toMatch(/go there/);
  });
});
