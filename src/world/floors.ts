// Floors (v2): the run is four bounded floors and the heart. Each floor is a 5×5-chunk level of its own,
// laid side by side far apart on the one grid (floor f's chunks sit around chunk (f * STRIDE, 0)), so
// coordinates stay unique and everything that reads the grid keeps working. Outside a floor's chunks is
// solid rock. You arrive in the middle chunk; the stairs down lie in a corner chunk, behind a boss room.
// Entering the room wakes the floor's boss (`spawnBoss`); its death opens the stairs (`onBossDown`), and
// `descend` takes you down. Floor 5 is the heart: an arena, and the boss there is the end (the thaw).
//
// Pure of the DOM and of the other world slices (only core imports), so the generator, the zones and the
// bosses can all import it without a cycle.

import { CHUNK, Cell, cell, chunkHook, ensure } from '../core/grid';
import { dist, ENEMIES, say, spawn, tickHooks } from '../core/game';
import { hash } from '../core/rng';
import { verb } from '../core/verbs';
import type { Entity, Game, Line } from '../core/types';
import { offer } from '../end/timeline';

export type Stairs = 'rope' | 'spiral' | 'chute' | 'lift';

export interface Floor {
  id: number;
  name: string;
  /** the sight layer's hint: wall tint and fog (hex), how dark */
  look: { tint: string; fog: string; dark: number };
  /** what it says when you arrive */
  enter: string;
  /** how this floor plays differently, one line (told on arrival, and by `where`) */
  gimmick: string;
  /** foes here hit and last this much more */
  foe: { hp: number; damage: number };
  /** loot tier this floor rolls up to */
  tier: number;
  /** readiness a careful player wants before walking in (the sims' gate) */
  need: number;
  /** what the way down looks like; the heart has none */
  stairs: Stairs | null;
}

export const FLOORS: Floor[] = [
  { id: 0, name: 'the cradle', look: { tint: 'c8a070', fog: '100c0a', dark: 0 }, enter: 'the cradle. warm, close, almost kind.', gimmick: 'the walls here are thin: a weapon breaks a one-cell wall with floor behind it. break.', foe: { hp: 1, damage: 1 }, tier: 0, need: 0, stairs: 'rope' },
  { id: 1, name: 'the choir nave', look: { tint: 'd0b890', fog: '141018', dark: 0.15 }, enter: 'the choir nave. many small voices, all of them hungry.', gimmick: 'the nave echoes: more walls ring hollow here. a sonar eye or listen finds what hides.', foe: { hp: 1.2, damage: 1.15 }, tier: 1, need: 9, stairs: 'spiral' },
  { id: 2, name: 'the ossuary', look: { tint: '9aa8b0', fog: '080a10', dark: 0.4 }, enter: 'the ossuary. the marrow is cold: without a lamp you will not mend.', gimmick: 'dark and cold: no mending without a light, and your light sets how far you see.', foe: { hp: 1.7, damage: 1.45 }, tier: 2, need: 40, stairs: 'chute' },
  { id: 3, name: 'the furnace', look: { tint: 'ff7a40', fog: '200804', dark: 0.25 }, enter: 'the furnace. the god\'s heat sears here: keep it off or burn.', gimmick: 'the heat sears you every second unless something keeps it off. a rime hood does.', foe: { hp: 1.85, damage: 1.5 }, tier: 2, need: 70, stairs: 'lift' },
  { id: 4, name: 'the heart', look: { tint: 'ff5060', fog: '200408', dark: 0.2 }, enter: 'the heart. it beats around you, slow and enormous.', gimmick: 'the god\'s heart. its keeper waits ahead. end it, and the god thaws.', foe: { hp: 2.2, damage: 1.7 }, tier: 2, need: 95, stairs: null },
];
export const LAST = FLOORS.length - 1;

/** v2 variety: what each floor wants from you, said on arrival (its tricks: src/world/gimmicks.ts, src/fight/dodge.ts) */
export const WANTS: Record<number, string> = {
  0: 'it wants: kite and bite. lead the swarm across floor that cracks; break the thin walls.',
  1: 'it wants: aim. a ◇ over a foe means it sidesteps your first shot: shoot twice. kill a singing cantor first.',
  2: 'it wants: light. no mending without it, and your light draws them to you. armour for the walkers.',
  3: 'it wants: a rime hood, and timing: the vents breathe fire on one beat. cross between.',
  4: 'it wants: everything you have.',
};

/** how the stairs read in words: on arrival, on the map, in the nearby list */
export const STAIRS: Record<Stairs, { name: string; look: string }> = {
  rope: { name: 'the rope pit', look: 'a black pit in the floor, a chain hanging down into it' },
  spiral: { name: 'the candle stair', look: 'a spiral stair winding down, candles burning on every step' },
  chute: { name: 'the bone chute', look: 'a chute of polished bone ribs, sloping down into the dark' },
  lift: { name: 'the lift', look: 'a cage lift on two rails, light rising through its floor' },
};

/** the module ids a floor's arrival cache offers (src/world/cache.ts: five of them, take two): that floor's new kit.
 *  The first is the floor's headline and always on offer (on 3 and 4 the FPS slot: v2-view puts its control module there);
 *  the rest turn with the seed. The cradle's offer holds no eye (its first eye is a find) */
export const KIT: Record<number, string[]> = {
  0: ['choir-bell', 'frost-coat', 'hollow-tap', 'lead-lung', 'thorn-mantle'],
  1: ['nail-psalm', 'dawn-eye', 'survey-spool', 'vein-fork', 'plumb-line'],
  2: ['saints-reins', 'pilgrim-scope', 'illuminated-atlas', 'pulse-choir', 'bone-glass', 'ember-iris', 'censer', 'bone-lance'],
  3: ['martyrs-reins', 'martyr-scope', 'rime-hood', 'glass-diorama', 'heat-lance', 'heart-shard'],
  4: [],
};

// ---- geometry

/** chunks between two floors' middles: far enough that no eye, map or wander ever crosses */
export const STRIDE = 16;
/** a floor spans local chunks -HALF..HALF each way */
export const HALF = 2;

/** the floor a chunk column belongs to (rock between floors belongs to the nearest) */
export const floorOfChunk = (cx: number): number => Math.max(0, Math.min(LAST, Math.round(cx / STRIDE)));
export const floorAt = (x: number): number => floorOfChunk(Math.floor(x / CHUNK));
/** a chunk's place within its floor */
export const local = (cx: number, cy: number): [number, number] => [cx - floorOfChunk(cx) * STRIDE, cy];

/** the heart's approach: chunks of hall between its landing and its arena (r1 pace: the last floor lasted 45 s) */
export const HEART_APPROACH = 2;

/** is this chunk part of a floor (else it is rock)? The heart is a column: the landing, its hall, the arena north of it */
export function inside(cx: number, cy: number): boolean {
  const f = floorOfChunk(cx);
  const [lx, ly] = local(cx, cy);
  if (f === LAST) return lx === 0 && ly <= 0 && ly >= -HEART_APPROACH;
  return Math.abs(lx) <= HALF && Math.abs(ly) <= HALF;
}

/** the old "chunks from the start" for a chunk, so the generator, loot and foes scale as before: each floor
 *  is a band two wide (floor 0: 0..1.9, floor 1: 2..3.9, ...), rising toward its edges */
export function farOf(cx: number, cy: number): number {
  const f = floorOfChunk(cx);
  const [lx, ly] = local(cx, cy);
  return f * 2 + Math.min(1.9, Math.hypot(lx, ly) * 0.68);
}
export const farAt = (x: number, y: number): number => farOf(Math.floor(x / CHUNK), Math.floor(y / CHUNK));

/** the arrival chunk of a floor (where you wake on floor 0) */
export const isArrival = (cx: number, cy: number): boolean => local(cx, cy)[0] === 0 && cy === 0;
/** where you land on a floor: a cell centre */
export const origin = (f: number): [number, number] => [f * STRIDE * CHUNK + 8.5, 8.5];

/** the edge chunk that holds the floor's stairs and boss room (the heart: its arena, north of the landing).
 *  v2 balance (r1 pace: 43% of a run was walking): the middle of an edge, not a corner, about 35 cells out */
export function stairsChunk(seed: number, f: number): [number, number] {
  if (f === LAST) return [f * STRIDE, -HEART_APPROACH];
  const [sx, sy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][hash(seed, 111, f) % 4];
  return [f * STRIDE + sx * HALF, sy * HALF];
}
const cornerOf = (seed: number, f: number): [number, number] => {
  const [cx, cy] = stairsChunk(seed, f);
  return [Math.sign(cx - f * STRIDE), Math.sign(cy)];
};

/** the boss room in local cells of its chunk: [x0, y0, x1, y1] inclusive, 13×13 open (the bosses want room). The heart's arena is wider */
export const ROOM: [number, number, number, number] = [1, 1, 13, 13];
export const ARENA: [number, number, number, number] = [1, 1, 14, 14];
export const roomLocal = (f: number) => (f === LAST ? ARENA : ROOM);

/** the boss room in world cells, inclusive */
export function bossRoom(seed: number, f: number): [number, number, number, number] {
  const [cx, cy] = stairsChunk(seed, f);
  const [x0, y0, x1, y1] = roomLocal(f);
  return [cx * CHUNK + x0, cy * CHUNK + y0, cx * CHUNK + x1, cy * CHUNK + y1];
}
/** where the stairs stand: the room's side farthest from the floor's middle, a cell centre */
export function stairsAt(seed: number, f: number): [number, number] {
  const [x0, y0, x1, y1] = bossRoom(seed, f);
  const [sx, sy] = cornerOf(seed, f);
  const side = (s: number, a: number, b: number) => (s > 0 ? b - 1 : s < 0 ? a + 1 : Math.floor((a + b) / 2));
  return [side(sx, x0, x1) + 0.5, side(sy, y0, y1) + 0.5];
}
/** where the boss stands up: the room's middle */
export function bossAt(seed: number, f: number): [number, number] {
  const [x0, y0, x1, y1] = bossRoom(seed, f);
  return [(x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2];
}
export function inRoom(seed: number, f: number, x: number, y: number): boolean {
  const [x0, y0, x1, y1] = bossRoom(seed, f);
  return x >= x0 && x < x1 + 1 && y >= y0 && y < y1 + 1;
}

/** the floor you stand on now */
export const floorOf = (g: Game): number => g.floor ?? 0;

// ---- per-game state: which bosses woke and fell

interface State {
  woke: Set<number>;
  down: Set<number>;
}
const states = new WeakMap<Game, State>();
const S = (g: Game): State => {
  let s = states.get(g);
  if (!s) states.set(g, (s = { woke: new Set(), down: new Set() }));
  return s;
};
export const bossDown = (g: Game, f = floorOf(g)): boolean => S(g).down.has(f);
export const bossWoke = (g: Game, f = floorOf(g)): boolean => S(g).woke.has(f);

/** the stairs of a floor as an entity, once its chunk exists */
export const stairsOf = (g: Game, f = floorOf(g)): Entity | undefined => g.ents.find((e) => e.data?.stairs && e.data.floor === f);

// ---- bosses: src/fight/bosses.ts makes them; src/world/bosswire.ts joins the two slices (spawn here, down there)

export const bossHooks: { spawn: (g: Game, floor: number, x: number, y: number) => Entity | Entity[] | void } = { spawn: () => undefined };

/** wake the floor's boss in its room (src/fight/bosses.ts spawnBoss, through bossHooks) */
export function spawnBoss(g: Game, f: number, x: number, y: number): Entity | undefined {
  const out = bossHooks.spawn(g, f, x, y);
  const list = Array.isArray(out) ? out : out ? [out] : [];
  // the twin of a pair stands beside its lead: all of them know you are here
  for (const e of g.ents) if (e.enemy?.data.boss && floorAt(e.x) === f) e.enemy.data.noticed = true;
  return list[0];
}

/** the boss is down: the stairs open (the heart's: the god thaws). Safe to call twice */
export function onBossDown(g: Game, f = floorOf(g)): void {
  const s = S(g);
  if (s.down.has(f)) return;
  s.down.add(f);
  g.events.push({ type: 'boss-down', data: f });
  if (f === LAST) {
    if (g.ended) return;
    g.ended = 'thaw';
    g.events.push({ type: 'thaw' });
    const o = offer(g);
    say(g, `the heart's keeper falls. the heart turns over, warming. it drinks what you carry: ${o.total}. ${o.grade}.`);
    return;
  }
  const st = stairsOf(g, f);
  if (st) st.data!.open = true;
  const [x, y] = stairsAt(g.seed, f);
  if (!g.vectors.some((v) => v.what === 'way down' && v.x === x && v.y === y)) g.vectors.push({ card: 'boss', x, y, what: 'way down', found: false });
  const name = STAIRS[FLOORS[f].stairs!].name;
  say(g, `THE WAY DOWN IS OPEN.`, [`${name} unseals behind where it stood. `, { text: 'descend', cmd: 'descend' }, ' when you stand at it.']);
}

// ---- the stairs come with their chunk; the boss wakes when you step into its room

chunkHook((g, c) => {
  const f = floorOfChunk(c.cx);
  const [sx, sy] = stairsChunk(g.seed, f);
  if (c.cx !== sx || c.cy !== sy || !FLOORS[f].stairs) return;
  const [x, y] = stairsAt(g.seed, f);
  spawn(g, { kind: 'prop', x, y, data: { stairs: FLOORS[f].stairs, floor: f, open: S(g).down.has(f) } });
});

tickHooks.push((g) => {
  if (g.ended) return;
  const p = g.player;
  const f = floorOf(g);
  const s = S(g);
  // how far you went: the floors count, so the drone deepens floor by floor
  const [ox, oy] = origin(f);
  g.stats.far = Math.max(g.stats.far, Math.round(f * 40 + Math.hypot(p.x - ox, p.y - oy)));
  if (s.woke.has(f) || s.down.has(f) || !inRoom(g.seed, f, p.x, p.y)) return;
  s.woke.add(f);
  const [bx, by] = bossAt(g.seed, f);
  const boss = spawnBoss(g, f, bx, by);
  g.events.push({ type: 'boss', at: [bx, by], data: f });
  const who = boss ? ENEMIES[boss.enemy!.type]?.name ?? 'something' : 'something';
  say(g, f === LAST ? `⚠ ${who} rises from the heart. this is the last of it.` : `⚠ ${who} wakes in the room before the way down. it will not let you pass.`);
});

// ---- going down

/** standing at your floor's stairs (open or not) */
export const atStairs = (g: Game): Entity | undefined => {
  const st = stairsOf(g);
  return st && dist(st, g.player) < 1.6 ? st : undefined;
};

/** move to floor f: land in its middle, leave the floor above behind */
export function goDown(g: Game, f: number): void {
  const p = g.player;
  g.floor = f;
  [p.x, p.y] = origin(f);
  p.path = [];
  p.move = null;
  p.dir = Math.PI;
  // the floor above is gone for good: its things, its foes, its vectors
  g.ents = g.ents.filter((e) => floorAt(e.x) === f);
  g.vectors = g.vectors.filter((v) => floorAt(v.x) === f);
  ensure(g, p.x, p.y);
  g.events.push({ type: 'floor', data: f });
  const F = FLOORS[f];
  const [sx, sy] = stairsAt(g.seed, f);
  const [dx, dy] = [sx - p.x, sy - p.y];
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 45) % 8];
  const lines: (string | Line)[] = [`FLOOR ${f + 1}: ${F.name.toUpperCase()}.`, F.gimmick, WANTS[f]];
  if (F.stairs) lines.push(`the way down lies somewhere ${word}, past its keeper. a memory card or a scanner points to it.`);
  else lines.push(`its keeper waits ${word} of here.`);
  if (KIT[f]?.length) lines.push('a cache lies where you land: this floor\'s kit. take two.');
  say(g, ...lines);
}

verb('descend', {
  help: 'go down the stairs you stand at, once the floor\'s boss is down',
  when: (g) => !!atStairs(g),
  whenFail: (g) => {
    const st = stairsOf(g);
    if (floorOf(g) === LAST) return 'descend: there is no further down. the heart is here.';
    if (!st || !g.seen.has(`${Math.floor(st.x)},${Math.floor(st.y)}`)) return 'descend: you have not found the way down yet.';
    return 'descend: you are not at the stairs.';
  },
  run(g) {
    const f = floorOf(g);
    const st = atStairs(g);
    if (!st) return say(g, 'no stairs here.');
    if (!bossDown(g, f)) return say(g, `${STAIRS[FLOORS[f].stairs!].name} is sealed. its keeper still stands.`);
    say(g, `you go down ${STAIRS[FLOORS[f].stairs!].name}.`);
    goDown(g, f + 1);
  },
});

// ---- the cradle's gimmick: thin walls a weapon breaks (src/world/secrets.ts `break`)

/** the wall in front of you, if it is one plain cell thick with open floor behind it, on a floor with thin walls */
export function thinAhead(g: Game): [number, number] | null {
  const p = g.player;
  if (floorOf(g) !== 0) return null;
  const [dx, dy] = Math.abs(Math.sin(p.dir)) > Math.abs(Math.cos(p.dir)) ? [Math.sign(Math.sin(p.dir)), 0] : [0, -Math.sign(Math.cos(p.dir))];
  const [x, y] = [Math.floor(p.x) + dx, Math.floor(p.y) + dy];
  if (cell(g, x, y) !== Cell.wall || cell(g, x + dx, y + dy) !== Cell.floor) return null;
  if (!inside(Math.floor(x / CHUNK), Math.floor(y / CHUNK)) || !inside(Math.floor((x + dx) / CHUNK), Math.floor((y + dy) / CHUNK))) return null;
  return [x, y];
}
