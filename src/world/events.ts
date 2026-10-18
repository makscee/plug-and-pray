// Set pieces (r1 pace): out of the cradle (or back in it after 5 min), every 2-3 minutes something happens near you, so no stretch of the
// run is only walking. Deterministic: the seed and the count pick the kind; the place is a floor cell a few
// steps away along open cells. Each thing it makes carries `data.set` (the pace tool counts them).
//   patrol     the zone's foes in step, already coming for you
//   reliquary  a sealed reliquary cracks: a module from deeper in and resources
//   collapse   the vault gives: rubble spills bone or glass, and what slept in it wakes
//   machine    a dying machine leaves a module that still works (attuned)
//   flare      the furnace only: a vent breathes fire, a pyre lamp kindles in it over a furnace module
import { open } from '../core/grid';
import { MODS } from '../core/mods';
import { VERBS, way } from '../core/verbs';
import { cells, dist, say, spawn, tickHooks } from '../core/game';
import { hash, rng, type Rng } from '../core/rng';
import type { Entity, Game, Item } from '../core/types';
import { foe } from '../fight/spawn';
import { BETTER, fresh, FURNACE_KIT, lootMod, rollMult } from './spawn';
import { zoneAt } from './zones';
import { farAt } from './floors';
import { mapHooks } from './mind';
import { inOpen, onScreen, openPart } from '../ui/maptips';

/** seconds between set pieces: this, plus up to SPREAD more */
export const EVERY = 100;
const SPREAD = 60;
/** the first one waits this long into the run */
const FIRST = 150;

const KINDS: Record<number, string[]> = {
  0: ['machine', 'reliquary'],
  1: ['patrol', 'reliquary', 'collapse', 'machine'],
  2: ['patrol', 'reliquary', 'collapse', 'machine'],
  3: ['flare', 'patrol', 'reliquary', 'collapse', 'machine'],
};
/** who walks a patrol, by zone */
const PATROL: Record<number, string[]> = { 1: ['mite', 'mite'], 2: ['walker', 'mite'], 3: ['walker', 'mite', 'mite', 'mite'] };
/** what a collapse shakes awake, by zone */
const RUBBLE: Record<number, string[]> = { 1: ['mite'], 2: ['mite', 'mite'], 3: ['mite', 'mite', 'mite'] };
/** the cradle gets set pieces (finds only) once you have been out a while: coming home to mend is dead time too */
const CRADLE = 300;
/** kinds that bring foes wait for a body above this share of its hp; below it, a find comes instead */
const FIT = 0.6;
const FOES = ['patrol', 'collapse', 'flare'];

interface State {
  next: number;
  n: number;
}
const state = new WeakMap<Game, State>();

/** a floor cell 4-8 steps away along open cells, picked by the rng; null if the place is too cramped */
export function nearCell(g: Game, r: Rng, min = 4, max = 8): [number, number] | null {
  const p = g.player;
  const sx = Math.floor(p.x), sy = Math.floor(p.y);
  const seen = new Set([sx + ',' + sy]);
  let ring: [number, number][] = [[sx, sy]];
  const pool: [number, number][] = [];
  for (let d = 1; d <= max && ring.length; d++) {
    const nextRing: [number, number][] = [];
    for (const [x, y] of ring)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [nx, ny] = [x + dx, y + dy];
        if (seen.has(nx + ',' + ny) || !open(g, nx + 0.5, ny + 0.5)) continue;
        seen.add(nx + ',' + ny);
        nextRing.push([nx, ny]);
        if (d >= min) pool.push([nx, ny]);
      }
    ring = nextRing;
  }
  // keep clear of an elite's ground
  const ok = pool.filter(([x, y]) => !g.ents.some((e) => e.enemy?.data.elite && Math.hypot(e.x - x - 0.5, e.y - y - 0.5) < 7));
  if (!ok.length) return null;
  const [x, y] = r.pick(ok);
  return [x + 0.5, y + 0.5];
}

/** the button toward (x, y): the pilot's goto, else the longest first leg (src/core/verbs.ts `way`) */
export function goCmd(g: Game, x: number, y: number): string {
  if (VERBS.goto && (!VERBS.goto.when || VERBS.goto.when(g))) return `goto ${Math.floor(x)} ${Math.floor(y)}`;
  const [d, n] = way.long(g, x, y);
  return `go ${d} ${n}`;
}
const side = (dx: number, dy: number) => ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 45) % 8];

/** "6 cells ne" and a button for the way there */
function where(g: Game, x: number, y: number): (string | { text: string; cmd: string })[] {
  const [dx, dy] = [x - g.player.x, y - g.player.y];
  const cmd = goCmd(g, x, y);
  return [`${cells(Math.round(Math.hypot(dx, dy)))} ${side(dx, dy)}.  `, { text: cmd, cmd }];
}

/** what a set piece's finds are called while they lie there */
const NAMES: Record<string, string> = { reliquary: 'open reliquary', collapse: 'rubble', machine: 'dead machine', flare: 'vent' };
export interface Piece { x: number; y: number; name: string; r: number; side: string; cmd: string; item: Item }
/** set pieces whose finds still lie out there, within `range` cells, nearest first (playtest r2 pace:
 *  the message scrolled away and the finds were lost) */
export function pieces(g: Game, range = Infinity): Piece[] {
  const p = g.player;
  const out: Piece[] = [];
  for (const e of g.ents) {
    const set = e.data?.set as string | undefined;
    if (e.kind !== 'item' || !set || e.data?.mimic || dist(e, p) > range) continue;
    if (out.some((o) => Math.hypot(o.x - e.x, o.y - e.y) < 1.5)) continue;
    out.push({ x: e.x, y: e.y, name: NAMES[set] ?? 'a find', r: dist(e, p), side: side(e.x - p.x, e.y - p.y), cmd: '', item: e.item! });
  }
  return out.sort((a, b) => a.r - b.r);
}
/** the nearby panel's rows: set pieces within 12 cells but out of reach, with a button the way there */
export const nearPieces = (g: Game): Piece[] => pieces(g, 12).filter((o) => o.r >= 1.6).map((o) => ({ ...o, cmd: goCmd(g, o.x, o.y) }));

// on the map: a hollow diamond where a set piece's finds lie (on the edge when off the map)
mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const [w, h] = [ctx.canvas.width, ctx.canvas.height];
  // v2r4 ux: on the full-screen map only the finds in the open part show, each with its name (the legend is not there)
  const free = ctx.canvas.closest('#backdrop') ? openPart() : null;
  const names: [number, number, string][] = [];
  for (const o of pieces(g)) {
    let [x, y] = [(o.x - ox) * px, (o.y - oy) * px];
    if (free) {
      const s = onScreen(ctx.canvas, x, y)!;
      if (!inOpen(free, s[0], s[1], 4)) continue;
      if (!names.some(([a, b]) => Math.hypot(a - x, b - y) < 40)) names.push([x, y, o.name.replace(/^(a|an|the) /, '')]);
    } else if (x < 0 || y < 0 || x >= w || y >= h) {
      // inside the edges by its own size (v2r4 ux: a corner one was cut in half)
      const [dx, dy] = [x - w / 2, y - h / 2];
      const m = Math.max(5, px * 0.8) + 3;
      const k = Math.min((w / 2 - m) / Math.max(1e-6, Math.abs(dx)), (h / 2 - m) / Math.max(1e-6, Math.abs(dy)));
      [x, y] = [w / 2 + dx * k, h / 2 + dy * k];
    }
    const r = Math.max(5, px * 0.8);
    for (const [c, lw] of [['#000', 4], ['#b0f080', 2]] as const) {
      ctx.strokeStyle = c;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  const fs = Math.max(11, Math.min(18, Math.round(px * 1.3)));
  ctx.font = `${fs}px VT323, monospace`;
  ctx.textAlign = 'left';
  for (const [x, y, name] of names) {
    const r = Math.max(5, px * 0.8);
    const tw = ctx.measureText(name).width;
    const lx = x + r + 4 + tw > w ? x - r - 6 - tw : x + r + 4;
    ctx.fillStyle = 'rgba(10, 8, 7, 0.85)';
    ctx.fillRect(lx - 2, y + fs * 0.35 - fs * 0.8, tw + 4, fs);
    ctx.fillStyle = '#b0f080';
    ctx.fillText(name, lx, y + fs * 0.35);
  }
});

const item = (g: Game, x: number, y: number, it: Item, set: string): Entity => spawn(g, { kind: 'item', x, y, item: it, data: { set } });
const mark = (e: Entity, set: string) => ((e.enemy!.data.set = set), e);

/** make one set piece of this kind at (x, y); far = chunks from the start (the loot's depth) */
export function stage(g: Game, kind: string, x: number, y: number, r: Rng): void {
  const z = zoneAt(x, y);
  const far = farAt(x, y);
  if (kind === 'patrol') {
    const who = PATROL[z] ?? PATROL[1];
    who.forEach((type, k) => {
      const e = mark(foe(g, type, x + (k - (who.length - 1) / 2) * 0.3, y), 'patrol');
      e.enemy!.data.noticed = true;
    });
    say(g, ['feet in step, coming your way: a patrol, ', ...where(g, x, y)]);
  } else if (kind === 'reliquary') {
    // never a module you already have, if four rolls can help it (playtest r2 pace)
    item(g, x, y, fresh(g, lootMod(r, far + 2, undefined, !g.floor), r, far + 2), 'reliquary');
    item(g, x, y, { kind: 'res', res: r.pick(['bone', 'glass'] as const), n: r.int(2, 4) }, 'reliquary');
    say(g, ['a reliquary stands open, ', ...where(g, x, y)]);
  } else if (kind === 'collapse') {
    item(g, x, y, { kind: 'res', res: r.pick(['bone', 'glass'] as const), n: r.int(2, 3) }, 'collapse');
    (RUBBLE[z] ?? RUBBLE[1]).forEach((type, k) => (mark(foe(g, type, x + k * 0.3, y), 'collapse').enemy!.data.noticed = true));
    say(g, ['a vault caves in. something woke in the rubble, ', ...where(g, x, y)]);
  } else if (kind === 'machine') {
    const it = fresh(g, lootMod(r, far + 1, undefined, !g.floor), r, far + 1);
    if (it.kind === 'mod') {
      const nums = Object.entries(MODS[it.mod]?.params ?? {}).filter(([k, v]) => typeof v === 'number' && BETTER[k]);
      if (nums.length) {
        const key = r.pick(nums)[0];
        it.roll = { key, mult: rollMult(key, true), tag: 'attuned' };
      }
    }
    item(g, x, y, it, 'machine');
    say(g, ['a dead machine. something in it still works, ', ...where(g, x, y)]);
  } else if (kind === 'flare') {
    item(g, x, y, { kind: 'mod', mod: r.pick(FURNACE_KIT) }, 'flare');
    mark(foe(g, 'pyre', x, y + 0.01), 'flare');
    say(g, ['a pyre lamp lights up over loot, ', ...where(g, x, y)]);
  }
  g.events.push({ type: 'set', at: [x, y], data: kind });
}

tickHooks.push((g) => {
  if (g.ended) return;
  let s = state.get(g);
  if (!s) state.set(g, (s = { next: FIRST, n: 0 }));
  if (g.t < s.next) return;
  const z = zoneAt(g.player.x, g.player.y);
  // the cradle has enough early on; and not in the middle of a fight
  const busy = g.ents.some((e) => e.enemy?.data.noticed && dist(e, g.player) < 8);
  if ((z === 0 && g.t < CRADLE) || busy) return void (s.next = g.t + 10);
  // not behind a body on the move (a pilot's walk, a long leg): it comes where you stop (playtest r2 pace)
  if (g.player.path.length > 2) return void (s.next = g.t + 1);
  const r = rng(hash(g.seed, 71, s.n));
  const kinds = KINDS[z];
  if (!kinds) return void (s.next = g.t + 30); // the heart: nothing but its keeper
  // walk the zone's kinds in a seed-shuffled order, so two in a row differ
  let kind = kinds[(hash(g.seed, 72) + s.n) % kinds.length];
  if (FOES.includes(kind) && g.player.hp < g.player.maxHp * FIT) kind = r.pick(['machine', 'reliquary']);
  const at = nearCell(g, r);
  if (!at) return void (s.next = g.t + 5);
  stage(g, kind, at[0], at[1], r);
  s.n++;
  s.next = g.t + EVERY + r() * SPREAD;
});
