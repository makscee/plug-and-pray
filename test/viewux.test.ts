// v2r2 ux: the first eye far and sealed, the base eye's score, the layer cap, map clicks on floor 1, the boss's patience
import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { dist, newGame, tick } from '../src/core/game';
import { addItem, exec } from '../src/core/verbs';
import { Cell, cell, CHUNK } from '../src/core/grid';
import { MODS } from '../src/core/mods';
import type { Game, Inst } from '../src/core/types';
import { eyeChunk } from '../src/world/spawn';
import { sealedEye } from '../src/world/secrets';
import { stairsChunk } from '../src/world/floors';
import { baseScore, MAX_LAYERS, plan, shownLayers, turnLayers } from '../src/sight/layers';
import { walksOnClick } from '../src/world/mind';
import { BOSS, LEASH_HEAL, stageBoss } from '../src/fight/bosses';
import { EYE_HINT, goalLine } from '../src/tune/hints';

const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const eyeOf = (g: Game) => g.ents.find((e) => e.item?.kind === 'mod' && e.item.mod === 'pinhole-eye')!;

describe('v2r2 ux: the first eye', () => {
  it('is named only after a minute (or once you are near it)', () => {
    const g = newGame(5);
    for (const m of ['spark-finger', 'stepper-relay', 'map-spool']) {
      addItem(g, { kind: 'mod', mod: m });
      exec(g, 'install ' + MODS[m].name);
    }
    g.ents = g.ents.filter((e) => !e.enemy);
    run(g, 2);
    expect(goalLine(g)).toMatch(/no eye yet. walk/);
    exec(g, 'where');
    expect(text(g)).not.toMatch(/sealed behind a cracked wall/);
    run(g, EYE_HINT);
    expect(goalLine(g)).toMatch(/the ◆ on the map, \d+ cells/);
    expect(text(g)).toMatch(/caught a glint: your first eye, \d+ cells/); // v3: in the open, on the way to the keeper
  });
});

const inst = (mod: string, uid: number): Inst => ({ uid, mod, on: true, readyAt: 0, data: {} });

describe('v2r2 ux: the view', () => {
  it('a colour eye is the base over a sharper black & white one', () => {
    expect(baseScore(inst('vidicon-tube', 1))).toBeGreaterThan(baseScore(inst('carrion-eye', 2)));
    expect(MODS['carrion-eye'].params.filter).toBe('1bit');
  });

  it('a black & white eye layers over a grey one, never takes the view from it', () => {
    const g = newGame(2);
    g.player.slots = 10;
    g.player.core = 20;
    for (const m of ['pinhole-eye', 'carrion-eye']) {
      g.player.inv.push({ kind: 'mod', mod: m });
      exec(g, 'install ' + MODS[m].name);
    }
    run(g, 4);
    const pl = plan(g);
    expect(pl.base?.mod).toBe('pinhole-eye');
    expect(pl.layers.map((l) => [l.inst.mod, l.layer])).toEqual([['carrion-eye', 'script']]);
  });

  it('at most two layers draw, by priority, and `layers` turns them', () => {
    const g = newGame(2);
    g.player.slots = 14;
    g.player.core = 30;
    for (const m of ['dawn-eye', 'ember-iris', 'bat-psalter', 'carrion-eye', 'lattice-eye']) {
      g.player.inv.push({ kind: 'mod', mod: m });
      exec(g, 'install ' + MODS[m].name);
    }
    run(g, 4);
    const pl = plan(g);
    expect(pl.base?.mod).toBe('dawn-eye');
    const a = shownLayers(g, pl.layers);
    expect(a).toHaveLength(MAX_LAYERS);
    expect(a[0].layer).toBe('sonar');
    turnLayers(g);
    const b = shownLayers(g, pl.layers);
    expect(b.map((l) => l.inst.uid)).not.toEqual(a.map((l) => l.inst.uid));
  });

  it('the map spool walks on a click on floor 1 only; a surveyor\'s map everywhere', () => {
    const g = newGame(1);
    expect(walksOnClick(g, inst('map-spool', 1))).toBe(true);
    g.floor = 1;
    expect(walksOnClick(g, inst('map-spool', 1))).toBe(false);
    expect(walksOnClick(g, inst('survey-spool', 2))).toBe(true);
  });
});

describe('v2r2 ux: a boss forgives a short step out', () => {
  it('heals only after LEASH_HEAL s with you out of its room', () => {
    expect(LEASH_HEAL).toBe(8);
    const g = newGame(1);
    const e = stageBoss(g, 0, 'boss-warden');
    run(g, 2);
    e.enemy!.hp = BOSS['boss-warden'].hp * 0.8;
    const p = g.player;
    const home = e.enemy!.data.home as [number, number];
    // out a few cells past its door, back in before 8 s: no heal
    [p.x, p.y] = [home[0] + 11, home[1]];
    e.enemy!.data.windup = 0;
    run(g, 5);
    expect(e.enemy!.hp).toBeLessThan(BOSS['boss-warden'].hp);
    [p.x, p.y] = [home[0] + 3, home[1]];
    run(g, 0.5);
    [p.x, p.y] = [home[0] + 11, home[1]];
    run(g, 5);
    expect(e.enemy!.hp).toBeLessThan(BOSS['boss-warden'].hp);
    run(g, LEASH_HEAL);
    // 15% back, once, up to its phase line (full in phase 0)
    expect(e.enemy!.hp).toBe(Math.round(BOSS['boss-warden'].hp * 0.95));
    run(g, LEASH_HEAL * 2);
    expect(e.enemy!.hp).toBe(Math.round(BOSS['boss-warden'].hp * 0.95));
  });
});
