// v2-where (v2r5 run): `where` and walks go round a sleeping keeper's room, the loop guard is kept per target,
// `swap in` takes out the same kind or a duplicate first, and a kit card's "take out X" frees what is lacking.
import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import '../src/tune/hints';
import '../src/tune/door';
import { newGame, tick } from '../src/core/game';
import { chunk, open } from '../src/core/grid';
import { exec, way } from '../src/core/verbs';
import type { Game, Inst, Line } from '../src/core/types';
import { lastLeg, toCell } from '../src/tune/hints';
import { doorOf } from '../src/tune/door';
import { route } from '../src/mods/pilot';
import { freeing } from '../src/body';
import { bossRoom, inRoom, stairsChunk } from '../src/world/floors';
import { startKit } from '../src/tune/start';

const inst = (g: Game, mod: string, more: Partial<Inst> = {}): Inst => {
  const i: Inst = { uid: g.nextId++, mod, on: true, readyAt: 0, data: {}, ...more };
  g.player.installed.push(i);
  return i;
};
const cmdOf = (l: Line) => l.map((s) => (typeof s === 'string' ? '' : s.cmd)).join('');
const BACK: Record<string, string> = { n: 's', s: 'n', e: 'w', w: 'e' };

describe('v2-where: the loop guard', () => {
  it('keeps one leg per target, so another line cannot hide a ping-pong', () => {
    const g = newGame(7);
    startKit(g);
    exec(g, 'install all');
    tick(g, 3);
    const p = g.player;
    const [x, y] = [Math.floor(p.x), Math.floor(p.y)];
    // two targets a few cells off on open floor
    const spots: [number, number][] = [];
    for (let r = 4; r < 14 && spots.length < 2; r++)
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (spots.length < 2 && open(g, x + dx + 0.5, y + dy + 0.5)) spots.push([x + dx, y + dy]);
    expect(spots.length).toBe(2);
    const [a, b] = spots;
    toCell(g, a[0] + 0.5, a[1] + 0.5, 'a');
    toCell(g, b[0] + 0.5, b[1] + 0.5, 'b');
    expect([...lastLeg.get(g)!.keys()]).toEqual(expect.arrayContaining([`${a[0]},${a[1]}`, `${b[0]},${b[1]}`]));
    // the leg toward a turned straight back on the last one given for a, from elsewhere: another line in between
    // does not reset it, and the leg is never that straight-back one
    const [ax] = way.long(g, a[0] + 0.5, a[1] + 0.5);
    lastLeg.get(g)!.set(`${a[0]},${a[1]}`, { dir: BACK[ax], at: [x + 50, y + 50] });
    toCell(g, b[0] + 0.5, b[1] + 0.5, 'b');
    expect(cmdOf(toCell(g, a[0] + 0.5, a[1] + 0.5, 'a'))).not.toMatch(new RegExp(`^go ${ax} `));
  });
});

describe('v2-where: a sleeping keeper\'s room is a wall to walks', () => {
  it('route and way.long never cross it while it is shut, and do once you go in', () => {
    const g = newGame(7);
    const [cx, cy] = stairsChunk(g.seed, 0);
    chunk(g, cx, cy);
    const d = doorOf(g)!;
    [g.player.x, g.player.y] = [d.x, d.y];
    const [x0, y0, x1, y1] = bossRoom(g.seed, 0);
    // a target on the far side of the room from the door
    const far = (x: number, y: number) => Math.hypot(x - d.x, y - d.y);
    let t: [number, number] | null = null;
    for (let y = y0 - 3; y <= y1 + 3; y++)
      for (let x = x0 - 3; x <= x1 + 3; x++)
        if (!inRoom(g.seed, 0, x + 0.5, y + 0.5) && open(g, x + 0.5, y + 0.5) && (!t || far(x, y) > far(...t))) t = [x, y];
    expect(t).toBeTruthy();
    const [tx, ty] = t!;
    expect(way.block(g, tx, ty)).not.toBeNull();
    const { path } = route(g, Math.floor(d.x), Math.floor(d.y), tx, ty, 200, false, true);
    expect(path.some(([x, y]) => inRoom(g.seed, 0, x, y))).toBe(false);
    // a target inside the room is not blocked
    expect(way.block(g, x0 + 1, y0 + 1)).toBeNull();
    // `go in` opens it
    exec(g, 'go in');
    expect(way.block(g, tx, ty)).toBeNull();
  });
});

describe('v2-where: swap in takes out the right one', () => {
  it('a stronger generator takes out the weaker one, not the frost coat', () => {
    const g = newGame(11);
    g.player.slots = 5;
    g.player.core = 4;
    inst(g, 'stepper-relay');
    inst(g, 'map-spool');
    inst(g, 'choir-bell');
    inst(g, 'frost-coat');
    inst(g, 'ember-cell');
    g.player.inv.push({ kind: 'mod', mod: 'heart-shard', rarity: 'rare' });
    exec(g, 'swap in heart-shard');
    const mods = g.player.installed.map((i) => i.mod);
    expect(mods).toContain('heart-shard');
    expect(mods).toContain('frost-coat');
    expect(mods).not.toContain('ember-cell');
  });

  it('an eye takes out a duplicate bell, not a rare moth', () => {
    const g = newGame(11);
    g.player.slots = 6;
    g.player.core = 6;
    inst(g, 'stepper-relay');
    inst(g, 'map-spool');
    inst(g, 'choir-bell');
    inst(g, 'choir-bell');
    inst(g, 'suture-moth', { rarity: 'rare' });
    inst(g, 'spark-finger');
    g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'swap in pinhole eye');
    const mods = g.player.installed.map((i) => i.mod);
    expect(mods).toContain('pinhole-eye');
    expect(mods).toContain('suture-moth');
    expect(mods.filter((m) => m === 'choir-bell').length).toBe(1);
  });

  it('the kit card\'s fix frees power when power is what is short', () => {
    const g = newGame(11);
    g.player.slots = 8;
    g.player.core = 4;
    inst(g, 'stepper-relay');
    inst(g, 'map-spool');
    inst(g, 'thread-bell');
    inst(g, 'spark-finger');
    inst(g, 'choir-bell');
    const out = freeing(g, { mod: 'suture-moth' });
    expect(out).toBeTruthy();
    expect(out!.mod).not.toBe('thread-bell');
  });
});
