// v2r2 fun (v2-loop): every walk stops at the keeper's door, picks keep legs, the map and a better eye, the
// pilot walks you away from a fight, the gyro heart walks `go`, no dead loot, set pieces that ask.
import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import '../src/tune/hints';
import '../src/tune/door';
import { newGame, tick } from '../src/core/game';
import { chunk } from '../src/core/grid';
import { exec, VERBS } from '../src/core/verbs';
import { label } from '../src/core/mods';
import type { Entity, Game, Inst } from '../src/core/types';
import { startKit } from '../src/tune/start';
import { doorOf } from '../src/tune/door';
import { makeRoom, MAX_SLOTS } from '../src/body';
import { bossWoke, inRoom, stairsAt, stairsChunk } from '../src/world/floors';
import { CHOICES, choiceNear } from '../src/world/choices';
import { PIECE } from '../src/world/pieces';

const text = (g: Game, from = 0) => g.log.slice(from).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
const kit = (g: Game) => {
  startKit(g);
  g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
  exec(g, 'install all');
  run(g, 3);
};
const inst = (g: Game, mod: string, more: Partial<Inst> = {}): Inst => {
  const i: Inst = { uid: g.nextId++, mod, on: true, readyAt: 0, data: {}, ...more };
  g.player.installed.push(i);
  return i;
};
/** at floor 1's keeper's door, the boss asleep */
const atTheDoor = (g: Game) => {
  const [cx, cy] = stairsChunk(g.seed, 0);
  chunk(g, cx, cy);
  const d = doorOf(g)!;
  [g.player.x, g.player.y] = [d.x, d.y];
  g.player.path = [];
  run(g, 0.2);
  return d;
};

describe('v2r2 fun: the keeper door stops every walk', () => {
  it('go stops at the door; go in walks in and wakes it', () => {
    const g = newGame(7);
    kit(g);
    const d = atTheDoor(g);
    exec(g, `go ${d.dir} 5`);
    run(g, 4);
    expect(inRoom(g.seed, 0, g.player.x, g.player.y)).toBe(false);
    expect(bossWoke(g, 0)).toBe(false);
    expect(text(g)).toMatch(/you stop at the keeper's door/);
    exec(g, 'go in');
    run(g, 3);
    expect(inRoom(g.seed, 0, g.player.x, g.player.y)).toBe(true);
    expect(bossWoke(g, 0)).toBe(true);
  });

  it('a pilot route through the room stops at the door too; the door card buttons say go in', () => {
    const g = newGame(7);
    kit(g);
    g.player.slots = 8;
    g.player.inv.push({ kind: 'mod', mod: 'wayfinder-moth' });
    exec(g, 'install wayfinder moth');
    run(g, 2);
    const d = atTheDoor(g);
    const [x0, y0] = [Math.floor(g.player.x), Math.floor(g.player.y)];
    for (let y = y0 - 20; y <= y0 + 20; y++) for (let x = x0 - 20; x <= x0 + 20; x++) g.seen.add(`${x},${y}`);
    const [sx, sy] = stairsAt(g.seed, 0);
    exec(g, `goto ${Math.floor(sx)} ${Math.floor(sy)}`);
    run(g, 8);
    expect(bossWoke(g, 0)).toBe(false);
    expect(inRoom(g.seed, 0, g.player.x, g.player.y)).toBe(false);
    expect(text(g)).toMatch(/you stop at the keeper's door/);
    expect(JSON.stringify(g.log)).toContain('"cmd":"go in"');
    expect(d).toBeTruthy();
  });
});

describe('v2r2 fun: picks and installs keep legs, the map and a better eye', () => {
  it('a weapon never takes out the pilot that is your only legs, nor the map', () => {
    const g = newGame(1);
    g.player.slots = 3;
    g.player.core = 20;
    inst(g, 'psalm-of-roads');
    inst(g, 'map-spool');
    inst(g, 'spark-finger');
    const room = makeRoom(g, { mod: 'nail-psalm' }, false);
    expect(typeof room).not.toBe('string');
    if (typeof room !== 'string') expect(room.remove?.mod).toBe('spark-finger');
    // with only legs and the map to give, it waits in the bag
    g.player.installed = g.player.installed.filter((i) => i.mod !== 'spark-finger');
    g.player.slots = 2;
    expect(typeof makeRoom(g, { mod: 'nail-psalm' }, false)).toBe('string');
  });

  it('an eye takes out a weaker eye, never a better one; a weaker eye asks', () => {
    const g = newGame(1);
    g.player.slots = 3;
    g.player.core = 20;
    inst(g, 'vidicon-tube', { rarity: 'rare' });
    inst(g, 'stepper-relay');
    inst(g, 'censer');
    expect(typeof makeRoom(g, { mod: 'dawn-eye', rarity: 'fine' } as never, false)).toBe('string');
    const room = makeRoom(g, { mod: 'dawn-eye', rarity: 'unique' } as never, false);
    expect(typeof room !== 'string' && room.remove?.mod).toBe('vidicon-tube');
  });
});

describe('v2r2 fun: legs', () => {
  it('the gyro heart walks go and the map click way', () => {
    const g = newGame(1);
    g.player.slots = 4;
    g.player.core = 20;
    g.player.inv.push({ kind: 'mod', mod: 'gyro-heart' });
    exec(g, 'install gyro heart');
    run(g, 3);
    expect(VERBS.go.when!(g)).toBe(true);
    const [x, y] = [g.player.x, g.player.y];
    exec(g, 'go e 2');
    exec(g, 'go s 2');
    run(g, 2);
    expect(Math.hypot(g.player.x - x, g.player.y - y)).toBeGreaterThan(0.9);
  });
});

describe('v2r2 fun: no dead loot', () => {
  it('a print is not a copy of what you hold while something else can come', () => {
    const g = newGame(1);
    for (const r of ['bone', 'glass', 'copper', 'ichor'] as const) g.player.inv.push({ kind: 'res', res: r, n: 99 });
    g.ents.push({ id: 997, kind: 'printer', x: g.player.x + 0.5, y: g.player.y, data: { far: 0, made: 0, greeted: true } });
    for (let k = 0; k < 3; k++) exec(g, 'print weapon');
    const ids = g.player.inv.filter((i) => i.kind === 'mod').map((i) => (i.kind === 'mod' ? i.mod : ''));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a slot board at the cap melts into power, then bone; where stops selling slots', () => {
    const g = newGame(1);
    g.player.slots = MAX_SLOTS;
    g.player.core = 9;
    g.player.inv.push({ kind: 'mod', mod: 'slot-board' });
    run(g, 0.1);
    expect(g.player.core).toBe(10);
    expect(text(g)).toMatch(/melts into your core: \+1 power/);
    g.player.inv.push({ kind: 'mod', mod: 'slot-board' });
    run(g, 0.1);
    expect(g.player.inv.some((i) => i.kind === 'res' && i.res === 'bone' && i.n >= 4)).toBe(true);
    for (let k = 0; k < MAX_SLOTS; k++) inst(g, 'censer');
    g.player.inv.push({ kind: 'mod', mod: 'frost-coat' });
    const n = g.log.length;
    exec(g, 'where');
    expect(text(g, n)).not.toMatch(/printer sells slots/);
  });
});

describe('v2r2 fun: set pieces that ask', () => {
  it('seven pieces ask, at least one per floor, each deal with a price', () => {
    const ids = Object.keys(CHOICES);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids.length).toBeLessThanOrEqual(8);
    expect(new Set(ids.map((id) => PIECE[id].floor))).toEqual(new Set([0, 1, 2, 3]));
    for (const id of ids) for (const d of CHOICES[id].deals) expect(d.price.length).toBeGreaterThan(3);
  });

  it('the saint takes hp for a rare; once', () => {
    const g = newGame(1);
    const e: Entity = { id: 990, kind: 'prop', x: g.player.x + 1, y: g.player.y, data: { piece: 'saint', used: false } };
    g.ents.push(e);
    run(g, 0.1);
    expect(choiceNear(g)?.c).toBe(CHOICES.saint);
    expect(text(g)).toMatch(/kneel: 3 hp: a rare module/);
    const hp = g.player.hp;
    exec(g, 'choose 1');
    expect(g.player.hp).toBe(hp - 3);
    const got = g.player.inv.find((i) => i.kind === 'mod');
    expect(got && got.kind === 'mod' && (got.rarity === 'rare' || !label(got).includes(' '))).toBeTruthy();
    expect(choiceNear(g)).toBeNull();
  });

  it('the sarcophagus trades your weakest carried module for a unique', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'censer' });
    g.ents.push({ id: 991, kind: 'prop', x: g.player.x + 1, y: g.player.y, data: { piece: 'sarcophagus', used: false } });
    exec(g, 'choose 1');
    const mods = g.player.inv.filter((i) => i.kind === 'mod');
    expect(mods.length).toBe(1);
    expect(mods[0].kind === 'mod' && mods[0].rarity).toBe('unique');
  });
});
