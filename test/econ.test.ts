import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame } from '../src/core/game';
import { MODS, param } from '../src/core/mods';
import { exec } from '../src/core/verbs';
import { rng } from '../src/core/rng';
import { BETTER, lootMod, rollMult } from '../src/world/spawn';
import { attuneKey } from '../src/world/altar';
import { offers, priceAt, PRICES } from '../src/world/printer';
import { answers } from '../src/world/zones';
import { startKit } from '../src/tune/start';
import type { Game, Inst } from '../src/core/types';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
/** is b better than a for this key? */
const better = (key: string, a: number, b: number) => (BETTER[key] === 'down' ? b < a : b > a);
const NO_ROLL = new Set(['res', 'fps', 'colors', 'flicker', 'slots', 'chill', 'size', 'big', 'wide', 'detail']);

describe('rolls, attune and the economy (r1 econ)', () => {
  it('every number a module has is either classed better-up/down or never rolls', () => {
    for (const m of Object.values(MODS))
      for (const [k, v] of Object.entries(m.params)) if (typeof v === 'number') expect(BETTER[k] || NO_ROLL.has(k) ? true : `${m.id}.${k}`).toBe(true);
  });

  it('attuned moves every stat its better way, cracked its worse way (cooldown, lag, recharge down)', () => {
    for (const m of Object.values(MODS))
      for (const [key, v] of Object.entries(m.params)) {
        if (typeof v !== 'number' || !BETTER[key] || v === 0) continue;
        const at = param<number>({ mod: m.id, roll: { key, mult: rollMult(key, true), tag: 'attuned' } }, key);
        const cr = param<number>({ mod: m.id, roll: { key, mult: rollMult(key, false), tag: 'cracked' } }, key);
        expect(better(key, v, at), `attuned ${m.id}.${key}`).toBe(true);
        expect(better(key, cr, v), `cracked ${m.id}.${key}`).toBe(true);
      }
    expect(rollMult('cooldown', true)).toBe(0.7);
    expect(rollMult('damage', false)).toBe(0.7);
  });

  it('loot rolls go the right way', () => {
    const r = rng(7);
    let n = 0;
    for (let k = 0; k < 2000; k++) {
      const it = lootMod(r, 6);
      if (it.kind !== 'mod' || !it.roll || it.level) continue;
      n++;
      const v = MODS[it.mod].params[it.roll.key] as number;
      expect(better(it.roll.key, v, param<number>(it, it.roll.key)), `${it.roll.tag} ${it.mod}`).toBe(it.roll.tag === 'attuned');
    }
    expect(n).toBeGreaterThan(100);
  });

  it('an altar attunes an eye\'s range, shortens the mirror ward\'s recharge, then tempers once more', () => {
    expect(attuneKey({ mod: 'dawn-eye' })).toBe('range');
    expect(attuneKey({ mod: 'mirror-ward' })).toBe('recharge');
    const g = newGame(1);
    g.ents.push({ id: 998, kind: 'prop', x: g.player.x + 0.5, y: g.player.y, data: { altar: true, greeted: true } });
    for (const res of ['bone', 'glass', 'copper', 'ichor'] as const) g.player.inv.push({ kind: 'res', res, n: 99 });
    g.player.slots = 6;
    const ward: Inst = { uid: 500, mod: 'mirror-ward', on: false, readyAt: 0, data: {} };
    g.player.installed.push(ward);
    exec(g, 'attune mirror ward');
    expect(param<number>(ward, 'recharge')).toBeLessThan(8);
    for (let k = 1; k <= 3; k++) {
      const before = param<number>(ward, 'recharge');
      exec(g, 'temper mirror ward');
      expect(ward.roll).toMatchObject({ tag: 'tempered', n: k });
      expect(param<number>(ward, 'recharge')).toBeLessThan(before);
    }
    exec(g, 'temper mirror ward');
    expect(text(g)).toContain('as true as it gets');
  });

  it('copper early: 2 at the start, tier-0 recycling pays copper, the first reliquary has a copper-free relic', () => {
    const g = newGame(3);
    startKit(g);
    expect(g.player.inv.find((i) => i.kind === 'res' && i.res === 'copper')).toMatchObject({ n: 2 });
    expect(PRICES.scrap[0]).toEqual({ bone: 2, copper: 2 }); // v3 econ: a copper more // v2 r1 fun: recycling pays bone too
    const shop = { id: 999, kind: 'printer' as const, x: 0, y: 0, data: { far: 1, shop: true } };
    for (let k = 0; k < 5; k++) {
      shop.data = { far: 1, shop: true, rolls: k } as never;
      const list = offers(g, shop);
      expect(list.some((it, j) => it && !priceAt(shop, j, it).copper)).toBe(true);
    }
  });

  it('crossing into the furnace offers the rime hood you carry', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'rime-hood' }, { kind: 'mod', mod: 'halo' });
    expect(answers(g, 3).flat().some((s) => typeof s !== 'string' && s.cmd === 'install rime hood')).toBe(true);
    expect(answers(g, 2).flat().some((s) => typeof s !== 'string' && s.cmd === 'install halo')).toBe(true);
  });
});
