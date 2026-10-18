import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/tune/hints';
import '../src/body/fps';
import { newGame, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { slotsUsed } from '../src/core/mods';
import { startKit } from '../src/tune/start';
import { cacheNear, findOffer, fitOf } from '../src/world/cache';
import { goDown } from '../src/world/floors';

const run = (g: ReturnType<typeof newGame>, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};

describe('v2r4 ux', () => {
  it("the saint's reins go in with every slot full: they bring their own socket", () => {
    const g = newGame(11);
    startKit(g);
    goDown(g, 2);
    g.player.slots = slotsUsed(g);
    const c = cacheNear(g)!;
    const k = findOffer(c, "saint's reins");
    expect(k).toBeGreaterThanOrEqual(0);
    expect(fitOf(g, c.offer[k])).toMatch(/^goes straight in/); // (v2r5: and asks for a sharp eye without a scope)
    const slots = g.player.slots;
    exec(g, `pick ${k + 1}`);
    expect(g.player.installed.some((i) => i.mod === 'saints-reins')).toBe(true);
    run(g, 0.2);
    expect(g.player.slots).toBe(slots + 1);
    // the socket comes once: a second pair waits its turn like any module
    expect(fitOf(g, { kind: 'mod', mod: 'martyrs-reins' })).not.toBe('goes straight in');
  });
});
