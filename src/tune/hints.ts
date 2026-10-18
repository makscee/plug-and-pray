// Play-through tuning (#1328): what a blind new player is told, once, so the first minutes read from
// the console alone. When the legs first work, the console says where the spark and the card reader
// are, in compass words and cells, with a button that walks that way.
// Playtest r1: those buttons, listen's and a `go` into a wall all follow the pilot's pathfinder over
// open floor, so a button walks the first straight leg of a real way there, never into a wall.

import { active, def, label, param, slotsUsed } from '../core/mods';
import { cells, dist, itemName, say, tickHooks } from '../core/game';
import { canRead, carriesReader } from '../world/vectors';
import { atStairs, bossDown, floorAt, FLOORS, floorOf, LAST, STAIRS, stairsAt, stairsOf } from '../world/floors';
import { lightest, makeRoom, MAX_SLOTS } from '../body';
import { DIRS, open } from '../core/grid';
import { VERBS, verb, way } from '../core/verbs';
import { route, walkThen } from '../mods/pilot';
import { hollowBeside, secrets } from '../world/secrets';
import { walks } from '../mods/gait';
import { foundEye } from '../world/printer';
import { cacheOf, cacheProp, NEAR, wasOpened } from '../world/cache';
import type { Entity, Game, Line } from '../core/types';

const told = new WeakSet<Game>();
/** the keeper's door (src/tune/door.ts fills these in; it loads the bosses, so the sims never load it and
 *  their hook order stays as it was) */
export const keeperDoor: {
  at: (g: Game, r?: number) => { x: number; y: number; dir: string } | null;
  of: (g: Game, f: number) => { x: number; y: number; dir: string } | null;
  line: (g: Game, f: number) => Line[];
  ready: (g: Game, f: number) => boolean;
  /** v2r6: ready but thin ('' when not) */
  risky?: (g: Game, f: number) => string;
} = { at: () => null, of: () => null, line: () => [], ready: () => false };
/** how far (path cells) a hint looks for a way */
const PLAN = 60;

/** the first straight leg of a path over open floor toward (x, y): a direction and 1..9 cells, or null */
export function firstLeg(g: Game, x: number, y: number): [string, number] | null {
  const p = g.player;
  const [sx, sy] = [Math.floor(p.x), Math.floor(p.y)];
  const { path } = route(g, sx, sy, Math.floor(x), Math.floor(y), PLAN, false, true);
  if (!path.length) return null;
  const step = ([ax, ay]: number[], [bx, by]: number[]) => [Math.round(bx - ax), Math.round(by - ay)];
  const [dx, dy] = step([sx + 0.5, sy + 0.5], path[0]);
  let n = 1;
  while (n < Math.min(9, path.length)) {
    const [ex, ey] = step(path[n - 1], path[n]);
    if (ex !== dx || ey !== dy) break;
    n++;
  }
  const d = Object.keys(DIRS).find((k) => DIRS[k][0] === dx && DIRS[k][1] === dy);
  return d ? [d, n] : null;
}
const axis = way.leg;
way.leg = (g, x, y) => firstLeg(g, x, y) ?? axis(g, x, y);

/** straight runs of open floor from cell (x, y): [direction, cells up to 9] for each open side */
export function openRuns(g: Game, x: number, y: number, but = ''): [string, number][] {
  const out: [string, number][] = [];
  for (const d of ['n', 'e', 's', 'w']) {
    if (d === but) continue;
    const [dx, dy] = DIRS[d];
    let n = 0;
    while (n < 9 && open(g, x + dx * (n + 1), y + dy * (n + 1))) n++;
    if (n) out.push([d, n]);
  }
  return out;
}

// a `go` that stops short says where the wall is and which ways are open from where you stop
const go = VERBS.go;
if (go)
  VERBS.go = {
    ...go,
    run(g, args) {
      const p = g.player;
      const before = p.path.length;
      const lines = g.log.length;
      go.run(g, args);
      const d = args[0]?.[0];
      if (!d || !DIRS[d]) return;
      const want = Math.min(9, Math.max(1, Number(args[1]) || 1));
      const got = p.path.length - before;
      if (got >= want) return;
      // the base says "a wall." when nothing moved: this line says more
      if (g.log.length === lines + 1 && g.log[g.log.length - 1][0] === 'a wall.') g.log.pop();
      const [ex, ey] = p.path.length ? p.path[p.path.length - 1] : [Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5];
      // the ways on from where you stop: not straight back, unless that is all there is
      const back = { n: 's', s: 'n', e: 'w', w: 'e' }[d]!;
      const ways = openRuns(g, ex, ey, d);
      const runs = got && ways.length > 1 ? ways.filter(([r]) => r !== back) : ways;
      const buttons = runs.flatMap(([r, n], k): Line => [k ? '  ' : '', { text: `go ${r} ${n}`, cmd: `go ${r} ${n}` }]);
      const head = got ? `wall after ${got} cell${got > 1 ? 's' : ''}` : `a wall ${d}`;
      say(g, [`${head}; open: ${runs.length ? runs.map(([r]) => r).join(', ') : 'none'}.  `, ...buttons]);
    },
  };

function toward(g: Game, mod: string, sound: string): Line | null {
  const p = g.player;
  // v2r1 pace: a second card reader lies about as loot; the one with the card beside it comes first
  const card = (e: Entity) => g.ents.some((o) => o.item?.kind === 'card' && dist(o, e) < 1);
  const e = g.ents
    .filter((e) => e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === mod && !e.data?.mimic)
    .sort((a, b) => +card(b) - +card(a) || dist(a, p) - dist(b, p))[0];
  // playtest r3: one you wear counts too (it pointed at a second dawn eye)
  if (!e || [...p.inv, ...p.installed].some((i) => 'mod' in i && i.mod === mod)) return null;
  // v2r2 ux: the first eye lies sealed behind a cracked wall: the way is to the wall, and the act is break
  const sealed = e.data?.sealed as [number, number] | undefined;
  // the way is worked out even while the eye is not named yet: finding it makes the chunks on the way, and the
  // world must grow the same either way (the sims lost 9 thaws of 80 when it did not)
  const line = sealed ? toCell(g, sealed[0] + 0.5, sealed[1] + 0.5, `${sound}, sealed behind a cracked wall`, 'break') : toCell(g, e.x, e.y, sound);
  if (mod === 'pinhole-eye' && !eyeHinted(g)) return ['an eye lies somewhere on this floor. walk; the map marks it.'];
  return line;
}

/** the last leg `where` gave, per game and per target cell: which way, from where (v2r5 run: one entry per
 *  game, and each of `where`'s 3-5 lines overwrote it, so the guard never saw a ping-pong) */
export const lastLeg = new WeakMap<Game, Map<string, { dir: string; at: [number, number] }>>();
const legsOf = (g: Game) => {
  let m = lastLeg.get(g);
  if (!m) lastLeg.set(g, (m = new Map()));
  return m;
};
const BACK: Record<string, string> = { n: 's', s: 'n', e: 'w', w: 'e' };
/** the first straight leg of a way over floor you have mapped, or null when the map knows no way there */
function knownLeg(g: Game, x: number, y: number): [string, number] | null {
  const p = g.player;
  const [sx, sy] = [Math.floor(p.x), Math.floor(p.y)];
  const { path, whole } = route(g, sx, sy, Math.floor(x), Math.floor(y), 120);
  if (!whole || !path.length) return null;
  const [dx, dy] = [Math.round(path[0][0] - sx - 0.5), Math.round(path[0][1] - sy - 0.5)];
  let n = 1;
  while (n < Math.min(9, path.length) && Math.round(path[n][0] - path[n - 1][0]) === dx && Math.round(path[n][1] - path[n - 1][1]) === dy) n++;
  const d = Object.keys(DIRS).find((k) => DIRS[k][0] === dx && DIRS[k][1] === dy);
  return d ? [d, n] : null;
}

/** "<sound>, 21 cells se. first: [go s 5]": the leg is the start of a real way there (playtest r3: the
 * straight word and the leg read as a disagreement, and an axis leg walked into a dead end) */
export function toCell(g: Game, x: number, y: number, sound: string, act = 'take'): Line {
  const p = g.player;
  const [dx, dy] = [x - p.x, y - p.y];
  // r4: on it or beside it, the leg ping-ponged (go n 1, go s 1); say what to do here instead
  if (Math.abs(Math.floor(x) - Math.floor(p.x)) + Math.abs(Math.floor(y) - Math.floor(p.y)) <= 1) return [`${sound}: here. `, { text: act, cmd: act }];
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 45) % 8];
  let [ax, n] = way.long(g, x, y);
  // v2r5 run: the only way runs through a sleeping keeper's room: say so, never a leg into its door
  if (!way.whole && way.block(g, Math.floor(x), Math.floor(y))) {
    const block = way.block;
    way.block = () => null;
    way.long(g, x, y);
    const through = way.whole;
    way.block = block;
    if (through) {
      const here: [number, number] = [Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5];
      const run = openRuns(g, here[0], here[1]).sort((a, b) => b[1] - a[1])[0];
      const go: Line = run ? [{ text: `go ${run[0]} ${run[1]}`, cmd: walks(g) ? `go ${run[0]} ${run[1]}` : `crawl ${run[0]}` }] : [];
      return [`${sound}, ${cells(Math.round(Math.hypot(dx, dy)))} ${word}: past the keeper. go in, or explore `, ...go, ' for another way.'];
    }
  }
  // v2r4 run: behind unmapped wall it said go e 3, then go w 3 from there: a leg that turns straight back on the
  // last one for the same place goes by mapped floor instead, or says to explore
  const key = `${Math.floor(x)},${Math.floor(y)}`;
  const here: [number, number] = [Math.floor(p.x), Math.floor(p.y)];
  const last = legsOf(g).get(key);
  if (last && last.dir === BACK[ax] && (last.at[0] !== here[0] || last.at[1] !== here[1])) {
    const known = knownLeg(g, x, y);
    if (!known || known[0] === ax) {
      const runs = openRuns(g, here[0] + 0.5, here[1] + 0.5).filter(([d]) => d !== ax && d !== last.dir).sort((a, b) => b[1] - a[1]);
      const [ex, en] = runs[0] ?? [last.dir, 3];
      legsOf(g).set(key, { dir: ex, at: here });
      return [`${sound}, ${cells(Math.round(Math.hypot(dx, dy)))} ${word}. no known way yet: explore `, { text: `go ${ex} ${en}`, cmd: walks(g) ? `go ${ex} ${en}` : `crawl ${ex}` }, ' and the map fills.'];
    }
    [ax, n] = known;
  }
  legsOf(g).set(key, { dir: ax, at: here });
  // v2r2 fun: with a pilot as legs, its goto where it knows the way; the gyro heart walks `go` too
  const cmd = VERBS.goto?.when?.(g) && g.seen.has(`${Math.floor(x)},${Math.floor(y)}`) ? `goto ${Math.floor(x)} ${Math.floor(y)}` : walks(g) ? `go ${ax} ${n}` : `crawl ${ax}`;
  return [`${sound}, ${cells(Math.round(Math.hypot(dx, dy)))} ${word}. first: `, { text: cmd, cmd }];
}

/** v2r2 fun + ux: the first eye is named only after this long (game s), or once you walk within EYE_NEAR of it,
 *  so the map-only start lasts a while: you walk, click the map and hear hearts before anything points the way */
export const EYE_HINT = 60;
export const EYE_NEAR = 12;
const firstEye = (g: Game): Entity | undefined => g.ents.find((e) => e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === 'pinhole-eye' && !e.data?.mimic);
export function eyeHinted(g: Game): boolean {
  const e = firstEye(g);
  return !!g.floor || g.t >= EYE_HINT || !e || dist(e, g.player) < EYE_NEAR;
}

/** what the wake hint points at (the map marks them too, while they lie there) */
export const HINTED = ['pinhole-eye', 'card-reader'];

/** the reliquary by the start, until you have stood at it (playtest r3: its layer eye is the best early
 * hook, and three hint-following runs never found it) */
export const cradleShop = (g: Game): Entity | undefined =>
  g.ents.filter((e) => e.kind === 'printer' && e.data?.shop && ((e.data?.far as number) ?? 0) < 1.5 && !e.data?.greeted && dist(e, g.player) < 40).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];

/** the wake hint's lines: the dawn eye, the card reader (named as the map names them) and the cradle's reliquary, while they lie out there */
const hintLines = (g: Game) => {
  // v2 floors: the wake hint is the cradle's; deeper, a dawn eye lying about is only loot
  if (g.floor) return [];
  const shop = cradleShop(g);
  return [
    // v2r3 ux: "your first sight" only while you have none
    toward(g, 'pinhole-eye', g.player.installed.some((i) => def(i).family === 'camera') ? 'a spare eye glints' : 'an eye glints: your first sight'),
    // v2r1 ux: "ticks, waiting for a card" read as a machine you needed a card for; it is a pickup, with the card
    toward(g, 'card-reader', 'a card reader and a card: take both, then read'),
    // v2r3 fun: only once your first eye is found (its eye stays behind glass till then, src/world/printer.ts)
    shop && foundEye(g) ? toCell(g, shop.x, shop.y, 'a reliquary shop sells an eye for hidden things', 'buy') : null,
  ].filter((l): l is Line => !!l);
};

const toldDrag = new WeakSet<Game>();
// playtest r3: the take line named `read card` as plain text in a burst; a skimmer never read the card
const take = VERBS.take;
if (take)
  VERBS.take = {
    ...take,
    run(g, args) {
      const had = g.player.inv.filter((i) => i.kind === 'card' || (i.kind === 'mod' && i.mod === 'card-reader')).length;
      const mods = g.player.inv.filter((i) => i.kind === 'mod').length;
      take.run(g, args);
      // v2r1 ux: dragging was never taught; the first module you pick up says it once
      if (g.player.inv.filter((i) => i.kind === 'mod').length > mods && !toldDrag.has(g)) {
        toldDrag.add(g);
        say(g, 'drag it from the inventory to the grid to install, or onto a module to swap. double-click installs.');
      }
      const now = g.player.inv.filter((i) => i.kind === 'card' || (i.kind === 'mod' && i.mod === 'card-reader')).length;
      const read = VERBS.read;
      if (now > had && g.player.inv.some((i) => i.kind === 'card') && read && canRead(g))
        say(g, ['read the card, it points to loot: ', { text: '[read card]', cmd: 'read card' }]);
      else if (now > had && g.player.inv.some((i) => i.kind === 'card') && carriesReader(g))
        say(g, [`a card to read; your reader needs bone. `, ...readFix(g)]);
    },
  };

const toldEye = new WeakSet<Game>();
tickHooks.push((g) => {
  if (g.floor || toldEye.has(g) || !eyeHinted(g)) return;
  toldEye.add(g);
  const e = firstEye(g);
  if (!e || g.player.installed.some((i) => def(i).family === 'camera') || g.player.inv.some((i) => i.kind === 'mod' && def(i).family === 'camera')) return;
  const line = toward(g, 'pinhole-eye', '◆ the map caught a glint: your first eye');
  if (line) say(g, line);
});

tickHooks.push((g) => {
  if (told.has(g) || !active(g, 'gait').some((i) => param(i, 'go', false))) return;
  told.add(g);
  const lines = hintLines(g);
  if (lines.length) say(g, 'you hear:', ...lines, ['the map marks them. ', { text: 'listen', cmd: 'listen' }, ' finds the way, ', { text: 'where', cmd: 'where' }, ' repeats it.']);
});

/** v4 inv: reliquaries `where` has named */
const kitTold = new WeakMap<Game, Set<number>>();
// playtest r2: the hint was said once and could not be asked again
verb('where', {
  help: 'what to do next: an eye, a card to read, the stairs, a vector',
  run(g) {
    const lines = hintLines(g);
    if (lines.length) say(g, 'you hear:', ...lines);
    // playtest r3: past the dawn eye it went silent, with a card that points at the shard in the bag
    // v4 inv: an unopened reliquary on this floor, named once
    const kit = cacheProp(g);
    let told = kitTold.get(g);
    if (!told) kitTold.set(g, (told = new Set()));
    if (kit && !wasOpened(g) && !cacheOf(g).done && cacheOf(g).offer.length && !told.has(kit.id)) {
      told.add(kit.id);
      const [d, n] = way.long(g, kit.x, kit.y);
      const near = dist(kit, g.player) <= NEAR;
      say(g, ['a reliquary of the old machines waits where you landed: its kit, two free. ', near ? { text: 'open', cmd: 'open' } : { text: `go ${d} ${n}`, cmd: `go ${d} ${n}` }]);
    }
    const more = after(g);
    if (more.length) return say(g, ...more);
    if (!lines.length) say(g, 'nothing left to point at.');
  },
});

/** the altars you have stood at, per game: `where` keeps naming them */
const altarsUsed = new WeakMap<Game, Set<number>>();
const altarLook = new WeakMap<Game, number>();
tickHooks.push((g) => {
  if (g.t < (altarLook.get(g) ?? 0)) return;
  altarLook.set(g, g.t + 0.5);
  const a = g.ents.find((e) => e.data?.altar && dist(e, g.player) < 1.6);
  if (!a) return;
  let s = altarsUsed.get(g);
  if (!s) altarsUsed.set(g, (s = new Set()));
  s.add(a.id);
});

/** the nearest altar on floor f you have seen or stood at (the door card names one, or says none is seen) */
export function altarSeen(g: Game, f = floorOf(g)): Entity | undefined {
  const used = altarsUsed.get(g);
  return g.ents.filter((e) => e.data?.altar && floorAt(e.x) === f && (used?.has(e.id) || g.seen.has(`${Math.floor(e.x)},${Math.floor(e.y)}`))).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];
}

/** past the wake hint: a card to read, the nearest vector, a printer when slots are full */
function after(g: Game): Line[] {
  const p = g.player;
  const out: Line[] = [];
  if (p.inv.some((i) => i.kind === 'card'))
    out.push(
      canRead(g)
        ? ['a memory card waits to be read: ', { text: 'read card', cmd: 'read card' }]
        : carriesReader(g)
          ? [`a card waits; your reader needs bone. `, ...readFix(g)]
          : p.installed.some((i) => i.mod === 'card-reader' && !i.on)
          ? ['a card waits; your reader is off: ', { text: 'on card reader', cmd: 'on card reader' }]
          : ['a card waits; you need a card reader.'],
    );
  // r4 final: no card reader at all and floors left whose way down a card would tell: say where one comes from
  const hasReader = [...p.inv, ...p.installed].some((i) => 'mod' in i && i.mod === 'card-reader');
  if (!hasReader && (g.floor ?? 0) < 3 && !g.ents.some((e) => e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === 'card-reader'))
    out.push(['no card reader: ', { text: 'print mind', cmd: 'print mind' }, ' at a printer.']);
  // v2r2 ux: a rare boss drop was left on the floor while `where` pointed past it
  const r = rareNear(g);
  if (r) out.push(toCell(g, r.x, r.y, `✦ the ${itemName(r.item!).replace(/^the /, '')} lies where it fell`));
  out.push(wayDown(g));
  const v = g.vectors.filter((v) => !v.found && v.what !== 'way down').sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (v) out.push(toCell(g, v.x, v.y, `the ${v.what}`));
  // v2r4 run: the door card said "temper at an altar", or bone piled up with no glass, and nothing named an altar
  const res = (r: string) => p.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === r ? i.n : 0), 0);
  const f = floorOf(g);
  const unready = !bossDown(g) && !!keeperDoor.of(g, f) && !keeperDoor.ready(g, f);
  // v2r5 run: hurt after a retreat, `where` no longer named the altar you had used
  const hurt = p.hp < p.maxHp * 0.7;
  if (unready || hurt || (res('glass') < 1 && res('bone') >= 4)) {
    const al = altarSeen(g, f);
    const why = unready ? 'an altar tempers, mends and adds hp' : hurt ? 'an altar mends you' : 'an altar grinds 4 bone into 1 glass';
    out.push(al ? toCell(g, al.x, al.y, why, 'offer') : [`${why}; none seen on this floor yet: `, { text: 'listen', cmd: 'listen' }, ' hears them.']);
  }
  // a loose module of a kind you don't wear yet (a pinhole swapped out for the dawn eye is no reason)
  const loose = p.inv.some((i) => i.kind === 'mod' && !p.installed.some((o) => def(o).family === def(i).family));
  // v2r2 fun: at the cap no printer sells slots, so it says nothing
  if (loose && slotsUsed(g) >= p.slots && p.slots < MAX_SLOTS) {
    const pr = g.ents.filter((e) => e.kind === 'printer' && !e.data?.shop).sort((a, b) => dist(a, p) - dist(b, p))[0];
    out.push(pr ? toCell(g, pr.x, pr.y, 'slots are full; a printer sells slots', 'print') : ['slots are full; a printer sells slots.']);
  }
  return out;
}


/** a rare or unique module lying near on this floor, seen, not a mimic: the nearest */
export function rareNear(g: Game): Entity | undefined {
  const p = g.player;
  const f = floorOf(g);
  return g.ents
    .filter((e) => e.kind === 'item' && e.item?.kind === 'mod' && (e.item.rarity === 'rare' || e.item.rarity === 'unique') && !e.data?.mimic && floorAt(e.x) === f && dist(e, p) < 25 && g.seen.has(`${Math.floor(e.x)},${Math.floor(e.y)}`))
    .sort((a, b) => dist(a, p) - dist(b, p))[0];
}

/** v2 floors: the floor's goal, always: the open stairs, the known way down past its keeper, or a rough word */
function wayDown(g: Game): Line {
  const f = floorOf(g);
  const [sx, sy] = stairsAt(g.seed, f);
  if (f === LAST) return bossDown(g) ? ['the heart is still.'] : [`the heart's keeper waits in the arena, north. kill it and the god thaws.`];
  const name = STAIRS[FLOORS[f].stairs!].name;
  if (bossDown(g)) return toCell(g, sx, sy, `${name} is open`, 'descend');
  // v2r1: it stops at the keeper's door and weighs you, instead of walking you in (src/tune/door.ts)
  if (keeperDoor.at(g)) {
    const [head, verdict] = keeperDoor.line(g, f);
    return [...head, ' ', ...verdict];
  }
  const door = keeperDoor.of(g, f);
  if (g.vectors.some((v) => v.what === 'way down') || g.seen.has(`${Math.floor(sx)},${Math.floor(sy)}`))
    return door ? toCell(g, door.x, door.y, `the keeper's door; ${name} lies past it`, 'where') : toCell(g, sx, sy, `the way down, ${name}, past its keeper`, 'help descend');
  const p = g.player;
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(sx - p.x, -(sy - p.y)) * 180) / Math.PI + 360) % 360) / 45) % 8];
  // v2r1 ux: on floor 2 "a memory card points to it" gave no direction and no card: name a card lying on
  // this floor, and give a first leg the rough way
  const card = g.ents.filter((e) => e.kind === 'item' && e.item?.kind === 'card' && floorAt(e.x) === f).sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (card && dist(card, p) < 60) return toCell(g, card.x, card.y, `stairs unseen (${word}, past the keeper); a card that points there lies`);
  return toCell(g, sx, sy, `stairs unseen; roughly here, past the keeper`, 'where');
}

/** r5: a carried reader with no bone looped (read card: wants a bone; where: read card). The ways out,
 * as buttons: swap the reader in by the swap rule, else take out the lightest by hand; and the nearest bone */
export function readFix(g: Game): Line {
  const p = g.player;
  const out: Line = [];
  const room = makeRoom(g, { mod: 'card-reader' }, false);
  const out1 = typeof room === 'string' && slotsUsed(g) >= p.slots ? lightest(g) : undefined;
  if (typeof room !== 'string') out.push({ text: 'swap in card reader', cmd: 'swap in card reader' }, ', then read free. ');
  else if (out1) out.push({ text: `take out ${label(out1)}, install the reader`, cmd: `remove ${label(out1)}; install card reader` }, ', then read free. ');
  const b = g.ents.filter((e) => e.kind === 'item' && e.item?.kind === 'res' && e.item.res === 'bone').sort((a, c) => dist(a, p) - dist(c, p))[0];
  if (b) out.push(...toCell(g, b.x, b.y, out.length ? 'or bone lies' : 'bone lies', 'take'));
  else if (!out.length) out.push('bone: piles, rubble, or recycle a module at a printer.');
  return out;
}

// r5: the refusal says what is missing and the way out, not only why
const read = VERBS.read;
if (read)
  VERBS.read = {
    ...read,
    run(g, args) {
      const n = g.log.length;
      read.run(g, args);
      if (g.log.slice(n).some((l) => l.some((s) => (typeof s === 'string' ? s : s.text).includes('bone to read by')))) say(g, readFix(g));
    },
  };

/** v2r1 ux: the goal, one line, always on screen under the HUD (src/ui/goal.ts): "floor 2: find the way
 *  down (stairs: unknown / NE)". The same facts `where` uses */
export function goalLine(g: Game): string {
  const p = g.player;
  const f = floorOf(g);
  const n = `floor ${f + 1}`;
  if (!p.installed.some((i) => def(i).family === 'gait')) return `${n}: install your kit (drag to the grid, or install all)`;
  if (f === LAST) return bossDown(g) ? 'the heart is still.' : `${n}: the heart. kill its keeper, north`;
  // v2-view: the run wakes blind; the first goal is an eye (the ◆ on the map)
  const held = p.inv.find((i) => i.kind === 'mod' && def(i).family === 'camera');
  if (!f && !p.installed.some((i) => def(i).family === 'camera')) {
    if (held && held.kind === 'mod') return `${n}: install the ${label(held).replace(/^the /, '')}: your first sight`;
    const eye = g.ents.find((e) => e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === 'pinhole-eye' && !e.data?.mimic);
    const sealed = eye?.data?.sealed as [number, number] | undefined;
    if (sealed && Math.abs(Math.floor(p.x) - sealed[0]) + Math.abs(Math.floor(p.y) - sealed[1]) <= 1)
      return `${n}: your first eye is behind this cracked wall: break it`;
    if (eye && !eyeHinted(g)) return `${n}: no eye yet. walk (map click or arrows) to find one`;
    if (eye) {
      const w = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(eye.x - p.x, -(eye.y - p.y)) * 180) / Math.PI + 360) % 360) / 45) % 8].toUpperCase();
      return `${n}: no eye yet: the ◆ on the map, ${cells(Math.round(Math.hypot(eye.x - p.x, eye.y - p.y)))} ${w} (where)`;
    }
  }
  const [sx, sy] = stairsAt(g.seed, f);
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(sx - p.x, -(sy - p.y)) * 180) / Math.PI + 360) % 360) / 45) % 8].toUpperCase();
  const name = STAIRS[FLOORS[f].stairs!].name;
  const far = cells(Math.round(Math.hypot(sx - p.x, sy - p.y)));
  const rare = bossDown(g) ? rareNear(g) : undefined;
  if (rare) {
    const w = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(rare.x - p.x, -(rare.y - p.y)) * 180) / Math.PI + 360) % 360) / 45) % 8].toUpperCase();
    return `${n}: ✦ take the ${itemName(rare.item!).replace(/^the /, '')}, ${cells(Math.round(dist(rare, p)))} ${w}; then ${name}, ${far} ${word}`;
  }
  if (bossDown(g)) return `${n}: ${name} is open, ${far} ${word}: descend`;
  if (keeperDoor.at(g, 2.5)) return `${n}: the keeper's door. ${keeperDoor.ready(g, f) ? (keeperDoor.risky?.(g, f) ? 'risky: likely a retreat or two' : 'you look ready') : 'not ready: where says why'}`;
  if (g.vectors.some((v) => v.what === 'way down') || g.seen.has(`${Math.floor(sx)},${Math.floor(sy)}`)) return `${n}: beat the keeper, then the stairs (${name}, ${far} ${word})`;
  return `${n}: find the stairs (somewhere ${word})`;
}

// ---- v2r4 ux: `descend` and `break` a few cells short walk you there and act, instead of refusing
// ("the rope pit is open, 2 cells E: descend" answered "you are not at the stairs"; `where` said "here: break"
// one cell from the spot `break` wanted)
/** the stairs' cell when they are seen, open and within a few cells, but you are not at them */
function stairsNear(g: Game): [number, number] | null {
  const st = stairsOf(g);
  if (!st || atStairs(g) || !bossDown(g) || !g.seen.has(`${Math.floor(st.x)},${Math.floor(st.y)}`) || dist(st, g.player) > 4) return null;
  return [Math.floor(st.x), Math.floor(st.y)];
}
/** the floor cell to break a found hollow wall from, within a few cells, with a weapon on */
function shellNear(g: Game): [number, number] | null {
  if (!active(g, 'weapon').length || hollowBeside(g)?.found) return null;
  const p = g.player;
  const s = secrets(g)
    .filter((o) => o.kind === 'hollow' && o.found && !o.done)
    .map((o) => [o.x + o.fx, o.y + o.fy] as [number, number])
    .filter(([x, y]) => Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= 4)
    .sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.y) - Math.hypot(b[0] - p.x, b[1] - p.y))[0];
  return s ?? null;
}
for (const [name, spot, what] of [['descend', stairsNear, 'the stairs'], ['break', shellNear, 'the cracked wall']] as const) {
  const d = VERBS[name];
  if (!d) continue;
  const [when, run] = [d.when, d.run];
  d.when = (g) => !when || when(g) || !!spot(g);
  d.run = (g, args) => {
    if (!when || when(g)) return run(g, args);
    const at = spot(g);
    if (at && walkThen(g, at[0], at[1], name)) return say(g, `you walk to ${what}, then ${name}.`);
    say(g, d.whenFail?.(g) ?? `${name}: not here.`);
  };
}
