import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, strike, tick } from '../src/core/game';
import { MODS } from '../src/core/mods';
import { rng } from '../src/core/rng';
import type { Game } from '../src/core/types';
import { BOSS, KEEPER_FLESH, KEEPER_POWER, LEASH, LEASH_HEAL, stageBoss } from '../src/fight/bosses';
import { lootMod, ranged } from '../src/world/spawn';

const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};

describe('v2 balance', () => {
  it('a boss you walk away from waits at its post, then heals back to its phase line', () => {
    const g = newGame(1);
    const e = stageBoss(g, 0, 'boss-warden');
    run(g, 2);
    expect(e.enemy!.data.noticed).toBe(true);
    e.enemy!.hp = BOSS['boss-warden'].hp * 0.8; // still in phase 0: its line is full hp
    const p = g.player;
    // step far off: it starts nothing new and mends once LEASH_HEAL s pass
    p.x += LEASH + 3;
    e.enemy!.data.windup = 0;
    run(g, LEASH_HEAL + 1);
    expect(e.enemy!.data.windup).toBeFalsy();
    // v2r2 fun: 15% back, never past its phase line
    expect(e.enemy!.hp).toBe(Math.round(BOSS['boss-warden'].hp * 0.95));
  });

  it('the cradle rolls no ranged weapon; the nave does', () => {
    const r = rng(5);
    for (let k = 0; k < 300; k++) {
      const it = lootMod(r, 1, 'weapon', true);
      expect(it.kind === 'mod' && ranged(MODS[it.mod])).toBe(false);
    }
    const r2 = rng(5);
    let any = false;
    for (let k = 0; k < 300; k++) {
      const it = lootMod(r2, 3, 'weapon');
      if (it.kind === 'mod' && ranged(MODS[it.mod])) any = true;
    }
    expect(any).toBe(true);
  });

  it("a keeper's ember heart adds power and max hp and mends you", () => {
    const g = newGame(2);
    const e = stageBoss(g, 0, 'boss-bell');
    const p = g.player;
    const [core, max] = [p.core, p.maxHp];
    p.hp = 3;
    strike(g, e, 999);
    run(g, 0.2);
    expect(p.core).toBe(core + KEEPER_POWER);
    expect(p.maxHp).toBe(max + KEEPER_FLESH);
    expect(p.hp).toBe(p.maxHp);
  });

  it('the slag worm never surfaces inside you', () => {
    const g = newGame(3);
    const e = stageBoss(g, 3, 'boss-worm');
    let closest = 99;
    for (let k = 0; k < 20 * 40; k++) {
      const was = !!e.enemy?.data.under;
      tick(g, 0.05);
      if (g.ended) break;
      if (was && !e.enemy!.data.under) closest = Math.min(closest, Math.hypot(e.x - g.player.x, e.y - g.player.y));
      g.player.hp = g.player.maxHp;
    }
    expect(closest).toBeLessThan(99); // it did come up
    expect(closest).toBeGreaterThan(1);
  });
});
