import { describe as group, expect, it } from 'vitest';
import '../src/mods';
import { newGame } from '../src/core/game';
import { MODS } from '../src/core/mods';
import { exec } from '../src/core/verbs';
import { describe } from '../src/mods/describe';
import { offers, PRICES } from '../src/world/printer';

const text = (g: ReturnType<typeof newGame>) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');

group('descriptions, reliquaries, recycling', () => {
  it('every module and every roll describes itself in plain words', () => {
    for (const m of Object.values(MODS))
      for (const roll of [undefined, { key: Object.keys(m.params)[0] ?? 'x', mult: 0.7, tag: 'cracked' as const }]) {
        const lines = describe({ mod: m.id, roll });
        expect(lines.join(' '), m.id).not.toMatch(/undefined|NaN/);
        expect(lines[0].length, m.id).toBeGreaterThan(5);
      }
  });

  it('a reliquary sells three modules for resources, rerolls, and a module recycles into resources', () => {
    const g = newGame(1);
    const shop = { id: 999, kind: 'printer' as const, x: g.player.x + 0.5, y: g.player.y, data: { far: 0, shop: true } };
    g.ents.push(shop);
    const first = offers(g, shop);
    expect(first.length).toBe(3);
    exec(g, 'buy 1');
    expect(text(g)).toContain('the reliquary wants');
    for (const res of ['bone', 'glass', 'copper', 'ichor'] as const) g.player.inv.push({ kind: 'res', res, n: 10 });
    const mods = () => g.player.inv.filter((i) => i.kind === 'mod').length;
    const before = mods();
    exec(g, 'buy 1');
    expect(mods()).toBe(before + 1);
    expect(offers(g, shop)[0]).toBeNull();
    exec(g, 'reroll');
    expect(offers(g, shop).every(Boolean)).toBe(true);
    const bone = () => g.player.inv.find((i) => i.kind === 'res' && i.res === 'bone');
    const b0 = (bone() as { n: number }).n;
    g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'recycle pinhole');
    expect(text(g)).toContain('you grind pinhole eye down');
    expect((bone() as { n: number }).n).toBe(b0 + PRICES.scrap[0].bone!);
  });
});
