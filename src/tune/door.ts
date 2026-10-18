// The keeper's door (v2r1 ux + pace: `where` walked a new player straight into floor 1's keeper with the
// starting kit, and nothing said "you are not ready"). `where` now stops at the door of the boss room and
// weighs you against the keeper behind it: its hp and blows, your damage, and what is missing. The door is
// where the way in meets the room; you stand a cell outside it. src/ui/door.ts shows the keeper there too.

import { cell, Cell, DIRS, open } from '../core/grid';
import { doorIn, walkPace } from '../mods/gait';
import { endTrip, route } from '../mods/pilot';
import { dist, say, tickHooks } from '../core/game';
import { instRef, VERBS, way } from '../core/verbs';
import { active, def, label, MODS, param } from '../core/mods';
import { freeing, makeRoom } from '../body';
import type { Game, Line } from '../core/types';
import { BOSS, LOADOUTS, variantOf, type BossDef } from '../fight/bosses';
import { bossAt, bossDown, bossRoom, bossWoke, floorOf, inRoom, LAST, stairsChunk } from '../world/floors';
import { readiness } from '../world/zones';
import { dpsOf } from '../world/zonemath';
import { keeperDoor } from './hints';
import { sealedEye } from '../world/secrets';
import { attuneCost, fleshCost, temperCost } from '../world/altar';
import { affords, fmt, glassTip, type Cost } from '../world/printer';

/** v2r5 newcomer (the door said "temper" with 0 copper): a price you cannot pay yet says how to get there */
const price = (g: Game, c: Cost): string => {
  if (affords(g, c)) return ` (${fmt(c)})`;
  const tip = glassTip(g, c).trim();
  return ` (${fmt(c)}; you are short${tip ? `: ${tip.replace(/^short of /, '').replace(/ short of /g, ' ')}` : ': gather more'})`;
};

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
  const installed = k.mods.filter((m) => MODS[m]).map((mod, uid) => ({ uid, mod, on: true, readyAt: 0, data: {}, roll: k.rolls?.[mod] }));
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
  /** ready, but thin: hp for less than half the fight at a newcomer's pace ('' when not); you can still go in */
  risky: string;
  /** a button that fixes one of them (swap in the armour you carry) */
  link?: { text: string; cmd: string };
}

/** you against the keeper: ready when your readiness reaches most of what it is balanced for, a weapon is
 *  on and you are not hurt */
export function keeperCheck(g: Game, f = floorOf(g)): Check {
  const k = keeperOf(g, f);
  const p = g.player;
  const dps = dpsNow(g);
  const why: string[] = [];
  let link: { text: string; cmd: string } | undefined;
  const armed = p.installed.some((i) => i.on && def(i).family === 'weapon');
  if (!armed) why.push('no weapon is on');
  else {
    const ratio = readiness(warm(g)) / needOf(g, f);
    if (ratio < 0.8) {
      // v2r3 ux: every blocker at once (one at a time sent him swapping back and forth on floor 2)
      const L = LOADOUTS[Math.max(0, Math.min(4, f))];
      const ref = L.mods.filter((m) => MODS[m]?.family === 'weapon').map((mod) => ({ mod, roll: L.rolls?.[mod] }));
      const hit = dps / Math.max(0.01, dpsOf(ref));
      const weak = hit < 0.7;
      // v2-balance3 (v2r3 fight): the keeper is balanced for a tempered weapon you carry plain: say so
      const plain = p.installed.find((i) => i.on && L.rolls?.[i.mod] && i.roll?.tag !== 'attuned' && i.roll?.tag !== 'tempered');
      const untempered = !!plain && hit < 0.85;
      if (untempered) why.push(plain.roll ? `temper your ${def(plain).name} at an altar first${price(g, temperCost(plain))}` : `attune your ${def(plain).name} at an altar first${price(g, attuneCost(plain))}`);
      else if (weak) why.push('your weapons are weak for it: find or print a stronger one, or a second');
      // what it can take: readiness is damage times toughness, so the toughness falls out of the two
      // v2r4 ux: armour you already carry is named ("armour first" with a frost coat in the bag)
      const coat = (m: { mod: string }) => (MODS[m.mod]?.params?.armour as number | undefined ?? 0) > 0;
      const off = p.installed.find((i) => !i.on && coat(i));
      const bag = p.inv.find((i) => i.kind === 'mod' && coat(i));
      const fix = off ? `turn on your ${def(off).name}` : bag && bag.kind === 'mod' ? `install the ${def(bag).name} you carry` : `an altar (+hp) or armour first${price(g, fleshCost(g))}`;
      // v2r5 run: "install the frost coat you carry" while `swap in` refused: a link that makes the room
      if (!off && bag && bag.kind === 'mod' && !link) {
        const room = makeRoom(g, bag, false, true);
        const out = typeof room === 'string' ? freeing(g, bag) : undefined;
        if (typeof room !== 'string') link = { text: `swap in ${def(bag).name}`, cmd: `swap in ${label(bag)}` };
        else if (out) link = { text: `swap ${def(out).name} for ${def(bag).name}`, cmd: `remove ${instRef(g, out)}; install ${label(bag)}` };
      }
      if (!(weak || untempered) || ratio / Math.max(0.01, hit) < 0.8) why.push(`you could not take its blows long: ${fix}`);
    }
  }
  if (p.hp < p.maxHp * 0.7) why.push(`mend first (${Math.ceil(p.hp)}/${p.maxHp} hp)`);
  // v2r5 newcomer (5 of 6 floor-1 doors said "ready" at 10-14 hp, and all 5 fights were lost): hp that would not last
  // the fight at a person's pace (boss-sim --human: winners lose about 8% of a blow a second) is not ready
  else if (armed && dps > 0) {
    const need = Math.ceil(k.damage * HUMAN_PACE * (k.hp / dps));
    if (p.hp < need) why.push(`about ${need - Math.floor(p.hp)} hp short for a fight this long: more hp (an altar's flesh, armour) or a stronger weapon`);
  }
  // v2r6 newcomer: "ready" at a bare 10 hp lost the bell and the warden (2-2.5 hp an exchange, 10 hp gone in ~25 s
  // of a 48 s fight): hp for less than half the fight at a newcomer's pace is risky, not ready, and not a "no"
  let risky = '';
  if (!why.length && dps > 0) {
    const half = Math.ceil(0.5 * k.damage * NEW_PACE * (k.hp / dps));
    if (p.hp < half) risky = `you'll likely need a retreat or two (hp for about ${Math.round((p.hp / half) * 50)}% of the fight; more hp or damage makes it one go)`;
  }
  return { name: k.name, hp: k.hp, damage: k.damage, hint: k.def.hint, dps, ready: !why.length, why, risky, ...(link && why.length ? { link } : {}) };
}

/** the share of a keeper's blow a newcomer loses a second (v2r6: 2-2.5 hp an exchange against the bell's 2.5) */
export const NEW_PACE = 0.2;

/** the share of a keeper's blow a person loses a second, in fights they win (boss-sim --human, floors 1-2) */
export const HUMAN_PACE = 0.08;

const secs = (s: number) => (s >= 90 ? `about ${Math.round(s / 60)} min` : `about ${Math.max(1, Math.round(s))} s`);

/** "the keeper: the bell, 100 hp, hits 3.2. you deal 0.8/s (about 2 min). you are not ready: ..." */
export function keeperLine(g: Game, f = floorOf(g)): Line[] {
  const c = keeperCheck(g, f);
  const d = doorOf(g, f);
  const kill = c.dps > 0 ? ` (${secs(c.hp / c.dps)} to bring it down)` : '';
  const head = `the keeper: ${c.name}, ${c.hp} hp, hits up to ${c.damage.toFixed(1)}. you deal ${c.dps.toFixed(1)}/s${kill}.`;
  const verdict: Line = c.ready
    ? [c.risky ? `risky: ${c.risky}. ` : 'ready. ', { text: 'save setup battle', cmd: 'save setup battle' }, ...(d ? ['  ', { text: 'go in', cmd: 'go in' }] : [])]
    : [`you are not ready: ${c.why.join('; ')}. `, ...(c.link ? [c.link, '  '] : []), { text: 'save setup battle', cmd: 'save setup battle' }, ...(d ? ['  ', { text: 'go in anyway', cmd: 'go in' }] : [])];
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

// ---- v2r2 fun: every walk stops at the door (map clicks, goto, go, the pilot, keys, the gyro heart), not
// only `where`'s. Going in takes `go in`, from the door card or the console. It runs before the room's wake
// hook (src/world/floors.ts): a step that would cross into the room is taken back to where you stood.

/** per game: the floor you chose to go in on (`go in`), and where you last stood outside the room */
const gate = new WeakMap<Game, { inOn: number; out: [number, number] | null; said: number }>();
const gateOf = (g: Game) => {
  let s = gate.get(g);
  if (!s) gate.set(g, (s = { inOn: -1, out: null, said: -99 }));
  return s;
};
/** the door is shut to walks: its keeper sleeps and you did not say `go in` */
export const shut = (g: Game, f = floorOf(g)): boolean => f !== LAST && !bossDown(g, f) && !bossWoke(g, f) && gateOf(g).inOn !== f;

// v2r5 run: `where` and walks routed through the shut room and stopped at its door for good: while it is shut,
// its cells are walls to every way that does not end inside it
way.block = (g, tx, ty) => {
  const f = floorOf(g);
  if (!shut(g, f) || inRoom(g.seed, f, tx + 0.5, ty + 0.5) || inRoom(g.seed, f, g.player.x, g.player.y)) return null;
  return (x, y) => inRoom(g.seed, f, x + 0.5, y + 0.5);
};

tickHooks.unshift((g) => {
  if (g.ended) return;
  const p = g.player;
  const f = floorOf(g);
  const s = gateOf(g);
  if (!inRoom(g.seed, f, p.x, p.y)) return void (s.out = [p.x, p.y]);
  if (!shut(g, f) || !s.out) return;
  [p.x, p.y] = s.out;
  p.path = [];
  p.move = null;
  endTrip(g);
  g.events.push({ type: 'door' });
  const d = doorOf(g, f);
  // a map walk's next leg bumps the door again at once: said once
  if (g.t - s.said < 3) return void (s.said = g.t);
  s.said = g.t;
  say(g, [`you stop at the keeper's door. `, { text: 'go in', cmd: 'go in' }, ' when you are ready.']);
  // the console's weighing too, the first time on this floor
  if (d && !told.get(g)?.has(f)) {
    if (!told.has(g)) told.set(g, new Set());
    told.get(g)!.add(f);
    say(g, ...keeperLine(g, f));
  }
});

/** `go in`: through the door you stand at, a few cells into the room, with whatever legs you have */
// v2r4 ux: from a few cells out it walks you to the door first (it refused, "the door stands open already",
// from 3 cells), and with the keeper awake it takes you back in through the open door
const doorNear = (g: Game): Door | null => {
  const f = floorOf(g);
  if (f === LAST || bossDown(g, f) || inRoom(g.seed, f, g.player.x, g.player.y)) return null;
  const d = doorOf(g, f);
  return d && dist(d, g.player) <= 5 ? d : null;
};
doorIn.at = (g) => !!doorNear(g);
doorIn.run = (g) => {
  const f = floorOf(g);
  const d = doorNear(g);
  if (!d) {
    // v2r5 run: `go in` typed at the first eye's cracked wall: the verb there is break
    const brk = VERBS.break;
    const eye = sealedEye(g);
    const nearEye = !!eye && Math.hypot(eye.x + eye.fx + 0.5 - g.player.x, eye.y + eye.fy + 0.5 - g.player.y) <= 5;
    if (brk && (!brk.when || brk.when(g) || nearEye)) return brk.run(g, []);
    return void say(g, bossWoke(g, f) || bossDown(g, f) ? 'the door stands open already.' : "go in where? you are not at a keeper's door.");
  }
  gateOf(g).inOn = f;
  const p = g.player;
  const [dx, dy] = DIRS[d.dir];
  // to the door's cell first (you may stand beside it), then three cells in
  const path: [number, number][] = [];
  const [sx, sy] = [Math.floor(p.x), Math.floor(p.y)];
  const [ex, ey] = [Math.floor(d.x), Math.floor(d.y)];
  if (sx !== ex || sy !== ey) path.push(...route(g, sx, sy, ex, ey, 12, false, true).path);
  for (let k = 1; k <= 3 && open(g, d.x + dx * k, d.y + dy * k); k++) path.push([d.x + dx * k, d.y + dy * k]);
  p.path = path;
  p.move = null;
  p.pace = walkPace(g);
  say(g, 'you go in.');
};

Object.assign(keeperDoor, { at: atDoor, of: doorOf, line: keeperLine, ready: (g: Game, f: number) => keeperCheck(g, f).ready, risky: (g: Game, f: number) => keeperCheck(g, f).risky });
