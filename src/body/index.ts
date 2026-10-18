// The body slice: how you move and what your body holds (DESIGN 3, 4, 5). Pure core, no DOM:
// the servo gait's steps, the gyro heart's free movement, the tunnel tongue's dig, slot boards,
// saved setups and the clock of hours' foresight. Keys and windows live in ./input.ts and ./views.ts.

import { dist, say, tickHooks } from '../core/game';
import { active, def, label, param, powerMax, powerUsed, rarityOf, size, slotsUsed, switchOff, switchOn, traits, type Modish } from '../core/mods';
import { Cell, DIRS, cell, clear, dirAngle, setCell } from '../core/grid';
import { VERBS, addItem, findInst, findItem, instRef, verb } from '../core/verbs';
import type { Entity, Game, Inst } from '../core/types';
import { walk } from '../mods/gait';
import { MAX_CORE } from '../world/altar';

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
    // v2r3 fun: a typed step takes over a walk still under way (after `go in` it stayed refused)
    const p = g.player;
    if (p.path.length > 1) p.path = p.path.slice(0, 1);
    if (!servoStep(g, d[0]) && !p.path.length) say(g, 'a wall.');
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
    say(g, `the board seats itself. slots ${slotsUsed(g)}/${p.slots}.`);
  },
});

// v2r2 fun: a slot board found at the cap was dead loot. It folds into your core (+1 power), or into
// bone once the core is full, with a line saying so
tickHooks.push((g) => {
  const p = g.player;
  if (p.slots < MAX_SLOTS) return;
  const k = p.inv.findIndex((it) => it.kind === 'mod' && param<number>(it, 'slots', 0) > 0);
  if (k < 0) return;
  p.inv.splice(k, 1);
  if (p.core < MAX_CORE) {
    p.core++;
    say(g, `the slot board has no socket left (${MAX_SLOTS} is all the board takes). it melts into your core: +1 power, ${powerMax(g)} now.`);
  } else {
    addItem(g, { kind: 'res', res: 'bone', n: 4 });
    say(g, `the slot board has no socket left, and your core is full. it folds into bone: +4 bone.`);
  }
  g.events.push({ type: 'install' });
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
  // what it wants and you only carry goes in, out with what it does not want (off first) when slots are
  // full (playtest r2 pace: `setup travel` with the psalm carried switched everything off)
  const p = g.player;
  for (const m of [...left]) {
    const k = p.inv.findIndex((it) => it.kind === 'mod' && it.mod === m);
    if (k < 0) continue;
    while (slotsUsed(g) + size({ mod: m }) > p.slots) {
      const out = p.installed.filter((i) => !keep.has(i.uid) && !isPower(i)).sort((a, b) => Number(a.on) - Number(b.on))[0];
      if (!out) break;
      switchOff(g, out);
      p.installed = p.installed.filter((i) => i !== out);
      addItem(g, { kind: 'mod', mod: out.mod, ...traits(out) });
      g.events.push({ type: 'remove', data: out.uid });
    }
    if (slotsUsed(g) + size({ mod: m }) > p.slots) break;
    const [it] = p.inv.splice(k, 1);
    if (it.kind !== 'mod') continue;
    const inst: Inst = { uid: g.nextId++, mod: it.mod, ...traits(it), on: false, readyAt: 0, data: {} };
    p.installed.push(inst);
    if (!g.stats.mods.includes(it.mod)) g.stats.mods.push(it.mod);
    g.events.push({ type: 'install', data: inst.uid });
    keep.add(inst.uid);
    left.splice(left.indexOf(m), 1);
  }
  for (const i of g.player.installed) if (!keep.has(i.uid) && i.on && !isPower(i)) switchOff(g, i);
  for (const i of g.player.installed) if (keep.has(i.uid) && isPower(i)) switchOn(g, i);
  for (const i of g.player.installed) {
    if (!keep.has(i.uid) || isPower(i)) continue;
    const err = switchOn(g, i);
    if (err) errs.push(`${label(i)}: ${err}`);
  }
  for (const i of g.player.installed) if (!keep.has(i.uid) && i.on && isPower(i) && powerUsed(g) <= powerMax(g) - param<number>(i, 'power', 0)) switchOff(g, i);
  for (const m of left) errs.push(`${m.replace(/-/g, ' ')} is ${p.inv.some((it) => it.kind === 'mod' && it.mod === m) ? 'carried, no slot gives way' : 'not carried'}`);
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
  help: 'setup battle: turn on exactly that saved set, installing what you carry of it',
  run(g, [name]) {
    const all = Object.keys(setupsOf(g));
    if (!name) {
      if (!all.length) return say(g, 'no setups saved. turn on what you want, then: save setup battle');
      return say(g, ['setups: ', ...all.flatMap((n, k) => [k ? '  ' : '', { text: n, cmd: `setup ${n}` }])]);
    }
    // r4: `setup 1` is the first, as the 1-4 keys are
    if (/^\d$/.test(name) && !all.includes(name) && all[Number(name) - 1]) name = all[Number(name) - 1];
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

// ---- power runs short before slots do (docs/modules.md): the first time it refuses, point at setups

const hinted = new WeakSet<Game>();
for (const name of ['on', 'install']) {
  const base = VERBS[name];
  if (!base) continue;
  VERBS[name] = {
    ...base,
    run(g, args) {
      const n = g.log.length;
      const had = new Set(g.player.installed);
      base.run(g, args);
      if (!g.log.slice(n).some((l) => l.some((s) => (typeof s === 'string' ? s : s.text).includes('not enough power')))) return;
      // the refused module, and a button that makes room for it by the swap rule
      const inst = name === 'on' ? findInst(g, args, (i) => !i.on) : g.player.installed.find((i) => !had.has(i));
      const room = inst && !inst.on ? makeRoom(g, inst, true) : null;
      if (room && typeof room !== 'string' && inst) {
        const text = `turn off ${room.off.map((i) => label(i)).join(' and ')} and turn on ${label(inst)}`;
        say(g, ['or swap: ', { text, cmd: `swap in ${instRef(g, inst)}` }]);
      } else if (inst && !inst.on) {
        // r5: the swap rule found nothing (the pinhole is 0⚡︎, the map and the last weapon stay): name what
        // is short and offer the switch-offs that cover it, the map last, the last weapon never
        const short = def(inst).power - (powerMax(g) - powerUsed(g));
        const can = g.player.installed
          .filter((i) => i.on && i !== inst && def(i).power > 0 && def(i).family !== 'power' && !(weight(g, i) >= 9 && param<string>(i, 'what', '') !== 'map'))
          .sort((a, b) => weight(g, a) - weight(g, b) || def(b).power - def(a).power);
        const off: Inst[] = [];
        let left = short;
        for (const i of can) if (left > 0) off.push(i), (left -= def(i).power);
        const gen = hinted.has(g) ? ' a generator (the ember cell) gives +2.' : '';
        if (left <= 0 && off.length) {
          const text = `turn off ${off.map((i) => label(i)).join(' and ')} and turn on ${label(inst)}`;
          say(g, [`short ${short}⚡︎: `, { text, cmd: [...off.map((i) => `off ${instRef(g, i)}`), `on ${instRef(g, inst)}`].join('; ') }, '. your weapon stays on.' + gen]);
        } else say(g, `short ${short}⚡︎, and only your weapon could give it.` + gen);
      }
      if (hinted.has(g)) return;
      hinted.add(g);
      say(g, [
        'power runs out before slots do. switch something off, or keep two setups and swap: ',
        { text: 'save setup explore', cmd: 'save setup explore' },
        '  ',
        { text: 'save setup battle', cmd: 'save setup battle' },
        '. a generator (ember cell, votive battery) trades a slot for power.',
      ]);
    },
  };
}

// ---- install all: every carried module, until a slot or power runs out (the boot text's link, typed)

const oneInstall = VERBS.install;
verb('install', {
  ...oneInstall,
  help: 'put a module in a free slot: install pinhole eye, or install all',
  run(g, args) {
    if (args.join(' ') !== 'all') return oneInstall.run(g, args);
    const mods = g.player.inv.filter((i) => i.kind === 'mod');
    if (!mods.length) return say(g, 'you carry no modules.');
    for (const it of mods) {
      const n = g.log.length;
      oneInstall.run(g, label(it).split(' '));
      // the first refusal ends it: what it said is the one line about why
      if (g.log.slice(n).some((l) => l.some((s) => /no free slot|stays off|motherboard is full/.test(typeof s === 'string' ? s : s.text)))) break;
    }
  },
});

// ---- swap in (playtest r2): a module that does not fit makes room, by one rule. What weighs least
// gives way: off modules leave a slot first, then the lightest on ones that weigh no more than it.
// Eyes, power and the last legs never give way.

const WEIGHT: Partial<Record<string, number>> = { weapon: 4, body: 3, lamp: 3, scanner: 2, mind: 2, gait: 2, tool: 1 };
// v2r2 fun: a pilot is legs too (a pick took the psalm of roads, the only legs, for a weapon)
const legs = (i: { mod: string }) => def(i).family === 'gait' && ['go', 'keys', 'free', 'pilot'].some((k) => param(i, k, false));
// playtest r3: the map and the last weapon that is on never give way either (a swap took the map, and
// an eye's swap switched the only bell off mid-fight)
const weapon = (i: { mod: string }) => def(i).family === 'weapon';
function weight(g: Game, i: { mod: string }): number {
  if (legs(i) && !g.player.installed.some((o) => o !== i && o.on && legs(o))) return 9;
  if (param<string>(i, 'what', '') === 'map') return 9;
  if (weapon(i) && (i as Inst).on && !g.player.installed.some((o) => o !== i && o.on && weapon(o))) return 9;
  return WEIGHT[def(i).family] ?? 9;
}

/** r5: the installed module that gives way first when you take one out by hand (none: all weigh 9) */
export const lightest = (g: Game): Inst | undefined =>
  g.player.installed.filter((i) => def(i).family !== 'power' && def(i).family !== 'camera' && weight(g, i) < 9).sort((a, b) => weight(g, a) - weight(g, b) || +a.on - +b.on)[0];

const RANK: Record<string, number> = { common: 0, fine: 1, rare: 2, unique: 3 };
/** how good a module is within its family: rarity first, then tier (an eye: then its res) */
const worth = (m: Modish): number => RANK[rarityOf(m)] * 1000 + def(m).tier * 100 + (def(m).family === 'camera' ? Math.min(99, param<number>(m, 'res', 0) / 4) : 0);
// (another weapon as good gives way too: a nail psalm for the spark finger; never a copy)
const weaker = (i: Modish, it: Modish): boolean => worth(i) < worth(it) || (worth(i) === worth(it) && i.mod !== it.mod && def(it).family === 'weapon');
/** what never gives way to `it` (v2r2 fun: a pick took the only legs; an eye took a better eye):
 *  the last legs (unless `it` is legs), the map, and an eye that is not weaker than `it` (any eye for a non-eye) */
function kept(g: Game, i: Inst, it: { mod: string }): boolean {
  if (param<string>(i, 'what', '') === 'map') return true;
  if (legs(i) && !legs(it) && !g.player.installed.some((o) => o !== i && legs(o))) return true;
  if (def(i).family === 'camera') return def(it).family !== 'camera' ? !g.player.installed.some((o) => o !== i && o.on && def(o).family === 'camera' && worth(o) >= worth(i)) : !weaker(i, it);
  return false;
}

export interface Room {
  /** taken out for a slot */
  remove?: Inst;
  /** taken out too, when one slot is not enough (a module that takes two) */
  more?: Inst[];
  /** switched off for power */
  off: Inst[];
}

/** what to take out and switch off so `it` (carried, or installed and off) can be in and on; why not, if nothing can */
export function makeRoom(g: Game, it: { mod: string }, installed: boolean, last = false): Room | string {
  const p = g.player;
  const top = WEIGHT[def(it).family] ?? 9;
  const light = (i: Inst) => def(i).family !== 'power' && weight(g, i) < 9 && weight(g, i) <= top;
  let remove: Inst | undefined;
  const more: Inst[] = [];
  const need = installed ? 0 : slotsUsed(g) + size(it) - p.slots;
  if (need > 0) {
    const off = p.installed.filter((i) => !i.on && def(i).family !== 'power').sort((a, b) => weight(g, a) - weight(g, b));
    const on = p.installed.filter((i) => i.on && light(i)).sort((a, b) => weight(g, a) - weight(g, b) || def(b).power - def(a).power);
    // the weakest of its own family goes first (playtest r3: an eye took the map and kept the pinhole); an
    // eye only ever takes out a weaker eye (v2r2 fun: a fine dawn eye took out the rare vidicon)
    const fam = p.installed.filter((i) => def(i).family === def(it).family && def(i).family !== 'power' && weaker(i, it)).sort((a, b) => +a.on - +b.on || worth(a) - worth(b));
    // one that frees enough, in that order; else the first few until they do (v2: modules that take two).
    // Never the last legs, the map or a better eye (v2r2 fun)
    const order = [...new Set([...fam, ...off, ...on])].filter((i) => !kept(g, i, it));
    // an eye no better than the ones you wear asks first: it would take a slot from something else
    if (def(it).family === 'camera' && !fam.length && p.installed.some((i) => def(i).family === 'camera')) return `your eyes see better than ${def(it).name}: take something out by hand to wear it too.`;
    remove = order.find((i) => size(i) >= need);
    let freed = remove ? need : 0;
    if (!remove) for (const i of order) if (freed < need) (remove ? more.push(i) : (remove = i)), (freed += size(i));
    if (!remove || freed < need) return `no slot gives way for ${def(it).name}: all ${p.slots} hold what weighs more.`;
  }
  // v2r3 fun: new legs short of power replace the legs you walk on (swap in the penitent's heels refused:
  // the stepper was the last legs, so nothing could give way)
  if (!remove && !installed && legs(it) && !param(it, 'pilot', false) && def(it).power > powerMax(g) - powerUsed(g)) {
    remove = p.installed.filter((i) => i.on && legs(i) && !param(i, 'pilot', false)).sort((a, b) => worth(a) - worth(b))[0];
  }
  const out = remove ? [remove, ...more] : [];
  let short = def(it).power - (powerMax(g) - powerUsed(g)) - out.reduce((s, r) => s + (r.on ? def(r).power : 0), 0);
  const off: Inst[] = [];
  if (short > 0) {
    // v2r1 ux: an eye's power comes from another eye first (the fog of saints for the carrion eye: it
    // offered nothing, or the map); `last` (swap in): then the map, as the install hint offers it (r5)
    const cam = def(it).family === 'camera';
    const eye = (i: Inst) => cam && def(i).family === 'camera';
    const map = (i: Inst) => last && param<string>(i, 'what', '') === 'map';
    // v2r3 fun: weapons go last, after the map when an eye will be on (an eye's swap turned both weapons off
    // with mites near), and never the last weapon left on
    const seeing = cam || p.installed.some((i) => i.on && def(i).family === 'camera' && !out.includes(i));
    const w = (i: Inst) => (eye(i) ? 0 : map(i) ? (seeing ? 4.5 : 8) : weapon(i) ? 6 : weight(g, i));
    const armed = () => p.installed.filter((i) => i.on && weapon(i) && !out.includes(i) && !off.includes(i)).length;
    const spare = (i: Inst) => !weapon(i) || armed() > 1;
    const all = p.installed.filter((i) => i.on && !out.includes(i) && def(i).power > 0 && (light(i) || eye(i) || map(i)));
    // a weapon only when the rest cannot cover it
    const rest = all.filter((i) => !weapon(i));
    const can = rest.reduce((n, i) => n + def(i).power, 0) >= short ? rest : all;
    // one that frees enough, the lightest and cheapest; else the lightest, biggest first, until it fits
    const one = can.filter((i) => def(i).power >= short && spare(i)).sort((a, b) => w(a) - w(b) || def(a).power - def(b).power)[0];
    if (one) off.push(one), (short = 0);
    else
      for (const i of can.sort((a, b) => w(a) - w(b) || def(b).power - def(a).power)) {
        if (short <= 0) break;
        if (!spare(i)) continue;
        off.push(i);
        short -= def(i).power;
      }
    if (short > 0) return `not enough power for ${def(it).name}, and nothing lighter to switch off.`;
  }
  return more.length ? { remove, more, off } : { remove, off };
}

verb('swap', {
  help: 'swap in censer: make room for a module (off or out with what weighs least) and turn it on',
  run(g, args) {
    const words = args[0] === 'in' ? args.slice(1) : args;
    if (!words.length) return say(g, 'swap in what? swap in censer');
    const p = g.player;
    const inst = findInst(g, words, (i) => !i.on);
    const k = inst && !inst.on ? -1 : findItem(g, words);
    const it = k >= 0 ? p.inv[k] : inst;
    if (!it || ('kind' in it && it.kind !== 'mod')) return say(g, 'swap in what? a module you carry, or one installed and off.');
    if (it === inst && inst.on) return say(g, `${label(inst)} is on already.`);
    const room = makeRoom(g, it as { mod: string }, it === inst, true);
    if (typeof room === 'string') return say(g, room);
    const did: string[] = [];
    const inBag = new Set(p.inv);
    for (const r of room.remove ? [room.remove, ...(room.more ?? [])] : []) {
      switchOff(g, r);
      p.installed = p.installed.filter((i) => i !== r);
      addItem(g, { kind: 'mod', mod: r.mod, ...traits(r) });
      g.events.push({ type: 'remove', data: r.uid });
      did.push(`${label(r)} out`);
    }
    for (const o of room.off) {
      switchOff(g, o);
      did.push(`${label(o)} off`);
    }
    const why = did.length ? `; ${did.join('; ')}.` : '.';
    if (it === inst) {
      const err = switchOn(g, inst);
      return say(g, err ?? `${label(inst)} on${why}`);
    }
    const before = new Set(p.installed);
    // v2r3 ux: what came out takes the bag spot of what went in
    const back = p.inv.filter((o) => !inBag.has(o) && o.kind === 'mod');
    if (back.length && k >= 0) {
      p.inv = p.inv.filter((o) => !back.includes(o));
      p.inv.splice(Math.min(k, p.inv.length), 0, ...back);
    }
    oneInstall.run(g, words);
    const added = p.installed.find((i) => !before.has(i));
    if (added) say(g, `${label(added)} ${added.on ? 'on' : 'in, off'}${why}`);
  },
});

// playtest r3: `uninstall` is what a new player types for remove
if (VERBS.remove && !VERBS.uninstall) VERBS.uninstall = { ...VERBS.remove, help: 'the same as remove' };

// the power hint says "turn off X and turn on Y"; typed, that was "turn: unknown". `turn` reads it
if (!VERBS.turn)
  verb('turn', {
    help: 'turn off censer and turn on carrion eye: the same as off and on',
    run(g, args) {
      let mode = '';
      let name: string[] = [];
      const flush = () => {
        if (mode && name.length) VERBS[mode]?.run(g, name);
        name = [];
      };
      for (const w of args) {
        if (w === 'and' || w === 'turn') flush();
        else if ((w === 'on' || w === 'off') && !name.length) mode = w;
        else name.push(w);
      }
      flush();
      if (!mode) say(g, 'turn what? turn off censer, or turn on carrion eye. (face turns you)');
    },
  });
