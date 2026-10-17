import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { newGame, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { CARD, LIGHT, MELT, MELT_AT, beat, card, clock, light, melt, summary } from '../src/end/timeline';

describe('the Thaw Engine ending', () => {
  it('installing the engine ends the run as thaw', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'thaw-engine' });
    exec(g, 'install thaw engine');
    for (let k = 0; k < 60; k++) tick(g, 1 / 30);
    expect(g.ended).toBe('thaw');
  });

  it('the light floods, then every window melts, the console last, then the card', () => {
    expect(light(0)).toBe(0);
    expect(light(LIGHT)).toBe(1);
    expect(melt(MELT_AT, 0)).toBe(0);
    expect(melt(MELT_AT + MELT, 0)).toBe(1);
    expect(melt(MELT_AT + MELT, 3)).toBeLessThan(1);
    expect(melt(CARD, 4)).toBe(1);
    expect(card(CARD - 0.1)).toBe(false);
    expect(card(CARD)).toBe(true);
    for (let t = 0; t < 10; t += 0.13) expect(beat(t)).toBeGreaterThanOrEqual(0), expect(beat(t)).toBeLessThanOrEqual(1);
  });

  it('the card reads the run: cells out, modules found, kills, time', () => {
    const g = newGame(1);
    Object.assign(g.stats, { far: 212, mods: ['a', 'b', 'c'], kills: 7 });
    g.t = 1384.4;
    expect(clock(65)).toBe('1:05');
    Object.assign(g.stats, { far: 1, mods: ['a'] });
    expect(summary(g)).toMatch(/^1 cell out · 1 module found/);
    Object.assign(g.stats, { far: 212, mods: ['a', 'b', 'c'] });
    expect(summary(g)).toBe('212 cells out · 3 modules found · 7 put down · 23:04');
  });
});
