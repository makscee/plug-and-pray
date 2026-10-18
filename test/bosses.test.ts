import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, strike, tick } from '../src/core/game';
import type { Entity, Game } from '../src/core/types';
import { BOSS, BOSSES, bossDrops, bossHooks, inZone, spawnBoss, stageBoss, stunOf, variantOf } from '../src/fight/bosses';
import { SPRITES } from '../src/sight/sprites';

const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
const lead = (g: Game) => g.ents.find((e) => e.enemy && BOSS[e.enemy.type])!;

describe('bosses', () => {
  it('three variants on each of floors 0-3, the heart alone on 4, each with a sprite and phases', () => {
    for (let f = 0; f < 4; f++) expect(BOSSES[f].filter((b) => !b.mate || b.id < b.mate)).toHaveLength(3);
    expect(BOSSES[4].map((b) => b.id)).toEqual(['boss-heart']);
    expect(BOSS['boss-heart'].phases).toHaveLength(3);
    for (const b of Object.values(BOSS)) {
      expect(SPRITES[b.id], b.id).toBeTruthy();
      expect(b.phases.length).toBe(b.at.length + 1);
      for (const ph of b.phases) expect(ph.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('the variant is fixed by the seed, and the heart never changes', () => {
    const a = newGame(7);
    const b = newGame(7);
    for (let f = 0; f < 5; f++) expect(variantOf(a, f).id).toBe(variantOf(b, f).id);
    const seen = new Set<string>();
    for (let s = 1; s < 40; s++) seen.add(variantOf(newGame(s), 1).id);
    expect(seen.size).toBe(3);
    for (let s = 1; s < 10; s++) expect(variantOf(newGame(s), 4).id).toBe('boss-heart');
  });

  it('winds up before it hits: a move is named and its zone is marked first', () => {
    const g = newGame(1);
    const e = stageBoss(g, 0, 'boss-bell');
    run(g, 3);
    const d = e.enemy!.data;
    expect(d.noticed).toBe(true);
    // somewhere in the first seconds it wound up a toll or a clapper, with a zone on the floor
    const told = g.log.map((l) => l.join('')).join('\n');
    expect(told).toMatch(/the bell: /);
    expect(g.ents.some((x) => x.data?.mark) || !!d.zones || told.includes('toll')).toBe(true);
  });

  it('turns at half its hp', () => {
    const g = newGame(1);
    const e = stageBoss(g, 1, 'boss-organ');
    run(g, 0.5);
    strike(g, e, e.enemy!.hp * 0.55);
    run(g, 6);
    expect(e.enemy!.data.phase).toBe(1);
  });

  it('a toll stuns who stands in its ring', () => {
    const g = newGame(1);
    const e = stageBoss(g, 0, 'boss-bell');
    const p = g.player;
    // stand in the ring, 2.5 cells off, and wait for the toll
    [p.x, p.y] = [e.x, e.y + 2.5];
    let stunned = false;
    for (let k = 0; k < 200 && !stunned; k++) {
      [p.x, p.y] = [e.x, e.y + 2.5];
      p.hp = p.maxHp;
      tick(g, 0.05);
      stunned = g.t < stunOf(g);
    }
    expect(stunned).toBe(true);
  });

  it('on death: the floors hook, a fine+ module, and a unique on floor 1', () => {
    const g = newGame(3);
    let down: Entity | null = null;
    bossHooks.down = (_g, e) => void (down = e);
    const e = spawnBoss(g, 1, 8.5, 6.5);
    const before = g.nextId;
    strike(g, e, 9999);
    expect(down).toBe(e);
    const drops = g.ents.filter((x) => x.id >= before && x.item?.kind === 'mod').map((x) => x.item as { mod: string; rarity?: string });
    expect(drops.length).toBe(2);
    expect(drops.some((d) => d.rarity === 'unique')).toBe(true);
    expect(drops.every((d) => d.rarity && d.rarity !== 'common')).toBe(true);
    expect(bossDrops(newGame(3), 0).length).toBe(1);
    bossHooks.down = () => {};
  });

  it('the twins fall together: the hook waits for the second', () => {
    const g = newGame(1);
    let n = 0;
    bossHooks.down = () => void n++;
    spawnBoss(g, 3, 8.5, 6.5, 'boss-bellows');
    const [a, b] = g.ents.filter((e) => e.enemy && BOSS[e.enemy.type]);
    strike(g, a, 9999);
    expect(n).toBe(0);
    strike(g, b, 9999);
    expect(n).toBe(1);
    bossHooks.down = () => {};
  });

  it('zones: a ring with a hole, a line with a width', () => {
    expect(inZone({ k: 'ring', x: 0, y: 0, r0: 1.5, r1: 3 }, 0, 1)).toBe(false);
    expect(inZone({ k: 'ring', x: 0, y: 0, r0: 1.5, r1: 3 }, 0, 2)).toBe(true);
    expect(inZone({ k: 'line', x: 0, y: 0, vx: 1, vy: 0, len: 5, w: 0.5 }, 3, 0.3)).toBe(true);
    expect(inZone({ k: 'line', x: 0, y: 0, vx: 1, vy: 0, len: 5, w: 0.5 }, 3, 0.8)).toBe(false);
    void lead;
  });
});
