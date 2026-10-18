import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { newGame } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { plan } from '../src/world/vectors';
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

  it('shard 1 gives the engine a bearing and points to the next shard', () => {
    const g = newGame(5);
    reader(g);
    g.player.inv.push({ kind: 'card', card: 'shard-1' });
    exec(g, 'read card');
    expect(text(g)).toMatch(/the engine: about \d+ cells from where you woke, bearing near \d+ \([a-z]+\)/);
    expect(text(g)).toMatch(/the next shard lies in the ossuary/);
    const v = g.vectors.find((v) => v.what === 'scripture shard')!;
    expect(Math.floor(v.x / 16)).toBe(plan(5).shards[1][0]);
    // shard 2 points to shard 3, on the map and in `vectors`
    g.player.inv.push({ kind: 'card', card: 'shard-2' });
    exec(g, 'read card');
    const v3 = g.vectors.filter((v) => v.what === 'scripture shard').at(-1)!;
    expect([Math.floor(v3.x / 16), Math.floor(v3.y / 16)]).toEqual(plan(5).shards[2]);
    expect(text(g)).toMatch(/the next shard lies in the furnace/);
  });

  it('recycle asks once before it grinds the only card reader while a card is unread', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'card-reader' }, { kind: 'card', card: 'log-ferry' });
    exec(g, 'recycle card reader');
    expect(text(g)).toMatch(/only card reader/);
    expect(g.player.inv.some((i) => i.kind === 'mod' && i.mod === 'card-reader')).toBe(true);
    exec(g, 'recycle card reader');
    expect(g.player.inv.some((i) => i.kind === 'mod' && i.mod === 'card-reader')).toBe(false);
  });
});
