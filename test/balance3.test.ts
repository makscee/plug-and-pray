// v2-balance3 (v2r3 fight): `swap in` never blinds you; the door card weighs the floor-2 keeper against a
// tempered nail psalm; the ossuary's kit always offers a lance; repeated "still cooling" folds into one line.
import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import '../src/tune/hints';
import '../src/tune/door';
import { newGame } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game, Inst } from '../src/core/types';
import { offerOf } from '../src/world/cache';
import { LOADOUTS } from '../src/fight/bosses';
import { keeperCheck } from '../src/tune/door';

const text = (g: Game, from = 0) => g.log.slice(from).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const inst = (g: Game, mod: string, more: Partial<Inst> = {}): Inst => {
  const i: Inst = { uid: g.nextId++, mod, on: true, readyAt: 0, data: {}, ...more };
  g.player.installed.push(i);
  return i;
};

describe('v2-balance3: swap in keeps your sight', () => {
  it('with no eye, a swap turns a spare weapon off, never the map', () => {
    const g = newGame(11);
    g.player.slots = 6;
    g.player.core = 4;
    inst(g, 'stepper-relay');
    const map = inst(g, 'map-spool');
    inst(g, 'spark-finger');
    inst(g, 'choir-bell');
    g.player.inv.push({ kind: 'mod', mod: 'frost-coat' });
    exec(g, 'swap in frost coat');
    expect(map.on).toBe(true);
    expect(g.player.installed.find((i) => i.mod === 'frost-coat')?.on).toBe(true);
    expect(text(g)).not.toContain('blind');
  });

  it('with only the map left to give, it refuses and says why', () => {
    const g = newGame(11);
    g.player.slots = 6;
    g.player.core = 3;
    inst(g, 'stepper-relay');
    const map = inst(g, 'map-spool');
    inst(g, 'spark-finger');
    g.player.inv.push({ kind: 'mod', mod: 'frost-coat' });
    exec(g, 'swap in frost coat');
    expect(map.on).toBe(true);
    // v2r6 newcomer: a weapon is still on, so it names that, never "only your map is left"
    expect(text(g)).toContain('switch off your spark finger by hand');
    expect(text(g)).not.toContain('only your map');
  });

  it('an eye may still take the map\'s power', () => {
    const g = newGame(11);
    g.player.slots = 6;
    g.player.core = 4;
    inst(g, 'stepper-relay');
    const map = inst(g, 'map-spool');
    inst(g, 'spark-finger');
    inst(g, 'choir-bell');
    g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'swap in pinhole eye');
    const eye = g.player.installed.find((i) => i.mod === 'pinhole-eye');
    expect(eye?.on || map.on).toBe(true);
  });
});

describe('v2-balance3: the ossuary offers a lance', () => {
  it('every seed\'s floor-3 offer holds a bone or heat lance', () => {
    for (let seed = 1; seed <= 200; seed++) for (const f of [2, 3]) expect(offerOf(seed, f).some((it) => it.kind === 'mod' && /lance/.test(it.mod))).toBe(true);
  });
});

describe('v2-balance3: still cooling folds', () => {
  it('shoot spam counts up one line', () => {
    const g = newGame(1);
    g.player.slots = 6;
    g.player.core = 6;
    inst(g, 'nail-psalm', { data: { readyAt: 99 } });
    const n = g.log.length;
    for (let k = 0; k < 4; k++) exec(g, 'shoot');
    expect(text(g, n)).toBe('> shoot\nnail psalm: still cooling. ×4');
  });
});

describe('v2-balance3: the floor-2 door card weighs the temper', () => {
  const kit = (temper: boolean) => {
    const g = newGame(3);
    const k = LOADOUTS[1];
    g.player.installed = [];
    for (const mod of k.mods) inst(g, mod, temper && k.rolls?.[mod] ? { roll: { ...k.rolls[mod] } } : {});
    g.player.slots = 9;
    g.player.core = k.core;
    g.player.maxHp = g.player.hp = 10 + k.flesh;
    return g;
  };
  it('a tempered nail psalm is ready', () => {
    expect(keeperCheck(kit(true), 1).ready).toBe(true);
  });
  it('a plain one is told to attune it first, with the price (v2r5 newcomer: a plain one cannot be tempered yet)', () => {
    const c = keeperCheck(kit(false), 1);
    expect(c.ready).toBe(false);
    expect(c.why.join('; ')).toContain('attune your nail psalm at an altar first (');
  });
});
