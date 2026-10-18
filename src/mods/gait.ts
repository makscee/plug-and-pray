// Gait: how you move. The stepper relay types moves (`go n 3`, `face e`). The body slice adds
// the servo gait (arrow keys, cell to cell), the gyro heart (free WASD and mouse aim) and dig.

import { active, family, param } from '../core/mods';
import { DIRS, dirAngle, open } from '../core/grid';
import { say } from '../core/game';
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
  help: 'walk: go n 3 (n e s w, up to 9 cells)',
  when: can('go'),
  run(g, [d, k]) {
    if (!d || !DIRS[d[0]]) return say(g, 'go where? n e s w');
    g.player.pace = 2.5;
    const n = walk(g, d[0], Math.min(9, Math.max(1, Number(k) || 1)));
    if (!n) say(g, 'a wall.');
  },
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
  when: can('go'),
  run(g, [d]) {
    const v = d && (DIAG[d] ?? DIRS[d[0]]);
    if (!v) return say(g, 'face where? n ne e se s sw w nw');
    g.player.dir = dirAngle(v[0], v[1]);
  },
});

verb('stop', {
  help: 'stop walking',
  when: can('go'),
  run(g) {
    g.player.path = g.player.path.slice(0, 1);
  },
});
