import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { Cell, cell, setCell } from '../src/core/grid';
import { MODS, powerMax } from '../src/core/mods';
import { foresee, front, gyroMove, gyroTurn, servoStep } from '../src/body';
import type { Game } from '../src/core/types';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
/** a fresh game with these modules installed and warm */
function body(...ids: string[]): Game {
  const g = newGame(1);
  for (const id of ids) {
    g.player.inv.push({ kind: 'mod', mod: id });
    exec(g, 'install ' + MODS[id].name);
  }
  run(g, 3);
  return g;
}

describe('the body', () => {
  it('servo gait steps one cell per key and turns with it', () => {
    const g = body('servo-gait');
    expect(servoStep(g, 'e')).toBe(true);
    expect(g.player.dir).toBeCloseTo(Math.PI / 2);
    run(g, 1);
    expect([g.player.x, g.player.y]).toEqual([9.5, 8.5]);
    // a held key does not pile up steps
    for (let k = 0; k < 10; k++) servoStep(g, 's');
    expect(g.player.path.length).toBeLessThanOrEqual(2);
    exec(g, 'step w');
    expect(text(g)).not.toContain('unknown');
  });

  it('arrow steps need the servo gait', () => {
    const g = newGame(1);
    expect(servoStep(g, 'e')).toBe(false);
    exec(g, 'step e');
    expect(text(g)).toContain('nothing installed');
  });

  it('gyro heart walks free relative to facing and turns', () => {
    const g = body('gyro-heart');
    gyroTurn(g, Math.PI / 2); // face east
    gyroMove(g, 1, 0);
    expect(g.player.move![0]).toBeCloseTo(2.5);
    expect(g.player.move![1]).toBeCloseTo(0);
    run(g, 0.4);
    expect(g.player.x).toBeGreaterThan(9);
    gyroMove(g, 0, 0);
    expect(g.player.move).toBeNull();
    // off: no more sliding
    gyroMove(g, 1, 0);
    exec(g, 'off gyro');
    run(g, 0.1);
    expect(g.player.move).toBeNull();
  });

  it('tunnel tongue digs plain wall, not veins', () => {
    const g = body('tunnel-tongue');
    g.player.x = 5.5; // west edge of the start chamber (cells 5..11)
    g.player.dir = -Math.PI / 2; // west
    const [x, y] = front(g);
    expect([x, y]).toEqual([4, 8]);
    expect(cell(g, x, y)).toBe(Cell.wall);
    exec(g, 'dig');
    expect(cell(g, x, y)).toBe(Cell.floor);
    exec(g, 'dig'); // still grinding
    expect(text(g)).toContain('still grinding');
    run(g, 1.1);
    g.player.x = 4.5;
    setCell(g, 3, 8, Cell.vein + 1);
    exec(g, 'dig');
    expect(cell(g, 3, 8)).toBe(Cell.vein + 1);
    expect(text(g)).toContain('too hard');
  });

  it('a slot board adds a slot, even when every slot is full, and is used up', () => {
    const g = body('servo-gait', 'ledger', 'ember-cell');
    expect(g.player.slots).toBe(3);
    g.player.inv.push({ kind: 'mod', mod: 'slot-board' });
    exec(g, 'install slot board');
    expect(g.player.slots).toBe(4);
    expect(g.player.inv).toHaveLength(0);
    g.player.slots = 8;
    g.player.inv.push({ kind: 'mod', mod: 'slot-board' });
    exec(g, 'install slot');
    expect(g.player.slots).toBe(8);
    expect(text(g)).toContain('full');
  });

  it('power modules raise the cap', () => {
    const g = body('votive-battery', 'heart-shard');
    expect(powerMax(g)).toBe(4 + 3 + 5);
  });

  it('setups switch to exactly the saved set, with warm-ups', () => {
    const g = body('servo-gait', 'ledger', 'clock-of-hours');
    exec(g, 'off ledger');
    exec(g, 'save setup battle');
    exec(g, 'on ledger');
    exec(g, 'off clock');
    run(g, 1);
    exec(g, 'save setup explore');
    exec(g, 'setup battle');
    const on = (id: string) => g.player.installed.find((i) => i.mod === id)!;
    expect(on('ledger').on).toBe(false);
    expect(on('clock-of-hours').on).toBe(true);
    expect(on('clock-of-hours').readyAt).toBeGreaterThan(g.t); // warming
    expect(on('servo-gait').on).toBe(true);
    exec(g, 'setup explore');
    expect(on('ledger').on).toBe(true);
    expect(on('clock-of-hours').on).toBe(false);
    exec(g, 'setup');
    expect(text(g)).toContain('setups: battle  explore');
    exec(g, 'setup nope');
    expect(text(g)).toContain('no setup called nope');
  });

  it('the clock of hours sees where a mite will be', () => {
    const g = body('clock-of-hours');
    g.ents.push({ id: 999, kind: 'enemy', x: 11.5, y: 8.5, enemy: { type: 'mite', hp: 2, readyAt: 0, data: { noticed: true } } });
    run(g, 0.5);
    const [f] = foresee(g);
    expect(f.e.id).toBe(999);
    // it runs west at you: in a second it is closer
    expect(f.x).toBeLessThan(f.e.x - 0.5);
  });
});
