// The module pass (docs/modules.md): seeing is a mechanic, power binds first, every module a niche.
import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, spawn, spawnEnemy, strike, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { MODS, powerUsed } from '../src/core/mods';
import { eyeRange, canHit } from '../src/mods/sense';
import { startKit } from '../src/tune/start';
import type { Game } from '../src/core/types';

const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 30; k++) tick(g, 1 / 30);
};
function rigged(...mods: string[]): Game {
  const g = newGame(1);
  g.ents = [];
  g.player.core = 20;
  g.player.slots = 8;
  for (const m of mods) {
    g.player.inv.push({ kind: 'mod', mod: m });
    exec(g, 'install ' + MODS[m].name);
  }
  run(g, 3.5);
  return g;
}
const inst = (g: Game, id: string) => g.player.installed.find((i) => i.mod === id)!;

describe('module pass', () => {
  it('the kit fits with one power to spare, and the dawn eye asks for a choice', () => {
    const g = newGame(1);
    startKit(g);
    for (const m of ['pinhole eye', 'stepper relay', 'map spool', 'spark finger']) exec(g, 'install ' + m);
    expect(g.player.core - powerUsed(g)).toBe(1);
    expect(MODS['dawn-eye'].power).toBeGreaterThan(1);
    // power is spread 0..4, not everything at 1
    const powers = new Set(Object.values(MODS).filter((m) => m.family !== 'power' && m.family !== 'unique').map((m) => m.power));
    expect([...powers].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('a ranged auto weapon needs an eye; touch works blind', () => {
    const g = rigged('rivet-sling');
    const far = spawnEnemy(g, 'mite', 8.5, 5.5);
    expect(canHit(g, far)).toBe(false);
    const near = spawnEnemy(g, 'mite', 9.5, 8.5);
    expect(canHit(g, near)).toBe(true);
    const seen = rigged('rivet-sling', 'dawn-eye');
    expect(canHit(seen, spawnEnemy(seen, 'mite', 8.5, 5.5))).toBe(true);
  });

  it('the hum is struck only when sonar, heat or a listener finds it', () => {
    const g = rigged('spark-finger', 'dawn-eye');
    const hum = spawnEnemy(g, 'hum', 9.5, 8.5);
    expect(canHit(g, hum)).toBe(false);
    for (const eye of ['bat-psalter', 'ember-iris']) {
      const s = rigged('spark-finger', eye);
      expect(canHit(s, spawnEnemy(s, 'hum', 9.5, 8.5)), eye).toBe(true);
    }
    const l = rigged('spark-finger', 'bone-listener');
    l.player.dir = Math.PI / 2;
    expect(canHit(l, spawnEnemy(l, 'hum', 9.5, 8.5))).toBe(true);
  });

  it('the ossuary is dark: colour eyes see as far as your light, sonar and outlines see their range', () => {
    const g = rigged('dawn-eye', 'bat-psalter', 'lattice-eye', 'ember-iris');
    expect(eyeRange(g, inst(g, 'dawn-eye'))).toBe(9);
    g.player.x = 32 * 16 + 8.5; // floor 3, the ossuary
    expect(eyeRange(g, inst(g, 'dawn-eye'))).toBeLessThan(4);
    expect(eyeRange(g, inst(g, 'bat-psalter'))).toBe(10);
    expect(eyeRange(g, inst(g, 'lattice-eye'))).toBe(11);
    g.player.inv.push({ kind: 'mod', mod: 'cold-star' });
    exec(g, 'install cold star');
    run(g, 2.5);
    expect(eyeRange(g, inst(g, 'dawn-eye'))).toBe(9);
    g.player.x = 48 * 16 + 8.5; // the furnace washes out heat
    expect(eyeRange(g, inst(g, 'ember-iris'))).toBeLessThan(5);
  });

  it('a lodestone wakes a mimic before you reach for it', () => {
    const g = rigged('lodestone');
    const m = spawn(g, { kind: 'item', x: 13.5, y: 8.5, item: { kind: 'mod', mod: 'halo' }, data: { mimic: true } });
    run(g, 0.2);
    expect(m.kind).toBe('enemy');
  });

  it('walkers shrug off small hits; big ones go through', () => {
    const g = newGame(1);
    const w = spawnEnemy(g, 'walker', 20.5, 8.5);
    const hp = w.enemy!.hp;
    strike(g, w, 1);
    expect(hp - w.enemy!.hp).toBeCloseTo(0.2);
    strike(g, w, 5);
    expect(hp - w.enemy!.hp).toBeCloseTo(4);
  });

  it('a rime hood keeps the furnace off but chills you elsewhere; light warms', () => {
    const g = rigged('rime-hood');
    g.player.hp = 5;
    g.player.hurtAt = -99;
    run(g, 5);
    expect(g.player.hp).toBe(5);
    g.player.inv.push({ kind: 'mod', mod: 'halo' });
    exec(g, 'install halo');
    run(g, 5);
    expect(g.player.hp).toBeGreaterThan(5);
  });

  it('power refused points at setups once', () => {
    const g = newGame(1);
    g.player.core = 1;
    g.player.inv.push({ kind: 'mod', mod: 'dawn-eye' });
    exec(g, 'install dawn eye');
    const said = g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
    expect(said).toContain('save setup battle');
  });
});
