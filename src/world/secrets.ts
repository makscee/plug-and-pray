// Secrets: things only some eyes show (playtest r1: "every eye shows the same corridor"). Placed by
// chunk and seed, nothing in the world until an eye finds them:
//   hands   warm handprints on the floor, a trail to a warm plate with a cache under it. heat only.
//   script  scripture scratched into a wall: it names a place (a vector). black & white or outlines.
//   hollow  a wall that is a shell over a sealed niche. sonar hears it; `break` (any weapon) or dig opens it.
// And mimics breathe on a heat or a black & white eye. Pure (no three, no DOM): the scene draws them.

import { CHUNK, Cell, cell, chunkHook, setCell, veinOf } from '../core/grid';
import { dist, itemName, say, spawn, tickHooks } from '../core/game';
import { active, label, param } from '../core/mods';
import { hash, rng, type Rng } from '../core/rng';
import { goThere, verb } from '../core/verbs';
import type { Chunk, Entity, Game, Inst, Line } from '../core/types';
import { eyeRange } from '../mods/sense';
import { generate, rooms } from './gen';
import { eyeChunk, lootMod, opening, shopAt } from './spawn';
import { bearing } from './vectors';
import { ZONES, zoneAt, zoneOf } from './zones';
import { isArrival, stairsChunk, thinAhead } from './floors';

export type Kind = 'hands' | 'script' | 'hollow';

export interface Secret {
  kind: Kind;
  /** the cell of the thing: the wall (script, hollow) or the warm plate (hands) */
  x: number;
  y: number;
  /** a wall's face: the step from the wall into the floor it faces */
  fx: number;
  fy: number;
  /** hands: the cells the prints cross, far end first; hollow: the niche behind the shell */
  trail: [number, number][];
  /** an eye has shown it (told once) */
  found: boolean;
  /** paid out: the cache taken, the scripture read, the shell broken */
  done: boolean;
  /** a few words picked for it (scripture) */
  salt: number;
  /** v2r2 ux: the first eye's niche (known from the start: the map's ◆ marks it; it pays only the eye) */
  eye?: boolean;
}

/** which eye filters show each kind (and mimics breathing) */
export const SHOWS: Record<Kind | 'breath' | 'veins', string[]> = { hands: ['heat'], script: ['1bit', 'edge'], hollow: ['sonar'], breath: ['heat', '1bit'], veins: ['color'] };

const all = new WeakMap<Game, Secret[]>();
export function secrets(g: Game): Secret[] {
  let s = all.get(g);
  if (!s) all.set(g, (s = []));
  return s;
}

/** reveals so far this run (codex firsts count elsewhere): for the sims and the end card */
export const reveals = (g: Game): number => secrets(g).filter((s) => s.found && !s.eye).length + (breathed.get(g)?.size ?? 0);

// ---- placing: one secret in about half the chunks past the start, the kind weighted by zone

/** [hands, script, hollow] weights per zone: the furnace washes out heat, so fewer hands there */
const WEIGHTS = [[0.2, 0.4, 0.4], [0.3, 0.15, 0.55], [0.4, 0.3, 0.3], [0.15, 0.4, 0.45]];
export const CHANCE = 0.5;
/** v2 floors: the choir nave echoes, so more of its chunks hide something (mostly hollow walls) */
const CHANCE_BY_FLOOR: Record<number, number> = { 1: 0.8 };

const F = (c: Chunk, x: number, y: number) => x >= 0 && y >= 0 && x < CHUNK && y < CHUNK && c.cells[y * CHUNK + x] === Cell.floor;
const W = (c: Chunk, x: number, y: number) => x >= 0 && y >= 0 && x < CHUNK && y < CHUNK && c.cells[y * CHUNK + x] === Cell.wall;
const STEPS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** a floor cell and the wall beside it: [x, y, dx, dy] with the wall at x+dx, y+dy (local cells) */
function faces(c: Chunk, inside: (x: number, y: number) => boolean): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let y = 1; y < CHUNK - 1; y++)
    for (let x = 1; x < CHUNK - 1; x++) {
      if (!F(c, x, y) || !inside(x, y)) continue;
      for (const [dx, dy] of STEPS) if (W(c, x + dx, y + dy)) out.push([x, y, dx, dy]);
    }
  return out;
}

const inRoom = (seed: number, c: Chunk) => {
  const rs = rooms(seed, c.cx, c.cy);
  return (x: number, y: number) => rs.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
};

/** the three faces nearest a local cell: the cradle's secrets stand by its reliquary */
const closest = (list: [number, number, number, number][], [bx, by]: [number, number]) =>
  [...list].sort((a, b) => Math.hypot(a[0] - bx, a[1] - by) - Math.hypot(b[0] - bx, b[1] - by)).slice(0, 3);

/** a shell over a niche: the wall beside a floor cell, and a wall cell behind it that touches no floor */
function hollow(r: Rng, c: Chunk, seed: number, by?: [number, number]): Omit<Secret, 'kind' | 'found' | 'done' | 'salt'> | null {
  const ok = faces(c, () => true).filter(([x, y, dx, dy]) => {
    const [wx, wy, px, py] = [x + dx, y + dy, x + 2 * dx, y + 2 * dy];
    if (px < 1 || py < 1 || px > CHUNK - 2 || py > CHUNK - 2 || !W(c, px, py)) return false;
    // the shell's sides are wall, and the niche touches nothing open but the shell
    if (F(c, wx + dy, wy + dx) || F(c, wx - dy, wy - dx)) return false;
    return !STEPS.some(([sx, sy]) => (px + sx !== wx || py + sy !== wy) && F(c, px + sx, py + sy));
  });
  if (!ok.length) return null;
  const room = inRoom(seed, c);
  const best = ok.filter(([x, y]) => room(x, y));
  const [x, y, dx, dy] = r.pick(by ? closest(ok, by) : best.length ? best : ok);
  const [ox, oy] = [c.cx * CHUNK, c.cy * CHUNK];
  return { x: ox + x + dx, y: oy + y + dy, fx: -dx, fy: -dy, trail: [[ox + x + 2 * dx, oy + y + 2 * dy]] };
}

/** a scratched wall: any wall face, a chamber's first */
function script(r: Rng, c: Chunk, seed: number, by?: [number, number], skip?: Secret | null): Omit<Secret, 'kind' | 'found' | 'done' | 'salt'> | null {
  const room = inRoom(seed, c);
  const free = ([x, y, dx, dy]: number[]) => !skip || skip.x !== c.cx * CHUNK + x + dx || skip.y !== c.cy * CHUNK + y + dy;
  const ok = faces(c, room).filter(free);
  const list = ok.length ? ok : faces(c, () => true).filter(free);
  if (!list.length) return null;
  const [x, y, dx, dy] = r.pick(by ? closest(list, by) : list);
  return { x: c.cx * CHUNK + x + dx, y: c.cy * CHUNK + y + dy, fx: -dx, fy: -dy, trail: [] };
}

/** a warm plate in a chamber, and the walk of prints that leads to it: 4 to 8 cells of floor */
function hands(r: Rng, c: Chunk, seed: number): Omit<Secret, 'kind' | 'found' | 'done' | 'salt'> | null {
  const room = inRoom(seed, c);
  const plates: [number, number][] = [];
  for (let y = 1; y < CHUNK - 1; y++) for (let x = 1; x < CHUNK - 1; x++) if (F(c, x, y) && room(x, y)) plates.push([x, y]);
  if (!plates.length) return null;
  const [sx, sy] = r.pick(plates);
  // walk out from the plate over floor; the prints come in from the farthest cell within 8
  const from = new Map<number, number>([[sy * CHUNK + sx, -1]]);
  let edge = [sy * CHUNK + sx];
  let far = edge;
  for (let d = 0; d < 8 && edge.length; d++) {
    const next: number[] = [];
    for (const k of edge)
      for (const [dx, dy] of STEPS) {
        const [x, y] = [(k % CHUNK) + dx, ((k / CHUNK) | 0) + dy];
        const n = y * CHUNK + x;
        if (!F(c, x, y) || from.has(n)) continue;
        from.set(n, k);
        next.push(n);
      }
    if (next.length) far = next;
    edge = next;
  }
  let k = r.pick(far);
  const trail: [number, number][] = [];
  while (k >= 0 && k !== sy * CHUNK + sx) {
    trail.push([c.cx * CHUNK + (k % CHUNK), c.cy * CHUNK + ((k / CHUNK) | 0)]);
    k = from.get(k)!;
  }
  if (trail.length < 4) return null;
  return { x: c.cx * CHUNK + sx, y: c.cy * CHUNK + sy, fx: 0, fy: 0, trail };
}

/** what a chunk hides, if anything: the same for a seed every time */
export function hide(seed: number, c: Chunk): Secret | null {
  const f = zoneOf(c.cx, c.cy);
  const [bx, bly] = stairsChunk(seed, f);
  if (isArrival(c.cx, c.cy) || (c.cx === bx && c.cy === bly) || !WEIGHTS[f]) return null;
  const r = rng(hash(seed, 91, c.cx, c.cy));
  const by = byShop(seed, c);
  if (!r.chance(CHANCE_BY_FLOOR[f] ?? CHANCE) && !by) return null;
  const [wh, ws] = WEIGHTS[Math.max(0, zoneOf(c.cx, c.cy))];
  const roll = r();
  const kind: Kind = by ? 'script' : roll < wh ? 'hands' : roll < wh + ws ? 'script' : 'hollow';
  const at = by ? script(r, c, seed, by, cradleHollow(seed, c)) : (kind === 'hands' ? hands : kind === 'script' ? script : hollow)(r, c, seed);
  return at ? { kind, ...at, found: false, done: false, salt: r.int(0, 999) } : null;
}

/** the first reveal is not left to luck (r2 hook): the reliquary beside the start (`opening`) always sells a
 *  layer eye (bat psalter or carrion eye, src/world/printer.ts), and a scratched wall and a hollow wall stand
 *  by it, so whichever eye you buy has something to show within a minute of home */
function byShop(seed: number, c: Chunk): [number, number] | undefined {
  const [sx, sy] = opening(seed).shop;
  if (c.cx !== sx || c.cy !== sy) return;
  const [x, y] = shopAt(seed, c);
  return [Math.floor(x) - c.cx * CHUNK, Math.floor(y) - c.cy * CHUNK];
}
/** the hollow wall by the cradle reliquary (its own rng, so the chunk's other secret stays as it was) */
export function cradleHollow(seed: number, c: Chunk): Secret | null {
  const by = byShop(seed, c);
  if (!by) return null;
  const r = rng(hash(seed, 96, c.cx, c.cy));
  const at = hollow(r, c, seed, by);
  return at ? { kind: 'hollow', ...at, found: false, done: false, salt: r.int(0, 999) } : null;
}

/** the layer eye the cradle reliquary keeps (src/world/printer.ts), one per seed: the bat psalter only where the
 *  hollow wall fits by it, else the carrion eye for the scratched wall */
export const CRADLE_EYES = ['bat-psalter', 'carrion-eye'];
export function cradleEye(seed: number): string {
  const [sx, sy] = opening(seed).shop;
  const eye = rng(hash(seed, 65)).pick(CRADLE_EYES);
  return eye === 'bat-psalter' && !cradleHollow(seed, generate(seed, sx, sy)) ? 'carrion-eye' : eye;
}

/** v2r2 ux: the first eye's niche: a shell over a niche in its chunk (src/world/spawn.ts eyeChunk), in a chamber
 *  if it can, and no floor touching the niche even on a diagonal (so nothing takes it through the wall). Its own
 *  rng, so the chunk's other secret stays as it was; null where no wall fits (the eye then lies on the floor) */
export function eyeNiche(seed: number, c: Chunk): Secret | null {
  const [ex, ey] = eyeChunk(seed);
  if (c.cx !== ex || c.cy !== ey) return null;
  const ok = faces(c, () => true).filter(([x, y, dx, dy]) => {
    const [wx, wy, px, py] = [x + dx, y + dy, x + 2 * dx, y + 2 * dy];
    if (px < 1 || py < 1 || px > CHUNK - 2 || py > CHUNK - 2 || !W(c, px, py)) return false;
    if (F(c, wx + dy, wy + dx) || F(c, wx - dy, wy - dx)) return false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((px + i !== wx || py + j !== wy) && F(c, px + i, py + j)) return false;
    return true;
  });
  if (!ok.length) return null;
  const room = inRoom(seed, c);
  const best = ok.filter(([x, y]) => room(x, y));
  const r = rng(hash(seed, 98, c.cx, c.cy));
  const [x, y, dx, dy] = r.pick(best.length ? best : ok);
  const [ox, oy] = [c.cx * CHUNK, c.cy * CHUNK];
  return { kind: 'hollow', x: ox + x + dx, y: oy + y + dy, fx: -dx, fy: -dy, trail: [[ox + x + 2 * dx, oy + y + 2 * dy]], found: true, done: false, salt: 0, eye: true };
}

/** where the first eye's niche is broken from: the floor cell its shell faces, while it is sealed */
export function sealedEye(g: Game): Secret | undefined {
  return secrets(g).find((s) => s.eye && !s.done);
}

chunkHook((g, c) => {
  // the first eye: in its niche, else on the far side of its chunk
  const [ex, ey] = eyeChunk(g.seed);
  if (c.cx === ex && c.cy === ey) {
    const n = eyeNiche(g.seed, c);
    if (n) secrets(g).push(n);
    const [x, y] = n ? n.trail[0] : (() => {
      const r = rng(hash(g.seed, 71, c.cx, c.cy));
      const fl: [number, number][] = [];
      for (let j = 1; j < CHUNK - 1; j++) for (let i = 1; i < CHUNK - 1; i++) if (F(c, i, j)) fl.push([i, j]);
      const far = fl.sort((a, b) => Math.hypot(b[0] - 8, b[1] - 8) - Math.hypot(a[0] - 8, a[1] - 8)).slice(0, 6);
      const [i, j] = far.length ? r.pick(far) : [8, 8];
      return [c.cx * CHUNK + i, c.cy * CHUNK + j];
    })();
    spawn(g, { kind: 'item', x: x + 0.5, y: y + 0.5, item: { kind: 'mod', mod: 'pinhole-eye' }, data: n ? { sealed: [n.x + n.fx, n.y + n.fy] } : undefined });
  }
  const s = hide(g.seed, c);
  if (s) secrets(g).push(s);
  const h = cradleHollow(g.seed, c);
  if (h) secrets(g).push(h);
});

// ---- finding: an eye with the right filter, on and warm, near enough and with a line to it

/** the eyes on now whose filter shows this kind */
export const eyesFor = (g: Game, kind: Kind | 'breath' | 'veins'): Inst[] => active(g, 'camera').filter((i) => SHOWS[kind].includes(param<string>(i, 'filter', '')));

/** the middle of a wall's face, a hair out into the floor */
const faceAt = (s: Secret): [number, number] => [s.x + 0.5 + s.fx * 0.55, s.y + 0.5 + s.fy * 0.55];

/** a straight line over open floor (a wall face's own point stands on floor) */
function sight(g: Game, x: number, y: number): boolean {
  const p = g.player;
  const n = Math.ceil(Math.hypot(x - p.x, y - p.y) * 3);
  for (let k = 1; k < n; k++) if (cell(g, p.x + ((x - p.x) * k) / n, p.y + ((y - p.y) * k) / n) !== Cell.floor) return false;
  return true;
}

/** within this eye's view: its range (at most `max`) and its cone, give or take */
function inView(g: Game, inst: Inst, x: number, y: number, max: number): boolean {
  const p = g.player;
  const d = Math.hypot(x - p.x, y - p.y);
  if (d > Math.min(max, eyeRange(g, inst))) return false;
  if (d < 1.2) return true;
  const a = Math.atan2(x - p.x, -(y - p.y)) - p.dir;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= ((param<number>(inst, 'fov', 60) / 2 + 12) * Math.PI) / 180;
}

// a unique's title starts with "the" already (the saint's last lens): the lines below say "the " themselves
const eyeName = (i: Inst) => label(i).replace(/^the /, '');
const WORD = ['n', 'e', 's', 'w'];
const sideOf = (g: Game, s: Secret) => {
  const [dx, dy] = [-s.fx, -s.fy];
  const p = g.player;
  // the shell as seen from where you stand: the side it lies on
  const ax = s.x + 0.5 - p.x, ay = s.y + 0.5 - p.y;
  if (Math.abs(ax) > Math.abs(ay)) return ax > 0 ? 'e' : 'w';
  if (ay !== 0) return ay > 0 ? 's' : 'n';
  return WORD[STEPS.findIndex(([x, y]) => x === dx && y === dy)];
};

/** the scripture's words: a line of the dead god's liturgy, then the place it names */
const VERSES = [
  'here the choir knelt. here it was eaten.',
  'we kept the furnace. the furnace kept us.',
  'count the ribs. the ninth is a door.',
  'it was warm once. it will be.',
  'do not wake the abbot. he counts.',
  'the saint does not burn. he is the burning.',
  'eight eyes for the god. the ninth for us.',
  'what you see is what sees you.',
];

/** the place a scratched wall names: the nearest cache not found yet, within three chunks (the scratches know
 *  where the dead hid things; the way down stays the cards' to tell). r2 decide: caches only, so a hollow wall still
 *  wants sonar: each eye owns one layer (carrion and lattice scripture, the bat psalter shells, heat the prints) */
function names(g: Game, s: Secret): [number, number, string] | null {
  // the cradle's scratched wall names the hollow wall beside it (r2 hook: the first reveal chain), and told is
  // as good as heard there: reading it lets you break that shell
  const [cx, cy] = [Math.floor(s.x / CHUNK), Math.floor(s.y / CHUNK)];
  const [ox, oy] = opening(g.seed).shop;
  const shell = cx === ox && cy === oy && secrets(g).find((o) => o.kind === 'hollow' && !o.done && Math.floor(o.x / CHUNK) === cx && Math.floor(o.y / CHUNK) === cy);
  if (shell) {
    shell.found = true;
    return [shell.x + 0.5 + shell.fx, shell.y + 0.5 + shell.fy, 'hollow wall'];
  }
  const other = secrets(g)
    .filter((o) => o.kind === 'hands' && !o.found && !o.done && Math.hypot(o.x - s.x, o.y - s.y) < CHUNK * 3)
    .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  if (!other) return null;
  return [other.x + 0.5 + other.fx, other.y + 0.5 + other.fy, 'warm cache'];
}

/** the loot of a secret: a module a tier up, and resources */
function pay(g: Game, s: Secret, x: number, y: number, extra: Entity['item'][]): string {
  const r = rng(hash(g.seed, 93, s.x, s.y));
  const far = Math.hypot(Math.floor(s.x / CHUNK), Math.floor(s.y / CHUNK));
  const items = [lootMod(r, far + 1.5, undefined, !g.floor), ...extra];
  for (const it of items) spawn(g, { kind: 'item', x, y, item: it! });
  return items.map((it) => itemName(it!)).join(', ');
}

function open(g: Game, s: Secret, how: string): void {
  if (s.done) return;
  s.done = true;
  s.found = true;
  const [px, py] = s.trail[0];
  setCell(g, s.x, s.y, Cell.floor);
  setCell(g, px, py, Cell.floor);
  if (s.eye) {
    g.events.push({ type: 'dig', at: [s.x + 0.5, s.y + 0.5] }, { type: 'reveal', at: [px + 0.5, py + 0.5], data: 'hollow' });
    for (const e of g.ents) if (e.data?.sealed) delete e.data.sealed;
    return say(g, [`the cracked wall gives. in the niche behind it a bead of black glass looks back: an eye. `, { text: 'go in', cmd: `go ${sideOf(g, s)} 1` }, ' then ', { text: 'take', cmd: 'take' }]);
  }
  const r = rng(hash(g.seed, 94, s.x, s.y));
  const got = pay(g, s, px + 0.5, py + 0.5, [{ kind: 'res', res: r.pick(['copper', 'glass'] as const), n: r.int(2, 3) }, ...(r.chance(0.5) ? [{ kind: 'res' as const, res: 'ichor' as const, n: 1 }] : [])]);
  g.events.push({ type: 'dig', at: [s.x + 0.5, s.y + 0.5] }, { type: 'reveal', at: [px + 0.5, py + 0.5], data: 'hollow' });
  say(g, [`${how} a niche no door ever reached. in it: ${got}. `, { text: 'go in', cmd: `go ${sideOf(g, s)} 2` }]);
}

/** a hollow wall beside you (n e s w), found or not */
export const hollowBeside = (g: Game): Secret | undefined => {
  const i = Math.floor(g.player.x), j = Math.floor(g.player.y);
  return secrets(g).find((s) => s.kind === 'hollow' && !s.done && Math.abs(s.x - i) + Math.abs(s.y - j) === 1);
};

/** r2 decide: where to stand to break a found shell: the floor cell its face looks onto, and the side the wall is on */
function standFor(g: Game, s: Secret): Line {
  const [far, go] = goThere(g, s.x + s.fx + 0.5, s.y + s.fy + 0.5);
  const side = WORD[STEPS.findIndex(([x, y]) => x === -s.fx && y === -s.fy)];
  return [`stand ${far}, the shell is the wall to its ${side}. `, go];
}

verb('break', {
  help: 'break a hollow wall beside you with a weapon (loud); in the cradle, any thin wall you face',
  when: (g) => active(g, 'weapon').length > 0 && (!!hollowBeside(g)?.found || !!thinAhead(g)),
  whenFail(g) {
    if (!active(g, 'weapon').length) return 'break: nothing on you can break a wall. any weapon can.';
    const p = g.player;
    const s = secrets(g).filter((o) => o.kind === 'hollow' && o.found && !o.done && dist({ x: o.x + 0.5, y: o.y + 0.5 }, p) < 12).sort((a, b) => dist({ x: a.x, y: a.y }, p) - dist({ x: b.x, y: b.y }, p))[0];
    if (!s) return g.floor === 0 ? 'break: face a wall one cell thick with floor behind it, or find a hollow wall (a sonar eye hears them).' : 'break: no hollow wall known here. a sonar eye hears them.';
    return ['no hollow wall beside you: ', ...standFor(g, s)];
  },
  run(g) {
    const s = hollowBeside(g);
    const thin = !s?.found && thinAhead(g);
    if (thin && active(g, 'weapon').length) {
      // v2 floors: the cradle's thin walls give way to any weapon, a short cut (and now and then a chip of bone)
      for (const e of g.ents) if (e.enemy && dist(e, g.player) <= 5) e.enemy.data.noticed = true;
      setCell(g, thin[0], thin[1], Cell.floor);
      g.events.push({ type: 'dig', at: [thin[0] + 0.5, thin[1] + 0.5] }, { type: 'noise', at: [g.player.x, g.player.y], data: 5 });
      const chip = rng(hash(g.seed, 97, thin[0], thin[1])).chance(0.35);
      if (chip) spawn(g, { kind: 'item', x: thin[0] + 0.5, y: thin[1] + 0.5, item: { kind: 'res', res: 'bone', n: 1 } });
      return say(g, `the thin wall gives. a way through${chip ? ', and a chip of bone in the rubble' : ''}.`);
    }
    if (!s) return say(g, 'the wall rings dull. solid.');
    if (!active(g, 'weapon').length) return say(g, 'nothing on you can break a wall.');
    // loud: what is near hears the stone go
    for (const e of g.ents) if (e.enemy && dist(e, g.player) <= 6) e.enemy.data.noticed = true;
    g.events.push({ type: 'noise', at: [g.player.x, g.player.y], data: 6 });
    open(g, s, `your ${label(active(g, 'weapon')[0])} cracks the shell. behind it,`);
  },
});

/** mimics told about, per game (by entity id) */
const breathed = new WeakMap<Game, Set<number>>();
/** eye filters told what they show, per game */
const taught = new WeakMap<Game, Set<string>>();

/** what an eye shows that others don't, told the first time an eye with that filter is warm */
const TEACH: Record<string, string> = {
  heat: 'shows what is warm: handprints on the floor where the dead machines crawled, and mimics breathing.',
  sonar: 'hears walls as echoes. a wall that rings hollow is a shell: break it, there is a niche behind.',
  '1bit': 'sees in black and white what colour hides: scripture scratched into the walls, and mimics breathing.',
  edge: 'traces every scratch: scripture cut into the walls shows as lines.',
  color: 'sees colour true: veins of glass, copper and ichor glint in the walls, and it names them. a needle or an auger drains them.',
};
const KINDS: Record<string, Kind> = { heat: 'hands', sonar: 'hollow', '1bit': 'script', edge: 'script' };
/** the eye filters that show a hidden layer (the UI keeps such an eye's window open) */
export const LAYERS = Object.keys(KINDS);

/** how much of an eye's layer lies within two chunks: "rings hollow here: 3 shells within 2 chunks." */
function layerHere(g: Game, f: string): string {
  const p = g.player;
  const R = CHUNK * 2;
  const n = (k: number, one: string, many: string) => `${k || 'no'} ${k === 1 ? one : many}`;
  if (f === 'color') {
    let k = 0;
    for (let y = Math.floor(p.y) - R; y <= Math.floor(p.y) + R; y++)
      for (let x = Math.floor(p.x) - R; x <= Math.floor(p.x) + R; x++) {
        const v = veinOf(cell(g, x, y));
        if (v && v !== 'bone' && !named.get(g)?.has(`${x},${y}`)) k++;
      }
    return k ? `glints here: ${n(k, 'vein', 'veins')} of glass, copper or ichor within 2 chunks.` : 'hides nothing from it here: no veins of glass, copper or ichor within 2 chunks.';
  }
  const k = secrets(g).filter((s) => s.kind === KINDS[f] && !s.done && Math.hypot(s.x - p.x, s.y - p.y) < R).length;
  // v2r3 ux: "is scratched here: no walls of scripture" said yes and no at once
  if (!k) return `hides nothing from it here: no ${f === 'sonar' ? 'hollow shells' : f === 'heat' ? 'handprints' : 'scripture'} within 2 chunks.`;
  if (f === 'sonar') return `rings hollow here: ${n(k, 'shell', 'shells')} within 2 chunks.`;
  if (f === 'heat') return `runs warm here: ${n(k, 'trail', 'trails')} of handprints within 2 chunks.`;
  return `is scratched here: ${n(k, 'wall', 'walls')} of scripture within 2 chunks.`;
}

tickHooks.push((g) => {
  const p = g.player;
  const list = secrets(g);
  let t = taught.get(g);
  if (!t) taught.set(g, (t = new Set()));
  const z = Math.max(0, zoneAt(p.x, p.y));
  for (const i of active(g, 'camera')) {
    const f = param<string>(i, 'filter', '');
    // told once per filter, then again in each new zone (how much of its layer lies here: the cue to swap eyes)
    if (!TEACH[f] || t.has(`${f}@${z}`)) continue;
    t.add(`${f}@${z}`);
    if (t.has(f)) {
      say(g, `the ${eyeName(i)}: ${ZONES[z].name} ${layerHere(g, f)}`);
      continue;
    }
    t.add(f);
    const near = list.filter((s) => s.kind === KINDS[f] && !s.done).sort((a, b) => dist({ x: a.x + 0.5, y: a.y + 0.5 }, p) - dist({ x: b.x + 0.5, y: b.y + 0.5 }, p))[0];
    const where = near && dist({ x: near.x, y: near.y }, p) < CHUNK * 2.5 ? ` the nearest lies ${bearing(g, near.x + 0.5, near.y + 0.5)}.` : '';
    say(g, `the ${eyeName(i)} ${TEACH[f]}${where}`);
  }
  for (const s of list) {
    if (s.done || Math.abs(s.x - p.x) > 12 || Math.abs(s.y - p.y) > 12) continue;
    if (s.kind === 'hands') {
      const eye = eyesFor(g, 'hands')[0];
      const sent = g.vectors.some((v) => v.card === 'scratch' && Math.floor(v.x) === s.x && Math.floor(v.y) === s.y);
      if (!eye && !sent) continue;
      if (eye && !s.found && s.trail.some(([x, y]) => inView(g, eye, x + 0.5, y + 0.5, 6) && sight(g, x + 0.5, y + 0.5))) {
        s.found = true;
        g.events.push({ type: 'reveal', at: [s.x + 0.5, s.y + 0.5], data: 'hands' });
        eye.data.flashAt = g.t;
        say(g, `the ${eyeName(eye)} shows handprints on the floor, still warm. they crawl somewhere. follow them.`);
      }
      // the plate pays out to the heat eye, or to whoever the scratches sent here
      if (Math.floor(p.x) === s.x && Math.floor(p.y) === s.y) {
        s.done = s.found = true;
        const r = rng(hash(g.seed, 95, s.x, s.y));
        const got = pay(g, s, s.x + 0.5, s.y + 0.5, [{ kind: 'res', res: r.pick(['bone', 'glass', 'copper'] as const), n: r.int(3, 4) }, { kind: 'res', res: 'copper', n: r.int(1, 2) }]);
        g.events.push({ type: 'reveal', at: [s.x + 0.5, s.y + 0.5], data: 'cache' });
        say(g, [`the prints end at a floor plate, warm from a hundred hands. under it: ${got}. `, { text: 'take', cmd: 'take' }]);
      }
    } else if (s.kind === 'script') {
      const eye = eyesFor(g, 'script').find((i) => inView(g, i, ...faceAt(s), 3.5));
      if (!eye || !sight(g, ...faceAt(s))) continue;
      s.found = s.done = true;
      const verse = VERSES[s.salt % VERSES.length];
      const at = names(g, s);
      const line: Line = [`the ${eyeName(eye)} reads scripture scratched into the wall: "${verse}"`];
      if (at) {
        g.vectors.push({ card: 'scratch', x: at[0], y: at[1], what: at[2], found: false });
        line.push(` it names a place. vector: ${bearing(g, at[0], at[1])}. ${at[2]}. `, { text: 'vectors', cmd: 'vectors' });
      }
      g.events.push({ type: 'reveal', at: faceAt(s), data: 'script' });
      eye.data.flashAt = g.t;
      say(g, line);
    } else if (s.kind === 'hollow') {
      // a digger (or the drain) got there first: the niche is open
      if (cell(g, s.x, s.y) === Cell.floor) {
        open(g, s, 'the wall gives onto');
        continue;
      }
      if (s.found) continue;
      const eye = eyesFor(g, 'hollow').find((i) => inView(g, i, ...faceAt(s), 4));
      if (!eye || !sight(g, ...faceAt(s))) continue;
      s.found = true;
      g.events.push({ type: 'reveal', at: faceAt(s), data: 'hollow' });
      eye.data.flashAt = g.t;
      // r2 decide: name the cell to stand on ("the wall to the s" pointed one cell off)
      if (hollowBeside(g) === s) say(g, [`the ${eyeName(eye)}'s song comes back hollow: the wall beside you is a shell. `, { text: 'break', cmd: 'break' }, ' it (any weapon), or dig.']);
      else say(g, [`the ${eyeName(eye)}'s song comes back hollow: a wall is a shell. `, ...standFor(g, s), ' then ', { text: 'break', cmd: 'break' }, ' it (any weapon), or dig.']);
    }
  }
  veins(g);
  // mimics breathe: a heat or black & white eye sees the chest on the floor rise and fall
  const breath = eyesFor(g, 'breath');
  if (!breath.length) return;
  let told = breathed.get(g);
  if (!told) breathed.set(g, (told = new Set()));
  for (const e of g.ents) {
    if (e.kind !== 'item' || !e.data?.mimic || told.has(e.id)) continue;
    const eye = breath.find((i) => inView(g, i, e.x, e.y, 7));
    if (!eye || !sight(g, e.x, e.y)) continue;
    told.add(e.id);
    g.events.push({ type: 'reveal', at: [e.x, e.y], data: 'breath' });
    eye.data.flashAt = g.t;
    say(g, `the ${eyeName(eye)} sees the ${e.item ? itemName(e.item) : 'thing'} on the floor rise and fall. it breathes. a mimic, waiting for a hand.`);
  }
});


// ---- veins: a colour eye names them (r2 decide: the colour eyes had no layer of their own)

/** vein cells a colour eye has named, per game */
const named = new WeakMap<Game, Set<string>>();
export const isNamed = (g: Game, x: number, y: number): boolean => !!named.get(g)?.has(`${x},${y}`);
/** the nearest point of a wall cell's face toward you: a hair out of the wall */
const wallFace = (g: Game, x: number, y: number): [number, number] => {
  const p = g.player;
  const cx = Math.max(x, Math.min(x + 1, p.x)), cy = Math.max(y, Math.min(y + 1, p.y));
  const d = Math.hypot(p.x - cx, p.y - cy) || 1;
  return [cx + ((p.x - cx) / d) * 0.05, cy + ((p.y - cy) / d) * 0.05];
};
const compass = (dx: number, dy: number) => ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) / 45) % 8];

/** veins a colour eye sees now (in its view, a line to the wall), not named yet: nearest first */
export function veinsSeen(g: Game): { x: number; y: number; res: string; eye: Inst }[] {
  const eyes = eyesFor(g, 'veins');
  if (!eyes.length) return [];
  const told = named.get(g);
  const p = g.player;
  const R = 9;
  const out: { x: number; y: number; res: string; eye: Inst; d: number }[] = [];
  for (let y = Math.floor(p.y) - R; y <= Math.floor(p.y) + R; y++)
    for (let x = Math.floor(p.x) - R; x <= Math.floor(p.x) + R; x++) {
      const res = veinOf(cell(g, x, y));
      // bone is everywhere: the eye names what is scarce
      if (!res || res === 'bone' || told?.has(`${x},${y}`)) continue;
      const [fx, fy] = wallFace(g, x, y);
      const eye = eyes.find((i) => inView(g, i, fx, fy, R));
      if (!eye || !sight(g, fx, fy)) continue;
      out.push({ x, y, res, eye, d: Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) });
    }
  return out.sort((a, b) => a.d - b.d);
}

function veins(g: Game): void {
  const seen = veinsSeen(g);
  if (!seen.length) return;
  let told = named.get(g);
  if (!told) named.set(g, (told = new Set()));
  for (const v of seen) told.add(`${v.x},${v.y}`);
  const [v] = seen;
  const p = g.player;
  const d = Math.round(Math.hypot(v.x + 0.5 - p.x, v.y + 0.5 - p.y));
  const more = seen.length > 1 ? ` (${seen.length - 1} more vein${seen.length > 2 ? 's' : ''} in view)` : '';
  g.events.push({ type: 'reveal', at: [v.x + 0.5, v.y + 0.5], data: 'vein' });
  v.eye.data.flashAt = g.t;
  say(g, `the ${eyeName(v.eye)}: a vein of ${v.res} glints, ${d <= 1 ? 'beside you' : `${d} cells ${compass(v.x + 0.5 - p.x, v.y + 0.5 - p.y)}`}.${more}`);
}
