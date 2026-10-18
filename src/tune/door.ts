// The keeper's door (v2r1 ux + pace: `where` walked a new player straight into floor 1's keeper with the
// starting kit, and nothing said "you are not ready"). `where` now stops at the door of the boss room and
// weighs you against the keeper behind it: its hp and blows, your damage, and what is missing. The door is
// where the way in meets the room; you stand a cell outside it. src/ui/door.ts shows the keeper there too.

import { cell, Cell } from '../core/grid';
import { dist, say, tickHooks } from '../core/game';
import { active, def, MODS, param } from '../core/mods';
import type { Game, Line } from '../core/types';
import { BOSS, LOADOUTS, variantOf, type BossDef } from '../fight/bosses';
import { bossAt, bossDown, bossRoom, bossWoke, floorOf, inRoom, LAST, stairsChunk } from '../world/floors';
import { readiness } from '../world/zones';
import { dpsOf } from '../world/zonemath';
import { keeperDoor } from './hints';

export interface Door {
  /** the cell you stand on, a cell outside the room (a cell centre) */
  x: number;
  y: number;
  /** the way in, from there */
  dir: string;
}

/** the door of this floor's boss room nearest to (x, y): an open cell on the ring round the room */
export function doorOf(g: Game, f = floorOf(g), near = g.player): Door | null {
  if (f === LAST) return null;
  // only once its chunk is made: looking must never make one (the sims' runs stay as they were)
  const [cx, cy] = stairsChunk(g.seed, f);
  if (!g.chunks.has(`${cx},${cy}`)) return null;
  const [x0, y0, x1, y1] = bossRoom(g.seed, f);
  const floor = (x: number, y: number) => cell(g, x, y) === Cell.floor;
  let best: Door | null = null;
  let bestD = Infinity;
  const look = (x: number, y: number, dx: number, dy: number, dir: string) => {
    if (!floor(x, y)) return;
    // a cell further out when it is open, so you stand clear of the room's edge
    const [sx, sy] = floor(x - dx, y - dy) ? [x - dx, y - dy] : [x, y];
    const d = Math.hypot(sx + 0.5 - near.x, sy + 0.5 - near.y);
    if (d < bestD) [best, bestD] = [{ x: sx + 0.5, y: sy + 0.5, dir }, d];
  };
  for (let x = x0; x <= x1; x++) {
    look(x, y0 - 1, 0, 1, 's');
    look(x, y1 + 1, 0, -1, 'n');
  }
  for (let y = y0; y <= y1; y++) {
    look(x0 - 1, y, 1, 0, 'e');
    look(x1 + 1, y, -1, 0, 'w');
  }
  return best;
}

/** the floor's keeper, both bodies of a pair counted */
export function keeperOf(g: Game, f = floorOf(g)): { def: BossDef; name: string; hp: number; damage: number } {
  const d = variantOf(g, f);
  const mate = d.mate ? BOSS[d.mate] : undefined;
  return { def: d, name: mate ? 'the forge twins' : d.name, hp: d.hp + (mate?.hp ?? 0), damage: Math.max(d.damage, mate?.damage ?? 0) };
}

/** readiness with what is on counted even while it warms */
const warm = (g: Game): Game => ({ ...g, t: 1e9 });
/** your damage a second with what is on (haste counted) */
export function dpsNow(g: Game): number {
  const w = warm(g);
  const haste = 1 + active(w, 'body').reduce((s, i) => s + param<number>(i, 'haste', 0), 0);
  return dpsOf(active(w, 'weapon')) * haste;
}
/** the readiness of the loadout the keeper is balanced for (src/fight/bosses.ts LOADOUTS) */
function needOf(g: Game, f: number): number {
  const k = LOADOUTS[Math.max(0, Math.min(4, f))];
  const installed = k.mods.filter((m) => MODS[m]).map((mod, uid) => ({ uid, mod, on: true, readyAt: 0, data: {} }));
  const maxHp = 10 + k.flesh + installed.reduce((s, i) => s + Number(MODS[i.mod]?.params.hp ?? 0), 0);
  return readiness({ ...g, t: 1e9, player: { ...g.player, installed, maxHp } });
}

export interface Check {
  name: string;
  hp: number;
  damage: number;
  hint: string;
  dps: number;
  ready: boolean;
  /** what is missing, plain words */
  why: string[];
}

/** you against the keeper: ready when your readiness reaches most of what it is balanced for, a weapon is
 *  on and you are not hurt */
export function keeperCheck(g: Game, f = floorOf(g)): Check {
  const k = keeperOf(g, f);
  const p = g.player;
  const dps = dpsNow(g);
  const why: string[] = [];
  const armed = p.installed.some((i) => i.on && def(i).family === 'weapon');
  if (!armed) why.push('no weapon is on');
  else if (readiness(warm(g)) < needOf(g, f) * 0.8) {
    const ref = LOADOUTS[Math.max(0, Math.min(4, f))].mods.filter((m) => MODS[m]?.family === 'weapon').map((mod) => ({ mod }));
    why.push(dps < dpsOf(ref) * 0.7 ? 'your weapons are weak for it: find or print a stronger one, or a second' : 'you could not take its blows long: an altar (+hp) or armour first');
  }
  if (p.hp < p.maxHp * 0.7) why.push(`mend first (${Math.ceil(p.hp)}/${p.maxHp} hp)`);
  return { name: k.name, hp: k.hp, damage: k.damage, hint: k.def.hint, dps, ready: !why.length, why };
}

const secs = (s: number) => (s >= 90 ? `about ${Math.round(s / 60)} min` : `about ${Math.max(1, Math.round(s))} s`);

/** "the keeper: the bell, 100 hp, hits 3.2. you deal 0.8/s (about 2 min). you are not ready: ..." */
export function keeperLine(g: Game, f = floorOf(g)): Line[] {
  const c = keeperCheck(g, f);
  const d = doorOf(g, f);
  const kill = c.dps > 0 ? ` (${secs(c.hp / c.dps)} to bring it down)` : '';
  const head = `the keeper: ${c.name}, ${c.hp} hp, hits up to ${c.damage.toFixed(1)}. you deal ${c.dps.toFixed(1)}/s${kill}.`;
  const verdict: Line = c.ready
    ? ['ready. ', { text: 'save setup battle', cmd: 'save setup battle' }, ...(d ? ['  ', { text: 'go in', cmd: `go ${d.dir} 3` }] : [])]
    : [`you are not ready: ${c.why.join('; ')}. `, { text: 'save setup battle', cmd: 'save setup battle' }, ...(d ? ['  ', { text: 'go in anyway', cmd: `go ${d.dir} 3` }] : [])];
  return [[head], verdict];
}

/** standing at the door, before its keeper wakes */
export function atDoor(g: Game, r = 1.6): Door | null {
  const f = floorOf(g);
  if (f === LAST || bossDown(g, f) || bossWoke(g, f)) return null;
  const [bx, by] = bossAt(g.seed, f);
  if (Math.hypot(bx - g.player.x, by - g.player.y) > 12) return null;
  const d = doorOf(g, f);
  return d && dist(d, g.player) <= r && !inRoom(g.seed, f, g.player.x, g.player.y) ? d : null;
}

/** the first time you reach a floor's door, the console weighs you too */
const told = new WeakMap<Game, Set<number>>();
tickHooks.push((g) => {
  const f = floorOf(g);
  let s = told.get(g);
  if (s?.has(f) || !atDoor(g, 2.5)) return;
  if (!s) told.set(g, (s = new Set()));
  s.add(f);
  say(g, ...keeperLine(g, f));
});

Object.assign(keeperDoor, { at: atDoor, of: doorOf, line: keeperLine, ready: (g: Game, f: number) => keeperCheck(g, f).ready });
