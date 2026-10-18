// ?scene=jump&at=<name> (Maks 10-18: links into a ready game situation): each one stages and plays on
import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, tick } from '../src/core/game';
import { open } from '../src/core/grid';
import { active, powerMax, powerUsed } from '../src/core/mods';
import { floorOf } from '../src/world/floors';
import { JUMPS, jump } from '../src/world/jump';

describe('jump links', () => {
  for (const name of Object.keys(JUMPS)) {
    it(`${name} stages a living player on its floor, every module on`, () => {
      for (const seed of [1, 7]) {
        const g = newGame(seed);
        expect(jump(g, name)).toBe(true);
        expect(floorOf(g)).toBe(JUMPS[name].floor);
        expect(open(g, g.player.x, g.player.y)).toBe(true);
        expect(g.player.installed.every((i) => i.on)).toBe(true);
        expect(powerUsed(g)).toBeLessThanOrEqual(powerMax(g));
        expect(g.log.flat().some((s) => typeof s === 'string' && s.startsWith('jump: '))).toBe(true);
        for (let k = 0; k < 20; k++) tick(g, 0.05);
        if (name !== 'ending') expect(g.ended).toBeNull();
        expect(g.player.hp).toBeGreaterThan(0);
      }
    });
  }
  it('eye-levels: pinhole II on, I and III in the bag', () => {
    const g = newGame(1);
    jump(g, 'eye-levels');
    expect(g.player.installed.find((i) => i.mod === 'pinhole-eye')?.level).toBe(2);
    expect(g.player.inv.filter((i) => i.kind === 'mod' && i.mod === 'pinhole-eye').map((i) => (i.kind === 'mod' ? i.level ?? 1 : 0)).sort()).toEqual([1, 3]);
  });
  it('f1-eye: the pinhole lies within reach; f1-fps: an eye is on and mites come', () => {
    const g = newGame(1);
    jump(g, 'f1-eye');
    const e = g.ents.find((x) => x.kind === 'item' && x.item?.kind === 'mod' && x.item.mod === 'pinhole-eye');
    expect(e && Math.hypot(e.x - g.player.x, e.y - g.player.y)).toBeLessThan(2.5);
    const h = newGame(1);
    jump(h, 'f1-fps');
    expect(active(h, 'camera').length).toBe(1);
    expect(h.ents.filter((x) => x.enemy?.type === 'mite' && x.enemy.data.noticed).length).toBeGreaterThanOrEqual(3);
  });
  it('an unknown name stages nothing', () => expect(jump(newGame(1), 'nowhere')).toBe(false));
});
