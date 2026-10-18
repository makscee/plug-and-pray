// Play-through tuning (#1328): what a blind new player is told, once, so the first minutes read from
// the console alone. When the legs first work, the console says where the spark and the card reader
// are, in compass words and cells, with a button that walks that way.
// Playtest r1: those buttons, listen's and a `go` into a wall all follow the pilot's pathfinder over
// open floor, so a button walks the first straight leg of a real way there, never into a wall.

import { active, def, param } from '../core/mods';
import { dist, say, tickHooks } from '../core/game';
import { nearestOpen } from '../world/vectors';
import { DIRS, open } from '../core/grid';
import { VERBS, verb, way } from '../core/verbs';
import { route } from '../mods/pilot';
import type { Entity, Game, Line } from '../core/types';

const told = new WeakSet<Game>();
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
  const e = g.ents.find((e) => e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === mod && !e.data?.mimic);
  // playtest r3: one you wear counts too (it pointed at a second dawn eye)
  if (!e || [...p.inv, ...p.installed].some((i) => 'mod' in i && i.mod === mod)) return null;
  return toCell(g, e.x, e.y, sound);
}

/** "<sound>, 21 cells se. first: [go s 5]": the leg is the start of a real way there (playtest r3: the
 * straight word and the leg read as a disagreement, and an axis leg walked into a dead end) */
function toCell(g: Game, x: number, y: number, sound: string): Line {
  const p = g.player;
  const [dx, dy] = [x - p.x, y - p.y];
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 45) % 8];
  const [ax, n] = way.long(g, x, y);
  const cmd = active(g, 'gait').some((i) => param(i, 'go', false)) ? `go ${ax} ${n}` : `crawl ${ax}`;
  return [`${sound}, ${Math.round(Math.hypot(dx, dy))} cells ${word}. first: `, { text: cmd, cmd }];
}

/** what the wake hint points at (the map marks them too, while they lie there) */
export const HINTED = ['dawn-eye', 'card-reader'];

/** the reliquary by the start, until you have stood at it (playtest r3: its layer eye is the best early
 * hook, and three hint-following runs never found it) */
export const cradleShop = (g: Game): Entity | undefined =>
  g.ents.filter((e) => e.kind === 'printer' && e.data?.shop && ((e.data?.far as number) ?? 0) < 1.5 && !e.data?.greeted && dist(e, g.player) < 40).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];

/** the wake hint's lines: the dawn eye, the card reader (named as the map names them) and the cradle's reliquary, while they lie out there */
const hintLines = (g: Game) => {
  const shop = cradleShop(g);
  return [
    toward(g, 'dawn-eye', 'the dawn eye glints, waiting for a socket'),
    toward(g, 'card-reader', 'a card reader ticks, waiting for a card'),
    shop ? toCell(g, shop.x, shop.y, 'glass doors chime: a reliquary keeps an eye for hidden things') : null,
  ].filter((l): l is Line => !!l);
};

// playtest r3: the take line named `read card` as plain text in a burst; a skimmer never read the card
const take = VERBS.take;
if (take)
  VERBS.take = {
    ...take,
    run(g, args) {
      const had = g.player.inv.filter((i) => i.kind === 'card' || (i.kind === 'mod' && i.mod === 'card-reader')).length;
      take.run(g, args);
      const now = g.player.inv.filter((i) => i.kind === 'card' || (i.kind === 'mod' && i.mod === 'card-reader')).length;
      const read = VERBS.read;
      if (now > had && g.player.inv.some((i) => i.kind === 'card') && read && (!read.when || read.when(g)))
        say(g, ['a card to read, it points somewhere: ', { text: '[read card]', cmd: 'read card' }]);
    },
  };

tickHooks.push((g) => {
  if (told.has(g) || !active(g, 'gait').some((i) => param(i, 'go', false))) return;
  told.add(g);
  const lines = hintLines(g);
  if (lines.length) say(g, 'you hear:', ...lines, ['the walls bend; ', { text: 'listen', cmd: 'listen' }, ' finds the way; the map marks them; ', { text: 'where', cmd: 'where' }, ' says it again.']);
});

// playtest r2: the hint was said once and could not be asked again
verb('where', {
  help: 'what to head for next: the dawn eye, the card reader, a card to read, the nearest vector',
  run(g) {
    const lines = hintLines(g);
    if (lines.length) say(g, 'you hear:', ...lines);
    // playtest r3: past the dawn eye it went silent, with a card that points at the shard in the bag
    const more = after(g);
    if (more.length) return say(g, ...more);
    if (!lines.length) say(g, 'nothing left the wake hint points at.');
  },
});

/** past the wake hint: a card to read, the nearest vector, a printer when slots are full */
function after(g: Game): Line[] {
  const p = g.player;
  const out: Line[] = [];
  if (p.inv.some((i) => i.kind === 'card'))
    out.push(
      VERBS.read && (!VERBS.read.when || VERBS.read.when(g))
        ? ['a memory card waits to be read: ', { text: 'read card', cmd: 'read card' }]
        : p.installed.some((i) => i.mod === 'card-reader' && !i.on)
          ? ['a memory card waits; your card reader is off: ', { text: 'on card reader', cmd: 'on card reader' }]
          : ['a memory card waits for a card reader.'],
    );
  const v = nearestOpen(g);
  if (v) out.push(toCell(g, v.x, v.y, `the ${v.what}`));
  // a loose module of a kind you don't wear yet (a pinhole swapped out for the dawn eye is no reason)
  const loose = p.inv.some((i) => i.kind === 'mod' && !p.installed.some((o) => def(o).family === def(i).family));
  if (loose && p.installed.length >= p.slots) {
    const pr = g.ents.filter((e) => e.kind === 'printer' && !e.data?.shop).sort((a, b) => dist(a, p) - dist(b, p))[0];
    out.push(pr ? toCell(g, pr.x, pr.y, 'slots are full; a printer sells slots') : ['slots are full; a printer sells slots.']);
  }
  return out;
}

