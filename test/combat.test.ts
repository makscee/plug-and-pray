// v2-combat: aim snaps, weapon copies cool rather than stack, no point-blank rings, the bell's steps, mk2's reins
import { describe, expect, it } from 'vitest';
import '../src/mods';
import { hurt, newGame, spawnEnemy } from '../src/core/game';
import type { Game, Inst } from '../src/core/types';
import { aimAt } from '../src/fight/aim';
import { autoCooldown, haste } from '../src/mods/weapon';
import { BOSS } from '../src/fight/bosses';
import { dash, fps } from '../src/body/fps';
import { dpsOf } from '../src/world/zonemath';
import { telegraph } from '../src/fight/telegraph';

function wear(g: Game, ...mods: string[]): Inst[] {
  g.player.core = 20;
  g.player.slots = 12;
  g.player.installed = mods.map((mod) => ({ uid: g.nextId++, mod, on: true, readyAt: -1, data: {} }));
  return g.player.installed;
}

describe('v2 combat', () => {
  it('shoot turns to the nearest foe even when it stands a little off your facing', () => {
    const g = newGame(1);
    g.ents = [];
    wear(g, 'nail-psalm', 'pinhole-eye');
    g.player.dir = 0; // north
    const e = spawnEnemy(g, 'mite', g.player.x + 0.8, g.player.y - 2.8); // about 16° off, 3 cells
    e.enemy!.data.noticed = true;
    aimAt(g, 8);
    expect(g.player.dir).toBeCloseTo(Math.atan2(0.8, 2.8), 3);
  });

  it('copies of a weapon cool it 25% quicker each, and never add damage', () => {
    const g = newGame(1);
    const [a] = wear(g, 'choir-bell', 'choir-bell', 'choir-bell');
    expect(autoCooldown(g, a)).toBeCloseTo((1.4 * 0.75 * 0.75) / haste(g), 5);
    const one = dpsOf([{ mod: 'choir-bell' }]);
    expect(dpsOf([{ mod: 'choir-bell' }, { mod: 'choir-bell' }, { mod: 'choir-bell' }])).toBeCloseTo(one / 0.5625, 5);
  });

  it('spirals and bursts never start point-blank', () => {
    for (const b of Object.values(BOSS))
      for (const ph of b.phases) for (const a of ph) if (a.id === 'spiral' || a.id === 'burst') expect(a.when!(newGame(1), null as never, 2.4)).toBe(false);
  });

  it("the bell's dropped bell is cleared by one step, and its toll leaves the 8 cells round it safe", () => {
    const bell = BOSS['boss-bell'];
    const peals = bell.phases.flat().filter((a) => a.id === 'peal');
    const g = newGame(1);
    for (const p of peals) {
      const z = p.aim!(g, null as never)[0] as { r1: number };
      expect(z.r1).toBeLessThan(1);
    }
    const tolls = bell.phases[0].filter((a) => a.id === 'toll');
    for (const t of tolls) expect((t.aim!(g, { x: 0, y: 0 } as never)[0] as { r0: number }).r0).toBeGreaterThan(Math.SQRT2);
  });

  it("the martyr's reins dash through a blow", () => {
    const g = newGame(1);
    wear(g, 'martyrs-reins', 'pilgrim-scope');
    fps(g).big = true;
    expect(dash(g)).toBe(true);
    const hp = g.player.hp;
    hurt(g, 3);
    expect(g.player.hp).toBe(hp);
    g.t += 0.5;
    hurt(g, 3);
    expect(g.player.hp).toBe(hp - 3);
  });

  it("the martyr's reins held fire faster", () => {
    const g = newGame(1);
    wear(g, 'martyrs-reins', 'pilgrim-scope');
    const h0 = haste(g);
    fps(g).big = true;
    expect(haste(g)).toBeCloseTo(h0 + 0.25, 5);
  });

  it('a star telegraph marks its edges and the gaps between its lines', () => {
    const lines = Array.from({ length: 8 }, (_, k) => ({ k: 'line' as const, x: 0, y: 0, vx: Math.cos((k * Math.PI) / 4), vy: Math.sin((k * Math.PI) / 4), len: 9, w: 0.55 }));
    const out = telegraph(lines, lines);
    expect(out.filter((p) => p[2]).length).toBeGreaterThanOrEqual(8);
    expect(out.filter((p) => !p[2]).length).toBeGreaterThan(8 * 20);
  });
});
