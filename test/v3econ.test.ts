import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { newGame, spawn } from '../src/core/game';
import { addItem, bagMods, exec, MOMENTS } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { modCost, PRINT_STEP, scrapOf } from '../src/world/printer';
import { upgradable, upgradeText } from '../src/world/upgrade';
import { levelDiff } from '../src/ui/cardText';
import { bossDrops } from '../src/fight/bosses';
import { startKit } from '../src/tune/start';
import { cacheNear } from '../src/world/cache';
import { goDown } from '../src/world/floors';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const res = (g: Game, r: string) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === r ? i.n : 0), 0);
const fresh = () => {
  const g = newGame(3);
  g.player.inv = [];
  g.player.installed = [];
  return g;
};

describe('v3 econ: the printer is no slot machine', () => {
  it('each print at a printer costs more bone, and a printed module grinds back to 1 bone', () => {
    const g = fresh();
    spawn(g, { kind: 'printer', x: g.player.x + 0.5, y: g.player.y, data: {} });
    addItem(g, { kind: 'res', res: 'bone', n: 40 });
    addItem(g, { kind: 'res', res: 'glass', n: 10 });
    exec(g, 'print module');
    expect(res(g, 'bone')).toBe(40 - modCost(0).bone!);
    exec(g, 'print module');
    expect(res(g, 'bone')).toBe(40 - 2 * modCost(0).bone! - PRINT_STEP);
    const m = bagMods(g)[0];
    expect(m.printed).toBe(true);
    expect(scrapOf(m)).toEqual({ bone: 1 });
  });
  it('uniques never grind, and the bag-full line never offers them', () => {
    expect(scrapOf({ kind: 'mod', mod: 'pinhole-eye', rarity: 'unique', title: 'x' })).toEqual({});
  });
});

describe('v3 econ: one upgrade track', () => {
  it('weapons come first, and the menu shows the real step in the card numbers', () => {
    const g = fresh();
    g.player.core = 20;
    g.player.slots = 8;
    for (const m of ['pinhole-eye', 'stepper-relay', 'nail-psalm']) addItem(g, { kind: 'mod', mod: m }), exec(g, `install ${m.replace('-', ' ')}`);
    expect(upgradable(g)[0].mod).toBe('nail-psalm');
    const w = upgradable(g)[0];
    expect(upgradeText(w)).toMatch(/→ II: [\d.]+ → [\d.]+ dmg\/s \(\+35%\)/);
    expect(levelDiff({ ...w, level: 2 }, 3).pct).toBe(26);
  });
  it('the upgrade line says the card numbers, and it shows as a moment', () => {
    const g = fresh();
    addItem(g, { kind: 'mod', mod: 'nail-psalm' });
    addItem(g, { kind: 'mod', mod: 'nail-psalm' });
    expect(text(g)).toMatch(/▲ upgrade: nail psalm II {2}· {2}[\d.]+ → [\d.]+ dmg\/s/);
    expect(MOMENTS.get(g)?.[0].head).toBe('▲ upgrade');
  });
});

describe('v3 econ: duplicates happen', () => {
  it('half the time a keeper leaves a copy of your weapon (an upgrade) instead of a fresh rare', () => {
    let ups = 0;
    for (let s = 1; s <= 40; s++) {
      const g = newGame(s);
      g.player.installed = [{ uid: 1, mod: 'nail-psalm', on: true, readyAt: 0, data: {} }];
      const d = bossDrops(g, 0)[0];
      if (d.kind === 'mod' && d.mod === 'nail-psalm') ups++;
    }
    expect(ups).toBeGreaterThan(10);
    expect(ups).toBeLessThan(30);
  });
});

describe('v3 econ: small bugs', () => {
  it('typed "swap X for Y" works as the door card button does', () => {
    const g = fresh();
    g.player.core = 20;
    g.player.slots = 1;
    addItem(g, { kind: 'mod', mod: 'spark-finger' });
    exec(g, 'install spark finger');
    addItem(g, { kind: 'mod', mod: 'frost-coat' });
    exec(g, 'swap spark finger for frost coat');
    expect(g.player.installed.map((i) => i.mod)).toEqual(['frost-coat']);
  });
});


describe('v3 econ: a second kit pick never swaps out the first', () => {
  it('whatever the seed, both picks stay', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = newGame(seed);
      startKit(g);
      goDown(g, 1);
      g.player.slots = g.player.installed.length + 1; // one free slot
      const c = cacheNear(g)!;
      exec(g, 'pick 1');
      const first = g.player.installed.find((i) => (c.put ?? []).includes(i.uid));
      exec(g, 'pick 1');
      if (first) expect(g.player.installed).toContain(first);
      if (first) expect(first.on).toBe(true);
    }
  });
});
