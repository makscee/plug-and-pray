import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, spawn, spawnEnemy, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { CHUNK, chunk } from '../src/core/grid';
import { shots } from '../src/fight/shots';
import { table } from '../src/fight/spawn';
import type { Game } from '../src/core/types';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 30; k++) tick(g, 1 / 30);
};
/** a game with a module installed and warm, standing in the start chamber (5..11 open) */
function armed(...mods: string[]): Game {
  const g = newGame(1);
  g.ents = [];
  for (const m of mods) {
    g.player.inv.push({ kind: 'mod', mod: m });
    exec(g, 'install ' + m.split('-')[0]);
  }
  run(g, 3);
  return g;
}

describe('fight', () => {
  it('shoot sends a nail down your facing and kills', () => {
    const g = armed('nail-psalm');
    g.player.dir = Math.PI / 2; // east
    const m = spawnEnemy(g, 'mite', 10.5, 8.5);
    m.enemy!.data.noticed = false;
    exec(g, 'shoot');
    expect(shots(g)).toHaveLength(1);
    run(g, 0.5);
    exec(g, 'shoot');
    run(g, 0.5);
    expect(g.ents.includes(m)).toBe(false);
    expect(text(g)).toContain('the mite bursts');
  });

  it('shoot is refused without an aimed weapon and cools between shots', () => {
    const g = armed('spark-finger');
    exec(g, 'shoot');
    expect(text(g)).toContain('nothing installed');
    const h = armed('nail-psalm');
    exec(h, 'shoot');
    exec(h, 'shoot');
    expect(text(h)).toContain('still cooling');
  });

  it("a seraph's orb hits you in its line and misses when you step out", () => {
    const g = armed();
    spawnEnemy(g, 'seraph', 5.5, 8.5); // same row as you (8.5, 8.5)
    run(g, 0.1);
    expect(shots(g)).toHaveLength(1);
    run(g, 2);
    expect(g.player.hp).toBe(8);
    const h = armed();
    spawnEnemy(h, 'seraph', 5.5, 8.5);
    run(h, 0.1);
    h.player.y = 10.5; // step out of the line
    run(h, 2.5);
    expect(h.player.hp).toBe(10);
  });

  it('regenerates slowly after four quiet seconds; the lead lung is three times faster', () => {
    const g = armed();
    g.player.hp = 5;
    g.player.hurtAt = g.t;
    run(g, 3.9);
    expect(g.player.hp).toBe(5);
    run(g, 10.1);
    expect(g.player.hp).toBeCloseTo(7, 1);
    const h = armed('lead-lung');
    h.player.hp = 5;
    h.player.hurtAt = h.t;
    run(h, 14);
    expect(h.player.hp).toBeCloseTo(9, 1);
  });

  it('the frost coat softens a hit; the mirror ward returns one and recharges', () => {
    const g = armed('frost-coat');
    spawnEnemy(g, 'walker', 9.5, 8.5);
    run(g, 1.2);
    expect(g.player.hp).toBe(8.5);
    const h = armed('mirror-ward');
    const m = spawnEnemy(h, 'mite', 9.5, 8.5);
    m.enemy!.hp = 5;
    run(h, 0.2);
    expect(h.player.hp).toBe(10);
    expect(m.enemy!.hp).toBe(4);
    run(h, 2);
    expect(h.player.hp).toBe(9);
  });

  it('a mimic wakes when you reach for it, and gives up what it wore', () => {
    const g = armed('spark-finger');
    spawn(g, { kind: 'item', x: 9.9, y: 8.5, item: { kind: 'mod', mod: 'vidicon-tube' }, data: { mimic: true } });
    exec(g, 'take');
    expect(text(g)).toContain('a mimic');
    expect(g.player.inv).toHaveLength(0);
    run(g, 8);
    expect(g.stats.kills).toBe(1);
    expect(g.ents.some((e) => e.item?.kind === 'mod' && e.item.mod === 'vidicon-tube')).toBe(true);
  });

  it('the hum is hidden, the rest are not; deeper chunks hold meaner things', () => {
    expect(table(1).length).toBe(0);
    expect(table(2).map((t) => t[0])).not.toContain('walker');
    expect(table(4).map((t) => t[0])).toEqual(expect.arrayContaining(['walker', 'hum', 'seraph']));
    const g = newGame(3);
    for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) chunk(g, cx, cy);
    const types = new Set(g.ents.filter((e) => e.enemy).map((e) => e.enemy!.type));
    expect(types.has('mite')).toBe(true);
    expect(g.ents.filter((e) => e.enemy && Math.hypot(Math.floor(e.x / CHUNK), Math.floor(e.y / CHUNK)) < 1.5)).toHaveLength(0);
  });

  it('a walker winds up: step away and it misses', () => {
    const g = armed();
    spawnEnemy(g, 'walker', 9.5, 8.5);
    run(g, 0.3);
    expect(text(g)).toContain('lifts its arm');
    g.player.x = 6.5;
    run(g, 0.8);
    expect(g.player.hp).toBe(10);
    expect(text(g)).toContain('on nothing');
  });

  it('the first three mites cost the spark finger a few hp, not the run', () => {
    const g = armed('spark-finger');
    for (const x of [10.2, 10.5, 10.8]) spawnEnemy(g, 'mite', x, 8.5);
    run(g, 10);
    expect(g.ents.filter((e) => e.enemy)).toHaveLength(0);
    expect(g.player.hp).toBeGreaterThan(5);
  });
});
