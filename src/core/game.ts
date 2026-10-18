// The run: a new game, the real-time tick, damage and death, entities and the console log.

import { CHUNK, clear, ensure, open } from './grid';
import { def, label, tickMods } from './mods';
import type { Entity, Game, Item, Line } from './types';
import { lit } from '../sight/lamp';

export interface EnemyDef {
  name: string;
  hp: number;
  /** cells per second */
  speed: number;
  damage: number;
  /** seconds between strikes */
  cooldown: number;
  /** how far (cells) it notices you; light makes it notice from farther (lamps) */
  sense: number;
  /** its own behaviour; without one it is drawn to you and strikes when adjacent */
  ai?: (g: Game, e: Entity, dt: number) => void;
  /** seen by cameras? the hum is not */
  hidden?: boolean;
  /** taken off every hit it takes (strike): walkers and the abbot are bone */
  armour?: number;
}
export const ENEMIES: Record<string, EnemyDef> = {};
export function enemy(type: string, d: EnemyDef): void {
  ENEMIES[type] = d;
}

/** per-tick hooks the slices add: regeneration, shots in flight, vectors found... */
export const tickHooks: ((g: Game, dt: number) => void)[] = [];

export const START_HP = 10;
/** how close a melee foe (and your touch weapons) must be: a diagonal neighbour counts */
export const REACH = 1.5;
/** how far from its post a guard follows you */
export const LEASH = 7;

export function newGame(seed: number): Game {
  const g: Game = {
    seed,
    floor: 0,
    t: 0,
    player: { x: 8.5, y: 8.5, dir: 0, hp: START_HP, maxHp: START_HP, slots: 3, core: 4, installed: [], inv: [], path: [], pace: 2.5, move: null, hurtAt: -99 },
    ents: [],
    chunks: new Map(),
    vectors: [],
    cards: [],
    seen: new Set(),
    log: [],
    nextId: 1,
    ended: null,
    stats: { mods: [], far: 0, kills: 0 },
    events: [],
  };
  ensure(g, g.player.x, g.player.y);
  return g;
}

/** r5: "1 cell", "3 cells" */
export const cells = (n: number): string => `${n} cell${n === 1 ? '' : 's'}`;

export function say(g: Game, ...lines: (string | Line)[]): void {
  for (const l of lines) g.log.push(typeof l === 'string' ? [l] : l);
}

export function spawn(g: Game, e: Omit<Entity, 'id'>): Entity {
  const ent = { ...e, id: g.nextId++ } as Entity;
  g.ents.push(ent);
  return ent;
}

export function spawnEnemy(g: Game, type: string, x: number, y: number): Entity {
  const d = ENEMIES[type];
  if (!d) throw new Error(`unknown enemy ${type}`);
  return spawn(g, { kind: 'enemy', x, y, enemy: { type, hp: d.hp, readyAt: 0, data: d.armour ? { armour: d.armour } : {} } });
}

export function itemName(it: Item): string {
  if (it.kind === 'mod') return label(it);
  if (it.kind === 'res') return `${it.n} ${it.res}`;
  return it.card.startsWith('shard') ? 'scripture shard' : 'memory card';
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function hurt(g: Game, n: number, from?: Entity): void {
  const p = g.player;
  if (g.ended) return;
  for (const f of hurtHooks) n = f(g, n, from);
  if (n <= 0) return;
  p.hp = Math.max(0, p.hp - n);
  p.hurtAt = g.t;
  g.events.push({ type: 'hurt', data: n });
  if (p.hp <= 0) {
    g.ended = 'dead';
    g.events.push({ type: 'die' });
    say(g, `you stop. ${from?.enemy ? ENEMIES[from.enemy.type]?.name ?? 'something' : 'something'} took you.`);
  }
}
/** body modules soften a hit (frost coat), the ward returns it: (game, damage, source) => damage left */
export const hurtHooks: ((g: Game, n: number, from?: Entity) => number)[] = [];

export function strike(g: Game, e: Entity, n: number): void {
  if (!e.enemy) return;
  // armoured foes (walkers, the abbot) shrug off part of every hit: big single hits beat fast small ones
  const armour = (e.enemy.data.armour as number) ?? 0;
  const raw = n;
  if (armour > 0) n = Math.max(n * 0.2, n - armour);
  // an elite that just missed a big move is open: it takes more (src/fight/index.ts OPEN)
  if (g.t < ((e.enemy.data.open as number) ?? 0)) n *= 1.5;
  e.enemy.hp -= n;
  g.events.push({ type: 'hit', at: [e.x, e.y], data: e.id });
  for (const f of strikeHooks) f(g, e, n, raw);
  if (e.enemy.hp <= 0) {
    g.ents = g.ents.filter((x) => x !== e);
    g.stats.kills++;
    g.events.push({ type: 'kill', at: [e.x, e.y], data: e.enemy.type });
    for (const f of killHooks) f(g, e);
  }
}
/** every blow that lands: (game, foe, damage dealt, damage before its armour) for the HUD's hit line */
export const strikeHooks: ((g: Game, e: Entity, n: number, raw: number) => void)[] = [];
/** drops and the like when an enemy dies */
export const killHooks: ((g: Game, e: Entity) => void)[] = [];

/** the centre of the first cell on a shortest open path from (ax, ay) to (bx, by), searching a few hundred cells */
export function nextCell(g: Game, ax: number, ay: number, bx: number, by: number, max = 400): [number, number] | null {
  const sx = Math.floor(ax), sy = Math.floor(ay), tx = Math.floor(bx), ty = Math.floor(by);
  const k = (x: number, y: number) => x * 100003 + y;
  const prev = new Map<number, number>([[k(sx, sy), -1]]);
  const q: [number, number][] = [[sx, sy]];
  for (let h = 0; h < q.length && q.length < max; h++) {
    const [x, y] = q[h];
    if (x === tx && y === ty) {
      // walk back to the step after the start
      let cur: [number, number] = [x, y];
      for (;;) {
        const pk = prev.get(k(cur[0], cur[1]))!;
        if (pk === k(sx, sy) || pk === -1) return [cur[0] + 0.5, cur[1] + 0.5];
        cur = [Math.round(pk / 100003), pk - Math.round(pk / 100003) * 100003];
      }
    }
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (prev.has(k(nx, ny)) || !open(g, nx + 0.5, ny + 0.5)) continue;
      prev.set(k(nx, ny), k(x, y));
      q.push([nx, ny]);
    }
  }
  return null;
}

/** the default enemy: drawn to you along open cells once it noticed you, strikes when adjacent */
export function chase(g: Game, e: Entity, dt: number): void {
  const d = ENEMIES[e.enemy!.type];
  const p = g.player;
  const r = dist(e, p);
  if (!e.enemy!.data.noticed) {
    if (r < d.sense + lit(g) && clear(g, e.x, e.y, p.x, p.y)) e.enemy!.data.noticed = true;
    else return;
  }
  // a guard (an elite on its post) does not follow you far: past its leash it walks back
  const post = e.enemy!.data.post as [number, number] | undefined;
  const home = post && Math.hypot(p.x - post[0], p.y - post[1]) > LEASH;
  if (home && Math.hypot(e.x - post[0], e.y - post[1]) < 0.3) return;
  let to: { x: number; y: number } = home ? { x: post[0], y: post[1] } : p;
  // round walls: head for the next cell on a short path, not straight at you (a straight line jams on corners)
  if (Math.floor(e.x) !== Math.floor(to.x) || Math.floor(e.y) !== Math.floor(to.y)) {
    const d = e.enemy!.data;
    if (!d.stepAt || g.t >= (d.stepAt as number)) {
      d.step = nextCell(g, e.x, e.y, to.x, to.y);
      d.stepAt = g.t + 0.4;
    }
    if (d.step) to = { x: (d.step as [number, number])[0], y: (d.step as [number, number])[1] };
  }
  if (home || r > 1.1) {
    // step toward the player's cell, preferring the longer axis, sliding along walls
    const dx = to.x - e.x;
    const dy = to.y - e.y;
    // v2 uniques: ash from the penitent's heels, the drowned bell's ring: half speed
    const step = d.speed * dt * (g.t < ((e.enemy!.data.slowUntil as number) ?? 0) ? 0.5 : 1);
    const tryMove = (mx: number, my: number) => {
      const nx = e.x + mx;
      const ny = e.y + my;
      if (open(g, nx + Math.sign(mx) * 0.3, ny + Math.sign(my) * 0.3)) {
        e.x = nx;
        e.y = ny;
        return true;
      }
      return false;
    };
    const sx = Math.sign(dx) * Math.min(step, Math.abs(dx));
    const sy = Math.sign(dy) * Math.min(step, Math.abs(dy));
    if (Math.abs(dx) > Math.abs(dy)) {
      if (!tryMove(sx, 0)) tryMove(0, sy || step);
    } else if (!tryMove(0, sy)) tryMove(sx || step, 0);
  }
  // within a diagonal step it strikes too (a corner can stop it closing the last bit)
  if (!home && dist(e, p) <= REACH && g.t >= e.enemy!.readyAt) {
    e.enemy!.readyAt = g.t + d.cooldown;
    e.enemy!.data.felt = g.t; // a hidden thing that strikes gives itself away for a moment (src/mods/sense.ts)
    hurt(g, d.damage, e);
  }
}

/** walk the gait path or the gyro's free movement */
function movePlayer(g: Game, dt: number): void {
  const p = g.player;
  const speed = p.pace;
  if (p.path.length) {
    const [tx, ty] = p.path[0];
    const dx = tx - p.x;
    const dy = ty - p.y;
    const r = Math.hypot(dx, dy);
    // the eye can hold your facing on a foe while you step (src/fight/eye.ts: backpedal)
    if (r > 0.01 && !(g.t < (p.faceLock ?? 0))) p.dir = Math.atan2(dx, -dy);
    if (r <= speed * dt) {
      p.x = tx;
      p.y = ty;
      p.path.shift();
    } else {
      p.x += (dx / r) * speed * dt;
      p.y += (dy / r) * speed * dt;
    }
  } else if (p.move) {
    const [vx, vy] = p.move;
    const R = 0.25; // body radius: slide along walls
    const nx = p.x + vx * dt;
    if (open(g, nx + Math.sign(vx) * R, p.y - R) && open(g, nx + Math.sign(vx) * R, p.y + R)) p.x = nx;
    const ny = p.y + vy * dt;
    if (open(g, p.x - R, ny + Math.sign(vy) * R) && open(g, p.x + R, ny + Math.sign(vy) * R)) p.y = ny;
  }
}

/** one real-time step; dt in seconds (the UI calls it every frame, tests call it directly) */
export function tick(g: Game, dt: number): void {
  if (g.ended) return;
  g.events = [];
  g.t += dt;
  const p = g.player;
  movePlayer(g, dt);
  ensure(g, p.x, p.y);
  tickMods(g, dt);
  for (const e of [...g.ents]) {
    if (!e.enemy || dist(e, p) > CHUNK * 1.5) continue;
    const d = ENEMIES[e.enemy.type];
    (d?.ai ?? chase)(g, e, dt);
    if (g.ended) return;
  }
  for (const f of tickHooks) f(g, dt);
}

/** things within reach of the player: the floor of your cell and the ones next to it */
export function reach(g: Game): Entity[] {
  return g.ents.filter((e) => e.kind === 'item' && dist(e, g.player) < 1.6);
}

export function installedNames(g: Game): string[] {
  return g.player.installed.map((i) => def(i).name);
}
