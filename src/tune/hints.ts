// Play-through tuning (#1328): what a blind new player is told, once, so the first minutes read from
// the console alone. When the legs first work, the console says where the spark and the card reader
// are, in compass words and cells, with a button that walks that way.
// Playtest r1: those buttons, listen's and a `go` into a wall all follow the pilot's pathfinder over
// open floor, so a button walks the first straight leg of a real way there, never into a wall.

import { active, param } from '../core/mods';
import { say, tickHooks } from '../core/game';
import { DIRS, open } from '../core/grid';
import { VERBS, verb, way } from '../core/verbs';
import { route } from '../mods/pilot';
import type { Game, Line } from '../core/types';

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
  if (!e || g.player.inv.some((i) => i.kind === 'mod' && i.mod === mod)) return null;
  const [dx, dy] = [e.x - p.x, e.y - p.y];
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 45) % 8];
  const [ax, n] = way.leg(g, e.x, e.y);
  const cmd = active(g, 'gait').some((i) => param(i, 'go', false)) ? `go ${ax} ${n}` : `crawl ${ax}`;
  return [`${sound}, ${Math.round(Math.hypot(dx, dy))} cells ${word}.  `, { text: cmd, cmd }];
}

/** what the wake hint points at (the map marks them too, while they lie there) */
export const HINTED = ['dawn-eye', 'card-reader'];

/** the wake hint's lines: the dawn eye and the card reader (named as the map names them), while they lie out there */
const hintLines = (g: Game) =>
  [toward(g, 'dawn-eye', 'the dawn eye glints, waiting for a socket'), toward(g, 'card-reader', 'a card reader ticks, waiting for a card')].filter((l): l is Line => !!l);

tickHooks.push((g) => {
  if (told.has(g) || !active(g, 'gait').some((i) => param(i, 'go', false))) return;
  told.add(g);
  const lines = hintLines(g);
  if (lines.length) say(g, 'you hear:', ...lines, ['the walls bend; ', { text: 'listen', cmd: 'listen' }, ' finds the way; the map marks them; ', { text: 'where', cmd: 'where' }, ' says it again.']);
});

// playtest r2: the hint was said once and could not be asked again
verb('where', {
  help: 'where the dawn eye and the card reader lie, with a fresh first leg there, until you hold them',
  run(g) {
    const lines = hintLines(g);
    if (!lines.length) return say(g, g.vectors.length ? ['nothing left the wake hint points at. the scripture points on: ', { text: 'vectors', cmd: 'vectors' }] : 'nothing left the wake hint points at.');
    say(g, 'you hear:', ...lines);
  },
});
