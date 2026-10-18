// Bosses (v2): one waits before each floor's stairs, rolled per run from three variants; the fifth floor
// holds the same heart every run. Each has 2 phases (the heart 3), telegraphed attacks (a wind-up pose in
// the eye, a red ring or line on the floor and the map, a ⚠ in the HUD and once in the console) and a
// gimmick for its floor: the cradle's are fought up close and kited (charges, mites, a bell), the choir's
// dodge your shots and reward range, the ossuary's and the furnace's throw bullet patterns you strafe through.
// `spawnBoss(g, floor, x, y)` places one; its death calls `bossHooks.down` (the floors slice sets it) and
// drops a fine+ module (a unique on floors 1 and 3). `stageBoss` sets up a test fight (?boss=, the sim).
import { dist, enemy, hurt, killHooks, say, spawn, spawnEnemy, tickHooks } from '../core/game';
import { Cell, clear, ensure, open, setCell } from '../core/grid';
import { label, MODS, slotsUsed } from '../core/mods';
import { VERBS } from '../core/verbs';
import { hash, rng } from '../core/rng';
import type { Entity, Game, Item } from '../core/types';
import { fire, shots, type ShotData } from './shots';
import { bossKind } from './bolts';
import { WARM } from '../mods/sense';
import { dealUnique } from '../mods/uniques';

// ---- shapes on the floor: what a wind-up will hit (drawn on the map, marked in the eye, read by the sim)

export type Zone = { k: 'ring'; x: number; y: number; r0: number; r1: number } | { k: 'line'; x: number; y: number; vx: number; vy: number; len: number; w: number };

export function inZone(z: Zone, x: number, y: number): boolean {
  if (z.k === 'ring') {
    const r = Math.hypot(x - z.x, y - z.y);
    return r >= z.r0 && r <= z.r1;
  }
  const [dx, dy] = [x - z.x, y - z.y];
  const along = dx * z.vx + dy * z.vy;
  const off = Math.abs(dx * z.vy - dy * z.vx);
  return along >= -0.4 && along <= z.len && off <= z.w;
}

// ---- the roster

export interface Atk {
  id: string;
  /** the HUD's ⚠ while it winds up */
  move: string;
  /** the console's ⚠, said the first time it comes */
  warn: string;
  windup: number;
  /** seconds after it lands before the next one starts */
  rest: number;
  /** only when this holds (r: cells to you) */
  when?: (g: Game, e: Entity, r: number) => boolean;
  /** at the start of the wind-up: lock the aim, return what it will hit */
  aim?: (g: Game, e: Entity) => Zone[];
  /** when the wind-up ends */
  land: (g: Game, e: Entity, zones: Zone[]) => void;
  /** after landing, every tick while it returns true (a charge, a spiral) */
  chan?: (g: Game, e: Entity, dt: number) => boolean;
}

export interface BossDef {
  id: string;
  /** 0..4 (4 is the heart) */
  floor: number;
  name: string;
  hp: number;
  /** a blow's damage; attacks hit with a share of it */
  damage: number;
  speed: number;
  /** how it moves between attacks */
  walk: 'close' | 'keep' | 'still' | 'drift';
  /** the distance it likes to keep (walk 'keep') */
  keep?: number;
  armour?: number;
  /** hit radius for your shots (a boss is big) */
  r: number;
  /** it sidesteps your shots (the choir) */
  dodge?: boolean;
  /** hp fractions where the next phase starts */
  at: number[];
  /** per phase, the attacks it cycles through */
  phases: Atk[][];
  /** what it is like, for the warning and the codex */
  hint: string;
  /** said when the next phase starts */
  turn: string[];
  /** a second body that is part of it (the forge twins) */
  mate?: string;
}

export const BOSSES: BossDef[][] = [[], [], [], [], []];
export const BOSS: Record<string, BossDef> = {};

/** the bosses' damage share by attack: a full blow, half for wide things, a third for each bullet */
const BLOW = 1;
const WIDE = 0.8;
const BULLET = 0.45;

const data = (e: Entity) => e.enemy!.data;
const bdef = (e: Entity) => BOSS[e.enemy!.type];
const dmg = (e: Entity, share: number) => bdef(e).damage * share;
const phaseOf = (e: Entity) => Number(data(e).phase ?? 0);
const toP = (g: Game, e: Entity): [number, number, number] => {
  const [dx, dy] = [g.player.x - e.x, g.player.y - e.y];
  const r = Math.hypot(dx, dy) || 1;
  return [dx / r, dy / r, r];
};

/** a bullet at angle `a` (radians, 0 = east) */
function bullet(g: Game, e: Entity, a: number, speed: number, share = BULLET, range = 14): void {
  fire(g, { x: e.x + Math.cos(a) * 0.4, y: e.y + Math.sin(a) * 0.4, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg: dmg(e, share), range, src: e, foe: true, kind: bossKind(e.enemy!.type, speed) });
}
/** n bullets fanned `spread` radians round the line to you */
function fan(g: Game, e: Entity, n: number, spread: number, speed: number, share = BULLET): void {
  const [vx, vy] = toP(g, e);
  const a0 = Math.atan2(vy, vx);
  for (let k = 0; k < n; k++) bullet(g, e, a0 + (n === 1 ? 0 : (k / (n - 1) - 0.5) * spread), speed, share);
}
/** n bullets all round, turned by `off`; `gap` leaves that many out (a way through) facing you */
function ring(g: Game, e: Entity, n: number, speed: number, off = 0, gap = 0, share = BULLET): void {
  const [vx, vy] = toP(g, e);
  // the gap opens to one side of you, never on you: standing still is not the answer
  const side = hash(g.seed, e.id, Math.floor(g.t * 3)) % 2 ? 1 : -1;
  const toward = Math.atan2(vy, vx) + side * (Math.PI / 2.5);
  for (let k = 0; k < n; k++) {
    const a = off + (k / n) * Math.PI * 2;
    const d = Math.abs(Math.atan2(Math.sin(a - toward), Math.cos(a - toward)));
    if (gap && d < (gap / n) * Math.PI) continue;
    bullet(g, e, a, speed, share);
  }
}

/** player stuns (the bell): you stand where you are until then */
const stunned = new WeakMap<Game, { until: number; x: number; y: number }>();
export const stunOf = (g: Game): number => stunned.get(g)?.until ?? -99;
function stun(g: Game, secs: number): void {
  stunned.set(g, { until: g.t + secs, x: g.player.x, y: g.player.y });
  say(g, `⚠ stunned: you cannot move for ${secs} s.`);
}

/** hit what stands in the zones; `open` leaves the boss open (more damage taken) when you were clear */
function strikeZones(g: Game, e: Entity, zones: Zone[], share: number, o: { stun?: number; open?: boolean; miss?: string } = {}): boolean {
  const p = g.player;
  if (zones.some((z) => inZone(z, p.x, p.y))) {
    hurt(g, dmg(e, share), e);
    if (o.stun && !g.ended) stun(g, o.stun);
    return true;
  }
  if (o.open) {
    data(e).open = g.t + 2;
    say(g, `${o.miss ?? 'it misses.'} it is open: hit it now.`);
  }
  return false;
}

/** foes it calls (mite queen, organ, heart), up to `cap` alive at once */
function summon(g: Game, e: Entity, type: string, n: number, cap: number): void {
  const mine = g.ents.filter((x) => x.enemy?.data.summoner === e.id).length;
  const r = rng(hash(g.seed, 77, e.id, Math.floor(g.t * 10)));
  for (let k = 0; k < Math.min(n, cap - mine); k++) {
    const a = r() * Math.PI * 2;
    for (let tries = 0; tries < 6; tries++) {
      const d = 1.2 + r() * 1.5;
      const [x, y] = [e.x + Math.cos(a + tries) * d, e.y + Math.sin(a + tries) * d];
      if (!open(g, x, y)) continue;
      const m = spawnEnemy(g, type, x, y);
      Object.assign(m.enemy!.data, { noticed: true, summoner: e.id, mult: 1, warned: true });
      break;
    }
  }
}

// ---- attack makers (numbers per boss)

/** draw breath, then rush down the line it saw you on; a miss leaves it reeling and open */
const charge = (o: { windup: number; cells: number; speed: number; rest: number; stun: number; move?: string }): Atk => ({
  id: 'charge',
  move: o.move ?? 'draws breath to charge',
  warn: 'it draws breath, then charges down the line it sees you on: step aside.',
  windup: o.windup,
  rest: o.rest,
  when: (g, e, r) => r > 1.4 && r < 7 && clear(g, e.x, e.y, g.player.x, g.player.y),
  aim(g, e) {
    const [vx, vy] = toP(g, e);
    data(e).aim = [vx, vy];
    return [{ k: 'line', x: e.x, y: e.y, vx, vy, len: o.cells, w: 0.7 }];
  },
  land(g, e) {
    data(e).left = o.cells;
  },
  chan(g, e, dt) {
    const d = data(e);
    const [vx, vy] = d.aim as [number, number];
    const step = o.speed * dt;
    const [nx, ny] = [e.x + vx * step, e.y + vy * step];
    const blocked = !open(g, nx + vx * 0.4, ny + vy * 0.4);
    if (!blocked) [e.x, e.y] = [nx, ny];
    d.left = (d.left as number) - step;
    if (dist(e, g.player) < 0.8) {
      hurt(g, dmg(e, BLOW), e);
      return false;
    }
    if (blocked || (d.left as number) <= 0) {
      d.stun = g.t + o.stun;
      d.open = g.t + o.stun + 0.5;
      say(g, 'the charge goes past you. it reels: hit it now.');
      return false;
    }
    return true;
  },
});

/** a slam round itself: get out of reach */
const slam = (o: { r: number; windup: number; rest: number; share?: number; move?: string; warn?: string }): Atk => ({
  id: 'slam',
  move: o.move ?? 'rears up to slam',
  warn: o.warn ?? `it rears up: it will slam everything within ${o.r} cells. step out.`,
  windup: o.windup,
  rest: o.rest,
  when: (_g, _e, r) => r < o.r + 1.5,
  aim: (_g, e) => [{ k: 'ring', x: e.x, y: e.y, r0: 0, r1: o.r }],
  land: (g, e, z) => void strikeZones(g, e, z, o.share ?? BLOW, { open: true, miss: 'the slam hits stone.' }),
});

/** a ring on the floor where you stand: move off it before it falls */
const peal = (o: { r: number; windup: number; rest: number; n?: number; share?: number; move?: string; warn?: string }): Atk => ({
  id: 'peal',
  move: o.move ?? 'marks the floor under you',
  warn: o.warn ?? 'a ring marks the floor under you: get off it before it falls.',
  windup: o.windup,
  rest: o.rest,
  aim(g) {
    const p = g.player;
    const zs: Zone[] = [{ k: 'ring', x: p.x, y: p.y, r0: 0, r1: o.r }];
    // more rings: where you would be if you kept walking that way
    for (let k = 1; k < (o.n ?? 1); k++) {
      const a = hash(g.seed, Math.floor(g.t * 7), k) / 2 ** 32 * Math.PI * 2;
      zs.push({ k: 'ring', x: p.x + Math.cos(a) * o.r * 2, y: p.y + Math.sin(a) * o.r * 2, r0: 0, r1: o.r });
    }
    return zs;
  },
  land: (g, e, z) => void strikeZones(g, e, z, o.share ?? WIDE),
});

/** bullets aimed at you, fanned */
const volley = (o: { n: number; spread: number; speed: number; windup: number; rest: number; times?: number; every?: number; move?: string; warn?: string }): Atk => ({
  id: 'volley',
  move: o.move ?? 'gathers a volley',
  warn: o.warn ?? 'it gathers a volley: strafe across it, not away.',
  windup: o.windup,
  rest: o.rest,
  // never point-blank: a bullet from a cell away cannot be dodged
  when: (_g, _e, r) => r >= 2.5,
  land(g, e) {
    fan(g, e, o.n, o.spread, o.speed);
    data(e).shots = (o.times ?? 1) - 1;
    data(e).next = g.t + (o.every ?? 0.5);
  },
  chan(g, e) {
    const d = data(e);
    if ((d.shots as number) <= 0) return false;
    if (g.t < (d.next as number)) return true;
    d.shots = (d.shots as number) - 1;
    d.next = g.t + (o.every ?? 0.5);
    fan(g, e, o.n, o.spread, o.speed);
    return true;
  },
});

/** a ring of bullets all round, with a gap to one side of you to slip through; `times` rings, each turned */
const burst = (o: { n: number; speed: number; windup: number; rest: number; gap?: number; times?: number; every?: number; move?: string; warn?: string }): Atk => ({
  id: 'burst',
  move: o.move ?? 'swells to burst',
  warn: o.warn ?? 'it swells: a ring of bullets comes out all round. find the gap.',
  windup: o.windup,
  rest: o.rest,
  // (v2 r1 fight: point-blank rings could not be dodged) only with you two cells off or more
  when: (_g, _e, r) => r >= 2,
  land(g, e) {
    ring(g, e, o.n, o.speed, 0, o.gap ?? 0);
    data(e).shots = (o.times ?? 1) - 1;
    data(e).next = g.t + (o.every ?? 0.6);
    data(e).turnBy = 0;
  },
  chan(g, e) {
    const d = data(e);
    if ((d.shots as number) <= 0) return false;
    if (g.t < (d.next as number)) return true;
    d.shots = (d.shots as number) - 1;
    d.next = g.t + (o.every ?? 0.6);
    d.turnBy = (d.turnBy as number) + Math.PI / o.n;
    ring(g, e, o.n, o.speed, d.turnBy as number, o.gap ?? 0);
    return true;
  },
});

/** arms of bullets that turn as they pour out: walk round with the gap */
const spiral = (o: { arms: number; secs: number; every: number; spin: number; speed: number; windup: number; rest: number; move?: string; warn?: string }): Atk => ({
  id: 'spiral',
  move: o.move ?? 'begins to spin',
  warn: o.warn ?? `it spins: ${o.arms} arms of bullets turn round it. move with the gaps.`,
  windup: o.windup,
  rest: o.rest,
  when: (_g, _e, r) => r >= 2,
  land(g, e) {
    const d = data(e);
    d.until = g.t + o.secs;
    d.next = g.t;
    const [vx, vy] = toP(g, e);
    // the first arms start beside you, not on you
    d.turnBy = Math.atan2(vy, vx) + Math.PI / o.arms;
  },
  chan(g, e, dt) {
    const d = data(e);
    if (g.t >= (d.until as number)) return false;
    d.turnBy = (d.turnBy as number) + o.spin * dt;
    if (g.t < (d.next as number)) return true;
    d.next = (d.next as number) + o.every;
    for (let k = 0; k < o.arms; k++) bullet(g, e, (d.turnBy as number) + (k / o.arms) * Math.PI * 2, o.speed);
    return true;
  },
});

/** down its four lines (or the diagonals): stand between them */
const cross = (o: { windup: number; rest: number; speed: number; diag?: boolean; both?: boolean; move?: string }): Atk => ({
  id: 'cross',
  move: o.move ?? (o.both ? 'gathers a star' : o.diag ? 'gathers a saltire' : 'gathers a cross'),
  warn: 'it gathers its light into lines: get off them, between.',
  windup: o.windup,
  rest: o.rest,
  aim(_g, e) {
    const out: Zone[] = [];
    const n = o.both ? 8 : 4;
    for (let k = 0; k < n; k++) {
      const a = o.both ? (k * Math.PI) / 4 : (k * Math.PI) / 2 + (o.diag ? Math.PI / 4 : 0);
      out.push({ k: 'line', x: e.x, y: e.y, vx: Math.cos(a), vy: Math.sin(a), len: 9, w: 0.55 });
    }
    data(e).lines = out.map((z) => (z.k === 'line' ? Math.atan2(z.vy, z.vx) : 0));
    return out;
  },
  land(g, e) {
    for (const a of data(e).lines as number[]) for (const s of [0, 0.35]) fire(g, { x: e.x + Math.cos(a) * s, y: e.y + Math.sin(a) * s, vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed, dmg: dmg(e, BULLET * 1.3), range: 12, src: e, foe: true, kind: bossKind(e.enemy!.type, o.speed) });
  },
});

/** calls foes to its side */
const brood = (o: { type: string; n: number; cap: number; windup: number; rest: number; move?: string; warn?: string }): Atk => ({
  id: 'brood',
  move: o.move ?? 'calls its brood',
  warn: o.warn ?? 'it calls its brood to it.',
  windup: o.windup,
  rest: o.rest,
  when: (g, e) => g.ents.filter((x) => x.enemy?.data.summoner === e.id).length < o.cap,
  land: (g, e) => summon(g, e, o.type, o.n, o.cap),
});

/** a slow pool of fire or slag on the floor, for `secs` (it burns while you stand in it) */
const pools = new WeakMap<Game, { x: number; y: number; r: number; until: number; src: number; share: number }[]>();
export const poolsOf = (g: Game) => pools.get(g) ?? [];
function pool(g: Game, e: Entity, x: number, y: number, r: number, secs: number, share = 0.35): void {
  let list = pools.get(g);
  if (!list) pools.set(g, (list = []));
  list.push({ x, y, r, until: g.t + secs, src: e.id, share: dmg(e, share) });
}
const sear = (o: { r: number; windup: number; rest: number; secs: number; n?: number; move?: string }): Atk => ({
  ...peal({ r: o.r, windup: o.windup, rest: o.rest, n: o.n, share: WIDE * 0.8, move: o.move ?? 'pours fire under you' }),
  id: 'sear',
  warn: 'fire runs to where you stand, and stays burning: get off and keep off.',
  land(g, e, z) {
    strikeZones(g, e, z, WIDE * 0.8);
    for (const s of z) if (s.k === 'ring') pool(g, e, s.x, s.y, s.r1, o.secs);
  },
});

/** moves to another spot (the organ's pipes, the hollow saint) */
const blink = (o: { windup: number; rest: number; then?: (g: Game, e: Entity) => void; move?: string; warn?: string }): Atk => ({
  id: 'blink',
  move: o.move ?? 'fades',
  warn: o.warn ?? 'it fades, and comes back somewhere else.',
  windup: o.windup,
  rest: o.rest,
  land(g, e) {
    const home = (data(e).home as [number, number]) ?? [e.x, e.y];
    const r = rng(hash(g.seed, 91, e.id, Math.floor(g.t)));
    for (let k = 0; k < 12; k++) {
      const a = r() * Math.PI * 2;
      const d = 2 + r() * 3;
      const [x, y] = [home[0] + Math.cos(a) * d, home[1] + Math.sin(a) * d];
      if (!open(g, x, y) || Math.hypot(x - g.player.x, y - g.player.y) < 2.5) continue;
      [e.x, e.y] = [x, y];
      break;
    }
    o.then?.(g, e);
  },
});

/** the bell's toll: a ring round it stuns who stands in it; inside it (close) or past it is safe */
const toll = (o: { r0: number; r1: number; windup: number; rest: number; stun: number; second?: [number, number] }): Atk => ({
  id: 'toll',
  move: 'swings to toll',
  warn: `the bell swings: its toll stuns between ${o.r0} and ${o.r1} cells. hug it or stand off.`,
  windup: o.windup,
  rest: o.rest,
  aim(_g, e) {
    const zs: Zone[] = [{ k: 'ring', x: e.x, y: e.y, r0: o.r0, r1: o.r1 }];
    return zs;
  },
  land(g, e, z) {
    if (!strikeZones(g, e, z, WIDE, { stun: o.stun })) say(g, 'the toll rolls past you.');
    if (!o.second) return;
    // phase 2: the echo, a beat later, the other ring: move from one to the other
    data(e).echo = g.t + 0.9;
    data(e).zones = [{ k: 'ring', x: e.x, y: e.y, r0: o.second[0], r1: o.second[1] }];
    data(e).move = 'the echo';
    data(e).windup = 0;
  },
  chan(g, e) {
    const d = data(e);
    if (!o.second) return false;
    if (g.t < (d.echo as number)) return true;
    strikeZones(g, e, (d.zones as Zone[]) ?? [], WIDE, { stun: o.stun });
    d.zones = null;
    d.move = '';
    return false;
  },
});

/** dig in and come up under you (the slag worm): gone from sight (and from your weapons) till it surfaces.
 *  Underground it is parked far off (UNDER), so nothing finds it; the tick below brings it up. */
export const UNDER = 10000;
/** how close to you it may surface */
export const SURFACE = 1.2;
const burrow = (o: { windup: number; rest: number; under: number; r: number; burst: number; poolSecs?: number }): Atk => ({
  id: 'burrow',
  move: 'digs in',
  warn: 'it digs into the floor. a ring marks where it comes up: under you. move.',
  windup: o.windup,
  rest: o.rest,
  land(g, e) {
    const d = data(e);
    Object.assign(d, { under: g.t + o.under, follow: g.t + o.under / 2, burst: o.burst, pool: o.poolSecs ?? 0, upR: o.r, move: 'comes up under you' });
    d.zones = [{ k: 'ring', x: g.player.x, y: g.player.y, r0: 0, r1: o.r }];
    e.x += UNDER;
  },
  // the tick below runs it while it is under
  chan: (_g, e) => !!data(e).under,
});
/** underground: parked far off till it surfaces */
export const isUnder = (e: Entity): boolean => !!e.enemy?.data.under;
tickHooks.push((g) => {
  for (const e of g.ents) {
    const d = e.enemy?.data;
    if (!d?.under) continue;
    const z = (d.zones as Zone[])[0] as Extract<Zone, { k: 'ring' }>;
    // it follows you for the first half, then the ring stays: move off it
    if (g.t < (d.follow as number)) [z.x, z.y] = [g.player.x, g.player.y];
    if (g.t < (d.under as number)) continue;
    [e.x, e.y] = open(g, z.x, z.y) ? [z.x, z.y] : [e.x - UNDER, e.y];
    // never inside you (v2 r1 fight: it came up in your body, unseen and unshootable): at least SURFACE cells off
    const p = g.player;
    const [ax, ay] = [e.x - p.x, e.y - p.y];
    const r = Math.hypot(ax, ay);
    if (r < SURFACE) {
      const a = r > 0.01 ? Math.atan2(ay, ax) : (hash(g.seed, Math.floor(g.t * 10)) / 2 ** 32) * Math.PI * 2;
      for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
        const [nx, ny] = [p.x + Math.cos(a + turn * 0.8) * SURFACE, p.y + Math.sin(a + turn * 0.8) * SURFACE];
        if (open(g, nx, ny)) {
          [e.x, e.y] = [nx, ny];
          break;
        }
      }
    }
    say(g, `⚠ ${bdef(e).name} bursts up out of the floor!`);
    strikeZones(g, e, [z], BLOW);
    ring(g, e, d.burst as number, 3.2, (hash(g.seed, Math.floor(g.t)) / 2 ** 32) * Math.PI);
    if (d.pool) pool(g, e, z.x, z.y, d.upR as number, d.pool as number);
    Object.assign(d, { under: 0, zones: null, move: '', chan: false, nextAt: g.t + 1.2 });
  }
});

function boss(d: BossDef): void {
  BOSSES[d.floor].push(d);
  BOSS[d.id] = d;
  enemy(d.id, { name: d.name, hp: d.hp, speed: d.speed, damage: d.damage, cooldown: 2, sense: 14, ai: bossAi, armour: d.armour });
  WARM.add(d.id);
}

// floor 0, the cradle: melee and kiting
boss({
  id: 'boss-warden', floor: 0, name: 'the great warden', hp: 70, damage: 2.4, speed: 1.6, walk: 'close', r: 0.55, at: [0.5],
  hint: 'it charges down the line it sees you on, and bites up close. step aside from the charge, then hit it while it reels.',
  turn: ['the great warden roars. it charges twice now.'],
  phases: [
    [charge({ windup: 1.1, cells: 5, speed: 9, rest: 1.2, stun: 1.8 }), slam({ r: 1.6, windup: 1, rest: 1.4, move: 'lifts its jaws', warn: 'it lifts its jaws: it bites all round. step back.' })],
    [charge({ windup: 1, cells: 6, speed: 10, rest: 0.4, stun: 1.5 }), charge({ windup: 0.8, cells: 6, speed: 10, rest: 1, stun: 1.6, move: 'charges again' }), slam({ r: 1.8, windup: 1, rest: 1.2, move: 'lifts its jaws' })],
  ],
});
boss({
  id: 'boss-queen', floor: 0, name: 'the mite queen', hp: 55, damage: 1.4, speed: 0.7, walk: 'close', r: 0.6, at: [0.5],
  hint: 'she calls mites and stomps. thin the mites, keep off her stomp, bite her between.',
  turn: ['the mite queen shrieks. the brood comes faster.'],
  phases: [
    [brood({ type: 'mite', n: 2, cap: 2, windup: 1, rest: 1.5 }), slam({ r: 1.7, windup: 1, rest: 1.6, move: 'rears to stomp', warn: 'the queen rears: her stomp reaches 1.7 cells. step out.' }), volley({ n: 1, spread: 0, speed: 3.2, windup: 0.8, rest: 1.4, times: 2, every: 0.6, move: 'spits acid', warn: 'she spits slow acid at you: sidestep it.' })],
    [brood({ type: 'mite', n: 2, cap: 3, windup: 0.9, rest: 1.2 }), slam({ r: 2, windup: 1, rest: 1.2, move: 'rears to stomp' }), volley({ n: 3, spread: 0.6, speed: 3.4, windup: 0.7, rest: 1.2, move: 'spits acid' })],
  ],
});
boss({
  id: 'boss-bell', floor: 0, name: 'the bell', hp: 65, damage: 2, speed: 0.5, walk: 'drift', r: 0.6, at: [0.5],
  hint: 'its toll stuns whoever stands in the ring round it. stand a step from it (inside the ring, outside the clapper) or well off.',
  turn: ['the bell cracks. now its toll echoes: the inner ring, then the outer.'],
  phases: [
    [toll({ r0: 1.4, r1: 4, windup: 1.1, rest: 0.7, stun: 1.5 }), slam({ r: 0.9, windup: 0.9, rest: 0.7, move: 'swings its clapper', warn: 'the clapper swings: it hits within 0.9 cells. a step back (not into the ring), then in again.' }), toll({ r0: 1.4, r1: 4, windup: 1.1, rest: 0.7, stun: 1.5 }), peal({ r: 1.1, windup: 1.3, rest: 0.7, move: 'drops a bell on you', warn: 'a small bell falls where you stand: step off the ring.' })],
    [toll({ r0: 1.5, r1: 4, windup: 1.1, rest: 0.8, stun: 1.4, second: [0, 1.6] }), slam({ r: 1, windup: 0.9, rest: 0.7, move: 'swings its clapper' }), toll({ r0: 0, r1: 1.6, windup: 1, rest: 0.8, stun: 1.4, second: [1.5, 4] }), peal({ r: 1.1, windup: 1.2, rest: 0.7, n: 2, move: 'drops bells on you' })],
  ],
});

// floor 1, the choir: ranged, and they dodge your shots
boss({
  id: 'boss-choir', floor: 1, name: 'the seraph choir', hp: 136, damage: 3.8, speed: 1.4, walk: 'keep', keep: 4.5, dodge: true, r: 0.6, at: [0.5],
  hint: 'it keeps its distance and slips your shots. it burns down its lines and fans its light at you.',
  turn: ['the choir sings louder. lamps join it.'],
  phases: [
    [cross({ windup: 1.1, rest: 1, speed: 4 }), volley({ n: 5, spread: 0.7, speed: 4.2, windup: 0.8, rest: 1, times: 2, every: 0.6, move: 'fans its light' }), cross({ windup: 1.1, rest: 1, speed: 4, diag: true })],
    [cross({ windup: 1, rest: 1, speed: 4.4, both: true }), brood({ type: 'seraph', n: 2, cap: 2, windup: 1, rest: 1, move: 'calls lamps', warn: 'it calls seraph lamps: they burn down their lines.' }), volley({ n: 5, spread: 0.8, speed: 4.2, windup: 0.8, rest: 1.2, times: 2, every: 0.7, move: 'fans its light' })],
  ],
});
boss({
  id: 'boss-organ', floor: 1, name: 'the mimic organ', hp: 115, damage: 2.2, speed: 0, walk: 'still', r: 0.65, at: [0.5],
  hint: 'it plays chords of slow notes at you, and moves between its pipes. its pedal note shakes the floor round it.',
  turn: ['the organ pulls out every stop. mimics drop from its pipes.'],
  phases: [
    [volley({ n: 5, spread: 1, speed: 3, windup: 0.9, rest: 1.2, move: 'draws a chord', warn: 'the organ draws a chord: five slow notes fan out. slip between them.' }), slam({ r: 2.2, windup: 1, rest: 1.2, move: 'holds a pedal note', warn: 'a pedal note: the floor shakes within 2.2 cells. stand off.' }), blink({ windup: 0.8, rest: 1, move: 'its pipes groan', warn: 'its pipes groan: it moves to another bank of pipes.' })],
    [volley({ n: 7, spread: 1.4, speed: 3.3, windup: 0.8, rest: 1, times: 2, every: 0.8, move: 'draws a chord' }), brood({ type: 'mimic', n: 2, cap: 2, windup: 1, rest: 1, move: 'opens its pipes', warn: 'mimics drop out of its pipes.' }), blink({ windup: 0.7, rest: 0.6, move: 'its pipes groan', then: (g, e) => fan(g, e, 3, 0.5, 3.4) })],
  ],
});
boss({
  id: 'boss-ringer', floor: 1, name: 'the bell-ringer', hp: 136, damage: 4.3, speed: 1.6, walk: 'keep', keep: 4, dodge: true, r: 0.5, at: [0.5],
  hint: 'it keeps away and rings the floor where you stand. keep moving; it slips your shots, so shoot as it lands.',
  turn: ['the bell-ringer rings faster: three peals follow you.'],
  phases: [
    [peal({ r: 1.1, windup: 1.3, rest: 1, move: 'rings the floor under you' }), volley({ n: 1, spread: 0, speed: 5, windup: 0.6, rest: 1, times: 3, every: 0.35, move: 'throws handbells', warn: 'it throws handbells at you: three, quick. sidestep.' })],
    [peal({ r: 1.1, windup: 1.4, rest: 0.8, n: 3, move: 'rings three peals' }), volley({ n: 3, spread: 0.5, speed: 5, windup: 0.6, rest: 1, times: 2, every: 0.4, move: 'throws handbells' }), peal({ r: 1.2, windup: 1.3, rest: 0.8, move: 'rings the floor under you' })],
  ],
});

// floor 2, the ossuary: FPS, bullet patterns
boss({
  id: 'boss-abbot', floor: 2, name: 'the high abbot', hp: 180, damage: 2.6, speed: 0.7, walk: 'close', armour: 0.8, r: 0.6, at: [0.5],
  hint: 'bone shrugs off small hits. it sweeps round itself and throws fans of bone; later, a spiral.',
  turn: ['the high abbot lifts its crozier. bones begin to wheel round it.'],
  phases: [
    [slam({ r: 2.3, windup: 1.1, rest: 1.2, move: 'raises the crozier', warn: 'it raises its crozier: a sweep two cells round it. get out.' }), volley({ n: 5, spread: 0.9, speed: 4, windup: 0.8, rest: 1.2, move: 'throws bones', warn: 'it throws a fan of bones: strafe through the gap.' }), volley({ n: 3, spread: 0.5, speed: 4.4, windup: 0.7, rest: 1, times: 2, every: 0.5, move: 'throws bones' })],
    [spiral({ arms: 3, secs: 3.5, every: 0.2, spin: 1.3, speed: 3.3, windup: 1, rest: 1.2, move: 'wheels its bones' }), slam({ r: 2.5, windup: 1, rest: 1, move: 'raises the crozier' }), volley({ n: 5, spread: 1, speed: 4.3, windup: 0.8, rest: 1.2, times: 2, every: 0.6, move: 'throws bones' })],
  ],
});
boss({
  id: 'boss-hydra', floor: 2, name: 'the ossuary hydra', hp: 250, damage: 2, speed: 0.5, walk: 'drift', r: 0.7, at: [0.5],
  hint: 'three heads spit in turn, then all at once. it grows a head at half.',
  turn: ['the ossuary hydra grows a fourth head.'],
  phases: [
    [volley({ n: 1, spread: 0, speed: 5, windup: 0.6, rest: 1, times: 3, every: 0.3, move: 'heads spit in turn', warn: 'its heads spit one after another: keep strafing.' }), volley({ n: 3, spread: 0.7, speed: 4, windup: 0.9, rest: 1.2, move: 'all heads draw breath', warn: 'all three heads draw breath: three at once.' }), burst({ n: 12, speed: 3.2, windup: 1.1, rest: 1.4, gap: 3, warn: 'it swells: bone shards all round, with a gap to one side: run for it.' })],
    [volley({ n: 1, spread: 0, speed: 5.5, windup: 0.5, rest: 0.8, times: 4, every: 0.25, move: 'heads spit in turn' }), burst({ n: 16, speed: 3.4, windup: 1, rest: 1.2, gap: 3, times: 2, every: 0.7 }), volley({ n: 4, spread: 0.9, speed: 4.4, windup: 0.8, rest: 1, times: 2, every: 0.6, move: 'all heads draw breath' })],
  ],
});
boss({
  id: 'boss-hollow', floor: 2, name: 'the hollow saint', hp: 240, damage: 4.2, speed: 1, walk: 'keep', keep: 5, r: 0.55, at: [0.5],
  hint: 'it burns down its lines, then the diagonals, and bursts into rings. it fades and comes back elsewhere.',
  turn: ['the hollow saint empties. it fades between every burst now.'],
  phases: [
    [cross({ windup: 1, rest: 0.8, speed: 4.5 }), burst({ n: 16, speed: 3.6, windup: 0.9, rest: 1, gap: 2, times: 2, every: 0.6 }), cross({ windup: 0.9, rest: 0.8, speed: 4.5, diag: true }), volley({ n: 5, spread: 0.8, speed: 4.6, windup: 0.7, rest: 1, times: 2, every: 0.55, move: 'casts its light' })],
    [cross({ windup: 1, rest: 0.8, speed: 4.8, both: true }), blink({ windup: 0.6, rest: 0.5, then: (g, e) => ring(g, e, 16, 3.4, 0, 2) }), burst({ n: 18, speed: 3.7, windup: 0.9, rest: 1, gap: 2, times: 3, every: 0.55 }), volley({ n: 5, spread: 0.8, speed: 4.8, windup: 0.6, rest: 0.9, times: 2, every: 0.5, move: 'casts its light' })],
  ],
});

// floor 3, the furnace: improved FPS, heavier patterns
boss({
  id: 'boss-saint', floor: 3, name: 'the burning saint', hp: 340, damage: 4.8, speed: 0, walk: 'still', r: 0.65, at: [0.5],
  hint: 'it pours out turning arms of fire and crosses of light. later the floor under you catches.',
  turn: ['the burning saint flares. fire runs to where you stand.'],
  phases: [
    [spiral({ arms: 2, secs: 3, every: 0.16, spin: 1.4, speed: 3.8, windup: 1, rest: 1.2 }), cross({ windup: 0.9, rest: 1, speed: 5, both: true }), volley({ n: 5, spread: 0.8, speed: 4.6, windup: 0.7, rest: 1, move: 'flings embers' })],
    [spiral({ arms: 3, secs: 3.5, every: 0.16, spin: -1.5, speed: 4, windup: 0.9, rest: 1 }), sear({ r: 1.3, windup: 1, rest: 0.8, secs: 6 }), cross({ windup: 0.8, rest: 0.9, speed: 5.2, both: true }), volley({ n: 7, spread: 1.1, speed: 4.8, windup: 0.7, rest: 1, times: 2, every: 0.6, move: 'flings embers' })],
  ],
});
boss({
  id: 'boss-hammer', floor: 3, name: 'the hammer twin', hp: 160, damage: 4, speed: 1.3, walk: 'close', armour: 0.6, r: 0.6, at: [0.5], mate: 'boss-bellows',
  hint: 'two of them: the hammer charges and slams, the bellows blows fire from afar. kill one and the other rages.',
  turn: ['the hammer twin glows white. it rages.'],
  phases: [
    [charge({ windup: 1, cells: 6, speed: 9, rest: 1.2, stun: 1.6, move: 'lowers its hammer' }), slam({ r: 2, windup: 1, rest: 1.4, move: 'lifts the hammer', warn: 'the hammer lifts: it slams two cells round. get out.' })],
    [charge({ windup: 0.8, cells: 7, speed: 10, rest: 0.8, stun: 1.4, move: 'lowers its hammer' }), slam({ r: 2.3, windup: 1, rest: 0.8, move: 'lifts the hammer' }), burst({ n: 10, speed: 3.6, windup: 0.8, rest: 1, gap: 2, move: 'strikes sparks' })],
  ],
});
boss({
  id: 'boss-bellows', floor: 3, name: 'the bellows twin', hp: 140, damage: 3.6, speed: 1.1, walk: 'keep', keep: 5, r: 0.6, at: [0.5], mate: 'boss-hammer',
  hint: 'two of them: the hammer charges and slams, the bellows blows fire from afar. kill one and the other rages.',
  turn: ['the bellows twin wheezes. its fire comes in streams.'],
  phases: [
    [volley({ n: 5, spread: 0.9, speed: 4.4, windup: 0.8, rest: 1.4, move: 'fills its bellows', warn: 'the bellows fill: a fan of fire. strafe.' }), sear({ r: 1.2, windup: 1.1, rest: 1.4, secs: 5 })],
    [spiral({ arms: 2, secs: 3, every: 0.18, spin: 1.6, speed: 4, windup: 0.9, rest: 1 }), volley({ n: 5, spread: 0.9, speed: 4.6, windup: 0.7, rest: 1, times: 2, every: 0.6, move: 'fills its bellows' }), sear({ r: 1.3, windup: 0.9, rest: 1, secs: 6 })],
  ],
});
boss({
  id: 'boss-worm', floor: 3, name: 'the slag worm', hp: 240, damage: 3.2, speed: 0.8, walk: 'drift', r: 0.7, at: [0.5],
  hint: 'it digs in and comes up under you in a ring of slag. hit it while it is up; it spits triplets.',
  turn: ['the slag worm boils. where it comes up, slag stays.'],
  phases: [
    [burrow({ windup: 0.8, rest: 1.6, under: 2.2, r: 1.4, burst: 10 }), volley({ n: 3, spread: 0.45, speed: 5, windup: 0.6, rest: 1, times: 3, every: 0.5, move: 'spits slag', warn: 'it spits slag in threes: strafe.' }), volley({ n: 5, spread: 1, speed: 4.4, windup: 0.8, rest: 1.4, move: 'rears and spits' })],
    [burrow({ windup: 0.7, rest: 1.4, under: 2, r: 1.5, burst: 14, poolSecs: 6 }), volley({ n: 3, spread: 0.45, speed: 5.4, windup: 0.5, rest: 0.9, times: 3, every: 0.45, move: 'spits slag' }), spiral({ arms: 2, secs: 2.5, every: 0.18, spin: 1.8, speed: 4, windup: 0.8, rest: 1.2, move: 'thrashes' })],
  ],
});

// floor 4: the heart, every run the same; each phase is a floor's way of fighting
boss({
  id: 'boss-heart', floor: 4, name: "the thaw engine's heart", hp: 380, damage: 4.6, speed: 0, walk: 'still', r: 0.75, at: [0.66, 0.33],
  hint: 'the heart of the engine. it fights the way every floor did: brood and toll, then lines and peals, then spirals and fire.',
  turn: ['the heart beats faster. light runs down its lines; the floor rings under you.', 'the heart burns white. fire pours out in arms, and the floor catches.'],
  phases: [
    [brood({ type: 'mite', n: 3, cap: 5, windup: 0.9, rest: 1, move: 'beats out mites' }), toll({ r0: 1.6, r1: 4, windup: 1.2, rest: 1.2, stun: 1.2 }), volley({ n: 5, spread: 0.9, speed: 4, windup: 0.8, rest: 1, move: 'pumps a volley' })],
    [cross({ windup: 1, rest: 0.9, speed: 4.6, both: true }), peal({ r: 1.2, windup: 1.2, rest: 0.8, n: 2, move: 'rings the floor under you' }), volley({ n: 5, spread: 0.9, speed: 4.4, windup: 0.7, rest: 1, times: 2, every: 0.6, move: 'pumps a volley' })],
    [spiral({ arms: 3, secs: 3.5, every: 0.17, spin: 1.5, speed: 4, windup: 0.9, rest: 1 }), sear({ r: 1.3, windup: 0.9, rest: 0.8, secs: 6 }), burst({ n: 14, speed: 3.6, windup: 0.9, rest: 1, gap: 3, times: 2, every: 0.6 }), brood({ type: 'mite', n: 3, cap: 4, windup: 0.8, rest: 0.8, move: 'beats out mites' })],
  ],
});

// ---- the brain all bosses share

/** the attack a boss is on, by id within its phase list */
const atkOf = (e: Entity): Atk | undefined => {
  const d = data(e);
  return bdef(e).phases[phaseOf(e)]?.find((a, k) => `${a.id}:${k}` === d.atk);
};

/** keeps the distance it likes, sliding along walls */
function walkTo(g: Game, e: Entity, dt: number, want: number): void {
  const def = bdef(e);
  const [vx, vy, r] = toP(g, e);
  let dir = r > want + 0.4 ? 1 : r < want - 0.6 ? -1 : 0;
  // keepers circle you a little when at range
  let [mx, my] = [vx * dir, vy * dir];
  if (def.walk === 'keep' && dir === 0) {
    const side = (Math.floor(g.t / 3) + e.id) % 2 ? 1 : -1;
    [mx, my] = [-vy * side * 0.6, vx * side * 0.6];
    dir = 1;
  }
  if (!dir) return;
  const step = def.speed * dt * (def.walk === 'drift' ? 1 : 1);
  const tryMove = (ax: number, ay: number) => {
    const [nx, ny] = [e.x + ax * step, e.y + ay * step];
    if (!open(g, nx + Math.sign(ax) * 0.4, ny) || !open(g, nx, ny + Math.sign(ay) * 0.4)) return false;
    [e.x, e.y] = [nx, ny];
    return true;
  };
  if (!tryMove(mx, my) && !tryMove(mx, 0)) tryMove(0, my);
}

/** the choir slips your shots: one coming at it within 3 cells, it steps aside (every DODGE s) */
export const DODGE = 2.2;
function dodge(g: Game, e: Entity, dt: number): boolean {
  const d = data(e);
  const slide = d.slide as [number, number, number] | undefined;
  if (slide && g.t < slide[2]) {
    const [nx, ny] = [e.x + slide[0] * dt, e.y + slide[1] * dt];
    if (open(g, nx, ny)) [e.x, e.y] = [nx, ny];
    return true;
  }
  if (g.t < ((d.dodgeAt as number) ?? 0)) return false;
  for (const s of shots(g)) {
    const sd = s.data as unknown as ShotData;
    if (sd.foe) continue;
    const [dx, dy] = [e.x - s.x, e.y - s.y];
    const r = Math.hypot(dx, dy);
    if (r > 3 || (dx * sd.vx + dy * sd.vy) <= 0) continue;
    const sp = Math.hypot(sd.vx, sd.vy) || 1;
    // perpendicular, the way that is open
    let [px, py] = [-sd.vy / sp, sd.vx / sp];
    if (!open(g, e.x + px * 1.2, e.y + py * 1.2)) [px, py] = [-px, -py];
    d.slide = [px * 5, py * 5, g.t + 0.25];
    d.dodgeAt = g.t + DODGE;
    return true;
  }
  return false;
}

/** past this many cells from you, or with you this far from its post, a boss starts nothing new */
export const LEASH = 10;
/** and after this long away it heals back to its phase line */
export const LEASH_HEAL = 6;

function bossAi(g: Game, e: Entity, dt: number): void {
  const d = data(e);
  const def = bdef(e);
  const p = g.player;
  if (!d.noticed) {
    if (dist(e, p) > 9 || !clear(g, e.x, e.y, p.x, p.y)) return;
    d.noticed = true;
    d.nextAt = g.t + 1.2;
  }
  // phases: at each threshold it turns (a twin turns when its mate falls, too)
  const frac = e.enemy!.hp / Number(d.maxHp ?? def.hp);
  const mateDown = def.mate && !g.ents.some((x) => x.enemy?.type === def.mate);
  const want = Math.min(def.phases.length - 1, Math.max(def.at.filter((a) => frac <= a).length, mateDown ? 1 : 0));
  if (want > phaseOf(e) && !d.windup && !d.chan) {
    d.phase = want;
    d.k = 0;
    say(g, `⚠ ${def.turn[want - 1] ?? `${def.name} turns.`}`);
    g.events.push({ type: 'boss-phase', at: [e.x, e.y], data: want });
    d.nextAt = g.t + 0.8;
  }
  if (g.t < ((d.stun as number) ?? 0)) return;
  if (d.windup) {
    if (g.t < (d.windup as number)) return;
    const atk = atkOf(e);
    const zones = (d.zones as Zone[]) ?? [];
    d.windup = 0;
    d.move = '';
    d.zones = null;
    d.wide = false;
    atk?.land(g, e, zones);
    d.chan = !!atk?.chan;
    d.nextAt = g.t + (atk?.rest ?? 1);
    return;
  }
  if (d.chan) {
    const atk = atkOf(e);
    if (atk?.chan?.(g, e, dt)) return;
    d.chan = false;
    d.nextAt = g.t + (atk?.rest ?? 1);
    return;
  }
  // the leash (v2 r1 fun): past LEASH cells, or with you that far from its room, it starts nothing new and goes
  // back to its post; LEASH_HEAL s away, it is whole again up to its phase line. Leaving is a choice, not a cheat
  const [hx, hy] = (d.home as [number, number]) ?? [e.x, e.y];
  if (dist(e, p) > LEASH || Math.hypot(p.x - hx, p.y - hy) > LEASH) {
    if (!d.awayAt) {
      d.awayAt = g.t;
      if (g.t - Number(d.leashSaid ?? -99) > 15) say(g, `${def.name} waits. it will not follow you out.`);
      d.leashSaid = g.t;
    }
    const [vx, vy] = [hx - e.x, hy - e.y];
    const r = Math.hypot(vx, vy);
    if (r > 0.2 && def.speed > 0) {
      const step = Math.min(r, def.speed * dt);
      const [nx, ny] = [e.x + (vx / r) * step, e.y + (vy / r) * step];
      if (open(g, nx, ny)) [e.x, e.y] = [nx, ny];
    }
    const line = phaseOf(e) ? def.at[phaseOf(e) - 1] : 1;
    const max = Number(d.maxHp ?? def.hp);
    if (g.t - Number(d.awayAt) > LEASH_HEAL && e.enemy!.hp < line * max) {
      e.enemy!.hp = Math.round(line * max);
      say(g, `${def.name} gathers itself, whole again to ${Math.round(line * 100)}%.`);
    }
    return;
  }
  d.awayAt = 0;
  if (def.dodge && dodge(g, e, dt)) return;
  if (def.walk === 'close') walkTo(g, e, dt, 1);
  else if (def.walk === 'keep') walkTo(g, e, dt, def.keep ?? 4);
  else if (def.walk === 'drift') walkTo(g, e, dt, 2.2);
  if (g.t < ((d.nextAt as number) ?? 0)) return;
  // the next attack in its cycle that fits
  const list = def.phases[phaseOf(e)];
  const r = dist(e, p);
  for (let n = 0; n < list.length; n++) {
    const k = (Number(d.k ?? 0) + n) % list.length;
    const atk = list[k];
    if (atk.when && !atk.when(g, e, r)) continue;
    d.k = k + 1;
    d.atk = `${atk.id}:${k}`;
    d.windup = g.t + atk.windup;
    d.windAt = g.t;
    d.move = atk.move;
    d.wide = atk.id === 'slam' || atk.id === 'toll';
    d.zones = atk.aim?.(g, e) ?? null;
    g.events.push({ type: 'warn', at: [e.x, e.y] });
    // the console teaches each move once a fight; the HUD says it every time
    const told = (d.told as string[]) ?? (d.told = []);
    if (!told.includes(atk.warn)) {
      told.push(atk.warn);
      say(g, `⚠ ${def.name}: ${atk.warn}`);
    }
    return;
  }
  d.nextAt = g.t + 0.5;
}

// ---- the stun, the pools, the marks on the floor

tickHooks.push((g, dt) => {
  const p = g.player;
  const s = stunned.get(g);
  if (s && g.t < s.until) {
    [p.x, p.y] = [s.x, s.y];
    p.path = [];
    p.move = null;
  }
  const list = pools.get(g);
  if (list?.length) {
    pools.set(g, list.filter((q) => g.t < q.until));
    for (const q of list) {
      if (Math.hypot(p.x - q.x, p.y - q.y) > q.r || g.ended) continue;
      // it burns in pulses: once every 0.5 s
      const k = Math.floor(g.t * 2);
      if (Math.floor((g.t - dt) * 2) === k) continue;
      const src = g.ents.find((x) => x.id === q.src);
      hurt(g, q.share, src);
    }
  }
  marks(g);
});

/** red embers on the floor round each wind-up's zones and pools: the eye shows where it will hit */
function marks(g: Game): void {
  const want: [number, number][] = [];
  for (const e of g.ents) {
    const zs = e.enemy?.data.zones as Zone[] | null | undefined;
    if (!zs || !bdef(e)) continue;
    for (const z of zs) want.push(...outline(z));
  }
  for (const q of poolsOf(g)) want.push(...outline({ k: 'ring', x: q.x, y: q.y, r0: 0, r1: q.r }), [q.x, q.y]);
  const key = want.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(';');
  const was = marked.get(g);
  if (was?.key === key) return;
  g.ents = g.ents.filter((x) => !x.data?.mark);
  for (const [x, y] of want) if (open(g, x, y)) spawn(g, { kind: 'prop', x, y, data: { mark: true } });
  marked.set(g, { key });
}
const marked = new WeakMap<Game, { key: string }>();

/** points along a zone's edge, about one per 0.7 cells */
export function outline(z: Zone): [number, number][] {
  const out: [number, number][] = [];
  if (z.k === 'ring') {
    for (const r of z.r0 > 0 ? [z.r0, z.r1] : [z.r1]) {
      const n = Math.max(6, Math.round((r * Math.PI * 2) / 0.7));
      for (let k = 0; k < n; k++) out.push([z.x + Math.cos((k / n) * Math.PI * 2) * r, z.y + Math.sin((k / n) * Math.PI * 2) * r]);
    }
    return out;
  }
  for (let s = 0.8; s <= z.len; s += 0.7) out.push([z.x + z.vx * s, z.y + z.vy * s]);
  return out;
}

// ---- spawning, death, drops

/** the floors slice sets `down` (it opens the stairs) */
export const bossHooks: { down: (g: Game, e: Entity) => void } = { down: () => {} };

/** the variant this run meets on a floor: fixed by the seed */
export function variantOf(g: Game, floor: number): BossDef {
  const list = BOSSES[Math.max(0, Math.min(4, floor))].filter((b) => !b.mate || b.id < b.mate);
  return list[hash(g.seed, 404, floor) % list.length];
}

/** place a floor's boss (and its twin) at x, y; returns the one that leads */
export function spawnBoss(g: Game, floor: number, x: number, y: number, variant?: string): Entity {
  const def = variant ? BOSS[variant] : variantOf(g, floor);
  const e = put(g, def, x, y);
  if (def.mate) put(g, BOSS[def.mate], x + 2, y);
  return e;
}
function put(g: Game, def: BossDef, x: number, y: number): Entity {
  const [px, py] = open(g, x, y) ? [x, y] : [Math.floor(x) + 0.5, Math.floor(y) + 0.5];
  const e = spawnEnemy(g, def.id, px, py);
  Object.assign(e.enemy!.data, { boss: true, elite: true, mult: 1, r: def.r, home: [px, py], maxHp: def.hp, phase: 0 });
  return e;
}

/** module upgrades a boss leaves: per floor, the kinds that help on the next one */
export const DROP_POOL: string[][] = [
  ['nail-psalm', 'rivet-sling', 'censer-flail', 'choir-bell', 'frost-coat', 'vidicon-tube'],
  ['bone-lance', 'ember-spit', 'gyro-heart', 'halo', 'mirror-ward', 'lead-lung'],
  ['heat-lance', 'reliquary-saw', 'ossuary-plate', 'rime-hood', 'reliquary-ribs', 'overclock-coil'],
  ['heat-lance', 'reliquary-saw', 'ossuary-plate', 'reliquary-ribs', 'saints-lens'],
  [],
];
/** core power each keeper's ember heart adds (all but the heart's) */
export const KEEPER_POWER = 2;
/** and max hp (r1: hp stalled at 22 from floor 2 on, while the keepers hit 4–6) */
export const KEEPER_FLESH = 2;
/** floors whose boss also gives up a unique (from the run's deck, src/mods/uniques.ts) */
export const UNIQUE_FLOORS = [1, 3];

export function bossDrops(g: Game, floor: number): Item[] {
  const r = rng(hash(g.seed, 505, floor));
  const owned = new Set([...g.player.installed.map((i) => i.mod), ...g.player.inv.flatMap((i) => (i.kind === 'mod' ? [i.mod] : []))]);
  const pool = DROP_POOL[floor].filter((m) => MODS[m]);
  const out: Item[] = [];
  if (pool.length) {
    const fresh = pool.filter((m) => !owned.has(m));
    out.push({ kind: 'mod', mod: r.pick(fresh.length ? fresh : pool), rarity: 'rare' }); // v2 balance: every keeper pays a rare
  }
  if (UNIQUE_FLOORS.includes(floor)) out.push(dealUnique(g));
  return out;
}

killHooks.push((g, e) => {
  const def = e.enemy && BOSS[e.enemy.type];
  if (!def) return;
  // its brood and its marks go with it
  g.ents = g.ents.filter((x) => x.enemy?.data.summoner !== e.id);
  const mate = def.mate && g.ents.find((x) => x.enemy?.type === def.mate);
  if (mate) {
    say(g, `${def.name} falls. ${BOSS[def.mate!].name} rages.`);
    return;
  }
  const lead = def.mate && def.id > def.mate ? BOSS[def.mate] : def;
  const name = lead.mate ? 'the forge twins' : def.name;
  pools.set(g, []);
  stunned.delete(g);
  const items = bossDrops(g, def.floor);
  items.forEach((item, k) => spawn(g, { kind: 'item', x: e.x + (k ? 0.4 : -0.2), y: e.y + 0.3, item }));
  say(g, `✦ ${name} is down.${items.length ? ` it leaves ${items.map((i) => (i.kind === 'mod' ? label(i) : '')).join(' and ')}.` : ''}`);
  // its ember heart (v2 balance, r1 pace: the next floor's kit had no power to run on): +KEEPER_POWER core power
  if (def.floor < BOSSES.length - 1) {
    const p = g.player;
    p.core += KEEPER_POWER;
    p.flesh = (p.flesh ?? 0) + KEEPER_FLESH;
    p.maxHp += KEEPER_FLESH;
    p.hp = p.maxHp;
    say(g, `its ember heart settles into you: +${KEEPER_POWER} power (${p.core}), +${KEEPER_FLESH} max hp, and it mends you.`);
  }
  g.events.push({ type: 'boss-down', at: [e.x, e.y], data: def.id });
  bossHooks.down(g, e);
});

// ---- test fights: ?boss=<floor>:<variant> in the browser, the boss sim in node

/** a loadout typical for each floor, and the hp it has by then */
export const LOADOUTS: { mods: string[]; flesh: number; slots: number; core: number }[] = [
  { mods: ['pinhole-eye', 'stepper-relay', 'spark-finger', 'censer-flail', 'lead-lung'], flesh: 0, slots: 6, core: 6 }, // v2 balance: what the run sim really has at the cradle's keeper
  { mods: ['vidicon-tube', 'stepper-relay', 'nail-psalm', 'spark-finger', 'rivet-sling', 'plumb-line', 'lead-lung'], flesh: 8, slots: 8, core: 9 }, // v2 balance: the run sim's kit at the nave's keeper
  // floors 3-5 are fought through the FPS scope (stageBoss goes big with it)
  { mods: ['pilgrim-scope', 'gyro-heart', 'bone-lance', 'nail-psalm', 'halo', 'frost-coat', 'map-spool'], flesh: 6, slots: 7, core: 13 },
  { mods: ['martyr-scope', 'gyro-heart', 'heat-lance', 'ember-spit', 'halo', 'ossuary-plate', 'rime-hood', 'map-spool'], flesh: 8, slots: 8, core: 18 },
  { mods: ['martyr-scope', 'gyro-heart', 'heat-lance', 'ember-spit', 'reliquary-saw', 'halo', 'ossuary-plate', 'rime-hood'], flesh: 10, slots: 8, core: 20 },
];

/** clear a square of floor round (x, y): room for a fight */
export function arena(g: Game, x: number, y: number, r = 7): void {
  ensure(g, x, y, 2);
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) setCell(g, Math.floor(x) + i, Math.floor(y) + j, Math.max(Math.abs(i), Math.abs(j)) === r ? Cell.wall : Cell.floor);
  // a few pillars to break lines
  for (const [i, j] of [[-3, -3], [3, 3], [-3, 3], [3, -3]]) setCell(g, Math.floor(x) + i, Math.floor(y) + j, Cell.wall);
}

/** a test fight: the floor's loadout on, an arena round you, the boss 4 cells north */
export function stageBoss(g: Game, floor: number, variant?: string): Entity {
  const p = g.player;
  const k = LOADOUTS[Math.max(0, Math.min(4, floor))];
  p.installed = [];
  p.inv = [];
  p.slots = k.slots;
  p.core = k.core;
  p.flesh = k.flesh;
  for (const mod of k.mods) if (MODS[mod]) p.installed.push({ uid: g.nextId++, mod, on: true, readyAt: g.t - 1, data: {} });
  p.slots = Math.max(k.slots, slotsUsed(g)); // some modules take two slots (v2 inventory)
  p.maxHp = 10 + k.flesh + p.installed.reduce((s, i) => s + Number(MODS[i.mod]?.params.hp ?? 0), 0);
  p.hp = p.maxHp;
  // a scope in the loadout: the fight is played big (src/body/fps.ts), as on floors 3-5
  if (p.installed.some((i) => Number(MODS[i.mod]?.params.big ?? 0) > 0)) VERBS.big?.run(g, []);
  arena(g, p.x, p.y);
  g.ents = g.ents.filter((e) => Math.hypot(e.x - p.x, e.y - p.y) > 12);
  p.dir = 0;
  const e = spawnBoss(g, floor, Math.floor(p.x) + 0.5, Math.floor(p.y) - 3.5, variant);
  say(g, [`staged: ${bdef(e).name} (floor ${floor}). ${bdef(e).hint}`]);
  return e;
}

/** the boss fight on screen: the lead and its mate (for the HUD bar) */
export function bossesNear(g: Game, range = 16): Entity[] {
  return g.ents.filter((e) => e.enemy && BOSS[e.enemy.type] && (isUnder(e) || dist(e, g.player) <= range));
}
