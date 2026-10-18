import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, spawn, spawnEnemy, strike as strikeIt, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { CHUNK, chunk } from '../src/core/grid';
import { shots } from '../src/fight/shots';
import { table } from '../src/fight/spawn';
import type { Game } from '../src/core/types';
import { deathInfo, lesson, volleys } from '../src/fight/death';
import { foe } from '../src/fight/spawn';
import { fighting } from '../src/fight/body';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 30; k++) tick(g, 1 / 30);
};
/** a game with a module installed and warm, standing in the start chamber (5..11 open) */
function armed(...mods: string[]): Game {
  const g = newGame(1);
  g.ents = [];
  if (mods.includes('pinhole-eye')) g.player.core += 3; // v3: the pinhole drinks 3
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
    expect(text(g)).toContain('nothing aimed is on');
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
    expect(g.player.hp).toBeCloseTo(9.1); // v2r5 newcomer: a cradle lamp hits ×0.6
    const h = armed();
    spawnEnemy(h, 'seraph', 5.5, 8.5);
    run(h, 0.1);
    h.player.y = 10.5; // step out of the line
    run(h, 2.5);
    expect(h.player.hp).toBe(10);
  });

  it('no mending for six seconds after a hit, then a quick mend; the lead lung is faster', () => {
    const g = armed();
    g.player.hp = 5;
    g.player.hurtAt = g.t;
    run(g, 5.9);
    expect(g.player.hp).toBe(5);
    run(g, 4.1);
    expect(g.player.hp).toBeCloseTo(7, 0);
    const h = armed('lead-lung');
    h.player.hp = 5;
    h.player.hurtAt = h.t;
    run(h, 10);
    expect(h.player.hp).toBeCloseTo(8.2, 0);
  });

  it('the frost coat softens a hit; the mirror ward returns one and recharges', () => {
    const g = armed('frost-coat');
    spawnEnemy(g, 'walker', 9.5, 8.5);
    run(g, 1.2);
    expect(g.player.hp).toBe(8.5);
    const h = armed('mirror-ward');
    const m = spawnEnemy(h, 'mite', 9.5, 8.5);
    m.enemy!.hp = 5;
    run(h, 1.1); // a mite rears 0.3–1 s before its first bite
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

  it('face takes the diagonals; shoot turns to the nearest foe; copies shorten the cooldown, not stack burst', () => {
    const g = armed('stepper-relay', 'pinhole-eye', 'nail-psalm');
    g.player.installed.push({ uid: g.nextId++, mod: 'nail-psalm', on: true, readyAt: 0, data: {} });
    exec(g, 'face ne');
    expect(g.player.dir).toBeCloseTo(Math.PI / 4, 5);
    exec(g, 'face s');
    const m = spawnEnemy(g, 'mite', 6.5, 6.5); // north-west, 2 cells each way
    m.enemy!.hp = 9;
    exec(g, 'shoot');
    expect(g.player.dir).toBeCloseTo(-Math.PI / 4, 5);
    expect(shots(g)).toHaveLength(1); // two psalms: one shot, a quicker cooldown
    const psalms = g.player.installed.filter((i) => i.mod === 'nail-psalm');
    expect(psalms.every((i) => Math.abs((i.data.readyAt as number) - g.t - 0.6 * 0.75) < 1e-6)).toBe(true);
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
    run(g, 0.9); // the rear is 0.3 to 1 s, by the mite's id (v2: the cradle relic takes an id too)
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

  it('a swarm bites in a stream, not in volleys', () => {
    const g = armed();
    const ms = [0, 1, 2, 3, 4, 5].map((k) => spawnEnemy(g, 'mite', 9.5 + (k % 2) * 0.1, 8.5));
    for (const m of ms) m.enemy!.data.noticed = true;
    g.player.hp = 100;
    g.player.maxHp = 100;
    const times: number[] = [];
    for (let k = 0; k < 6 * 30; k++) {
      const hp = g.player.hp;
      tick(g, 1 / 30);
      if (g.player.hp < hp) times.push(g.t);
    }
    // bites spread over many ticks: no tick takes all six
    expect(new Set(times.map((t) => t.toFixed(3))).size).toBeGreaterThan(8);
  });

  it('a nave mite keeps 1 hp; an ossuary one scales', () => {
    const g = armed();
    expect(foe(g, 'mite', 16 * 16 + 20.5, 0.5).enemy!.hp).toBe(1); // floor 2: the nave
    expect(foe(g, 'mite', 32 * 16 + 20.5, 0.5).enemy!.hp).toBeGreaterThan(1); // floor 3: the ossuary
  });

  it('a hit stops your walk, with the way back', () => {
    const g = armed('stepper-relay');
    // pacing east and west past a mite: a long walk
    for (let k = 0; k < 4; k++) g.player.path.push([10.5, 8.5], [6.5, 8.5]);
    const m = spawnEnemy(g, 'mite', 8.5, 9.5);
    m.enemy!.data.noticed = true;
    m.enemy!.hp = 99;
    for (let k = 0; k < 8 * 30 && g.player.hp === 10; k++) tick(g, 1 / 30);
    expect(g.player.hp).toBeLessThan(10);
    expect(g.player.path.length).toBeLessThanOrEqual(1);
    // v3: when the bite lands turns with the mite's id (the first eye's place moved), so 1 to 3 back
    expect(text(g)).toMatch(/bitten\. you stop\. go [ew] [1-3] back the way you came/);
  });

  it('a dodged sweep leaves the abbot open: it takes more', () => {
    const g = armed('stepper-relay');
    const a = spawnEnemy(g, 'abbot', 8.5, 8.5);
    Object.assign(a.enemy!.data, { noticed: true, blows: 2 });
    g.player.x = 9.5;
    run(g, 0.1);
    expect(a.enemy!.data.wide).toBe(true);
    g.player.x = 5.5; // three cells off
    run(g, 1.3);
    expect(text(g)).toContain('it is open');
    const hp = a.enemy!.hp;
    strikeIt(g, a, 3);
    expect(hp - a.enemy!.hp).toBeCloseTo((3 - 1.2) * 1.5);
  });

  it('no mending with a foe on you', () => {
    const g = armed();
    g.player.hp = 5;
    const m = spawnEnemy(g, 'seraph', 11.5, 10.5);
    m.enemy!.data.noticed = true;
    expect(fighting(g)).toBe(true);
    g.ents = [];
    expect(fighting(g)).toBe(false);
  });

  it('the death card groups a volley', () => {
    const v = volleys([0, 0, 0.05, 0.05, 2].map((t) => ({ type: 'mite', name: 'a choir mite', n: 0.5, t, seen: true })));
    expect(v.map((x) => x.count)).toEqual([4, 1]);
    expect(v[0].n).toBe(2);
  });

  it('in a corridor the warden backs off before it dashes', () => {
    const g = armed('stepper-relay');
    g.player.y = 4.5; // the chamber's north arm
    const w = spawnEnemy(g, 'warden', 8.5, 2.5);
    w.enemy!.data.noticed = true;
    run(g, 0.1);
    expect(text(g)).toContain('backs off');
    run(g, 0.6);
    expect(w.y).toBeLessThan(1.5);
  });
});
