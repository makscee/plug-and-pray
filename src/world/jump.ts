// ?scene=jump&at=<name> (Maks 10-18: "make links with tied game situation so I can just click and play it
// instead of always starting from scratch"): a curated set of playable moments, each with a kit that fits the
// point of the run it stands for. Nothing is frozen: the run goes on from there. Nothing happens without the
// parameter. `jump(g, name)` is the same staging for the tests.

import { CHUNK, chunk, ensure, open } from '../core/grid';
import { say, spawnEnemy, tickHooks } from '../core/game';
import { MODS, powerUsed, slotsUsed } from '../core/mods';
import { exec, VERBS } from '../core/verbs';
import type { Game, Item } from '../core/types';
import { bossAt, bossRoom, goDown, LAST, onBossDown, origin, stairsChunk } from './floors';
import { SPOT } from './cache';
import { firstEye, opening } from './spawn';
import { clean } from '../tune/start';

const params = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
const staged = new WeakSet<Game>();

/** a module to install: its id, and its level (I if left off) */
type Mod = string | [string, number];
interface Kit {
  on: Mod[];
  /** carried in the bag, not installed */
  bag?: Mod[];
  res?: Partial<Record<'bone' | 'copper' | 'glass' | 'ichor', number>>;
  /** core power at least (it grows to fit the kit, one to spare) */
  core: number;
  /** max hp from keepers' flesh */
  flesh: number;
}

/** the kits a run typically carries at each point (after src/fight/bosses.ts LOADOUTS, as reached in play) */
const START = ['thread-bell', 'stepper-relay', 'map-spool', 'spark-finger'];
const K: Record<string, Kit> = {
  start: { on: START, core: 4, flesh: 0, res: { copper: 2 } },
  eye: { on: [...START, 'pinhole-eye', 'censer-flail'], core: 6, flesh: 0, res: { bone: 3, copper: 2 } },
  f1keeper: { on: ['pinhole-eye', 'stepper-relay', 'map-spool', 'spark-finger', 'censer-flail', 'frost-coat'], core: 6, flesh: 0, res: { bone: 6, copper: 2 } },
  f2: { on: [['pinhole-eye', 2], 'stepper-relay', 'map-spool', 'spark-finger', 'censer-flail', 'frost-coat'], core: 8, flesh: 3, res: { bone: 6, copper: 3, glass: 1 } },
  f2keeper: { on: [['pinhole-eye', 2], 'stepper-relay', 'map-spool', ['nail-psalm', 2], 'spark-finger', 'rivet-sling', 'frost-coat'], core: 9, flesh: 3, res: { bone: 4, copper: 2 } },
  f3: { on: ['dawn-eye', 'stepper-relay', 'map-spool', ['nail-psalm', 2], 'spark-finger', 'rivet-sling', 'frost-coat'], core: 10, flesh: 6, res: { bone: 6, copper: 3, glass: 2 } },
  reins: { on: ['pilgrim-scope', 'saints-reins', 'stepper-relay', 'map-spool', 'bone-lance', ['nail-psalm', 2], 'halo', 'frost-coat'], core: 14, flesh: 6, res: { bone: 4, copper: 2 } },
  f4: { on: ['pilgrim-scope', 'saints-reins', 'gyro-heart', 'map-spool', 'bone-lance', ['nail-psalm', 3], 'halo', 'ossuary-plate'], core: 16, flesh: 9, res: { bone: 6, copper: 3, glass: 2 } },
  f4keeper: { on: ['martyr-scope', 'martyrs-reins', 'gyro-heart', 'map-spool', 'heat-lance', 'ember-spit', 'halo', 'ossuary-plate', 'rime-hood'], core: 19, flesh: 9, res: { bone: 4 } },
  heart: { on: ['martyr-scope', 'martyrs-reins', 'gyro-heart', 'map-spool', ['heat-lance', 2], 'ember-spit', 'reliquary-saw', 'halo', 'ossuary-plate', 'rime-hood'], core: 21, flesh: 12, res: { bone: 9, copper: 4, glass: 3, ichor: 2 } },
};

const id = (m: Mod) => (typeof m === 'string' ? m : m[0]);
const lv = (m: Mod) => (typeof m === 'string' ? 1 : m[1]);
const item = (m: Mod): Item => ({ kind: 'mod', mod: id(m), ...(lv(m) > 1 ? { level: lv(m) } : {}) });

/** put the kit on: the bag emptied, each module installed through the console as a player would, warm at once */
function kit(g: Game, k: Kit): void {
  clean(g);
  const p = g.player;
  const mods = [...k.on, ...(k.bag ?? [])].filter((m) => MODS[id(m)]);
  p.slots = 20; // room while installing; trimmed to fit below
  p.core = 99;
  const n = g.log.length;
  p.flesh = k.flesh;
  p.maxHp = 10 + k.flesh;
  for (const m of k.on.filter((m) => MODS[id(m)])) {
    p.inv.unshift(item(m));
    exec(g, `install ${MODS[id(m)].name}`, true);
  }
  g.log.length = n; // the install lines: the jump line says it all
  for (const m of k.bag ?? []) if (MODS[id(m)]) p.inv.push(item(m));
  for (const [res, n] of Object.entries(k.res ?? {})) if (n) p.inv.push({ kind: 'res', res: res as 'bone', n });
  p.slots = Math.max(6, slotsUsed(g) + 1, Math.min(8, mods.length));
  p.core = Math.max(k.core, powerUsed(g) + 1);
  p.maxHp += p.installed.reduce((s, i) => s + Number(MODS[i.mod]?.params.hp ?? 0), 0);
  p.hp = p.maxHp;
  for (const i of p.installed) i.readyAt = g.t - 1;
  // the big first-person view comes with the reins (src/body/fps.ts), as stageBoss does
  if (p.installed.some((i) => Number(MODS[i.mod]?.params.big ?? 0) > 0)) VERBS.big?.run(g, []);
}

function goTo(g: Game, x: number, y: number): void {
  g.player.x = x;
  g.player.y = y;
  g.player.path = [];
  g.player.move = null;
  ensure(g, x, y);
}
/** look from where you stand at (x, y) */
const face = (g: Game, x: number, y: number) => void (g.player.dir = Math.atan2(x - g.player.x, -(y - g.player.y)));

/** open cell centres between r0 and r1 from (x, y), with a clear straight line to it */
function spots(g: Game, x: number, y: number, r0: number, r1: number): [number, number][] {
  const out: [number, number][] = [];
  const R = Math.ceil(r1);
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const [sx, sy] = [Math.floor(x) + dx + 0.5, Math.floor(y) + dy + 0.5];
      const d = Math.hypot(sx - x, sy - y);
      if (d < r0 || d > r1 || !open(g, sx, sy)) continue;
      let clear = true;
      for (let k = 1; k < d * 3 && clear; k++) clear = open(g, x + ((sx - x) * k) / (d * 3), y + ((sy - y) * k) / (d * 3));
      if (clear) out.push([sx, sy]);
    }
  return out;
}

/** a pack of foes ahead of you, in a line of sight, the nearest `near` cells out; you face the first */
function foesAhead(g: Game, types: string[], near = 4, far = 7): void {
  const p = g.player;
  const at = spots(g, p.x, p.y, near, far);
  if (!at.length) return;
  // the side with the most open floor
  const [ax, ay] = at.reduce((s, [x, y]) => [s[0] + x - p.x, s[1] + y - p.y], [0, 0]);
  const pick = at.sort((a, b) => Math.hypot(a[0] - p.x - ax / at.length, a[1] - p.y - ay / at.length) - Math.hypot(b[0] - p.x - ax / at.length, b[1] - p.y - ay / at.length));
  types.forEach((t, k) => {
    const [x, y] = pick[Math.min(pick.length - 1, k * 2)];
    const e = spawnEnemy(g, t, x, y);
    e.enemy!.data.noticed = true;
  });
  face(g, pick[0][0], pick[0][1]);
}

/** just outside floor f's keeper room on the side facing the keeper, looking in (as ?scene=boss) */
function keeperDoor(g: Game, f: number): void {
  const [cx, cy] = stairsChunk(g.seed, f);
  chunk(g, cx, cy);
  const [x0, y0, x1, y1] = bossRoom(g.seed, f);
  const [bx, by] = bossAt(g.seed, f);
  const out: [number, number][] = [];
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if ((x < x0 || x > x1 || y < y0 || y > y1) && open(g, x + 0.5, y + 0.5)) out.push([x + 0.5, y + 0.5]);
  const [sx, sy] = out.sort((a, b) => Math.hypot(a[0] - bx, a[1] - by) - Math.hypot(b[0] - bx, b[1] - by))[0] ?? [bx, by];
  goTo(g, sx, sy);
  face(g, bx, by);
  // the room is known, as if your map had swept it
  for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) g.seen.add(`${x},${y}`);
}

/** the floors on the way down are cleared: their keepers fell (the stairs behind you stay open) */
function down(g: Game, f: number): void {
  const n = g.log.length;
  for (let k = 0; k < f; k++) onBossDown(g, k);
  g.log.length = n; // (their "the way down is open" lines belong to floors you left)
  if (f) goDown(g, f);
}

export interface Jump {
  what: string;
  floor: number;
  run: (g: Game) => void;
}

export const JUMPS: Record<string, Jump> = {
  'f1-start': { what: 'a fresh run, the start kit installed, no eye yet', floor: 0, run: (g) => kit(g, K.start) },
  'f1-reliquary': {
    what: "floor 1's reliquary, still shut, two steps ahead: walk into it or open it",
    floor: 0,
    run(g) {
      kit(g, K.start);
      const [ox, oy] = origin(0);
      goTo(g, ox, oy - 0.5);
      face(g, Math.floor(ox) - 8 + SPOT[0] + 0.5, Math.floor(oy) - 8 + SPOT[1] + 0.5);
    },
  },
  'f1-eye': {
    what: 'the pinhole eye, your first sight, lying a step away: walk onto it',
    floor: 0,
    run(g) {
      const [ex, ey] = firstEye(g.seed).at;
      chunk(g, Math.floor(ex / CHUNK), Math.floor(ey / CHUNK));
      kit(g, { ...K.start, res: { bone: 2, copper: 2 } });
      const [sx, sy] = spots(g, ex, ey, 1.4, 2.3)[0] ?? [ex, ey + 1];
      goTo(g, sx, sy);
      face(g, ex, ey);
    },
  },
  'f1-fps': {
    what: 'the pinhole installed: first person, mites ahead',
    floor: 0,
    run(g) {
      const [ex, ey] = firstEye(g.seed).at;
      goTo(g, ex, ey);
      g.ents = g.ents.filter((e) => !(e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === 'pinhole-eye'));
      kit(g, { ...K.start, on: [...START, 'pinhole-eye'], core: 5 });
      foesAhead(g, ['mite', 'mite', 'mite']);
    },
  },
  'f1-keeper': { what: "outside floor 1's keeper door, a cradle kit ready: walk in to wake it", floor: 0, run: (g) => (kit(g, K.f1keeper), keeperDoor(g, 0)) },
  'f2-start': { what: 'floor 2, the choir nave, just arrived (keeper 1 down)', floor: 1, run: (g) => (down(g, 1), kit(g, K.f2)) },
  'f2-keeper': { what: "outside floor 2's keeper door, a nave kit ready", floor: 1, run: (g) => (down(g, 1), kit(g, K.f2keeper), keeperDoor(g, 1)) },
  'f3-start': { what: 'floor 3, the ossuary, just arrived: the reliquary holds the reins', floor: 2, run: (g) => (down(g, 2), kit(g, K.f3)) },
  'f3-reins': {
    what: "saint's reins on: big first person with a bone lance, foes ahead (tab takes the mouse)",
    floor: 2,
    run(g) {
      down(g, 2);
      kit(g, K.reins);
      foesAhead(g, ['mite', 'mite', 'walker'], 5, 8);
    },
  },
  'f3-keeper': { what: "outside floor 3's keeper door, the reins kit ready", floor: 2, run: (g) => (down(g, 2), kit(g, K.reins), keeperDoor(g, 2)) },
  'f4-start': { what: 'floor 4, the furnace, just arrived: the heat burns', floor: 3, run: (g) => (down(g, 3), kit(g, K.f4)) },
  'f4-keeper': { what: "outside floor 4's keeper door, a furnace kit with the rime hood", floor: 3, run: (g) => (down(g, 3), kit(g, K.f4keeper), keeperDoor(g, 3)) },
  heart: { what: "the heart: at its arena's edge, the last keeper ahead", floor: LAST, run: (g) => (down(g, LAST), kit(g, K.heart), keeperDoor(g, LAST)) },
  ending: { what: 'the end: the heart is down and the god thaws', floor: LAST, run: (g) => (down(g, LAST), kit(g, K.heart), keeperDoor(g, LAST), onBossDown(g, LAST)) },
  'eye-levels': {
    what: 'pinhole eye II installed (amber); pinhole I and III in the bag: double-click to swap and compare',
    floor: 0,
    run(g) {
      kit(g, { ...K.start, on: [...START, ['pinhole-eye', 2]], bag: [['pinhole-eye', 3], 'pinhole-eye'], core: 6 });
    },
  },
  printer: {
    what: 'at the printer by the start, bone, copper and glass in hand: upgrade or print',
    floor: 0,
    run(g) {
      const [px, py] = opening(g.seed).printer;
      chunk(g, px, py);
      const pr = g.ents.find((e) => e.kind === 'printer' && !e.data?.shop && Math.floor(e.x / CHUNK) === px && Math.floor(e.y / CHUNK) === py);
      if (pr) {
        const [sx, sy] = spots(g, pr.x, pr.y, 0.9, 1.6)[0] ?? [pr.x, pr.y];
        goTo(g, sx, sy);
        face(g, pr.x, pr.y);
      }
      kit(g, { ...K.eye, res: { bone: 12, copper: 5, glass: 4 } });
    },
  },
  foes: {
    what: 'the nave with six kinds of foe around: click one for the foe window',
    floor: 1,
    run(g) {
      down(g, 1);
      kit(g, K.f2keeper);
      const p = g.player;
      const at = spots(g, p.x, p.y, 5, 9).sort((a, b) => Math.atan2(a[1] - p.y, a[0] - p.x) - Math.atan2(b[1] - p.y, b[0] - p.x));
      const kinds = ['mite', 'mite', 'seraph', 'walker', 'mimic', 'cantor', 'hum'];
      kinds.forEach((t, k) => at.length && spawnEnemy(g, t, ...at[Math.floor((k * at.length) / kinds.length)]));
      // every cell round you known, so the map shows each foe's mark
      for (let y = Math.floor(p.y) - 9; y <= p.y + 9; y++) for (let x = Math.floor(p.x) - 9; x <= p.x + 9; x++) g.seen.add(`${x},${y}`);
      if (at.length) face(g, ...at[0]);
    },
  },
  weapons: {
    what: 'four weapons on (spark finger, censer flail, choir bell, nail psalm) and mites coming: see each attack',
    floor: 0,
    run(g) {
      kit(g, { on: ['pinhole-eye', 'stepper-relay', 'map-spool', 'spark-finger', 'censer-flail', 'choir-bell', 'nail-psalm'], core: 8, flesh: 3 });
      foesAhead(g, ['mite', 'mite', 'mite', 'mite', 'mite'], 3, 6);
    },
  },
};

/** stage a jump on a fresh game; false for a name it does not know */
export function jump(g: Game, name: string): boolean {
  const j = JUMPS[name];
  if (!j) return false;
  j.run(g);
  say(g, `jump: ${j.what}.`);
  return true;
}

tickHooks.push((g) => {
  if (params?.get('scene') !== 'jump' || staged.has(g)) return;
  staged.add(g);
  const name = params.get('at') ?? '';
  if (!jump(g, name)) say(g, `jump: no "${name}". try one of: ${Object.keys(JUMPS).join(', ')}.`);
});
