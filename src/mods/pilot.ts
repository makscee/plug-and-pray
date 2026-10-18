// Pilots and waypoint logs (playtest 3: "modules that walk you around automatically, to a point on the
// map, and keep track of points of interest").
// A pilot is a gait with `pilot`: `goto x y` (or a click on the map) walks a path over cells you have
// seen; it lets go when you are struck or something new comes close. Params: plan (longest path, cells),
// pace (cells/s), avoid (paths around what it sees).
// A waypoint log is a mind module with what: 'log': it notes what you pass (keep: how many points,
// auto: which kinds, range: cells) and lists them with a go button. `mark name` adds your spot.

import { CHUNK, cell, chunkHook, open, veinOf } from '../core/grid';
import { dist, ENEMIES, say, spawn, tickHooks } from '../core/game';
import { active, families, family, param, working } from '../core/mods';
import { hash, rng } from '../core/rng';
import { exec, verb } from '../core/verbs';
import type { Entity, Game, Inst } from '../core/types';
import { view, VIEWS } from '../ui/views';
import { mapHooks } from '../world/mind';
import { floors } from '../world/gen';

// --- the pilot -----------------------------------------------------------------------------------

const pilots = (g: Game) => active(g, 'gait').filter((i) => param(i, 'pilot', false));
const pilot = (g: Game) => pilots(g).sort((a, b) => param<number>(b, 'plan', 0) - param<number>(a, 'plan', 0))[0];

const known = (g: Game, x: number, y: number) => g.seen.has(`${x},${y}`) && open(g, x + 0.5, y + 0.5);
const foes = (g: Game) => g.ents.filter((e) => e.kind === 'enemy' && e.enemy && !ENEMIES[e.enemy.type]?.hidden);

/** A* over seen floor (or any floor, `anyFloor`: the hints' first leg) from (sx, sy) toward (tx, ty), cells; the path's cells, or the nearest it got */
export function route(g: Game, sx: number, sy: number, tx: number, ty: number, plan: number, avoid = false, anyFloor = false): { path: [number, number][]; whole: boolean } {
  const k = (x: number, y: number) => `${x},${y}`;
  const danger = avoid ? foes(g).filter((e) => dist(e, { x: sx, y: sy }) < plan) : [];
  const cost = (x: number, y: number) => 1 + (danger.some((e) => Math.hypot(e.x - x - 0.5, e.y - y - 0.5) < 2.5) ? 6 : 0);
  const h = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty);
  const from = new Map<string, string>();
  const gs = new Map<string, number>([[k(sx, sy), 0]]);
  const openSet: [number, number, number][] = [[sx, sy, h(sx, sy)]];
  let best = [sx, sy];
  let bestH = h(sx, sy);
  let n = 0;
  while (openSet.length && n++ < 8000) {
    let bi = 0;
    for (let i = 1; i < openSet.length; i++) if (openSet[i][2] < openSet[bi][2]) bi = i;
    const [x, y] = openSet.splice(bi, 1)[0];
    const hx = h(x, y);
    if (hx < bestH) [best, bestH] = [[x, y], hx];
    if (x === tx && y === ty) break;
    const gx = gs.get(k(x, y))!;
    if (gx >= plan) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!(anyFloor ? open(g, nx + 0.5, ny + 0.5) : known(g, nx, ny))) continue;
      const ng = gx + cost(nx, ny);
      if (ng >= (gs.get(k(nx, ny)) ?? Infinity)) continue;
      gs.set(k(nx, ny), ng);
      from.set(k(nx, ny), k(x, y));
      openSet.push([nx, ny, ng + h(nx, ny)]);
    }
  }
  const path: [number, number][] = [];
  let at = k(best[0], best[1]);
  while (at !== k(sx, sy)) {
    const [x, y] = at.split(',').map(Number);
    path.unshift([x + 0.5, y + 0.5]);
    at = from.get(at)!;
  }
  return { path, whole: bestH === 0 };
}

interface Trip { to: [number, number]; near: Set<number>; hurtAt: number; inst: Inst }
const trips = new WeakMap<Game, Trip>();
export const trip = (g: Game) => trips.get(g);

function letGo(g: Game, why: string): void {
  trips.delete(g);
  const p = g.player;
  p.path = p.path.slice(0, 1);
  say(g, why);
}

/** start a trip to cell (tx, ty); false if the pilot cannot */
export function goto(g: Game, tx: number, ty: number): boolean {
  const inst = pilot(g);
  if (!inst) return say(g, 'no pilot answers.'), false;
  const p = g.player;
  const sx = Math.floor(p.x);
  const sy = Math.floor(p.y);
  if (sx === tx && sy === ty) return say(g, 'you are there.'), false;
  const plan = param<number>(inst, 'plan', 40);
  const { path, whole } = route(g, sx, sy, tx, ty, plan, param(inst, 'avoid', false));
  if (!path.length) return say(g, 'the pilot knows no way there. walk it once, or look at it.'), false;
  if (!whole && Math.abs(path[path.length - 1][0] - tx - 0.5) + Math.abs(path[path.length - 1][1] - ty - 0.5) > Math.abs(sx - tx) + Math.abs(sy - ty) - 2)
    return say(g, 'the pilot knows no way closer. walk some of it first.'), false;
  p.path = path;
  p.pace = param<number>(inst, 'pace', 2.5);
  trips.set(g, { to: [tx, ty], near: new Set(foes(g).filter((e) => dist(e, p) < 3.5).map((e) => e.id)), hurtAt: p.hurtAt, inst });
  say(g, whole ? `the pilot takes you: ${path.length} cells.` : `the pilot takes you as near as it knows: ${path.length} cells.`);
  return true;
}

tickHooks.push((g) => {
  const t = trips.get(g);
  if (!t) return;
  const p = g.player;
  if (!working(g, t.inst)) return letGo(g, 'the pilot goes quiet. you stop.');
  if (p.hurtAt > t.hurtAt) return letGo(g, 'struck. the pilot lets go.');
  const close = foes(g).find((e) => dist(e, p) < 3.5 && !t.near.has(e.id));
  if (close) return letGo(g, 'something close. the pilot lets go.');
  if (p.path.length && !open(g, p.path[0][0], p.path[0][1])) return letGo(g, 'the way is shut. the pilot lets go.');
  if (!p.path.length) {
    trips.delete(g);
    const [tx, ty] = t.to;
    say(g, Math.floor(p.x) === tx && Math.floor(p.y) === ty ? 'the pilot sets you down.' : 'the pilot sets you down, as near as it knew.');
  }
});

const gait = families.gait;
family('gait', {
  ...gait,
  buttons: (g, inst) => (param(inst, 'pilot', false) ? (trips.get(g) ? [{ label: 'stop', cmd: 'stop' }] : []) : gait?.buttons?.(g, inst) ?? []),
});

verb('goto', {
  help: 'the pilot walks you there: goto 12 -3 (cells), or goto printer (a waypoint), or click the map',
  when: (g) => !!pilot(g),
  run(g, args) {
    const [a, b] = args;
    if (a !== undefined && b !== undefined && !isNaN(Number(a)) && !isNaN(Number(b))) return void goto(g, Math.floor(Number(a)), Math.floor(Number(b)));
    const name = args.join(' ');
    const w = name && points(g).filter((m) => m.name.startsWith(name)).sort((x, y) => dist(x, g.player) - dist(y, g.player))[0];
    if (!w) return say(g, 'goto where? goto 12 -3, a waypoint name, or click the map.');
    goto(g, Math.floor(w.x), Math.floor(w.y));
  },
});

// `stop` belongs to the stepper; a pilot needs it too, and it ends the trip
verb('stop', {
  help: 'stop walking',
  when: (g) => active(g, 'gait').some((i) => param(i, 'go', false) || param(i, 'pilot', false)),
  run(g) {
    if (trips.get(g)) trips.delete(g);
    g.player.path = g.player.path.slice(0, 1);
  },
});

mapHooks.click.push((g, x, y) => {
  if (pilot(g)) exec(g, `goto ${x} ${y}`);
});

// --- the waypoint log ----------------------------------------------------------------------------

export interface Point { key: string; name: string; x: number; y: number; ent?: number; auto: boolean; at: number }

const logs = (g: Game) => active(g, 'mind').filter((i) => param<string>(i, 'what', '') === 'log');
const pointsOf = (inst: Inst): Point[] => ((inst.data.points ??= []) as Point[]);
/** every point in every working log, nearest first */
export function points(g: Game): Point[] {
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const i of logs(g)) for (const m of pointsOf(i)) if (!seen.has(m.key)) seen.add(m.key), out.push(m);
  return out.sort((a, b) => dist(a, g.player) - dist(b, g.player));
}

/** what an entity is worth noting as, by the log's auto kinds */
function kindOf(e: Entity): [string, string] | null {
  if (e.kind === 'printer') return ['printer', e.data?.shop ? 'shop printer' : 'printer'];
  if (e.kind !== 'item' || !e.item) return null;
  if (e.item.kind === 'card') return ['card', 'memory card'];
  if (e.item.kind === 'mod') return e.item.mod === 'card-reader' ? ['reader', 'card reader'] : ['mods', 'module'];
  if (e.item.kind === 'res') return ['res', e.item.res];
  return null;
}

function note(inst: Inst, g: Game, m: Omit<Point, 'at'>): void {
  const ps = pointsOf(inst);
  if (ps.some((o) => o.key === m.key)) return;
  ps.push({ ...m, at: g.t });
  const keep = param<number>(inst, 'keep', 8);
  while (ps.length > keep) {
    const i = ps.findIndex((o) => o.auto && o.key !== 'start');
    ps.splice(i < 0 ? 0 : i, 1);
  }
  if (m.auto && m.key !== 'start') say(g, [`log: ${m.name} noted, ${where(g, m)}.  `, { text: 'go', cmd: goCmd(g, m) }]);
}

const nextLook = new WeakMap<Inst, number>();
tickHooks.push((g) => {
  for (const inst of logs(g)) {
    if (!working(g, inst)) continue;
    if (g.t < (nextLook.get(inst) ?? 0)) continue;
    nextLook.set(inst, g.t + 0.5);
    const ps = pointsOf(inst);
    // forget what is gone: taken items, found vectors
    for (let i = ps.length - 1; i >= 0; i--) {
      const m = ps[i];
      if (m.ent !== undefined && !g.ents.some((e) => e.id === m.ent)) ps.splice(i, 1);
      else if (m.key.startsWith('vec:') && g.vectors.find((v) => `vec:${v.card}` === m.key)?.found) ps.splice(i, 1);
    }
    const auto = param<string[]>(inst, 'auto', []);
    const range = param<number>(inst, 'range', 8);
    const p = g.player;
    if (auto.includes('start')) note(inst, g, { key: 'start', name: 'where you woke', x: 8.5, y: 8.5, auto: true });
    for (const e of g.ents) {
      if (dist(e, p) > range) continue;
      const k = kindOf(e);
      if (!k || !auto.includes(k[0])) continue;
      note(inst, g, { key: `e:${e.id}`, name: k[1], x: e.x, y: e.y, ent: e.kind === 'item' ? e.id : undefined, auto: true });
    }
    if (auto.includes('vector'))
      for (const v of g.vectors) if (!v.found) note(inst, g, { key: `vec:${v.card}`, name: v.what, x: v.x, y: v.y, auto: true });
    if (auto.includes('veins')) {
      const r = Math.min(range, 6);
      for (let y = Math.floor(p.y) - r; y <= Math.floor(p.y) + r; y++)
        for (let x = Math.floor(p.x) - r; x <= Math.floor(p.x) + r; x++) {
          const v = veinOf(cell(g, x, y));
          if (!v || !g.seen.has(`${x},${y}`)) continue;
          if (ps.some((o) => o.name.endsWith('vein') && Math.hypot(o.x - x, o.y - y) < 5)) continue;
          note(inst, g, { key: `v:${x},${y}`, name: `${v} vein`, x: x + 0.5, y: y + 0.5, auto: true });
        }
    }
  }
});

const WORDS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
function where(g: Game, m: { x: number; y: number }): string {
  const p = g.player;
  const r = dist(m, p);
  if (r < 1.6) return 'here';
  const ang = ((Math.atan2(m.x - p.x, -(m.y - p.y)) * 180) / Math.PI + 360) % 360;
  return `${Math.round(r)} cells ${WORDS[Math.round(ang / 45) % 8]}`;
}
/** the button for a point: the pilot's goto, else the stepper's first leg toward it */
function goCmd(g: Game, m: { x: number; y: number }): string {
  if (pilot(g)) return `goto ${Math.floor(m.x)} ${Math.floor(m.y)}`;
  const p = g.player;
  const [dx, dy] = [m.x - p.x, m.y - p.y];
  const ax = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
  const n = Math.max(1, Math.min(9, Math.round(Math.max(Math.abs(dx), Math.abs(dy)))));
  return active(g, 'gait').some((i) => param(i, 'go', false)) ? `go ${ax} ${n}` : `crawl ${ax}`;
}

verb('mark', {
  help: 'note this spot in your waypoint log: mark den',
  when: (g) => logs(g).length > 0,
  run(g, args) {
    const inst = logs(g).find((i) => working(g, i));
    if (!inst) return say(g, 'the log is still warming.');
    const p = g.player;
    const name = args.join(' ') || `mark ${pointsOf(inst).filter((m) => !m.auto).length + 1}`;
    const x = Math.floor(p.x) + 0.5;
    const y = Math.floor(p.y) + 0.5;
    const ps = pointsOf(inst);
    ps.push({ key: `m:${x},${y}`, name, x, y, auto: false, at: g.t });
    const keep = param<number>(inst, 'keep', 8);
    while (ps.length > keep) ps.splice(Math.max(0, ps.findIndex((o) => o.auto)), 1);
    say(g, `log: ${name} marked.`);
  },
});

const mind = families.mind;
const isLog = (inst: Inst) => param<string>(inst, 'what', '') === 'log';
family('mind', {
  ...mind,
  tick: (g, inst, dt) => (isLog(inst) ? undefined : mind?.tick?.(g, inst, dt)),
  status: (g, inst) => (isLog(inst) ? [] : mind?.status?.(g, inst) ?? []),
  buttons: (g, inst) => (isLog(inst) ? [{ label: 'mark here', cmd: 'mark' }] : mind?.buttons?.(g, inst) ?? []),
});

const send = (cmd: string) => (window as unknown as { thaw: { send(c: string): void } }).thaw.send(cmd);
const prevView = VIEWS.mind;
view('mind', (el, inst, g) => {
  if (!isLog(inst)) return prevView ? prevView(el, inst, g) : { update() {} };
  const list = document.createElement('div');
  list.className = 'waypoints';
  el.append(list);
  let last = '';
  let next = 0;
  return {
    update(g: Game) {
      if (g.t < next) return;
      next = g.t + 0.3;
      const ps = working(g, inst) ? pointsOf(inst).slice().sort((a, b) => dist(a, g.player) - dist(b, g.player)) : [];
      const rows = ps.map((m) => [m.name, where(g, m), goCmd(g, m)] as const);
      const sig = JSON.stringify(rows) + inst.on;
      if (sig === last) return;
      last = sig;
      list.replaceChildren();
      if (!rows.length) {
        const p = document.createElement('p');
        p.className = 'flavour';
        p.textContent = working(g, inst) ? 'nothing noted yet.' : 'warming…';
        list.append(p);
      }
      for (const [name, at, cmd] of rows) {
        const row = document.createElement('div');
        row.className = 'wp';
        const a = document.createElement('span');
        a.textContent = name;
        const b = document.createElement('span');
        b.className = 'at';
        b.textContent = at;
        const go = document.createElement('button');
        go.textContent = cmd.startsWith('goto') ? 'go' : cmd;
        go.dataset.cmd = cmd;
        go.addEventListener('click', () => send(cmd));
        row.append(a, b, go);
        list.append(row);
      }
    },
  };
});

mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const t = trips.get(g);
  if (t) {
    ctx.fillStyle = '#f0a05088';
    for (const [x, y] of g.player.path) ctx.fillRect((x - ox) * px - 1, (y - oy) * px - 1, 2, 2);
  }
  for (const m of points(g)) {
    const x = (m.x - ox) * px;
    const y = (m.y - oy) * px;
    if (x < 0 || y < 0 || x > ctx.canvas.width || y > ctx.canvas.height) continue;
    ctx.strokeStyle = m.auto ? '#e0d0a0' : '#f0a050';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x - 4, y);
    ctx.closePath();
    ctx.stroke();
  }
});

// --- where they lie: a pilot and a log in the first ring, on their own dice ---------------------

chunkHook((g, c) => {
  const put = (mod: string) => {
    const r = rng(hash(g.seed, 53, c.cx, c.cy));
    const fs = floors(c);
    if (!fs.length) return;
    const [x, y] = fs[r.int(0, fs.length - 1)];
    spawn(g, { kind: 'item', x: c.cx * CHUNK + x + 0.5, y: c.cy * CHUNK + y + 0.5, item: { kind: 'mod', mod } });
  };
  if (c.cx === 0 && c.cy === -1) put('wayfinder-moth');
  if (c.cx === -1 && c.cy === 1) put('waystone-log');
});
