import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, spawn, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game } from '../src/core/types';

const last = (g: Game) => g.log[g.log.length - 1].map((s) => (typeof s === 'string' ? s : s.text)).join('');
const res = (g: Game, r: string) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === r ? i.n : 0), 0);

describe('loot (playtest r3)', () => {
  it('walking onto a pile takes it, one merged line; a module stays put', () => {
    const g = newGame(1);
    g.ents = g.ents.filter((e) => e.kind !== 'item');
    const { x, y } = g.player;
    const bone0 = res(g, 'bone');
    spawn(g, { kind: 'item', x, y, item: { kind: 'res', res: 'bone', n: 2 } });
    spawn(g, { kind: 'item', x, y, item: { kind: 'mod', mod: 'pinhole' } });
    tick(g, 0.05);
    expect(last(g)).toBe('+2 bone');
    spawn(g, { kind: 'item', x, y, item: { kind: 'res', res: 'glass', n: 1 } });
    spawn(g, { kind: 'item', x, y, item: { kind: 'res', res: 'bone', n: 1 } });
    tick(g, 0.05);
    expect(last(g)).toBe('+3 bone, +1 glass');
    expect(res(g, 'bone')).toBe(bone0 + 3);
    expect(g.ents.filter((e) => e.kind === 'item')).toHaveLength(1);
    // after a while, or another line, it starts a new line
    exec(g, 'inv');
    spawn(g, { kind: 'item', x, y, item: { kind: 'res', res: 'ichor', n: 1 } });
    tick(g, 0.05);
    expect(last(g)).toBe('+1 ichor');
  });
});
