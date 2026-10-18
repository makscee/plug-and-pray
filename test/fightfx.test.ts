import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/fight';
import { newGame, spawnEnemy, strike, tick } from '../src/core/game';
import { BOSS, BOSSES, stageBoss } from '../src/fight/bosses';
import { bossKind } from '../src/fight/bolts';
import { blowText, BLOW_SHOW, lastBlow } from '../src/fight/report';
import { boltWarn, fire, incoming, shots, sideOf } from '../src/fight/shots';

describe('v2 fight readability', () => {
  it('every boss bullet has a kind the eyes draw glowing', () => {
    for (let f = 0; f < 4; f++)
      for (const b of BOSSES[f].filter((x) => !x.mate || x.id < x.mate)) {
        const g = newGame(3);
        stageBoss(g, f, b.id);
        for (let k = 0; k < 20 * 25 && !shots(g).length; k++) tick(g, 0.05);
        for (const s of shots(g)) expect(s.data!.kind, b.id).toBeTruthy();
      }
    expect(bossKind('boss-worm', 4)).toBe('slag');
    expect(bossKind('boss-choir', 2.4)).toBe('ball');
    expect(bossKind('boss-choir', 6)).toBe('needle');
    expect(bossKind('boss-choir', 4)).toBe('bolt');
    expect(Object.keys(BOSS).length).toBeGreaterThan(10);
  });

  it('a bolt coming at you is warned of with its way; one passing wide is not', () => {
    const g = newGame(1);
    const p = g.player;
    p.dir = 0; // north
    fire(g, { x: p.x, y: p.y - 2, vx: 0, vy: 4, dmg: 1, range: 8, src: null, foe: true, kind: 'bolt' });
    expect(incoming(g)).toHaveLength(1);
    expect(boltWarn(g)).toBe('bolt from n: step aside');
    expect(boltWarn(g, 3, true)).toBe('bolt from ahead: step aside');
    expect(sideOf(g, { x: p.x + 2, y: p.y })).toBe('the right');
    expect(sideOf(g, { x: p.x, y: p.y + 2 })).toBe('behind');
    g.ents = g.ents.filter((e) => !e.data?.shot);
    // flying past, two cells to the side; and one flying away
    fire(g, { x: p.x + 2, y: p.y - 2, vx: 0, vy: 4, dmg: 1, range: 8, src: null, foe: true });
    fire(g, { x: p.x, y: p.y - 2, vx: 0, vy: -4, dmg: 1, range: 8, src: null, foe: true });
    expect(boltWarn(g)).toBe('');
  });

  it('a blow that lands is told for a moment: the hit, what armour ate, a kill', () => {
    const g = newGame(1);
    const p = g.player;
    const w = spawnEnemy(g, 'walker', p.x + 1, p.y);
    strike(g, w, 1.5);
    expect(lastBlow(g)!.ate).toBeCloseTo(1.2 - 0, 1);
    expect(blowText(g)).toMatch(/^armour ate 1\.2 · hit 0\.3$/);
    strike(g, w, 4);
    expect(blowText(g)).toBe('✦ hit 2.8');
    g.t += BLOW_SHOW + 0.1;
    expect(blowText(g)).toBe('');
    strike(g, w, 50);
    expect(blowText(g)).toBe('✦ ossuary walker down');
  });
});
