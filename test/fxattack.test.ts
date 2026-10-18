// v5-fx-attack: your attacks leave short-lived marks in a fixed pool, by weapon
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { fx, live, POOL, strikeFx, shotFx, kick } from '../src/fx/attacks';
import type { Inst } from '../src/core/types';
import '../src/mods';
import '../src/world';

const kinds = (g: ReturnType<typeof newGame>) => {
  const k: string[] = [];
  live(g, (f) => k.push(f.kind));
  return k;
};
const w = (mod: string) => ({ mod } as unknown as Inst);

describe('attack fx', () => {
  it('a shot flashes, traces and sparks, kicks, then fades', () => {
    const g = newGame(1);
    shotFx(g, g.player.x, g.player.y - 3, true);
    expect(kinds(g).sort()).toEqual(['muzzle', 'spark', 'tracer']);
    expect(kick(g)).toBeGreaterThan(0);
    g.t += 1;
    expect(kinds(g)).toEqual([]);
    expect(kick(g)).toBe(0);
  });
  it('each melee weapon has its own look', () => {
    const g = newGame(1);
    const to = { x: g.player.x + 1, y: g.player.y };
    strikeFx(g, w('choir-bell'), to, 2, true);
    strikeFx(g, w('censer-flail'), to, 1.8, true);
    strikeFx(g, w('spark-finger'), to, 1.8, false);
    expect(kinds(g)).toEqual(['ring', 'spark', 'arc', 'spark', 'zap', 'spark']);
  });
  it('the pool never grows', () => {
    const g = newGame(1);
    for (let k = 0; k < POOL * 3; k++) fx(g, 'spark', 0, 0);
    expect(kinds(g).length).toBe(POOL);
  });
});
