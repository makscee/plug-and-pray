// The body slice: how you move and what your body holds (DESIGN 3, 4, 5). Pure core, no DOM:
// the servo gait's steps, the gyro heart's free movement, the tunnel tongue's dig, slot boards,
// saved setups and the clock of hours' foresight. Keys and windows live in ./input.ts and ./views.ts.

import { dist, say, tickHooks } from '../core/game';
import { active, def, label, param, powerMax, powerUsed, switchOff, switchOn } from '../core/mods';
import { Cell, DIRS, cell, clear, dirAngle, setCell } from '../core/grid';
import { VERBS, findItem, verb } from '../core/verbs';
import type { Entity, Game } from '../core/types';
import { walk } from '../mods/gait';

const gaitWith = (g: Game, key: string) => active(g, 'gait').find((i) => param(i, key, false));

// ---- servo gait: an arrow key steps one cell that way and turns you with it

/** one servo step; quiet (keys call it, not the console). Returns false when nothing moved. */
export function servoStep(g: Game, d: string): boolean {
  const servo = gaitWith(g, 'keys');
  const v = DIRS[d];
  if (!servo || !v) return false;
  const p = g.player;
  p.dir = dirAngle(v[0], v[1]);
  // a held key repeats: keep at most one step queued behind the one under way
  if (p.path.length > 1) return false;
  p.move = null;
  p.pace = param<number>(servo, 'pace', 4);
  const n = walk(g, d, 1);
  if (n) g.events.push({ type: 'step' });
  return n > 0;
}

verb('step', {
  help: 'servo gait: step n (one cell, arrow keys do the same)',
  when: (g) => !!gaitWith(g, 'keys'),
  run(g, [d]) {
    if (!d || !DIRS[d[0]]) return say(g, 'step where? n e s w');
    if (!servoStep(g, d[0]) && !g.player.path.length) say(g, 'a wall.');
  },
});

// ---- gyro heart: free movement inside the cells, forward/back and strafe relative to your facing

/** fwd and side in -1..1 (W/S, D/A); sets player.move, or clears it without a working gyro heart */
export function gyroMove(g: Game, fwd: number, side: number): void {
  const p = g.player;
  const gyro = gaitWith(g, 'free');
  if (!gyro || (!fwd && !side)) {
    p.move = null;
    return;
  }
  p.path = p.path.slice(0, 1);
  const speed = param<number>(gyro, 'speed', 2.5);
  const fx = Math.sin(p.dir), fy = -Math.cos(p.dir);
  let vx = fwd * fx - side * fy;
  let vy = fwd * fy + side * fx;
  const r = Math.hypot(vx, vy) || 1;
  vx = (vx / r) * speed;
  vy = (vy / r) * speed;
  p.move = [vx, vy];
}

export const hasGyro = (g: Game): boolean => !!gaitWith(g, 'free');

/** mouse turn (radians); only with a working gyro heart */
export function gyroTurn(g: Game, by: number): void {
  if (!gaitWith(g, 'free')) return;
  const p = g.player;
  p.dir = (((p.dir + by) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

// a gyro heart switched off or removed mid-stride must not keep you sliding
tickHooks.push((g) => {
  if (g.player.move && !gaitWith(g, 'free')) g.player.move = null;
});

// ---- tunnel tongue: dig the wall cell in front into floor (plain wall only: not veins, not metal)

/** the cell in front, rounded to the nearest of n e s w */
export function front(g: Game): [number, number] {
  const p = g.player;
  const a = Math.round(p.dir / (Math.PI / 2)) & 3;
  const [dx, dy] = [DIRS.n, DIRS.e, DIRS.s, DIRS.w][a];
  return [Math.floor(p.x) + dx, Math.floor(p.y) + dy];
}

verb('dig', {
  help: 'tunnel tongue: turn the wall in front into floor',
  when: (g) => !!gaitWith(g, 'dig'),
  run(g) {
    const tongue = gaitWith(g, 'dig')!;
    const ready = (tongue.data.readyAt as number) ?? 0;
    if (g.t < ready) return say(g, 'the tongue is still grinding.');
    const [x, y] = front(g);
    const c = cell(g, x, y);
    if (c === Cell.floor) return say(g, 'nothing to dig: open ahead.');
    if (c !== Cell.wall) return say(g, 'too hard. the tongue slips off it.');
    setCell(g, x, y, Cell.floor);
    tongue.data.readyAt = g.t + param<number>(tongue, 'cooldown', 1);
    g.events.push({ type: 'dig', at: [x + 0.5, y + 0.5] });
    say(g, 'the tongue grinds through. the way ahead is open.');
  },
});

// ---- slot boards: installing a board adds a slot and uses the board up

export const MAX_SLOTS = 8;
const baseInstall = VERBS.install;
verb('install', {
  ...baseInstall,
  run(g, args) {
    const p = g.player;
    const it = p.inv[findItem(g, args)];
    const slots = it?.kind === 'mod' ? param<number>(it, 'slots', 0) : 0;
    if (!slots) return baseInstall.run(g, args);
    if (p.slots >= MAX_SLOTS) return say(g, `the motherboard is full: ${MAX_SLOTS} slots.`);
    p.inv.splice(p.inv.indexOf(it), 1);
    p.slots = Math.min(MAX_SLOTS, p.slots + Math.round(slots));
    g.events.push({ type: 'install' });
    say(g, `the board seats itself. slots ${p.installed.length}/${p.slots}.`);
  },
});

// ---- setups: a named set of modules that are on; `setup battle` turns on exactly that set

/** saved setups by name: module ids that were on */
export const setups = new WeakMap<Game, Record<string, string[]>>();
export const setupsOf = (g: Game): Record<string, string[]> => {
  let s = setups.get(g);
  if (!s) setups.set(g, (s = {}));
  return s;
};

export function saveSetup(g: Game, name: string): string[] {
  const on = g.player.installed.filter((i) => i.on).map((i) => i.mod);
  setupsOf(g)[name] = on;
  return on;
}

/** switch to a saved setup: off what is not in it, on what is (power first); returns problems */
export function useSetup(g: Game, name: string): string[] | null {
  const want = setupsOf(g)[name];
  if (!want) return null;
  const left = [...want];
  const keep = new Set<number>();
  for (const i of g.player.installed) {
    const k = left.indexOf(i.mod);
    if (k >= 0) {
      left.splice(k, 1);
      keep.add(i.uid);
    }
  }
  const errs: string[] = [];
  const isPower = (i: { mod: string }) => def(i).family === 'power';
  for (const i of g.player.installed) if (!keep.has(i.uid) && i.on && !isPower(i)) switchOff(g, i);
  for (const i of g.player.installed) if (keep.has(i.uid) && isPower(i)) switchOn(g, i);
  for (const i of g.player.installed) {
    if (!keep.has(i.uid) || isPower(i)) continue;
    const err = switchOn(g, i);
    if (err) errs.push(`${label(i)}: ${err}`);
  }
  for (const i of g.player.installed) if (!keep.has(i.uid) && i.on && isPower(i) && powerUsed(g) <= powerMax(g) - param<number>(i, 'power', 0)) switchOff(g, i);
  for (const m of left) errs.push(`${m.replace(/-/g, ' ')} is not installed`);
  return errs;
}

verb('save', {
  help: 'save setup battle: remember what is on now',
  run(g, [what, name]) {
    if (what !== 'setup' || !name) return say(g, 'save what? save setup battle');
    const on = saveSetup(g, name);
    say(g, [`setup ${name}: ${on.length ? on.map((m) => m.replace(/-/g, ' ')).join(', ') : 'nothing on'}. `, { text: `setup ${name}`, cmd: `setup ${name}` }]);
  },
});

verb('setup', {
  help: 'setup battle: turn on exactly that saved set',
  run(g, [name]) {
    const all = Object.keys(setupsOf(g));
    if (!name) {
      if (!all.length) return say(g, 'no setups saved. turn on what you want, then: save setup battle');
      return say(g, ['setups: ', ...all.flatMap((n, k) => [k ? '  ' : '', { text: n, cmd: `setup ${n}` }])]);
    }
    const errs = useSetup(g, name);
    if (!errs) return say(g, `no setup called ${name}.`);
    say(g, `setup ${name}: warming up.${errs.length ? ' ' + errs.join('; ') + '.' : ''}`);
  },
});

// ---- clock of hours: where enemies will be in about a second

const SEEN = 'clockSeen';

/** enemies' velocities, measured while a clock is on (so the sight slice can read them too) */
tickHooks.push((g, dt) => {
  if (!clocks(g).length || dt <= 0) return;
  for (const e of g.ents) {
    if (!e.enemy) continue;
    const d = e.enemy.data;
    const last = d[SEEN] as [number, number] | undefined;
    if (last) {
      const vx = (e.x - last[0]) / dt, vy = (e.y - last[1]) / dt;
      const old = (d.clockV as [number, number] | undefined) ?? [vx, vy];
      d.clockV = [old[0] * 0.7 + vx * 0.3, old[1] * 0.7 + vy * 0.3];
    }
    d[SEEN] = [e.x, e.y];
  }
});

const clocks = (g: Game) => active(g, 'mind').filter((i) => param<string>(i, 'what', '') === 'clock');

export interface Foresight {
  e: Entity;
  /** where it will be in `secs` */
  x: number;
  y: number;
}

/** where each enemy within the clock's range will be in `secs` (default the clock's own), slid to a stop at walls */
export function foresee(g: Game, secs?: number): Foresight[] {
  const c = clocks(g)[0];
  if (!c) return [];
  const range = param<number>(c, 'range', 8);
  const s = secs ?? param<number>(c, 'ahead', 1);
  const out: Foresight[] = [];
  for (const e of g.ents) {
    if (!e.enemy || dist(e, g.player) > range) continue;
    const [vx, vy] = (e.enemy.data.clockV as [number, number] | undefined) ?? [0, 0];
    let t = s;
    // shorten the jump until the straight line is open
    while (t > 0.05 && !clear(g, e.x, e.y, e.x + vx * t, e.y + vy * t)) t *= 0.6;
    if (t <= 0.05) t = 0;
    out.push({ e, x: e.x + vx * t, y: e.y + vy * t });
  }
  return out;
}
