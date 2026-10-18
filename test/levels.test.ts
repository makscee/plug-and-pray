import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { newGame, spawn } from '../src/core/game';
import { label, MODS, param } from '../src/core/mods';
import { addItem, BAG, bagMods, exec, TOP_BONE } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { UPGRADE_COST, upgradeCost } from '../src/world/upgrade';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const res = (g: Game, r: string) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === r ? i.n : 0), 0);
const fresh = () => {
  const g = newGame(3);
  g.player.inv = [];
  g.player.installed = [];
  return g;
};

describe('v3 modules: levels', () => {
  it('a duplicate find upgrades yours instead of adding a copy, up to III, then folds into bone', () => {
    const g = fresh();
    addItem(g, { kind: 'mod', mod: 'nail-psalm' });
    const base = param<number>(bagMods(g)[0], 'damage');
    addItem(g, { kind: 'mod', mod: 'nail-psalm' });
    expect(bagMods(g)).toHaveLength(1);
    expect(bagMods(g)[0].level).toBe(2);
    expect(label(bagMods(g)[0])).toBe('nail psalm II');
    expect(text(g)).toMatch(/▲ upgrade: nail psalm II/);
    expect(param<number>(bagMods(g)[0], 'damage')).toBeCloseTo(base * 1.35);
    addItem(g, { kind: 'mod', mod: 'nail-psalm' });
    expect(bagMods(g)[0].level).toBe(3);
    expect(addItem(g, { kind: 'mod', mod: 'nail-psalm' })).toBe('scrapped');
    expect(bagMods(g)).toHaveLength(1);
    expect(res(g, 'bone')).toBe(TOP_BONE);
  });

  it('upgrades the installed copy first; removing it keeps its level', () => {
    const g = fresh();
    g.player.core = 9;
    addItem(g, { kind: 'mod', mod: 'spark-finger' });
    exec(g, 'install spark finger');
    expect(g.player.installed).toHaveLength(1);
    addItem(g, { kind: 'mod', mod: 'spark-finger', level: 2 });
    // a level II find on a level I raises it by one more than a plain copy would
    expect(g.player.installed[0].level).toBe(2);
    // commands come lowercased: "spark finger ii" names "spark finger II"
    exec(g, 'off spark finger II');
    expect(g.player.installed[0].on).toBe(false);
    exec(g, 'remove spark finger II');
    expect(bagMods(g)[0].level).toBe(2);
  });

  it('upgrade at a printer pays the rising cost; away from one it says where', () => {
    const g = fresh();
    addItem(g, { kind: 'mod', mod: 'nail-psalm' });
    exec(g, 'upgrade nail psalm');
    expect(text(g)).toMatch(/printer or an altar/);
    spawn(g, { kind: 'printer', x: g.player.x + 0.5, y: g.player.y, data: {} });
    expect(upgradeCost(bagMods(g)[0])).toEqual(UPGRADE_COST[2]);
    exec(g, 'upgrade nail psalm');
    expect(bagMods(g)[0].level ?? 1).toBe(1);
    expect(text(g)).toMatch(/wants 4 bone/);
    g.player.inv.push({ kind: 'res', res: 'bone', n: 12 }, { kind: 'res', res: 'copper', n: 6 }, { kind: 'res', res: 'glass', n: 4 });
    exec(g, 'upgrade nail psalm');
    expect(bagMods(g)[0].level).toBe(2);
    expect([res(g, 'bone'), res(g, 'copper'), res(g, 'glass')]).toEqual([8, 4, 3]);
    exec(g, 'upgrade nail psalm');
    expect(bagMods(g)[0].level).toBe(3);
    expect([res(g, 'bone'), res(g, 'copper'), res(g, 'glass')]).toEqual([0, 0, 0]);
    expect(upgradeCost(bagMods(g)[0])).toBeNull();
  });

  it('a power cell gives +1 power a level; a module with no key number stays at I', () => {
    const g = fresh();
    addItem(g, { kind: 'mod', mod: 'ember-cell' });
    addItem(g, { kind: 'mod', mod: 'ember-cell' });
    expect(param<number>(bagMods(g)[0], 'power')).toBe(Number(MODS['ember-cell'].params.power) + 1);
    addItem(g, { kind: 'mod', mod: 'slot-board' });
    expect(addItem(g, { kind: 'mod', mod: 'slot-board' })).toBe('scrapped');
  });

  it('past the bag size a find asks what to recycle', () => {
    const g = fresh();
    for (const m of ['nail-psalm', 'spark-finger', 'choir-bell', 'frost-coat', 'ember-cell']) addItem(g, { kind: 'mod', mod: m });
    expect(bagMods(g)).toHaveLength(BAG + 1);
    expect(text(g)).toMatch(/bag full \(5\/4\)/);
    expect(g.log[g.log.length - 1].some((s) => typeof s !== 'string' && s.cmd === 'recycle nail psalm')).toBe(true);
  });
});
