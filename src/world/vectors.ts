// Memory cards and vectors. Reading a card with the card reader prints its log and a vector (distance and
// bearing): on each floor the first card points to the way down (the stairs behind the floor's boss room,
// src/world/floors.ts), later ones to a printer, the ninth eye or a cache, placed in the chunk the vector ends in.
// (v2: the scripture shards and the Thaw Engine are gone; the heart's keeper is the end.)

import { CHUNK, chunkHook } from '../core/grid';
import { cells, dist, say, spawn, tickHooks } from '../core/game';
import { active, def, param } from '../core/mods';
import { hash, rng } from '../core/rng';
import { verb } from '../core/verbs';
import type { Chunk, Game, Res, Vector } from '../core/types';
import { CARDS, LOGS, OPENERS } from './cards';
import { spot } from './gen';
import { lootMod } from './spawn';
import { bossDown, farOf, floorOf, inside, stairsAt } from './floors';
import { offer } from '../end/timeline';

/** what a card read leaves behind for the next reads, per game */
interface Lore {
  /** ordinary cards spawned so far: the next one gets the next log */
  spawned: number;
  /** floors whose way down a vector already points at */
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
  const k = L(g).spawned++;
  if (k === 0) return rng(hash(g.seed, 67)).pick(OPENERS).id;
  return LOGS[k % LOGS.length].id;
}

/** "74 cells, bearing 128 (se)" from the player to (x, y) */
export function bearing(g: Game, x: number, y: number): string {
  const p = g.player;
  const deg = Math.round(((Math.atan2(x - p.x, -(y - p.y)) * 180) / Math.PI + 360) % 360);
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round(deg / 45) % 8];
  return `${cells(Math.round(dist(p, { x, y })))}, bearing ${deg} (${word})`;
}

const chunkOf = (x: number, y: number): [number, number] => [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];

/** put a vector's thing into its chunk now, if the chunk exists; else the chunk hook does it later */
function place(g: Game, v: Vector): void {
  const [cx, cy] = chunkOf(v.x, v.y);
  if (g.chunks.has(`${cx},${cy}`)) drop(g, v);
}
function drop(g: Game, v: Vector): void {
  const far = farOf(...chunkOf(v.x, v.y));
  if (v.what === 'printer') spawn(g, { kind: 'printer', x: v.x, y: v.y, data: { far, made: 0 } });
  else if (v.what === 'ninth eye') spawn(g, { kind: 'item', x: v.x, y: v.y, item: { kind: 'mod', mod: 'ninth-eye', rarity: 'unique', title: 'the ninth eye' } });
  else if (v.what === 'cache') {
    const r = rng(hash(g.seed, 31, v.x, v.y));
    spawn(g, { kind: 'item', x: v.x, y: v.y, item: lootMod(r, far + 2) });
    spawn(g, { kind: 'item', x: v.x, y: v.y, item: { kind: 'res', res: r.pick(['bone', 'glass', 'copper'] as const), n: r.int(3, 5) } });
    spawn(g, { kind: 'item', x: v.x, y: v.y, item: { kind: 'res', res: 'ichor', n: 1 } });
  }
}

/** vectors read earlier drop their things when their chunk is made */
chunkHook((g: Game, c: Chunk) => {
  for (const v of g.vectors) {
    const [cx, cy] = chunkOf(v.x, v.y);
    if (cx === c.cx && cy === c.cy && v.what !== 'way down') drop(g, v);
  }
});

function vectorFor(g: Game, card: string): Vector {
  const l = L(g);
  // the floor's way down first, unless it is known already (the boss fell, or a card told it)
  const f = floorOf(g);
  const [sx, sy] = stairsAt(g.seed, f);
  if (f < 4 && !l.pointed.includes(f) && !bossDown(g, f) && !g.vectors.some((v) => v.what === 'way down' && v.x === sx && v.y === sy)) {
    l.pointed.push(f);
    return { card, x: sx, y: sy, what: 'way down', found: false };
  }
  // past that: something useful two or three chunks away from here, on this floor
  const r = rng(hash(g.seed, 41, g.cards.length));
  const what = !l.ninth && g.cards.length >= 3 ? 'ninth eye' : r.chance(0.5) ? 'printer' : 'cache';
  if (what === 'ninth eye') l.ninth = true;
  const a = r() * Math.PI * 2;
  const d = r.int(2, 3);
  const [pcx, pcy] = chunkOf(g.player.x, g.player.y);
  let [cx, cy] = [pcx + Math.round(Math.sin(a) * d), pcy + Math.round(-Math.cos(a) * d)];
  // never into the rock round the floor: pulled back toward you until it lands inside
  for (let k = 0; k < 4 && !inside(cx, cy); k++) [cx, cy] = [cx - Math.sign(cx - pcx), cy - Math.sign(cy - pcy)];
  if (!inside(cx, cy)) [cx, cy] = [pcx, pcy];
  const [x, y] = spot(g.seed, cx, cy, 3 + g.cards.length);
  return { card, x, y, what, found: false };
}

export const reading = (g: Game): boolean => active(g, 'mind').some((i) => param<string>(i, 'what', '') === 'reader');
/** r2 decide: a reader carried, not installed, still reads, for a bone a card (it was remove, install, read, swap back) */
export const READ_BY_HAND: Partial<Record<Res, number>> = { bone: 1 };
export const carriesReader = (g: Game) => g.player.inv.some((i) => i.kind === 'mod' && def(i).family === 'mind' && param<string>(i, 'what', '') === 'reader');
export const bones = (g: Game) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === 'bone' ? i.n : 0), 0);
/** r5: a read that will work now (`read`'s when lets a carried reader in, bone or not) */
export const canRead = (g: Game): boolean => reading(g) || (carriesReader(g) && bones(g) >= READ_BY_HAND.bone!);

verb('read', {
  help: 'read a memory card: read card (needs the card reader: installed it reads free, carried it wants a bone)',
  when: (g) => reading(g) || carriesReader(g),
  whenFail: (g) => (g.player.installed.some((i) => i.mod === 'card-reader' && !i.on) ? 'read: your card reader is off. on card reader' : 'read: you need a card reader, installed or carried.'),
  run(g) {
    const k = g.player.inv.findIndex((i) => i.kind === 'card');
    if (k < 0) return say(g, 'you carry no memory card.');
    const it = g.player.inv[k];
    if (it.kind !== 'card') return;
    if (!reading(g)) {
      if (bones(g) < READ_BY_HAND.bone!) return say(g, `a carried reader wants a bone to read by; you have none. installed: free.`);
      const b = g.player.inv.find((i) => i.kind === 'res' && i.res === 'bone');
      if (b && b.kind === 'res') b.n -= READ_BY_HAND.bone!;
      g.player.inv = g.player.inv.filter((i) => i.kind !== 'res' || i.n > 0);
      say(g, 'you hold the reader to the light and feed it a bone. it reads.');
    }
    g.player.inv.splice(g.player.inv.indexOf(it), 1);
    const c = CARDS[it.card];
    if (!g.cards.includes(it.card)) g.cards.push(it.card);
    g.events.push({ type: 'read', data: it.card });
    say(g, ...(c?.lines ?? ['the card is blank.']).map((s) => '  ' + s));
    const v = vectorFor(g, it.card);
    g.vectors.push(v);
    place(g, v);
    say(g, `  vector: ${bearing(g, v.x, v.y)}. ${v.what}${v.what === 'way down' ? ', past the floor\'s keeper' : ''}.`);
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
    // a wall the eyes named (src/world/finds.ts) is broken or read, not taken; the way down is gone down
    const down = v.what === 'way down';
    const act = v.what === 'hollow wall' ? 'break' : v.what === 'scratched wall' || v.what === 'warm prints' ? '' : down ? (bossDown(g) ? 'descend' : '') : 'take';
    say(g, [`the vector ends here: the ${v.what}${down && !bossDown(g) ? ', sealed while its keeper stands' : ''}. `, ...(act ? [{ text: act, cmd: act }] : [])]);
  }
  // the old ending, kept for test runs and stagings: a thaw engine installed (it no longer lies anywhere)
  if (!g.ended && g.player.installed.some((i) => def(i).id === 'thaw-engine')) {
    g.ended = 'thaw';
    g.events.push({ type: 'thaw' });
    const o = offer(g);
    say(g, `the engine turns over. something vast, warming. it drinks what you carry: ${o.total}. ${o.grade}.`);
  }
});

