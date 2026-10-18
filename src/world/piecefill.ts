// What a set piece holds (src/world/pieces.ts): its centrepiece prop (drawn by src/sight/variety.ts), its finds
// round the centrepiece, the foes that live there, a line the first time you walk in, and the mending ones
// (the oil font, the bone chandelier, the frost shrine) mend you whole once when you stand at them.
import { CHUNK, Cell, chunkHook } from '../core/grid';
import { dist, say, spawn, tickHooks } from '../core/game';
import { hash, rng } from '../core/rng';
import type { Entity, Game, Item } from '../core/types';
import { foe } from '../fight/spawn';
import { lootMod } from './spawn';
import { nextLog } from './vectors';
import { farOf, floorAt } from './floors';
import { PIECE, PIECE_MID, PIECE_ROOM, pieceAt, type Piece } from './pieces';
import { mapHooks } from './mind';

/** the centrepiece of a set piece on your floor */
export const pieceProps = (g: Game): Entity[] => g.ents.filter((e) => e.kind === 'prop' && typeof e.data?.piece === 'string');
export const pieceOf = (e: Entity): Piece | undefined => PIECE[e.data?.piece as string];

chunkHook((g, c) => {
  const p = pieceAt(g.seed, c.cx, c.cy);
  if (!p) return;
  const [mx, my] = [c.cx * CHUNK + PIECE_MID[0] + 0.5, c.cy * CHUNK + PIECE_MID[1] + 0.5];
  spawn(g, { kind: 'prop', x: mx, y: my, data: { piece: p.id, used: false } });
  const r = rng(hash(g.seed, 143, c.cx, c.cy));
  const far = farOf(c.cx, c.cy);
  // finds lie in a ring a cell or two round the centrepiece, on open floor
  const spots: [number, number][] = [[-1, 1], [1, 1], [0, 2], [-2, 0], [2, 0], [0, -2], [-1, -1], [1, -1]];
  let k = 0;
  const put = (it: Item) => {
    for (let n = 0; n < spots.length; n++) {
      const [dx, dy] = spots[(k + n) % spots.length];
      const [x, y] = [PIECE_MID[0] + dx, PIECE_MID[1] + dy];
      if (c.cells[y * CHUNK + x] !== Cell.floor) continue;
      k += n + 1;
      return void spawn(g, { kind: 'item', x: c.cx * CHUNK + x + 0.5, y: c.cy * CHUNK + y + 0.5, item: it, data: { set: 'piece' } });
    }
  };
  const h = p.hold;
  if (h.mods !== undefined) {
    const it = lootMod(r, far + Math.max(0, h.mods), undefined, p.floor === 0);
    // the richer pieces hand out finer work
    if (h.mods >= 2 && it.kind === 'mod' && !it.rarity) it.rarity = 'fine';
    put(it);
  }
  for (const [res, n] of h.res ?? []) put({ kind: 'res', res, n });
  if (h.card) put({ kind: 'card', card: nextLog(g) });
  for (const [type, n] of h.foes ?? [])
    for (let j = 0; j < n; j++) {
      const [x0, y0, x1, y1] = PIECE_ROOM;
      const [x, y] = [r.int(x0, x1), r.int(y0, y1)];
      if (c.cells[y * CHUNK + x] !== Cell.floor) continue;
      foe(g, type, c.cx * CHUNK + x + 0.5, c.cy * CHUNK + y + 0.5).enemy!.data.set = 'piece';
    }
});

/** told once per piece: you walked in; the mending ones mend once */
const told = new WeakMap<Game, Set<number>>();
tickHooks.push((g) => {
  if (g.ended) return;
  const p = g.player;
  let s = told.get(g);
  if (!s) told.set(g, (s = new Set()));
  for (const e of pieceProps(g)) {
    const pc = pieceOf(e);
    if (!pc) continue;
    const d = dist(e, p);
    if (d < 4.6 && !s.has(e.id) && floorAt(e.x) === floorAt(p.x)) {
      s.add(e.id);
      g.events.push({ type: 'piece', at: [e.x, e.y], data: pc.id });
      say(g, [`✧ ${pc.name.toUpperCase()}. `, pc.line]);
    }
    if (pc.hold.heal && !e.data!.used && d < 1.6 && p.hp < p.maxHp) {
      e.data!.used = true;
      p.hp = p.maxHp;
      g.events.push({ type: 'mend', at: [e.x, e.y] });
      say(g, `${pc.name} mends you whole. it will not again.`);
    }
  }
});

// on the map: a set piece you have seen is a small four-point star in its own ink
mapHooks.draw.push((g, ctx, ox, oy, px) => {
  for (const e of pieceProps(g)) {
    if (!g.seen.has(`${Math.floor(e.x)},${Math.floor(e.y)}`)) continue;
    const pc = pieceOf(e);
    const [x, y] = [(e.x - ox) * px, (e.y - oy) * px];
    if (!pc || x < 0 || y < 0 || x >= ctx.canvas.width || y >= ctx.canvas.height) continue;
    const r = Math.max(5, px * 1.1);
    ctx.save();
    ctx.fillStyle = pc.hold.heal && e.data!.used ? '#605850' : pc.ink;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 - Math.PI / 2;
      const rr = k % 2 ? r * 0.35 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
});
