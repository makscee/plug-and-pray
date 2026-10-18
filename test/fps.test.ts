import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/fight';
import { newGame, spawnEnemy, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { shots, type ShotData } from '../src/fight/shots';
import type { Game } from '../src/core/types';
import { bigOn, dash, fps, fpsEye, fpsFire, fpsMove, lunge, ray } from '../src/body/fps';
import { floorNow, spread } from '../src/fight/bolts';

const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 30; k++) tick(g, 1 / 30);
};
/** in the start chamber (5..11 open), modules on and warm, the big view up */
function scoped(...mods: string[]): Game {
  const g = newGame(2); // a seed whose landing is the plain square (src/world/gen.ts LANDINGS)
  g.ents = [];
  g.player.slots = 8;
  g.player.core = 12;
  for (const m of mods) {
    g.player.inv.push({ kind: 'mod', mod: m });
    exec(g, 'install ' + m.split('-').join(' '));
  }
  run(g, 3);
  exec(g, 'big');
  return g;
}
const at = (g: Game, x: number, y: number, dir: number) => Object.assign(g.player, { x, y, dir });

describe('fps eye (v2)', () => {
  it('goes big only with a scope on; the big view drops when it goes off', () => {
    const g = scoped('pilgrim-scope', 'nail-psalm');
    expect(fpsEye(g)?.mod).toBe('pilgrim-scope');
    expect(bigOn(g)).toBe(true);
    exec(g, 'off pilgrim scope');
    run(g, 0.1);
    expect(bigOn(g)).toBe(false);
    expect(fps(g).big).toBe(false);
  });

  it('a click fires down the crosshair at any angle, as far as the weapon reaches and no farther', () => {
    const g = scoped('pilgrim-scope', 'nail-psalm'); // nail psalm: 1.5 dmg, range 8
    at(g, 6.5, 10.5, Math.atan2(3, 2)); // not one of the 8 ways
    const m = spawnEnemy(g, 'walker', 9.5, 8.5);
    m.enemy!.hp = 10;
    expect(ray(g, g.player.dir, 8).foe).toBe(m);
    expect(fpsFire(g)).toBe(1);
    expect(m.enemy!.hp).toBeLessThan(10);
    expect(fps(g).hitAt).toBe(g.t);
    // turned a little off it: a miss
    run(g, 2);
    g.player.dir += 0.4;
    expect(fpsFire(g)).toBe(0);
  });

  it('never fires through a wall or past its reach', () => {
    const g = scoped('pilgrim-scope', 'ember-spit'); // range 6
    at(g, 8.5, 8.5, Math.PI / 2);
    spawnEnemy(g, 'walker', 15.5, 8.5); // 7 cells east, past a wall at 12
    expect(ray(g, Math.PI / 2, 6).foe).toBeNull();
    expect(fpsFire(g)).toBe(0);
  });

  it('wasd walks and strafes relative to the view, sliding on walls', () => {
    const g = scoped('pilgrim-scope');
    at(g, 8.5, 8.5, Math.PI); // facing south
    fpsMove(g, 0, 1); // strafe right: west when facing south
    run(g, 0.5);
    expect(g.player.x).toBeLessThan(8);
    expect(Math.abs(g.player.y - 8.5)).toBeLessThan(0.01);
    fpsMove(g, 1, 0);
    run(g, 5);
    expect(g.player.y).toBeLessThan(12); // the corridor's wall stops you
    fpsMove(g, 0, 0);
  });

  it('the lunge throws you forward and the melee weapon strikes what you face', () => {
    const g = scoped('pilgrim-scope', 'spark-finger');
    at(g, 8.5, 8.5, Math.PI / 2);
    const m = spawnEnemy(g, 'mite', 10.3, 8.5);
    m.enemy!.hp = 5;
    expect(lunge(g)).toBe(true);
    expect(m.enemy!.hp).toBe(4);
    // a click with no aimed weapon lunges
    run(g, 2);
    fpsFire(g);
    expect(m.enemy!.hp).toBeLessThan(4);
  });

  it('mk2 dashes; mk1 does not', () => {
    const g = scoped('pilgrim-scope');
    expect(dash(g)).toBe(false);
    const h = scoped('martyr-scope');
    at(h, 6.5, 8.5, Math.PI / 2);
    expect(dash(h)).toBe(true);
    run(h, 0.3);
    expect(h.player.x).toBeGreaterThan(8.3);
    expect(dash(h)).toBe(false); // cooling
  });
});

describe('enemy bolts (v2)', () => {
  it('floors 1-2: the seraph keeps its line orbs; floor 3: it aims a telegraphed bolt you can strafe out of', () => {
    const g = newGame(1);
    g.ents = [];
    at(g, 10.5, 8.5, Math.PI * 1.5);
    spawnEnemy(g, 'seraph', 5.5, 8.5);
    expect(floorNow(g)).toBe(0);
    run(g, 0.2);
    expect(shots(g).every((s) => !(s.data as unknown as ShotData).kind)).toBe(true);

    const h = newGame(1);
    h.ents = [];
    (h as unknown as { floor: number }).floor = 2;
    at(h, 10.5, 9.5, Math.PI * 1.5);
    const s = spawnEnemy(h, 'seraph', 5.5, 7.5); // off its row and column: it aims anyway
    run(h, 0.1);
    expect(s.enemy!.data.move).toBe('seraph draws a bolt');
    expect(shots(h)).toHaveLength(0);
    run(h, 0.6);
    expect(shots(h).map((x) => (x.data as unknown as ShotData).kind)).toEqual(['bolt']);
    // standing still, it lands
    run(h, 1.5);
    expect(h.player.hp).toBeLessThan(h.player.maxHp);

    const k = newGame(1);
    k.ents = [];
    (k as unknown as { floor: number }).floor = 2;
    at(k, 10.5, 8.5, Math.PI * 1.5);
    spawnEnemy(k, 'seraph', 5.5, 8.5);
    k.player.inv.push({ kind: 'mod', mod: 'martyr-scope' });
    k.player.core = 12;
    exec(k, 'install martyr scope');
    run(k, 1.6);
    exec(k, 'big');
    const hp = k.player.hp;
    // the bolt is on its way: strafe out of it
    fpsMove(k, 0, 1);
    run(k, 0.6);
    fpsMove(k, 0, 0);
    run(k, 1.5);
    expect(k.player.hp).toBe(hp);
  });

  it('spread fans shots centred on you (the bosses use it too)', () => {
    const g = newGame(1);
    g.ents = [];
    const e = spawnEnemy(g, 'pyre', 8.5, 5.5);
    spread(g, e, 3, 0.6);
    const vs = shots(g).map((s) => s.data as unknown as ShotData);
    expect(vs).toHaveLength(3);
    // the middle one heads straight at you (south)
    expect(Math.abs(vs[1].vx)).toBeLessThan(1e-9);
    expect(vs[1].vy).toBeGreaterThan(0);
  });
});
