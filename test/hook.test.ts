import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { newGame } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { stairsAt } from '../src/world/floors';
import { opening } from '../src/world/spawn';
import { chunk } from '../src/core/grid';
import { OPENERS } from '../src/world/cards';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const reader = (g: Game) => {
  g.player.inv.push({ kind: 'mod', mod: 'card-reader' });
  exec(g, 'install card reader');
  for (const i of g.player.installed) i.readyAt = g.t - 1;
};

describe('r2 hook', () => {
  it('the first card a run finds turns with the seed', () => {
    const first = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      // the reader's chunk beside the start holds the first card
      const [cx, cy] = opening(seed).reader;
      const g = newGame(seed);
      chunk(g, cx, cy);
      const card = g.ents.find((e) => e.item?.kind === 'card' && Math.floor(e.x / 16) === cx && Math.floor(e.y / 16) === cy)!;
      first.add(card.item!.kind === 'card' ? card.item!.card : '');
    }
    expect(first.size).toBeGreaterThanOrEqual(3);
    for (const id of first) expect(OPENERS.map((c) => c.id)).toContain(id);
  });

  it('v2: the first card on a floor points the way down', () => {
    const g = newGame(5);
    reader(g);
    g.player.inv.push({ kind: 'card', card: 'log-ferry' });
    exec(g, 'read card');
    const v = g.vectors.find((v) => v.what === 'way down')!;
    expect([v.x, v.y]).toEqual(stairsAt(5, 0));
    expect(text(g)).toMatch(/way down, past the floor's keeper/);
  });

  it('r4: the last card reader neither recycles nor drops while floors are left; it may past the furnace', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'card-reader' }, { kind: 'card', card: 'log-ferry' });
    exec(g, 'recycle card reader');
    expect(text(g)).toMatch(/only card reader/);
    exec(g, 'recycle card reader');
    exec(g, 'drop card reader');
    expect(g.player.inv.some((i) => i.kind === 'mod' && i.mod === 'card-reader')).toBe(true);
    g.floor = 3;
    // with a card still unread it asks once first (r2)
    exec(g, 'recycle card reader');
    exec(g, 'recycle card reader');
    expect(g.player.inv.some((i) => i.kind === 'mod' && i.mod === 'card-reader')).toBe(false);
  });
});
