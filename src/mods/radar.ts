// Radars (v2, Maks 10-18: "make it necessary to have different radars and scanners to locate different points of
// interest across the level"). A scanner with `finds` pings every `every` s and marks what it finds within `range`
// on your map (src/sight/know.ts), only as sure as it can tell:
//   thing  the sounding knell: "something" for any find, a blob `spread` cells wide, never what
//   cache  the hollow tap: a hollow wall or a warm plate, on its cell, "something sealed"; the bone glass names
//          what is kept there. A tapped shell can be broken (`break`) like one sonar heard
//   vein   the vein fork: every vein, its ore and size
//   life   the pulse choir: every heart, a blob that fades (they move), not whose
//   deep   the plumb line: the way down and what guards it, anywhere on the floor
// Nothing else marks these, so a floor's caches, veins and stairs stay off the map without the right finder.

import { CHUNK, cell, veinOf } from '../core/grid';
import { cells, ENEMIES, itemName, say, tickHooks } from '../core/game';
import { active, families, family, label, param } from '../core/mods';
import { hash, rng } from '../core/rng';
import type { Entity, Game, Inst, Line } from '../core/types';
import { mark, marks, unmark, type Mark, type MarkKind } from '../sight/know';
import { secrets, type Secret } from '../world/secrets';
import { lootMod } from '../world/spawn';
import { view, VIEWS } from '../ui/views';
import '../sight/scanner';

export type Finds = 'thing' | 'cache' | 'vein' | 'life' | 'deep';
const finds = (inst: { mod: string }) => param<string>(inst, 'finds', '') as Finds | '';
export const radars = (g: Game): Inst[] => active(g, 'scanner').filter((i) => finds(i));

/** the way down and what keeps it: stairs and bosses as the floors slice places them (data.stairs, data.boss),
 *  the zone elites and the thaw engine until then. Other slices can add their own here */
export const deepHooks: ((g: Game) => { e: Entity; kind: 'stairs' | 'boss'; what: string }[])[] = [];
export function deepOnes(g: Game): { e: Entity; kind: 'stairs' | 'boss'; what: string }[] {
  const out: { e: Entity; kind: 'stairs' | 'boss'; what: string }[] = [];
  for (const e of g.ents) {
    if (e.data?.stairs) out.push({ e, kind: 'stairs', what: typeof e.data.stairs === 'string' ? e.data.stairs : 'the way down' });
    else if (e.enemy && (e.enemy.data.boss || e.enemy.data.elite)) out.push({ e, kind: 'boss', what: ENEMIES[e.enemy.type]?.name ?? 'a guardian' });
    else if (e.data?.boss) out.push({ e, kind: 'boss', what: String(e.data.boss) });
    else if (e.item?.kind === 'mod' && e.item.mod === 'thaw-engine') out.push({ e, kind: 'stairs', what: 'the thaw engine' });
  }
  for (const f of deepHooks) out.push(...f(g));
  return out;
}

/** what a secret keeps: the module its payout rolls first (src/world/secrets.ts pay), named */
export function keptIn(g: Game, s: Secret): string {
  const r = rng(hash(g.seed, 93, s.x, s.y));
  const far = Math.hypot(Math.floor(s.x / CHUNK), Math.floor(s.y / CHUNK));
  return itemName(lootMod(r, far + 1.5));
}

/** a blob's centre: the thing, nudged by a fixed amount for this thing, so the blob holds it but does not centre on it */
function nudge(g: Game, key: string, x: number, y: number, spread: number): [number, number] {
  if (!spread) return [x, y];
  const r = rng(hash(g.seed, 77, ...[...key].map((c) => c.charCodeAt(0))));
  const a = r() * Math.PI * 2;
  const d = r() * spread * 0.7;
  return [x + Math.cos(a) * d, y + Math.sin(a) * d];
}

/** one ping: mark everything this radar finds now, and forget its old marks that are gone */
export function ping(g: Game, inst: Inst): Mark[] {
  const p = g.player;
  const range = param<number>(inst, 'range', 20);
  const spread = param<number>(inst, 'spread', 0);
  const names = param<boolean>(inst, 'names', false);
  const kind = finds(inst);
  const near = (x: number, y: number) => Math.hypot(x - p.x, y - p.y) <= range;
  const found: Mark[] = [];
  const put = (key: string, k: MarkKind, x: number, y: number, what: string, info: string, ttl?: number) => {
    const [mx, my] = nudge(g, key, x, y, spread);
    const m: Mark = { key, kind: k, x: mx, y: my, r: spread, what, info, at: g.t, ttl, by: inst.mod };
    mark(g, m);
    found.push(m);
  };
  const open = (s: Secret) => !s.done;
  if (kind === 'thing') {
    for (const e of g.ents) {
      if (!near(e.x, e.y)) continue;
      const it = e.kind === 'printer' || e.data?.altar || (e.item && e.item.kind !== 'res') || e.data?.stairs || e.enemy?.data.boss || e.enemy?.data.elite;
      if (it) put(`thing:${e.id}`, 'thing', e.x, e.y, 'something', 'the knell rang back from somewhere in here. it cannot say what.');
    }
    for (const s of secrets(g)) if (open(s) && near(s.x + 0.5, s.y + 0.5)) put(`thing:s${s.x},${s.y}`, 'thing', s.x + 0.5, s.y + 0.5, 'something', 'the knell rang back from somewhere in here. it cannot say what.');
  } else if (kind === 'cache') {
    for (const s of secrets(g)) {
      if (!open(s) || s.kind === 'script' || !near(s.x + 0.5, s.y + 0.5)) continue;
      const shell = s.kind === 'hollow';
      // a tapped shell is as good as a heard one: break works on it (src/world/secrets.ts)
      if (shell) s.found = true;
      const what = names ? `${shell ? 'sealed niche' : 'warm cache'}: ${keptIn(g, s)}` : shell ? 'something behind this wall' : 'something under the floor';
      const info = shell
        ? `a hollow wall. stand beside it and break it (any weapon), or dig.${names ? ` inside: ${keptIn(g, s)} and a little ore.` : ' the tap cannot say what is inside.'}`
        : `a warm plate in the floor: stand on it.${names ? ` under it: ${keptIn(g, s)}.` : ' the tap cannot say what is under it.'}`;
      put(`cache:${s.x},${s.y}`, 'cache', s.x + 0.5, s.y + 0.5, what, info);
    }
    for (const m of marks(g)) if (m.key.startsWith('cache:') && !secrets(g).some((s) => open(s) && m.key === `cache:${s.x},${s.y}`)) unmark(g, m.key);
  } else if (kind === 'vein') {
    // one mark per vein: the flood of touching vein cells of one ore, marked at its cell nearest you
    const done = new Set<string>();
    const R = Math.ceil(range);
    const [px, py] = [Math.floor(p.x), Math.floor(p.y)];
    for (const m of marks(g)) if (m.key.startsWith('vein:') && near(m.x, m.y) && !veinOf(cell(g, Math.floor(m.x), Math.floor(m.y)))) unmark(g, m.key);
    for (let y = py - R; y <= py + R; y++)
      for (let x = px - R; x <= px + R; x++) {
        const res = veinOf(cell(g, x, y));
        if (!res || done.has(`${x},${y}`) || !near(x + 0.5, y + 0.5)) continue;
        const flood: [number, number][] = [[x, y]];
        done.add(`${x},${y}`);
        for (let k = 0; k < flood.length && flood.length < 40; k++)
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const [nx, ny] = [flood[k][0] + dx, flood[k][1] + dy];
            if (done.has(`${nx},${ny}`) || veinOf(cell(g, nx, ny)) !== res) continue;
            done.add(`${nx},${ny}`);
            flood.push([nx, ny]);
          }
        const [bx, by] = flood.reduce((a, b) => (Math.hypot(b[0] - px, b[1] - py) < Math.hypot(a[0] - px, a[1] - py) ? b : a));
        const [kx, ky] = flood.reduce((a, b) => (b[1] < a[1] || (b[1] === a[1] && b[0] < a[0]) ? b : a));
        for (const m of marks(g)) if (m.key.startsWith('vein:') && m.key !== `vein:${kx},${ky}` && flood.some(([fx, fy]) => Math.floor(m.x) === fx && Math.floor(m.y) === fy)) unmark(g, m.key);
        put(`vein:${kx},${ky}`, 'vein', bx + 0.5, by + 0.5, names ? `${res} vein` : 'a vein', `${res} vein, ${cells(flood.length)} of ore. a leech needle or bone auger beside it drains it.`);
      }
  } else if (kind === 'life') {
    for (const e of g.ents) {
      if (!e.enemy || !near(e.x, e.y)) continue;
      put(`life:${e.id}`, 'life', e.x, e.y, names ? ENEMIES[e.enemy.type]?.name ?? 'something alive' : 'something alive', 'a heart the choir heard. it moves; the mark fades.', param<number>(inst, 'every', 2) * 1.6);
    }
  } else if (kind === 'deep') {
    for (const m of marks(g)) if (m.key.startsWith('deep:') && !g.ents.some((e) => m.key === `deep:${e.id}`)) unmark(g, m.key);
    for (const d of deepOnes(g)) {
      if (!near(d.e.x, d.e.y)) continue;
      const info = d.kind === 'stairs' ? `${d.what}. the way on from this floor.` : `${d.what}: what keeps the way down. the stairs stay shut until it falls.`;
      put(`deep:${d.e.id}`, d.kind, d.e.x, d.e.y, d.what, info);
    }
  }
  return found;
}

/** "12 cells se" */
export function toward(g: Game, x: number, y: number): string {
  const p = g.player;
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(x - p.x, -(y - p.y)) * 180) / Math.PI + 360) % 360) / 45) % 8];
  return `${cells(Math.round(Math.hypot(x - p.x, y - p.y)))} ${word}`;
}

const NOUN: Record<Finds, string> = { thing: 'something', cache: 'cache', vein: 'vein', life: 'heart', deep: 'way down' };
const told = new WeakMap<Game, Set<string>>();

tickHooks.push((g) => {
  for (const inst of radars(g)) {
    const every = param<number>(inst, 'every', 5);
    if (g.t < ((inst.data.pingAt as number) ?? 0)) continue;
    inst.data.pingAt = g.t + every;
    const got = ping(g, inst);
    inst.data.found = got.length;
    // the first ping says what it found, once per module, with the nearest one's bearing
    let t = told.get(g);
    if (!t) told.set(g, (t = new Set()));
    if (t.has(inst.mod)) continue;
    t.add(inst.mod);
    const k = finds(inst) as Finds;
    const p = g.player;
    const best = got.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    const line: Line = [
      best
        ? `the ${label(inst)}: ${got.length} ${got.length === 1 ? NOUN[k] : NOUN[k] === 'something' ? 'somethings' : NOUN[k] === 'way down' ? 'ways' : NOUN[k] + 's'} on your map; the nearest, ${best.what}, ${toward(g, best.x, best.y)}.`
        : `the ${label(inst)}: nothing within ${cells(param<number>(inst, 'range', 20) | 0)} yet. it keeps listening.`,
    ];
    say(g, line);
  }
});

// status and the window: a radar says what it has marked, the three nearest in words (useful with no map at all)
const prev = families.scanner;
family('scanner', {
  ...prev,
  status(g, inst) {
    if (!finds(inst)) return prev?.status?.(g, inst) ?? [];
    return [[`${(inst.data.found as number) ?? 0} marked on your map; it pings every ${param<number>(inst, 'every', 5)} s.`]];
  },
});

/** the marks this radar placed, nearest first */
export const placed = (g: Game, inst: Inst): Mark[] =>
  marks(g)
    .filter((m) => m.by === inst.mod)
    .sort((a, b) => Math.hypot(a.x - g.player.x, a.y - g.player.y) - Math.hypot(b.x - g.player.x, b.y - g.player.y));

const prevView = VIEWS.scanner;
view('scanner', (el, inst, g) => {
  if (!finds(inst)) return prevView ? prevView(el, inst, g) : { update() {} };
  const bar = document.createElement('div');
  bar.className = 'radar-sweep';
  const fill = document.createElement('i');
  bar.append(fill);
  const list = document.createElement('div');
  list.className = 'radar-list';
  el.append(bar, list);
  let last = '';
  let next = 0;
  return {
    update(g: Game) {
      const warm = inst.on && g.t >= inst.readyAt;
      const every = param<number>(inst, 'every', 5);
      const left = Math.max(0, ((inst.data.pingAt as number) ?? 0) - g.t);
      fill.style.width = warm ? `${Math.round(100 * (1 - left / every))}%` : '0%';
      if (g.t < next) return;
      next = g.t + 0.4;
      const rows = warm ? placed(g, inst).slice(0, 3).map((m) => `${m.what} · ${toward(g, m.x, m.y)}`) : [];
      const sig = rows.join('|') + warm;
      if (sig === last) return;
      last = sig;
      list.replaceChildren();
      const head = document.createElement('p');
      head.className = 'flavour';
      head.textContent = !warm ? (inst.on ? 'warming…' : 'off') : rows.length ? `${placed(g, inst).length} on your map:` : 'nothing yet. it keeps listening.';
      list.append(head);
      for (const r of rows) {
        const p = document.createElement('p');
        p.textContent = r;
        list.append(p);
      }
    },
  };
});

/** test runs: the marks, so a play-through can point at one */
(globalThis as unknown as { thawMarks?: (g: Game) => Mark[] }).thawMarks = marks;
