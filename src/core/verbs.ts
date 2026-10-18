// Console commands: `verb(name, def)`. A module family adds its verbs in its own file and makes them
// available only while a module of it is on (`when`). Buttons anywhere type these same commands.

import { does } from '../mods/describe';
import { dist, itemName, reach, say, spawn, tickHooks } from './game';
import { DIRS, open } from './grid';
import { active, def, label, MODS, param, powerMax, powerUsed, size, slotsUsed, switchOff, switchOn, traits } from './mods';
import type { Entity, Game, Inst, Item, Line, Res, Seg } from './types';

export interface VerbDef {
  help: string;
  /** usable now? (a gait verb needs a gait on); hidden from help when not */
  when?: (g: Game) => boolean;
  /** r2 decide: what to say when `when` fails, if it knows better than "nothing installed" (no altar in reach) */
  whenFail?: (g: Game) => string | Line | null;
  run: (g: Game, args: string[]) => void;
}
export const VERBS: Record<string, VerbDef> = {};
export function verb(name: string, d: VerbDef): void {
  VERBS[name] = d;
}

/** run a typed line: echo it, then the verb; every line the game prints goes to g.log */
export function exec(g: Game, line: string): void {
  const words = line.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return;
  say(g, [{ text: '> ' + words.join(' '), cmd: '' }]);
  if (g.ended) return say(g, 'nothing answers.');
  const [v, ...args] = words;
  const d = VERBS[v];
  if (!d) return say(g, `${v}: unknown. try `, [{ text: 'help', cmd: 'help' }]);
  if (d.when && !d.when(g)) return say(g, warming(g, d) ?? d.whenFail?.(g) ?? `${v}: nothing installed can do that.`);
  d.run(g, args);
}

/** r4: a verb that would work once a warming module is warm says so ("stepper relay is warming up (1 s)") */
function warming(g: Game, d: VerbDef): string | null {
  const warm = g.player.installed.filter((i) => i.on && g.t < i.readyAt);
  if (!warm.length) return null;
  const was = warm.map((i) => i.readyAt);
  for (const i of warm) i.readyAt = g.t;
  let ok = false;
  try {
    ok = d.when!(g);
  } finally {
    warm.forEach((i, k) => (i.readyAt = was[k]));
  }
  if (!ok) return null;
  const i = warm.sort((a, b) => a.readyAt - b.readyAt)[0];
  return `${label(i)} is warming up (${Math.max(1, Math.ceil(i.readyAt - g.t))} s).`;
}

/** "2 cells se" and a [go there] button (stepper legs: across, then along) from you to the cell (x, y);
 *  `short`: stop a cell short on the last leg (a machine is used from beside it) */
export function goThere(g: Game, x: number, y: number, short = false): [string, Seg] {
  const p = g.player;
  const [i, j] = [Math.floor(p.x), Math.floor(p.y)];
  const [dx, dy] = [Math.floor(x) - i, Math.floor(y) - j];
  const leg = (d: string, n: number, last: boolean) => `go ${d} ${Math.abs(n) - (last && short ? 1 : 0)}`;
  // the leg order whose corner cell is open
  const xFirst = !dy || (!!dx && open(g, i + dx, j));
  const legs = [xFirst ? ['x', dx] : ['y', dy], xFirst ? ['y', dy] : ['x', dx]]
    .filter(([, n]) => n)
    .map(([a, n], k, all) => leg(a === 'x' ? ((n as number) > 0 ? 'e' : 'w') : (n as number) > 0 ? 's' : 'n', n as number, k === all.length - 1))
    .filter((c) => !c.endsWith(' 0'));
  const word = (dy < 0 ? 'n' : dy > 0 ? 's' : '') + (dx > 0 ? 'e' : dx < 0 ? 'w' : '');
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  return [`${n} cell${n === 1 ? '' : 's'} ${word || 'here'}`, { text: 'go there', cmd: legs.join('; ') }];
}

/** r4: "bone listener" finds "bone-listener" */
const flat = (s: string) => s.replace(/-/g, ' ');
/** an inventory item whose name contains the words, e.g. "pinhole", "pinhole eye" */
export function findItem(g: Game, args: string[]): number {
  const q = flat(args.join(' '));
  if (!q) return -1;
  return g.player.inv.findIndex((it) => flat(itemName(it)).includes(q));
}
export function findInst(g: Game, args: string[], prefer?: (i: Inst) => boolean): Inst | undefined {
  // two of the same: `off spark finger 2` is the second (what a window's dot and the panel type)
  const nth = args.length > 1 && /^\d+$/.test(args[args.length - 1]) ? Number(args[args.length - 1]) : 0;
  const q = (nth ? args.slice(0, -1) : args).join(' ');
  if (!q) return undefined;
  if (nth) {
    const same = g.player.installed.filter((i) => label(i) === q);
    if (same[nth - 1]) return same[nth - 1];
  }
  const all = g.player.installed.filter((i) => flat(label(i)).includes(flat(q)));
  return (prefer && all.find(prefer)) || all[0];
}
/** the words that name this one installed module: its label, and its place among same-named ones */
export function instRef(g: Game, inst: Inst): string {
  const same = g.player.installed.filter((i) => label(i) === label(inst));
  return same.length > 1 ? `${label(inst)} ${same.indexOf(inst) + 1}` : label(inst);
}

/** the button for an inventory item: what a click on it does */
function itemButton(it: Item): Line {
  const n = itemName(it);
  // r4 final: the power it uses, on the same line (take, inv)
  if (it.kind === 'mod') return [{ text: n, cmd: `install ${def(it).name}` }, `  ${it.rarity === 'unique' ? '✦ unique ' : ''}${def(it).family}${def(it).family === 'power' || !def(it).power ? '' : ` · ${def(it).power}p`}`];
  if (it.kind === 'card') return [{ text: n, cmd: `read card` }];
  return [n];
}

export function addItem(g: Game, it: Item): void {
  if (it.kind === 'res') {
    const have = g.player.inv.find((x) => x.kind === 'res' && x.res === it.res);
    if (have && have.kind === 'res') return void (have.n += it.n);
  }
  g.player.inv.push(it);
}

/** verbs help and the actions bar never list (test runs only) */
const HIDDEN = new Set(['conjure']);
/** verbs a key does (t, p): help lists them, the actions bar does not */
const KEYED = new Set(['tidy', 'pause']);

verb('help', {
  help: 'the goal, the keys and what you can do: help, help go',
  run(g, [v]) {
    if (v) {
      const d = VERBS[v];
      if (!d || HIDDEN.has(v)) return say(g, [`${v}: no such verb. `, { text: 'help', cmd: 'help' }]);
      return say(g, `${v}: ${d.help}${d.when && !d.when(g) ? ' (nothing installed can do it now)' : ''}`);
    }
    // the verbs first, the goal and the keys last, so a short console shows those
    const ok = Object.keys(VERBS).filter((v) => !HIDDEN.has(v) && (!VERBS[v].when || VERBS[v].when!(g)));
    say(g, ok.flatMap((v, k) => (k ? ['  ', { text: v, cmd: v }] : [{ text: v, cmd: v }])) as Line);
    say(
      g,
      ['help <verb> tells one: ', { text: 'help go', cmd: 'help go' }],
      'the goal: go down. four floors, each with a keeper in the room before its stairs: kill it, then descend.',
      'under the furnace lies the heart. kill its keeper and the god thaws. a memory card points the way down.',
      'keys: arrows or wasd walk · q e turn · t tidies windows · p pauses · 1-4 setups · esc leaves the console, enter comes back',
    );
  },
});

verb('inv', {
  help: 'what you carry',
  run(g) {
    if (!g.player.inv.length) return say(g, 'you carry nothing.');
    for (const it of g.player.inv) say(g, itemButton(it));
  },
});

verb('take', {
  help: 'take what is within reach: take (or take all), take pinhole',
  run(g, args) {
    // `take all` is `take` (the nearby panel's button says so)
    const q = args.join(' ') === 'all' ? '' : args.join(' ');
    const near = reach(g).filter((e) => !q || itemName(e.item!).includes(q));
    if (!near.length) return say(g, q ? `no ${q} within reach.` : 'nothing within reach.');
    for (const e of near) {
      if (e.data?.mimic) continue; // a mimic is an enemy dressed as loot (fight slice wakes it)
      g.ents = g.ents.filter((x) => x !== e);
      addItem(g, e.item!);
      g.events.push({ type: 'take', at: [e.x, e.y] });
      const it = e.item!;
      if (it.kind === 'mod') say(g, ['you take: ', ...itemButton(it)], `  ${does(it)}`);
      else say(g, ['you take: ', ...itemButton(it)]);
    }
  },
});

/** resource piles come up as you walk onto their cell (playtest r3: piles lay a cell off the route,
 *  unseen); one line, counting up while more come within a few seconds ("+2 bone, +1 glass").
 *  modules stay a choice: `take` */
const picked = new WeakMap<Game, { line: Line; t: number; got: [Res, number][] }>();
export function pickUp(g: Game): void {
  const p = g.player;
  const [i, j] = [Math.floor(p.x), Math.floor(p.y)];
  const piles = g.ents.filter((e) => e.kind === 'item' && e.item?.kind === 'res' && !e.data?.mimic && Math.floor(e.x) === i && Math.floor(e.y) === j);
  if (!piles.length) return;
  let m = picked.get(g);
  if (!m || g.t - m.t > 3 || g.log[g.log.length - 1] !== m.line) {
    m = { line: [''], t: g.t, got: [] };
    say(g, m.line);
    picked.set(g, m);
  }
  m.t = g.t;
  for (const e of piles) {
    const it = e.item as Extract<Item, { kind: 'res' }>;
    g.ents = g.ents.filter((x) => x !== e);
    addItem(g, { ...it });
    g.events.push({ type: 'take', at: [e.x, e.y] });
    const have = m.got.find(([r]) => r === it.res);
    if (have) have[1] += it.n;
    else m.got.push([it.res, it.n]);
  }
  m.line[0] = m.got.map(([r, n]) => `+${n} ${r}`).join(', ');
}
tickHooks.push(pickUp);

verb('drop', {
  help: 'leave an item here',
  run(g, args) {
    const k = findItem(g, args);
    if (k < 0) return say(g, 'you carry no such thing.');
    const [it] = g.player.inv.splice(k, 1);
    spawn(g, { kind: 'item', x: g.player.x, y: g.player.y, item: it });
    say(g, `dropped ${itemName(it)}.`);
  },
});

verb('install', {
  help: 'put a module in a free slot: install pinhole eye',
  run(g, args) {
    const p = g.player;
    const k = findItem(g, args);
    const it = p.inv[k];
    if (!it || it.kind !== 'mod') return say(g, 'no such module in your inventory. ', [{ text: 'inv', cmd: 'inv' }]);
    if (slotsUsed(g) + size(it) > p.slots) return say(g, size(it) > 1 ? `${def(it).name} takes ${size(it)} slots, ${p.slots - slotsUsed(g)} free. remove something, swap it in, or buy a slot at a printer.` : `no free slot (${p.slots}). remove something, swap it in, or buy a slot at a printer.`);
    p.inv.splice(k, 1);
    const inst: Inst = { uid: g.nextId++, mod: it.mod, ...traits(it), on: false, readyAt: 0, data: {} };
    p.installed.push(inst);
    if (!g.stats.mods.includes(it.mod)) g.stats.mods.push(it.mod);
    g.events.push({ type: 'install', data: inst.uid });
    const err = switchOn(g, inst);
    say(g, `installed ${label(inst)}.` + (err ? ` it stays off: ${err}.` : def(inst).warm ? ' warming up.' : ''));
  },
});

verb('remove', {
  help: 'take a module out of its slot',
  run(g, args) {
    const inst = findInst(g, args, (i) => i.on);
    if (!inst) return say(g, 'nothing installed by that name.');
    switchOff(g, inst);
    g.player.installed = g.player.installed.filter((i) => i !== inst);
    addItem(g, { kind: 'mod', mod: inst.mod, ...traits(inst) });
    g.events.push({ type: 'remove', data: inst.uid });
    say(g, `removed ${label(inst)}.`);
  },
});

verb('on', {
  help: 'switch a module on (it warms up first)',
  run(g, args) {
    // two of the same: `on` means the one that is off
    const inst = findInst(g, args, (i) => !i.on);
    if (!inst) return say(g, 'nothing installed by that name.');
    const err = switchOn(g, inst);
    say(g, err ?? `${label(inst)} warming up.`);
  },
});

verb('off', {
  help: 'switch a module off: frees its power',
  run(g, args) {
    const inst = findInst(g, args, (i) => i.on);
    if (!inst) return say(g, 'nothing installed by that name.');
    switchOff(g, inst);
    say(g, `${label(inst)} off.`);
  },
});

verb('status', {
  help: 'your body: hp, slots, power',
  run(g) {
    const p = g.player;
    say(g, `hp ${Math.ceil(p.hp)}/${p.maxHp}   slots ${slotsUsed(g)}/${p.slots}   power ${powerUsed(g)}/${powerMax(g)}`);
    for (const i of p.installed) say(g, [{ text: label(i), cmd: `${i.on ? 'off' : 'on'} ${def(i).name}` }, `  ${i.on ? (g.t >= i.readyAt ? 'on' : 'warming') : 'off'}  ${def(i).power}p`]);
  },
});

/** the first leg toward (x, y): a direction and up to 9 cells. A straight axis here; tune/hints.ts
 * swaps in the pilot's pathfinder over open floor, so the button walks round walls */
export const way = {
  leg(g: Game, x: number, y: number): [string, number] {
    const [dx, dy] = [x - g.player.x, y - g.player.y];
    const ax = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
    return [ax, Math.max(1, Math.min(9, Math.round(Math.max(Math.abs(dx), Math.abs(dy)))))];
  },
  /** the longest straight first leg (up to 9) that stays on a shortest way over open floor, else `leg`
   * (playtest r2 pace: the pathfinder's staircase gave 1-cell legs that turned back on themselves) */
  long(g: Game, x: number, y: number): [string, number] {
    const [sx, sy, tx, ty] = [Math.floor(g.player.x), Math.floor(g.player.y), Math.floor(x), Math.floor(y)];
    if (sx === tx && sy === ty) return way.leg(g, x, y);
    // steps to the target over open floor, from the target out (bounded around both ends)
    const pad = 12;
    const [x0, x1, y0, y1] = [Math.min(sx, tx) - pad, Math.max(sx, tx) + pad, Math.min(sy, ty) - pad, Math.max(sy, ty) + pad];
    const steps = new Map<string, number>([[tx + ',' + ty, 0]]);
    let ring: [number, number][] = [[tx, ty]];
    for (let d = 1; ring.length && !steps.has(sx + ',' + sy) && d < 120; d++) {
      const next: [number, number][] = [];
      for (const [cx, cy] of ring)
        for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const [nx, ny] = [cx + ex, cy + ey];
          const k = nx + ',' + ny;
          if (steps.has(k) || nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          if (!(nx === sx && ny === sy) && !open(g, nx + 0.5, ny + 0.5)) continue;
          steps.set(k, d);
          next.push([nx, ny]);
        }
      ring = next;
    }
    const total = steps.get(sx + ',' + sy);
    if (total === undefined) return way.leg(g, x, y);
    let best: [string, number] | null = null;
    for (const dir of ['n', 'e', 's', 'w']) {
      const [ex, ey] = DIRS[dir];
      let n = 0;
      // each step one nearer: still a shortest way
      while (n < 9 && steps.get(sx + ex * (n + 1) + ',' + (sy + ey * (n + 1))) === total - n - 1) n++;
      if (n && (!best || n > best[1])) best = [dir, n];
    }
    return best ?? way.leg(g, x, y);
  },
};

verb('listen', {
  help: 'what you hear around you',
  run(g) {
    const p = g.player;
    // a pack is told once, by its nearest (playtest r1: a lone mite and a swarm sounded the same)
    const pack = (e: { x: number; y: number }) => g.ents.filter((o) => o.enemy && dist(o, e) < 2.5).length;
    // things lying together are told once too, and a prop is heard only if it is an altar (r2 pace)
    const lying = (e: { x: number; y: number }) => g.ents.filter((o) => o.kind === 'item' && dist(o, e) < 2).length;
    const heard = (e: Entity) => e.kind !== 'prop' || !!e.data?.altar || !!e.data?.stairs;
    // v2 floors: the choir nave echoes, so you hear farther there
    const far = g.floor === 1 ? 16 : 10;
    const near = g.ents
      .filter((e) => dist(e, p) < far && heard(e))
      .sort((a, b) => dist(a, p) - dist(b, p))
      .filter((e, k, all) => (e.enemy ? pack(e) < 3 || !all.slice(0, k).some((o) => o.enemy && dist(o, e) < 2.5) : e.kind !== 'item' || !all.slice(0, k).some((o) => o.kind === 'item' && dist(o, e) < 2)));
    if (!near.length) return say(g, 'only the slow drip of something warm.');
    // compass words and cells, and a button for the next move (tuning #1328: "to the right" of a
    // facing you cannot see told a blind player nothing; crawl and go take compass words)
    const goes = active(g, 'gait').some((i) => param(i, 'go', false));
    for (const e of near.slice(0, 4)) {
      const [dx, dy] = [e.x - p.x, e.y - p.y];
      const r = dist(e, p);
      const how = r < 1.6 ? 'within reach' : `${Math.round(r)} cells`;
      const ang = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      const side = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round(ang / 45) % 8];
      // machines and altars have a sound of their own, so they are named
      const n = e.kind === 'item' ? lying(e) : 1;
      const what = e.enemy
        ? e.enemy.data.elite ? 'something large, keeping time' : pack(e) >= 3 ? `a swarm, ${pack(e)} or so` : 'something moving'
        : e.kind === 'printer' ? (e.data?.shop ? 'a reliquary humming' : 'a printer humming')
        : e.data?.stairs ? 'wind rising from below: the way down'
        : e.kind === 'prop' ? 'an altar, breathing slow'
        : n > 1 ? `things lying still ×${n}` : 'something lying still';
      // the longest first leg along a way there, not a straight axis into a wall (playtest r1, r2)
      const [ax, steps] = way.long(g, e.x, e.y);
      const cmd = r < 1.6 ? (e.kind === 'item' ? 'take' : '') : goes ? `go ${ax} ${steps}` : `crawl ${ax}`;
      say(g, [`${what}, ${how}${r < 1.6 ? '' : ', ' + side}.  `, ...(cmd ? [{ text: cmd, cmd }] : [])]);
    }
  },
});

/** for tests and the play script: every module in the table by id */
export const allMods = () => Object.keys(MODS);

/** verbs that need a word after them; the actions bar spells those out itself */
const ARGS = new Set(['take', 'drop', 'install', 'remove', 'on', 'off', 'go', 'crawl', 'face', 'step', 'print', 'save', 'setup', 'conjure', 'read', 'goto', 'buy', 'info', 'recycle', 'swap', 'uninstall']);
const ok = (g: Game, v: string) => !!VERBS[v] && (!VERBS[v].when || VERBS[v].when!(g));

export interface Action { label: string; cmd: string }
/** moves and the plain verbs open right now: the console's actions bar (items and modules have their own panels) */
export function actions(g: Game): [string, Action[]][] {
  const p = g.player;
  const a = (label: string, cmd = label): Action => ({ label, cmd });
  const cx = Math.floor(p.x) + 0.5;
  const cy = Math.floor(p.y) + 0.5;
  const run = (d: string) => {
    const [dx, dy] = DIRS[d];
    let n = 0;
    while (n < 9 && open(g, cx + dx * (n + 1), cy + dy * (n + 1))) n++;
    return n;
  };
  const move: Action[] = [];
  for (const d of ['n', 'e', 's', 'w']) {
    const n = run(d);
    if (!n) continue;
    if (ok(g, 'go')) move.push(a(`go ${d} ${n}`));
    else if (ok(g, 'step')) move.push(a(`step ${d}`));
    else move.push(a(`crawl ${d}`));
  }
  if (ok(g, 'stop') && p.path.length > 1) move.push(a('stop'));
  const other = Object.keys(VERBS).filter((v) => !ARGS.has(v) && !HIDDEN.has(v) && !KEYED.has(v) && v !== 'stop' && ok(g, v)).map((v) => a(v));
  const groups: [string, Action[]][] = [['move', move], ['other', other]];
  return groups.filter(([, xs]) => xs.length);
}
