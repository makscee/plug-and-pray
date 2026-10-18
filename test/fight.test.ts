import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, spawn, spawnEnemy, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { CHUNK, chunk } from '../src/core/grid';
import { shots } from '../src/fight/shots';
import { table } from '../src/fight/spawn';
import type { Game } from '../src/core/types';
import { deathInfo, lesson } from '../src/fight/death';

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
    expect(g.player.hp).toBe(8.5);
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
    run(h, 0.6); // a mite rears for 0.4 s before it bites
    expect(h.player.hp).toBe(10);
    expect(m.enemy!.hp).toBe(4.5);
    run(h, 2.4);
    expect(h.player.hp).toBe(9.5);
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

  it('the chamber you wake in is calm; its conduits and the first ring are not', () => {
    const g = newGame(1);
    for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) chunk(g, cx, cy);
    const foes = g.ents.filter((e) => e.kind === 'enemy');
    expect(foes.length).toBeGreaterThanOrEqual(8);
    expect(foes.every((e) => Math.hypot(e.x - 8.5, e.y - 8.5) >= 7)).toBe(true);
    expect(foes.some((e) => Math.hypot(e.x - 8.5, e.y - 8.5) < 16)).toBe(true);
  });

  it('the hum is hidden, the rest are not; deeper chunks hold meaner things', () => {
    expect(table(0).map((t) => t[0])).toEqual(['mite']); // playtest 10-18: fights from the start
    expect(table(1).map((t) => t[0])).not.toContain('walker');
    expect(table(2).map((t) => t[0])).not.toContain('walker');
    expect(table(4).map((t) => t[0])).toEqual(expect.arrayContaining(['walker', 'hum', 'seraph']));
    const g = newGame(3);
    for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) chunk(g, cx, cy);
    const types = new Set(g.ents.filter((e) => e.enemy).map((e) => e.enemy!.type));
    expect(types.has('mite')).toBe(true);
    expect(g.ents.filter((e) => e.enemy && Math.hypot(e.x - 8.5, e.y - 8.5) < 7)).toHaveLength(0); // calm where you wake
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

describe('fight r1: seeing the fight', () => {
  it('the eye snaps to a foe that comes close, but not right after you turned yourself', () => {
    const g = armed('stepper-relay');
    g.player.dir = 0; // north
    const m = spawnEnemy(g, 'mite', 10.5, 8.5); // east
    m.enemy!.data.noticed = true;
    run(g, 0.1);
    expect(g.player.dir).toBeCloseTo(Math.PI / 2, 1);
    const h = armed('stepper-relay');
    exec(h, 'face n');
    const n = spawnEnemy(h, 'mite', 10.5, 8.5);
    n.enemy!.data.noticed = true;
    run(h, 0.1);
    expect(h.player.dir).toBeCloseTo(0, 5);
  });

  it('face takes the diagonals; shoot turns to the nearest foe; each weapon keeps its own cooldown', () => {
    const g = armed('stepper-relay', 'pinhole-eye', 'nail-psalm');
    g.player.installed.push({ uid: g.nextId++, mod: 'nail-psalm', on: true, readyAt: 0, data: {} });
    exec(g, 'face ne');
    expect(g.player.dir).toBeCloseTo(Math.PI / 4, 5);
    exec(g, 'face s');
    const m = spawnEnemy(g, 'mite', 6.5, 6.5); // north-west, 2 cells each way
    m.enemy!.hp = 9;
    exec(g, 'shoot');
    expect(g.player.dir).toBeCloseTo(-Math.PI / 4, 5);
    expect(shots(g)).toHaveLength(2); // both psalms
    exec(g, 'shoot');
    expect(text(g)).toContain('still cooling');
  });

  it('warns once of an elite ahead and names a swarm when you listen', () => {
    const g = armed('stepper-relay');
    const w = spawnEnemy(g, 'warden', 8.5, 8.5 - 9);
    w.enemy!.data.elite = true;
    for (let k = 0; k < 4; k++) spawnEnemy(g, 'mite', 5.5 + k * 0.3, 8.5 + 9);
    run(g, 0.2);
    const t = text(g);
    expect(t).toContain('the choir warden waits ahead, 9 cells n');
    expect(t).toContain('a swarm of 4 mites ahead');
    run(g, 0.5);
    expect(text(g).split('waits ahead').length).toBe(2);
    exec(g, 'listen');
    expect(text(g)).toContain('something large, keeping time');
    expect(text(g)).toContain('a swarm');
  });

  it('the warden draws breath, dashes, and reels when you step aside', () => {
    const g = armed('stepper-relay');
    const w = spawnEnemy(g, 'warden', 8.5, 5.5);
    w.enemy!.data.noticed = true;
    run(g, 0.1);
    expect(text(g)).toContain('draws breath');
    expect(w.enemy!.data.move).toBe('warden draws breath');
    exec(g, 'go e 2');
    run(g, 2);
    expect(text(g)).toContain('reels');
    expect(g.player.hp).toBe(10);
  });

  it('an elite back at its post with you gone is whole again', () => {
    const g = armed('stepper-relay');
    const w = spawnEnemy(g, 'abbot', 8.5, 8.5);
    Object.assign(w.enemy!.data, { elite: true, post: [8.5, 8.5], maxHp: 16 });
    w.enemy!.hp = 3;
    g.player.x = 8.5 + 0; // inside the chamber, then far off
    g.player.y = 8.5;
    g.player.x = 30.5;
    run(g, 0.2);
    expect(w.enemy!.hp).toBe(16);
    expect(text(g)).toContain('whole again');
  });

  it('a mite rears before it bites; the death card names who took you and what would have helped', () => {
    const g = armed();
    const m = spawnEnemy(g, 'mite', 9.5, 8.5);
    m.enemy!.data.noticed = true;
    run(g, 0.2);
    expect(m.enemy!.data.windup).toBeGreaterThan(g.t);
    expect(g.player.hp).toBe(10);
    run(g, 0.4);
    expect(g.player.hp).toBe(9.5);
    g.player.hp = 0.2;
    const w = spawnEnemy(g, 'warden', 7.5, 8.5);
    w.enemy!.data.noticed = true;
    run(g, 2);
    expect(g.ended).toBe('dead');
    const info = deathInfo(g);
    expect(info.killer).toMatch(/took you/);
    expect(info.blows.length).toBeGreaterThan(0);
    expect(lesson(g).length).toBeGreaterThan(5);
  });

  it('taking a scripture shard is told big', () => {
    const g = armed();
    spawn(g, { kind: 'item', x: 9.5, y: 8.5, item: { kind: 'card', card: 'shard-1' } });
    exec(g, 'take');
    run(g, 0.1);
    expect(text(g)).toContain('you take: scripture shard');
    expect(text(g)).toContain('SCRIPTURE SHARD 1 of 3');
  });
});
