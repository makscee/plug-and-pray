import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { newGame } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { startKit } from '../src/tune/start';
import { boneOf, cacheNear, cacheOf, COST, FREE, offerOf, OFFER, SCRAP } from '../src/world/cache';
import { goDown, KIT } from '../src/world/floors';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const mods = (g: Game) => [...g.player.inv, ...g.player.installed].flatMap((i) => ('mod' in i ? [i.mod] : []));

describe('v2 kit cache: pick two of five', () => {
  it('offers five of the floor\'s kit, its headline always', () => {
    for (let seed = 1; seed < 30; seed++)
      for (const f of [0, 1, 2, 3]) {
        const o = offerOf(seed, f).map((i) => (i.kind === 'mod' ? i.mod : ''));
        expect(o.length).toBe(Math.min(OFFER, KIT[f].length));
        expect(o[0]).toBe(KIT[f][0]);
        expect(new Set(o).size).toBe(o.length);
        for (const m of o) expect(KIT[f]).toContain(m);
      }
    // the ossuary's seven turn with the seed
    const seen = new Set<string>();
    for (let seed = 1; seed < 30; seed++) seen.add(offerOf(seed, 2).map((i) => (i.kind === 'mod' ? i.mod : '')).join());
    expect(seen.size).toBeGreaterThan(3);
  });

  it('two picks are free and go in; the third costs bone; the rest scraps into bone', () => {
    const g = newGame(4);
    startKit(g);
    goDown(g, 1);
    const c = cacheNear(g)!;
    expect(c).toBeTruthy();
    const first = c.offer[0];
    exec(g, 'pick 1');
    exec(g, 'pick 1');
    expect(c.taken).toBe(FREE);
    expect(mods(g)).toContain(first.kind === 'mod' ? first.mod : '');
    // a third pick with no bone is refused
    const before = c.offer.length;
    exec(g, 'pick 1');
    expect(c.offer.length).toBe(before);
    expect(text(g)).toMatch(new RegExp(`costs ${COST[0]} bone`));
    g.player.inv.push({ kind: 'res', res: 'bone', n: COST[0] + 1 });
    exec(g, 'pick 1');
    expect(c.offer.length).toBe(before - 1);
    expect(boneOf(g)).toBe(1);
    const left = c.offer.length;
    exec(g, 'scrap');
    expect(boneOf(g)).toBe(1 + left * SCRAP);
    expect(cacheOf(g).done).toBe(true);
    expect(cacheNear(g)).toBeUndefined();
  });

  it('a pick by name works, and away from the cache it says where', () => {
    const g = newGame(9);
    startKit(g);
    goDown(g, 1);
    exec(g, 'pick plumb line');
    expect(mods(g)).toContain('plumb-line');
    g.player.x += 12;
    exec(g, 'pick 1');
    expect(text(g)).toMatch(/where you landed/);
  });
});
