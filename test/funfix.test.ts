// v2r3 fun (v2-funfix): stuns cannot chain and a move given while stunned waits; the cradle reliquary keeps its
// eye till your first; every legs walk `go`, map clicks and `where`; `swap in` turns weapons off last; kits that
// turn with the seed; no dead card readers, no weaker prints.
import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import '../src/tune/hints';
import '../src/tune/door';
import { newGame, spawn, tick } from '../src/core/game';
import { chunk } from '../src/core/grid';
import { exec, VERBS } from '../src/core/verbs';
import type { Game, Inst } from '../src/core/types';
import { stageBoss, STUN_GUARD, stunOf } from '../src/fight/bosses';
import { startKit } from '../src/tune/start';
import { doorOf } from '../src/tune/door';
import { makeRoom } from '../src/body';
import { inRoom, KIT, stairsChunk } from '../src/world/floors';
import { offerOf } from '../src/world/cache';
import { foundEye, offers, outdone, shopNear } from '../src/world/printer';
import { uniqueItem } from '../src/mods/uniques';
import { MODS } from '../src/core/mods';
import { ranged } from '../src/world/spawn';

const text = (g: Game, from = 0) => g.log.slice(from).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
const inst = (g: Game, mod: string, more: Partial<Inst> = {}): Inst => {
  const i: Inst = { uid: g.nextId++, mod, on: true, readyAt: 0, data: {}, ...more };
  g.player.installed.push(i);
  return i;
};

describe('v2r3 fun: stuns', () => {
  it('a stun cannot follow another within the guard', () => {
    const g = newGame(1);
    const e = stageBoss(g, 0, 'boss-bell');
    const p = g.player;
    const starts: [number, number][] = [];
    let was = -99;
    for (let k = 0; k < 600; k++) {
      [p.x, p.y] = [e.x, e.y + 2.5];
      p.hp = p.maxHp;
      tick(g, 0.05);
      const until = stunOf(g);
      if (until !== was) starts.push([g.t, until]), (was = until);
    }
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < starts.length; k++) expect(starts[k][0]).toBeGreaterThanOrEqual(starts[k - 1][1] + STUN_GUARD - 0.06);
  });

  it('a go given while stunned walks once the stun ends', () => {
    const g = newGame(1);
    const e = stageBoss(g, 0, 'boss-bell');
    inst(g, 'stepper-relay');
    const p = g.player;
    let k = 0;
    for (; k < 400 && g.t >= stunOf(g); k++) {
      [p.x, p.y] = [e.x, e.y + 2.5];
      p.hp = p.maxHp;
      p.path = [];
      tick(g, 0.05);
    }
    expect(g.t < stunOf(g)).toBe(true);
    const at = [p.x, p.y];
    exec(g, 'go s 3');
    tick(g, 0.05);
    expect([p.x, p.y]).toEqual(at);
    while (g.t < stunOf(g)) {
      p.hp = p.maxHp;
      tick(g, 0.05);
    }
    p.hp = p.maxHp;
    run(g, 0.6);
    expect(p.y).toBeGreaterThan(at[1] + 0.5);
  });
});

describe('v2r3 fun: the cradle reliquary keeps its eye till your first', () => {
  it('no eye is sold before one is found; after, it is', () => {
    const g = newGame(7);
    startKit(g);
    exec(g, 'install all');
    run(g, 1);
    const p = g.player;
    // stand at the cradle's reliquary
    for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) chunk(g, cx, cy);
    const shop = g.ents.find((e) => e.kind === 'printer' && e.data?.shop)!;
    [p.x, p.y] = [shop.x + 1, shop.y];
    expect(shopNear(g)).toBe(shop);
    const k = offers(g, shop).findIndex((it) => it?.kind === 'mod' && MODS[it.mod].family === 'camera');
    expect(k).toBeGreaterThanOrEqual(0);
    expect(foundEye(g)).toBe(false);
    const n = g.log.length;
    exec(g, `buy ${k + 1}`);
    expect(text(g, n)).toMatch(/shut until you find your first eye/);
    expect(p.inv.some((i) => i.kind === 'mod' && MODS[i.mod].family === 'camera')).toBe(false);
    // the first eye found: the glass opens
    p.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
    expect(foundEye(g)).toBe(true);
    exec(g, `buy ${k + 1}`);
    expect(p.inv.filter((i) => i.kind === 'mod' && MODS[i.mod].family === 'camera').length).toBe(2);
  });
});

describe('v2r3 fun: legs parity', () => {
  it('the penitent\'s heels walk go, the map\'s multi-cell legs and where', () => {
    const g = newGame(7);
    g.player.slots = 8;
    g.player.core = 9;
    g.player.inv.push(uniqueItem('penitent-heels'));
    exec(g, 'install heels');
    run(g, 2);
    const p = g.player;
    expect(VERBS.go.when!(g)).toBe(true);
    const n = g.log.length;
    for (const d of ['n', 'e', 's', 'w']) {
      exec(g, `go ${d} 3`);
      if (p.path.length >= 2) break;
    }
    expect(text(g, n)).not.toMatch(/nothing installed/);
    expect(p.path.length).toBeGreaterThanOrEqual(2);
    expect(p.pace).toBeGreaterThan(1);
    exec(g, 'where');
    expect(JSON.stringify(g.log.slice(n))).not.toContain('"cmd":"crawl');
  });

  it('swap in new legs replaces the old ones', () => {
    const g = newGame(1);
    g.player.slots = 6;
    g.player.core = 4;
    inst(g, 'stepper-relay');
    inst(g, 'map-spool');
    inst(g, 'spark-finger');
    inst(g, 'choir-bell');
    g.player.inv.push(uniqueItem('penitent-heels'));
    exec(g, "swap in penitent's heels");
    const legs = g.player.installed.filter((i) => MODS[i.mod].family === 'gait');
    expect(legs.map((i) => i.mod)).toEqual(['penitent-heels']);
    expect(g.player.installed.filter((i) => i.on && MODS[i.mod].family === 'weapon').length).toBe(2);
  });

  it('after go in at the keeper\'s door, a typed step still steps', () => {
    const g = newGame(7);
    startKit(g);
    g.player.inv = g.player.inv.filter((i) => !(i.kind === 'mod' && i.mod === 'stepper-relay'));
    g.player.inv.push(uniqueItem('penitent-heels'), { kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'install all');
    run(g, 3);
    const [cx, cy] = stairsChunk(g.seed, 0);
    chunk(g, cx, cy);
    const d = doorOf(g)!;
    [g.player.x, g.player.y] = [d.x, d.y];
    g.player.path = [];
    run(g, 0.2);
    exec(g, 'go in');
    run(g, 0.1);
    const back = { n: 's', s: 'n', e: 'w', w: 'e' }[d.dir]!;
    const n = g.log.length;
    exec(g, `step ${back}`);
    expect(text(g, n)).not.toMatch(/nothing installed/);
    run(g, 3);
    expect(inRoom(g.seed, 0, g.player.x, g.player.y)).toBe(false);
  });
});

describe('v2r3 fun: swap in turns weapons off last', () => {
  // v3r1 floor 1: an eye never takes the map; a spare weapon gives way instead, never the last one
  it('an eye takes power from a spare weapon, never the map, never the last weapon', () => {
    const g = newGame(1);
    g.player.slots = 6;
    g.player.core = 4;
    inst(g, 'stepper-relay');
    inst(g, 'map-spool');
    inst(g, 'spark-finger');
    inst(g, 'choir-bell');
    // 2 short and only one spare weapon (1): refused, the map stays
    expect(typeof makeRoom(g, { mod: 'bat-psalter' }, false, true)).toBe('string');
    g.player.core = 5;
    const room = makeRoom(g, { mod: 'bat-psalter' }, false, true);
    expect(typeof room).not.toBe('string');
    if (typeof room === 'string') return;
    expect(room.off.map((i) => i.mod)).toEqual(['spark-finger']);
    expect(room.off.filter((i) => MODS[i.mod].family === 'weapon').length).toBeLessThanOrEqual(1);
    // one weapon and nothing else to give: it stays on
    const h = newGame(1);
    h.player.slots = 6;
    h.player.core = 2;
    inst(h, 'stepper-relay');
    inst(h, 'choir-bell');
    expect(typeof makeRoom(h, { mod: 'bat-psalter' }, false, true)).toBe('string');
  });
});

describe('v2r3 fun: kits turn with the seed', () => {
  it('floors 1-2 hold 7-8; their offers differ by seed; floor 3 always offers a ranged weapon', () => {
    for (const f of [0, 1]) {
      expect(KIT[f].length).toBeGreaterThanOrEqual(7);
      expect(KIT[f].length).toBeLessThanOrEqual(8);
      for (const m of KIT[f]) expect(MODS[m], m).toBeTruthy();
      const seen = new Set<string>();
      for (let s = 1; s < 30; s++) seen.add(offerOf(s, f).map((i) => (i.kind === 'mod' ? i.mod : '')).sort().join());
      expect(seen.size).toBeGreaterThan(3);
    }
    for (let s = 1; s < 60; s++) {
      const o = offerOf(s, 2).map((i) => (i.kind === 'mod' ? i.mod : ''));
      expect(o.some((m) => ranged(MODS[m])), `seed ${s}: ${o}`).toBe(true);
      expect(offerOf(s, 1).some((i) => i.kind === 'mod' && i.mod === 'dawn-eye')).toBe(true);
    }
  });
});

describe('v2r3 fun: no dead loot', () => {
  it('a card reader past the opener folds into bone', () => {
    const g = newGame(3);
    const e = spawn(g, { kind: 'item', x: 5.5, y: 5.5, item: { kind: 'mod', mod: 'card-reader' } });
    tick(g, 0.05);
    expect(e.item).toEqual({ kind: 'res', res: 'bone', n: 2 });
  });

  it('a print weaker than what you hold of its kind is rerolled', () => {
    const g = newGame(1);
    inst(g, 'choir-bell');
    expect(outdone(g, { mod: 'censer-flail' })).toBe(true);
    expect(outdone(g, { mod: 'reliquary-saw' })).toBe(false);
    // another reach is another kind
    expect(outdone(g, { mod: 'rivet-sling' })).toBe(false);
  });
});
