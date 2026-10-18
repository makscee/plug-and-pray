// Gait: how you move. The stepper relay types moves (`go n 3`, `face e`). The body slice adds
// the servo gait (arrow keys, cell to cell), the gyro heart (free WASD and mouse aim) and dig.

import { active, family, param } from '../core/mods';
import { DIRS, dirAngle, open } from '../core/grid';
import { say, tickHooks } from '../core/game';
import { verb } from '../core/verbs';
import type { Game } from '../core/types';

family('gait', {
  buttons: (g, inst) => [
    ...(param<boolean>(inst, 'go', false) ? ['n', 'e', 's', 'w'].map((d) => ({ label: d, cmd: `go ${d}` })) : []),
    // body slice: the servo gait's steps (arrow keys do the same), the tunnel tongue's dig
    ...(param<boolean>(inst, 'keys', false) ? ['n', 'e', 's', 'w'].map((d) => ({ label: d, cmd: `step ${d}` })) : []),
    ...(param<boolean>(inst, 'dig', false) ? [{ label: 'dig', cmd: 'dig' }] : []),
  ],
});

const can = (key: string) => (g: Game) => active(g, 'gait').some((i) => param(i, key, false));
/** v2r2 fun: legs that walk a path, `go` and map clicks: the stepper, and the gyro heart too (it only took WASD) */
// v2r3 fun: the servo gait and its uniques (the penitent's heels) walk paths too, at their own pace (`go`,
// map clicks and `where` said "nothing installed can do that", or crawled one cell)
export const walks = (g: Game): boolean => active(g, 'gait').some((i) => param(i, 'go', false) || param(i, 'free', false) || param(i, 'keys', false));
/** the pace of a walked path: the stepper's, else the servo's or the gyro heart's own speed */
export const walkPace = (g: Game): number => {
  // (the faster of the stepper and a servo: the heels walk 4 cells/s beside the stepper's 2.5)
  const servo = active(g, 'gait').filter((i) => param(i, 'keys', false)).map((i) => param<number>(i, 'pace', 4));
  if (servo.length) return Math.max(can('go')(g) ? 2.5 : 0, ...servo);
  if (can('go')(g)) return 2.5;
  const gyro = active(g, 'gait').find((i) => param(i, 'free', false));
  return gyro ? param<number>(gyro, 'speed', 2.5) : 0.5;
};
/** the keeper's door (src/tune/door.ts): standing at it, and `go in` */
export const doorIn: { at: (g: Game) => boolean; run: (g: Game) => void } = { at: () => false, run: (g) => void say(g, 'go in where? there is no door here.') };

/** queue up to k cells in direction d, stopping before a wall */
export function walk(g: Game, d: string, k: number): number {
  const v = DIRS[d];
  if (!v) return 0;
  const p = g.player;
  const last = p.path.length ? p.path[p.path.length - 1] : [Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5];
  let [x, y] = last;
  let n = 0;
  for (; n < k; n++) {
    if (!open(g, x + v[0], y + v[1])) break;
    x += v[0];
    y += v[1];
    p.path.push([x, y]);
  }
  if (!n) p.dir = dirAngle(v[0], v[1]);
  return n;
}

verb('go', {
  help: 'walk: go n 3 (n e s w, up to 9 cells); at a keeper\'s door, go in',
  when: (g) => walks(g) || doorIn.at(g),
  run(g, [d, k]) {
    if (d === 'in') return doorIn.run(g);
    if (!d || !DIRS[d[0]]) return say(g, 'go where? n e s w');
    g.player.pace = walkPace(g);
    const n = walk(g, d[0], Math.min(9, Math.max(1, Number(k) || 1)));
    if (!n) say(g, 'a wall.');
    else ending.set(g, d[0]);
  },
});

// playtest r3: every `go` ended facing the wall at its end, and every wall looks alike: the eye read as
// frozen. On arrival, facing a wall, you turn to the longest open run (straight back only when it is
// more than twice as long as any side way)
const ending = new WeakMap<Game, string>();
tickHooks.push((g) => {
  const d = ending.get(g);
  const p = g.player;
  if (!d || p.path.length) return;
  ending.delete(g);
  const [x, y] = [Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5];
  if (open(g, x + DIRS[d][0], y + DIRS[d][1])) return;
  const back = { n: 's', s: 'n', e: 'w', w: 'e' }[d];
  let best: [string, number] | null = null;
  for (const r of ['n', 'e', 's', 'w']) {
    let n = 0;
    while (n < 9 && open(g, x + DIRS[r][0] * (n + 1), y + DIRS[r][1] * (n + 1))) n++;
    const score = r === back ? n / 2 : n;
    if (n && (!best || score > best[1])) best = [r, score];
  }
  if (best) p.dir = dirAngle(DIRS[best[0]][0], DIRS[best[0]][1]);
});

verb('crawl', {
  help: 'drag yourself one cell: crawl n (slow, needs nothing)',
  run(g, [d]) {
    if (!d || !DIRS[d[0]]) return say(g, 'crawl where? n e s w');
    if (g.player.path.length) return say(g, 'you are still moving.');
    g.player.pace = 0.5;
    if (!walk(g, d[0], 1)) say(g, 'a wall.');
  },
});

/** the four between-words for `face`: diagonal foes can be aimed at (playtest r1) */
const DIAG: Record<string, [number, number]> = { ne: [1, -1], se: [1, 1], sw: [-1, 1], nw: [-1, -1] };

verb('face', {
  help: 'turn: face n (n ne e se s sw w nw)',
  when: walks,
  run(g, [d]) {
    const v = d && (DIAG[d] ?? DIRS[d[0]]);
    if (!v) return say(g, 'face where? n ne e se s sw w nw');
    g.player.dir = dirAngle(v[0], v[1]);
  },
});

verb('stop', {
  help: 'stop walking',
  when: walks,
  run(g) {
    g.player.path = g.player.path.slice(0, 1);
  },
});
