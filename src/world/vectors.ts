// Memory cards and vectors. Each seed fixes where the three scripture shards and the Thaw Engine
// lie (`plan`); a chunk that holds one gets it when it is made. Reading a card with the card reader
// prints its log and a vector (distance and bearing): ordinary cards point to the next shard not yet
// pointed at, then to a printer, the ninth eye or a cache, placed in the chunk the vector ends in.
// The shards each give a third of the Engine's vector. Installing the Engine ends the run: 'thaw'.

import { CHUNK, chunkHook, open } from '../core/grid';
import { dist, say, spawn, spawnEnemy, tickHooks } from '../core/game';
import { ELITE, GUARD_HINT } from '../fight';
import { zoneAt, zoneOf } from './zones';
import { active, def, param } from '../core/mods';
import { hash, rng } from '../core/rng';
import { verb } from '../core/verbs';
import type { Chunk, Game, Vector } from '../core/types';
import { CARDS, LOGS, SHARDS } from './cards';
import { spot } from './gen';
import { lootMod } from './spawn';
import { foe } from '../fight/spawn';

export interface Plan {
  /** chunk of shard 1, 2, 3 */
  shards: [number, number][];
  engine: [number, number];
}

const plans = new Map<number, Plan>();
/** how far out (chunks) shards 1, 2, 3 lie; the Engine 1.7 past shard 3 */
export const SHARD_AT = [2.2, 4, 5.8];
/** the seed's fixed places: one shard in each zone past the cradle (about 2.2, 4 and 5.8 chunks out: r2 pace, a
 *  human run in 25-30 min) on
 *  different bearings, the Engine one or two chunks past shard 3 */
export function plan(seed: number): Plan {
  let p = plans.get(seed);
  if (p) return p;
  const r = rng(hash(seed, 21));
  const a0 = r() * Math.PI * 2;
  const at = (d: number, a: number): [number, number] => [Math.round(Math.sin(a) * d), Math.round(-Math.cos(a) * d)];
  // nudge the distance until the rounded chunk lands in the zone it is meant for
  const inZone = (z: number, d: number, a: number): [number, number] => {
    for (const dd of [d, d - 0.4, d + 0.4, d - 0.8, d + 0.8]) {
      const c = at(dd, a);
      if (zoneOf(c[0], c[1]) === z) return c;
    }
    return at(d, a);
  };
  const a2 = a0 + 2.1 + r() * 0.6;
  const a3 = a0 + 4.2 + r() * 0.6;
  const s3 = inZone(3, SHARD_AT[2], a3);
  // r1 pace: the Engine lies one to two chunks past shard 3 on its bearing (it was across the map: a 4-10 min dead walk)
  let engine = at(SHARD_AT[2] + 1.7, a3);
  for (const d of [1.7, 2.1, 2.5, 3.1].map((k) => SHARD_AT[2] + k)) {
    engine = at(d, a3);
    if (engine[0] !== s3[0] || engine[1] !== s3[1]) break;
  }
  p = { shards: [inZone(1, SHARD_AT[0], a0), inZone(2, SHARD_AT[1], a2), s3], engine };
  plans.set(seed, p);
  return p;
}

/** what a card read leaves behind for the next reads, per game */
interface Lore {
  /** ordinary cards spawned so far: the next one gets the next log */
  spawned: number;
  /** shards (1..3) a vector already points at */
  pointed: number[];
  ninth: boolean;
}
const lore = new WeakMap<Game, Lore>();
const L = (g: Game): Lore => {
  let l = lore.get(g);
  if (!l) lore.set(g, (l = { spawned: 0, pointed: [], ninth: false }));
  return l;
};

/** the next unread log for a card lying in the world */
export function nextLog(g: Game): string {
  return LOGS[L(g).spawned++ % LOGS.length].id;
}

/** "74 cells, bearing 128 (se)" from the player to (x, y) */
export function bearing(g: Game, x: number, y: number): string {
  const p = g.player;
  const deg = Math.round(((Math.atan2(x - p.x, -(y - p.y)) * 180) / Math.PI + 360) % 360);
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round(deg / 45) % 8];
  return `${Math.round(dist(p, { x, y }))} cells, bearing ${deg} (${word})`;
}

const chunkOf = (x: number, y: number): [number, number] => [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];

/** put a vector's thing into its chunk now, if the chunk exists; else the chunk hook does it later */
function place(g: Game, v: Vector): void {
  const [cx, cy] = chunkOf(v.x, v.y);
  if (g.chunks.has(`${cx},${cy}`)) drop(g, v);
}
function drop(g: Game, v: Vector): void {
  const far = Math.hypot(...chunkOf(v.x, v.y));
  if (v.what === 'printer') spawn(g, { kind: 'printer', x: v.x, y: v.y, data: { far, made: 0 } });
  else if (v.what === 'ninth eye') spawn(g, { kind: 'item', x: v.x, y: v.y, item: { kind: 'mod', mod: 'ninth-eye' } });
  else if (v.what === 'cache') {
    const r = rng(hash(g.seed, 31, v.x, v.y));
    spawn(g, { kind: 'item', x: v.x, y: v.y, item: lootMod(r, far + 2) });
    spawn(g, { kind: 'item', x: v.x, y: v.y, item: { kind: 'res', res: r.pick(['bone', 'glass', 'copper'] as const), n: r.int(3, 5) } });
    spawn(g, { kind: 'item', x: v.x, y: v.y, item: { kind: 'res', res: 'ichor', n: 1 } });
  }
}

/** the planned shards and the Engine come with their chunks; vectors read earlier drop their things */
chunkHook((g: Game, c: Chunk) => {
  const p = plan(g.seed);
  p.shards.forEach(([cx, cy], k) => {
    if (c.cx !== cx || c.cy !== cy) return;
    const [x, y] = spot(g.seed, cx, cy, 1, c);
    spawn(g, { kind: 'item', x, y, item: { kind: 'card', card: SHARDS[k].id } });
    spawn(g, { kind: 'item', x, y, item: { kind: 'res', res: 'ichor', n: 1 } });
    guard(g, x, y, ELITE[Math.max(1, Math.min(3, zoneAt(x, y)))]);
  });
  if (c.cx === p.engine[0] && c.cy === p.engine[1]) {
    const [x, y] = spot(g.seed, c.cx, c.cy, 2, c);
    spawn(g, { kind: 'item', x, y, item: { kind: 'mod', mod: 'thaw-engine' } });
    // r1 pace: not a second saint but a gauntlet: a walker keeps the engine, a mite swarm waits on the way in
    // (only these: the chunk holds no other foes, src/fight/spawn.ts; a lamp here could hold the only corridor shut)
    const post = (type: string, salt: number, dx = 0) => {
      const [px, py] = salt ? spot(g.seed, c.cx, c.cy, salt, c) : [x + 1, y];
      const e = foe(g, type, (open(g, px, py) ? px : x) + dx, open(g, px, py) ? py : y);
      e.enemy!.data.post = [e.x, e.y];
    };
    post('walker', 0);
    for (const dx of [-0.45, -0.15, 0.15, 0.45]) post('mite', 6, dx);
  }
  for (const v of g.vectors) {
    const [cx, cy] = chunkOf(v.x, v.y);
    if (cx === c.cx && cy === c.cy && v.what !== 'scripture shard' && v.what !== 'thaw engine') drop(g, v);
  }
});

/** cells around a guarded shard kept free of other foes */
export const CLEAR = 6;

/** an elite stands over a shard (and the engine): a cell or two off it, at full strength for its zone */
function guard(g: Game, x: number, y: number, type: string): void {
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!open(g, x + dx, y + dy)) continue;
    const e = spawnEnemy(g, type, x + dx, y + dy);
    e.enemy!.data.elite = true;
    e.enemy!.data.post = [e.x, e.y];
    // the elite keeps its ground: no rabble crowds the shard (a fight with it, not a pile-on)
    g.ents = g.ents.filter((o) => !o.enemy || o === e || Math.hypot(o.x - x, o.y - y) > CLEAR);
    return;
  }
}

/** where a planned thing lies, as a cell centre */
export function shardAt(g: Game, k: number): [number, number] {
  const [cx, cy] = plan(g.seed).shards[k];
  return spot(g.seed, cx, cy, 1);
}
export function engineAt(g: Game): [number, number] {
  const [cx, cy] = plan(g.seed).engine;
  return spot(g.seed, cx, cy, 2);
}

const holds = (g: Game, card: string) => g.cards.includes(card) || g.player.inv.some((i) => i.kind === 'card' && i.card === card);

function vectorFor(g: Game, card: string): Vector {
  const l = L(g);
  for (let k = 0; k < 3; k++) {
    if (l.pointed.includes(k) || holds(g, SHARDS[k].id)) continue;
    l.pointed.push(k);
    const [x, y] = shardAt(g, k);
    return { card, x, y, what: 'scripture shard', found: false };
  }
  // past the shards: something useful two or three chunks away from here
  const r = rng(hash(g.seed, 41, g.cards.length));
  const what = !l.ninth && g.cards.length >= 3 ? 'ninth eye' : r.chance(0.5) ? 'printer' : 'cache';
  if (what === 'ninth eye') l.ninth = true;
  const a = r() * Math.PI * 2;
  const d = r.int(2, 3);
  const [pcx, pcy] = chunkOf(g.player.x, g.player.y);
  const [cx, cy] = [pcx + Math.round(Math.sin(a) * d), pcy + Math.round(-Math.cos(a) * d)];
  const [x, y] = spot(g.seed, cx, cy, 3 + g.cards.length);
  return { card, x, y, what, found: false };
}

export const reading = (g: Game): boolean => active(g, 'mind').some((i) => param<string>(i, 'what', '') === 'reader');

verb('read', {
  help: 'read a memory card: read card (needs the card reader)',
  when: reading,
  run(g) {
    const k = g.player.inv.findIndex((i) => i.kind === 'card');
    if (k < 0) return say(g, 'you carry no memory card.');
    const it = g.player.inv[k];
    if (it.kind !== 'card') return;
    g.player.inv.splice(k, 1);
    const c = CARDS[it.card];
    if (!g.cards.includes(it.card)) g.cards.push(it.card);
    g.events.push({ type: 'read', data: it.card });
    say(g, ...(c?.lines ?? ['the card is blank.']).map((s) => '  ' + s));
    if (c?.shard) {
      const n = SHARDS.filter((s) => g.cards.includes(s.id)).length;
      const [ex, ey] = engineAt(g);
      const fromStart = Math.round(Math.hypot(ex - 8.5, ey - 8.5) / 10) * 10;
      const deg = Math.round(((Math.atan2(ex - g.player.x, -(ey - g.player.y)) * 180) / Math.PI + 360) % 360);
      if (n === 1) say(g, `  the engine: about ${fromStart} cells from where you woke.`);
      else if (n === 2) say(g, `  the engine: about ${fromStart} cells out, bearing near ${Math.round(deg / 45) * 45} from here.`);
      else {
        const v: Vector = { card: it.card, x: ex, y: ey, what: 'thaw engine', found: false };
        g.vectors.push(v);
        say(g, [`  vector: ${bearing(g, ex, ey)}. `, 'the thaw engine.']);
      }
    } else {
      const v = vectorFor(g, it.card);
      g.vectors.push(v);
      place(g, v);
      say(g, `  vector: ${bearing(g, v.x, v.y)}. ${v.what}.`);
      // the fight slice's word on the shard's guard (playtest r1: the first elite came unannounced)
      const guard = v.what === 'scripture shard' && GUARD_HINT[ELITE[Math.max(1, Math.min(3, zoneAt(v.x, v.y)))]];
      if (guard) say(g, `  ${guard}`);
    }
    say(g, 'the card goes blank.');
  },
});

verb('vectors', {
  help: 'the vectors you know',
  when: (g) => g.vectors.length > 0,
  run(g) {
    for (const v of g.vectors) say(g, `${v.found ? '(reached) ' : ''}${v.what}: ${bearing(g, v.x, v.y)}`);
  },
});

/** the nearest vector not reached yet */
export function nearestOpen(g: Game): Vector | undefined {
  return g.vectors.filter((v) => !v.found).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];
}

tickHooks.push((g) => {
  for (const v of g.vectors) {
    if (v.found || dist(v, g.player) > 1.6) continue;
    v.found = true;
    g.events.push({ type: 'vector', at: [v.x, v.y] });
    say(g, [`the vector ends here: the ${v.what}. `, { text: 'take', cmd: 'take' }]);
  }
  if (!g.ended && g.player.installed.some((i) => def(i).id === 'thaw-engine')) {
    g.ended = 'thaw';
    g.events.push({ type: 'thaw' });
    say(g, 'the engine turns over. something vast, warming.');
  }
});

