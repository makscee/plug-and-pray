import { describe, expect, it } from 'vitest';
import '../src/mods';
import { hurt, newGame, spawn, spawnEnemy, strike, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { CHUNK, chunk } from '../src/core/grid';
import { label, MODS, param, powerMax } from '../src/core/mods';
import { describe as describeMod, does } from '../src/mods/describe';
import { lootMod } from '../src/world/spawn';
import { rng } from '../src/core/rng';
import { dealUnique, isUnique, perkText, throughOne, uniqueItem, UNIQUES } from '../src/mods/uniques';
import { relicChunk } from '../src/mods/relics';
import { offers, priceOf } from '../src/world/printer';
import type { Game, Item } from '../src/core/types';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 30; k++) tick(g, 1 / 30);
};
/** a game with these items installed and warm, in the start chamber, nothing else about */
function armed(...items: Item[]): Game {
  const g = newGame(1);
  g.ents = [];
  g.player.core = 20;
  for (const it of items) {
    g.player.inv.push(it);
    if (it.kind === 'mod') exec(g, 'install ' + label(it));
  }
  run(g, 3);
  g.ents = [];
  return g;
}

describe('v2 rarity', () => {
  it('fine and rare move the key number its better way, and the name says so', () => {
    const fine = { mod: 'bone-lance', rarity: 'fine' as const };
    const rare = { mod: 'bone-lance', rarity: 'rare' as const };
    expect(param<number>(fine, 'damage')).toBeCloseTo(6 * 1.15);
    expect(param<number>(rare, 'damage')).toBeCloseTo(6 * 1.3);
    expect(param<number>(rare, 'cooldown')).toBe(2.2);
    expect(param<number>({ mod: 'dawn-eye', rarity: 'rare' }, 'range')).toBeCloseTo(9 * 1.3);
    expect(label(rare)).toBe('rare bone lance');
    expect(label({ ...fine, roll: { key: 'damage', mult: 1.4, tag: 'attuned' } })).toBe('fine attuned bone lance');
    expect(describeMod(rare)[1]).toContain('rare: damage +30%');
  });

  it('deeper zones roll rarer, and uniques never roll as loot', () => {
    const share = (far: number) => {
      const r = rng(7);
      let n = 0;
      for (let k = 0; k < 2000; k++) {
        const it = lootMod(r, far);
        if (it.kind === 'mod') {
          expect(isUnique(it.mod)).toBe(false);
          if (it.rarity) n++;
        }
      }
      return n / 2000;
    };
    expect(share(0.5)).toBeLessThan(share(2.5));
    expect(share(2.5)).toBeLessThan(share(4.5));
  });

  it('every unique is its own module with a title and a perk in words', () => {
    expect(UNIQUES.length).toBeGreaterThanOrEqual(8);
    for (const u of UNIQUES) {
      expect(MODS[u.id].tier).toBe(3);
      expect(MODS[u.id].family).toBe(MODS[u.base].family);
      expect(perkText({ mod: u.id })).not.toBe('');
      const it = uniqueItem(u.id);
      expect(label(it as { mod: string })).toBe(u.title);
      expect(does(it as { mod: string })).toContain('✦');
    }
  });

  it('a run deals each unique once, and the cradle keeps one in a corner chunk', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = newGame(seed);
      const [cx, cy] = relicChunk(seed);
      chunk(g, cx, cy);
      const relic = g.ents.find((e) => e.data?.relic && Math.floor(e.x / CHUNK) === cx && Math.floor(e.y / CHUNK) === cy);
      expect(relic?.item?.kind === 'mod' && isUnique(relic.item.mod)).toBe(true);
      expect(relic?.item?.kind === 'mod' && relic.item.rarity).toBe('unique');
      const a = dealUnique(g);
      const b = dealUnique(g);
      expect(a.kind === 'mod' && b.kind === 'mod' && a.mod !== b.mod && relic!.item!.kind === 'mod' && a.mod !== relic!.item!.mod).toBe(true);
    }
  });

  it('an elite gives up a unique, and says so', () => {
    const g = armed();
    const w = spawnEnemy(g, 'warden', 9.5, 8.5);
    w.enemy!.data.elite = true;
    strike(g, w, 99);
    expect(g.ents.some((e) => e.data?.relic && e.item?.kind === 'mod' && e.item.rarity === 'unique')).toBe(true);
    expect(text(g)).toContain('a relic with its own name');
  });

  it('install and remove keep rarity and title', () => {
    const g = armed(uniqueItem('leech-psalm'), { kind: 'mod', mod: 'bone-lance', rarity: 'rare' });
    expect(g.player.installed.find((i) => i.mod === 'leech-psalm')?.title).toBe('the leech psalm');
    expect(g.player.installed.find((i) => i.mod === 'bone-lance')?.rarity).toBe('rare');
    exec(g, 'remove rare bone lance');
    expect(g.player.inv.some((i) => i.kind === 'mod' && i.mod === 'bone-lance' && i.rarity === 'rare')).toBe(true);
  });

  it('a unique prices above a common one at a reliquary', () => {
    const unique = priceOf(uniqueItem('kiln-heart'));
    const common = priceOf({ kind: 'mod', mod: 'ember-cell' });
    expect(unique.ichor ?? 0).toBeGreaterThan(common.ichor ?? 0);
  });

  it('reliquaries past the cradle keep a unique now and then', () => {
    let n = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = newGame(seed);
      const e = spawn(g, { kind: 'printer', x: 8.5, y: 8.5, data: { far: 3, shop: true } });
      if (offers(g, e).some((it) => it?.kind === 'mod' && it.rarity === 'unique')) n++;
    }
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(12);
  });
});

describe('v2 unique perks', () => {
  it('the chain of saint vitus leaps on to two more', () => {
    const g = armed(uniqueItem('vitus-chain'));
    const ms = [9.5, 10.5, 11.5].map((x) => spawnEnemy(g, 'walker', x, 8.5));
    run(g, 0.1);
    expect(ms.every((m) => m.enemy!.hp < 5 * 1)).toBe(true);
  });

  it("the abbot's last rite leaves you at 1 hp once, then sleeps", () => {
    const g = armed(uniqueItem('last-rite'));
    hurt(g, 99);
    expect(g.ended).toBe(null);
    expect(g.player.hp).toBe(1);
    expect(text(g)).toContain('last rite');
    hurt(g, 99);
    expect(g.ended).toBe('dead');
  });

  it('the leech psalm mends on a kill', () => {
    const g = armed(uniqueItem('leech-psalm'));
    g.player.hp = 5;
    strike(g, spawnEnemy(g, 'mite', 20.5, 8.5), 9);
    expect(g.player.hp).toBe(6);
  });

  it('the drowned bell and the ash slow what they touch', () => {
    const g = armed(uniqueItem('drowned-bell'));
    const m = spawnEnemy(g, 'walker', 9.5, 8.5);
    run(g, 0.1);
    expect(Number(m.enemy!.data.slowUntil)).toBeGreaterThan(g.t);
    const h = armed(uniqueItem('penitent-heels'));
    run(h, 0.2);
    const w = spawnEnemy(h, 'mite', h.player.x, h.player.y);
    run(h, 0.1);
    expect(Number(w.enemy!.data.slowUntil)).toBeGreaterThan(h.t);
  });

  it('the kiln heart gives more power deeper', () => {
    const g = armed(uniqueItem('kiln-heart'));
    const at0 = powerMax(g);
    // v2: floor 3, the ossuary (src/world/floors.ts)
    g.floor = 2;
    g.player.x = CHUNK * 32 + 8.5;
    g.player.y = 8.5;
    chunk(g, 32, 0);
    run(g, 0.1);
    expect(powerMax(g)).toBe(at0 + 2);
  });

  it("the saint's last lens sees through one wall, not two", () => {
    const g = newGame(1);
    // the start chamber is open 5..11: a wall cell at x = 4 or 12, and beyond it whatever lies there
    expect(throughOne(g, 8.5, 8.5, 8.5, 8.5)).toBe(true);
    let one = 0;
    for (let x = 0; x < 30; x++) if (throughOne(g, 8.5, 8.5, x + 0.5, 8.5)) one++;
    expect(one).toBeGreaterThan(6);
    expect(one).toBeLessThan(30);
  });
});
