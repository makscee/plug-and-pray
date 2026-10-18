// One more trick per floor (v2 variety), each cheap to read on any eye and on the map:
//   the cradle   CRUMBLE: in a fight the floor cracks between you and them (an outline of cracks), and gives
//                way CRUMBLE.secs later. Whatever stands on it falls hurt: lure the swarm across, stay off.
//   the nave     CANTORS: a hooded singer stands in some chambers (and the choir loft). While it sings (a ring
//                on the map, its mouth open), every foe within CANTOR.reach hits CANTOR.mult harder. Kill it first.
//                (its foes also sidestep shots: src/fight/dodge.ts)
//   the ossuary  dark and cold, and your light draws them (src/core/game.ts `lit`): said on arrival
//   the furnace  VENTS: grates that breathe fire on one beat for the whole floor (VENT.every s): they glow,
//                then burst. Cross between beats.
// And each floor says on arrival what it wants from you (src/world/floors.ts WANTS).
import { dist, enemy, ENEMIES, hurt, hurtHooks, say, spawn, strike, tickHooks } from '../core/game';
import { CHUNK, Cell, chunkHook, open } from '../core/grid';
import { hash, rng } from '../core/rng';
import type { Entity, Game } from '../core/types';
import { foe } from '../fight/spawn';
import { SPRITES } from '../sight/sprites';
import { floorAt, floorOf, floorOfChunk, inRoom, isArrival, LAST, stairsChunk, WANTS } from './floors';
import { mapHooks } from './mind';
import { cellIn } from './spawn';
import { PIECE_MID, pieceAt } from './pieces';

// ---- the cradle: crumbling floor

export const CRUMBLE = { secs: 2.2, every: 40, hurt: 1.5, foeHurt: 3, r: 1 };
interface Crack { x: number; y: number; at: number }
const cracks = new WeakMap<Game, { list: Crack[]; next: number; told: number }>();
const C = (g: Game) => {
  let s = cracks.get(g);
  if (!s) cracks.set(g, (s = { list: [], next: 45, told: 0 }));
  return s;
};
/** the cracking patches now, for the eye and the map: centre cells and when they fall */
export const cracksOf = (g: Game): Crack[] => C(g).list;
const onCrack = (c: Crack, x: number, y: number) => Math.abs(Math.floor(x) - c.x) <= CRUMBLE.r && Math.abs(Math.floor(y) - c.y) <= CRUMBLE.r;

tickHooks.push((g) => {
  if (g.ended) return;
  const s = C(g);
  const p = g.player;
  // falls
  for (const c of s.list.filter((c) => g.t >= c.at)) {
    s.list = s.list.filter((x) => x !== c);
    g.events.push({ type: 'crumble', at: [c.x + 0.5, c.y + 0.5] });
    let fell = 0;
    for (const e of [...g.ents]) if (e.enemy && !e.enemy.data.boss && onCrack(c, e.x, e.y)) (strike(g, e, CRUMBLE.foeHurt), fell++);
    if (onCrack(c, p.x, p.y)) hurt(g, CRUMBLE.hurt);
    say(g, fell ? `the floor gives way under ${fell === 1 ? 'one of them' : `${fell} of them`}.` : 'the cracked floor gives way. it settles again, rubble.');
  }
  if (floorOf(g) !== 0 || g.t < s.next || s.list.length) return;
  // a fight: two or more foes after you, close
  const after = g.ents.filter((e) => e.enemy && e.enemy.data.noticed && !e.enemy.data.boss && dist(e, p) < 6).sort((a, b) => dist(a, p) - dist(b, p));
  if (after.length < 2 || inRoom(g.seed, 0, p.x, p.y)) return;
  // between you and the nearest, a little nearer them
  const [cx, cy] = [Math.floor(p.x + (after[0].x - p.x) * 0.6), Math.floor(p.y + (after[0].y - p.y) * 0.6)];
  if (!open(g, cx + 0.5, cy + 0.5)) return void (s.next = g.t + 2);
  s.list.push({ x: cx, y: cy, at: g.t + CRUMBLE.secs });
  s.next = g.t + CRUMBLE.every;
  g.events.push({ type: 'crack', at: [cx + 0.5, cy + 0.5] });
  s.told++;
  say(g, s.told <= 2 ? `⚠ the floor cracks between you and them. it gives way in ${CRUMBLE.secs.toFixed(0)} s: let them come across it, and stay off.` : '⚠ the floor cracks.');
});

// ---- the nave: cantors

export const CANTOR = { reach: 6, mult: 1.5, sing: 4, rest: 4 };
/** a cantor sings now (each keeps its own beat) */
export const singing = (g: Game, e: Entity): boolean => e.enemy?.type === 'cantor' && (g.t + e.id * 1.7) % (CANTOR.sing + CANTOR.rest) < CANTOR.sing && !!e.enemy.data.noticed;
const cantorAi = (g: Game, e: Entity) => {
  // it does not walk or bite; it notices you as anything does, then sings (its mouth open: the attack frame)
  if (!e.enemy!.data.noticed && dist(e, g.player) < ENEMIES.cantor.sense) e.enemy!.data.noticed = true;
  e.enemy!.data.flinch = singing(g, e) ? g.t + 0.2 : 0;
};
enemy('cantor', { name: 'a cantor', hp: 4, speed: 0, damage: 0, cooldown: 9, sense: 7, ai: cantorAi });
// a hooded singer in a long robe; it opens its mouth wide to sing (frame 2 while singing, src/sight/scene.ts frameOf)
SPRITES.cantor = {
  size: 0.9, lift: 0, heat: 0.6,
  art(px, f) {
    const robe = '#5a3a6a', dark = '#2a1830', face = '#e0c8a8';
    for (let y = 8; y < 31; y++) {
      const w = y < 13 ? 4 + (y - 8) * 0.6 : 5 + (y - 13) * 0.35;
      for (let x = Math.round(16 - w); x <= Math.round(15 + w); x++) px(x, y, y < 13 && Math.abs(x - 15.5) > w - 1.5 ? dark : robe);
    }
    for (let y = 11; y < 17; y++) for (let x = 13; x < 19; x++) px(x, y, face);
    px(14, 13, '#201010');
    px(17, 13, '#201010');
    const open = f === 2 ? 2 : 0;
    for (let y = 15; y <= 15 + open; y++) for (let x = 15; x < 17; x++) px(x, y, '#401018');
    // a candle in its hands
    for (let y = 18; y < 22; y++) px(15, y, '#f0e8d0');
    px(15, 17, '#ffc040');
  },
};
// it sings: foes near it hit harder
hurtHooks.unshift((g, n, from) => {
  if (!from?.enemy || n <= 0) return n;
  const src = g.ents.find((e) => e.id === from.id) ?? from;
  return g.ents.some((c) => singing(g, c) && dist(c, src) <= CANTOR.reach) ? n * CANTOR.mult : n;
});
const sang = new WeakMap<Game, boolean>();
tickHooks.push((g) => {
  if (sang.get(g) || floorOf(g) !== 1) return;
  const c = g.ents.find((e) => singing(g, e) && dist(e, g.player) < 10);
  if (!c) return;
  sang.set(g, true);
  say(g, `⚠ a cantor sings. while it sings, every foe within ${CANTOR.reach} cells of it hits ${CANTOR.mult}× harder. kill it first.`);
});
// the nave's chunks: a cantor in some of them, always one in the choir loft
chunkHook((g, c) => {
  const f = floorOfChunk(c.cx);
  if (f !== 1 || isArrival(c.cx, c.cy)) return;
  const [sx, sy] = stairsChunk(g.seed, f);
  if (c.cx === sx && c.cy === sy) return;
  const piece = pieceAt(g.seed, c.cx, c.cy);
  const r = rng(hash(g.seed, 161, c.cx, c.cy));
  if (piece?.hold.cantor) return void foe(g, 'cantor', c.cx * CHUNK + PIECE_MID[0] + 0.5, c.cy * CHUNK + PIECE_MID[1] - 1.5);
  if (!r.chance(0.3)) return;
  const [x, y] = cellIn(r, c, g.seed);
  foe(g, 'cantor', x, y);
});

// ---- the furnace: vents on one beat

export const VENT = { every: 4, glow: 1.2, burst: 0.6, hurt: 1.2, r: 0.7 };
/** where a vent is in the beat: 'rest', 'glow' (the tell) or 'burst' */
export function ventPhase(g: Game): 'rest' | 'glow' | 'burst' {
  const t = g.t % VENT.every;
  return t >= VENT.every - VENT.burst ? 'burst' : t >= VENT.every - VENT.burst - VENT.glow ? 'glow' : 'rest';
}
export const vents = (g: Game): Entity[] => g.ents.filter((e) => e.kind === 'prop' && e.data?.vent);
enemy('vent', { name: 'a furnace vent', hp: 1, speed: 0, damage: VENT.hurt, cooldown: VENT.every, sense: 0 });
chunkHook((g, c) => {
  const f = floorOfChunk(c.cx);
  if (f !== 3 || isArrival(c.cx, c.cy) || f === LAST) return;
  const [sx, sy] = stairsChunk(g.seed, f);
  if (c.cx === sx && c.cy === sy) return;
  const r = rng(hash(g.seed, 171, c.cx, c.cy));
  const n = r.int(1, 3);
  for (let k = 0; k < n; k++) {
    const [x, y] = cellIn(r, c, g.seed);
    if (c.cells[(Math.floor(y) - c.cy * CHUNK) * CHUNK + Math.floor(x) - c.cx * CHUNK] !== Cell.floor) continue;
    if (g.ents.some((e) => e.data?.vent && Math.hypot(e.x - x, e.y - y) < 2)) continue;
    spawn(g, { kind: 'prop', x, y, data: { vent: true } });
  }
});
const burnt = new WeakMap<Game, { beat: number; told: boolean }>();
tickHooks.push((g) => {
  if (g.ended || floorOf(g) !== 3) return;
  let s = burnt.get(g);
  if (!s) burnt.set(g, (s = { beat: -1, told: false }));
  const p = g.player;
  const near = vents(g).filter((v) => floorAt(v.x) === 3 && dist(v, p) < 9);
  if (near.length && !s.told) {
    s.told = true;
    say(g, `⚠ vents in the floor breathe fire, all on one beat: every ${VENT.every} s they glow, then burst. stand off the grates when they glow.`);
  }
  if (ventPhase(g) !== 'burst') return;
  const beat = Math.floor(g.t / VENT.every);
  if (beat === s.beat) return;
  const v = near.find((v) => dist(v, p) < VENT.r);
  if (!v) return;
  s.beat = beat;
  hurt(g, VENT.hurt, { ...v, enemy: { type: 'vent', hp: 1, readyAt: 0, data: {} } });
  // foes on a grate burn too
  for (const e of [...g.ents]) if (e.enemy && !e.enemy.data.boss && near.some((n) => dist(n, e) < VENT.r)) strike(g, e, VENT.hurt * 2);
});

// ---- the map: cracks, singing rings, vents

mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const f = floorOf(g);
  ctx.save();
  if (f === 0)
    for (const c of cracksOf(g)) {
      const [x, y] = [(c.x - CRUMBLE.r - ox) * px, (c.y - CRUMBLE.r - oy) * px];
      const s = (CRUMBLE.r * 2 + 1) * px;
      ctx.strokeStyle = Math.floor(g.t * 6) % 2 ? '#ff9040' : '#ffd060';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, s, s);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.stroke();
    }
  if (f === 1)
    for (const e of g.ents) {
      if (!singing(g, e) || !g.seen.has(`${Math.floor(e.x)},${Math.floor(e.y)}`)) continue;
      ctx.strokeStyle = '#d8a0ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc((e.x - ox) * px, (e.y - oy) * px, CANTOR.reach * px, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  if (f === 3) {
    const ph = ventPhase(g);
    for (const v of vents(g)) {
      if (!g.seen.has(`${Math.floor(v.x)},${Math.floor(v.y)}`)) continue;
      ctx.fillStyle = ph === 'burst' ? '#ffe080' : ph === 'glow' ? '#ff6020' : '#602010';
      const r = Math.max(2, px * 0.4);
      ctx.fillRect((v.x - ox) * px - r, (v.y - oy) * px - r, r * 2, r * 2);
    }
  }
  ctx.restore();
});

// the cradle says what it wants once you are up (the other floors say it as you land: src/world/floors.ts goDown)
const wanted = new WeakSet<Game>();
tickHooks.push((g) => {
  if (wanted.has(g) || floorOf(g) !== 0 || g.t < 3) return;
  wanted.add(g);
  say(g, WANTS[0]);
});
