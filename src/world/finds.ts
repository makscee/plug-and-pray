// Secrets on the map and in `vectors` (playtest r2: "the bearing isn't in vectors or on the map"). When a layer
// eye first warms up and names the nearest secret of its kind, that becomes a vector; when an eye finds handprints,
// a bearing to the plate they crawl to. The map spool draws what is known: a hollow wall as a ringing shell, a
// scratched wall as a tablet, the warm plate as a ring, and a dotted trail of prints.

import { CHUNK } from '../core/grid';
import { dist, say, tickHooks } from '../core/game';
import { active, param } from '../core/mods';
import type { Game } from '../core/types';
import { mapHooks } from './mind';
import { secrets, type Kind, type Secret } from './secrets';
import { bearing } from './vectors';

const KINDS: Record<string, Kind> = { heat: 'hands', sonar: 'hollow', '1bit': 'script', edge: 'script' };
const WHAT: Record<Kind, string> = { hollow: 'hollow wall', script: 'scratched wall', hands: 'warm prints' };

/** per game: secrets named by a teach line, filters already handled, found prints already told */
const named = new WeakMap<Game, Set<Secret>>();
const handled = new WeakMap<Game, Set<string>>();
const trailed = new WeakMap<Game, Set<Secret>>();
const get = <T>(m: WeakMap<Game, Set<T>>, g: Game): Set<T> => {
  let s = m.get(g);
  if (!s) m.set(g, (s = new Set()));
  return s;
};

/** the floor cell in front of a wall secret (or the prints' first cell), as a cell centre: where its vector ends */
const stand = (s: Secret): [number, number] => (s.kind === 'hands' ? [s.trail[0][0] + 0.5, s.trail[0][1] + 0.5] : [s.x + 0.5 + s.fx, s.y + 0.5 + s.fy]);
const key = (s: Secret) => `eye:${s.x},${s.y}`;

function point(g: Game, s: Secret, what: string, x: number, y: number): void {
  if (g.vectors.some((v) => v.card === key(s))) return;
  g.vectors.push({ card: key(s), x, y, what, found: false });
}

tickHooks.push((g) => {
  const p = g.player;
  const list = secrets(g);
  const done = get(handled, g);
  // a layer eye's first warm-up names the nearest secret of its kind (secrets.ts says it): mark it
  for (const i of active(g, 'camera')) {
    const f = param<string>(i, 'filter', '');
    if (!KINDS[f] || done.has(f) || g.t < i.readyAt) continue;
    done.add(f);
    const near = list
      .filter((s) => s.kind === KINDS[f] && !s.done)
      .sort((a, b) => dist({ x: a.x + 0.5, y: a.y + 0.5 }, p) - dist({ x: b.x + 0.5, y: b.y + 0.5 }, p))[0];
    if (!near || dist({ x: near.x, y: near.y }, p) >= CHUNK * 2.5) continue;
    get(named, g).add(near);
    // a vector only for one out of reach: one at your elbow would end as soon as it began
    const [vx, vy] = stand(near);
    if (Math.hypot(vx - p.x, vy - p.y) > 3) point(g, near, WHAT[near.kind], vx, vy);
    say(g, ['  marked on your map: ', { text: WHAT[near.kind], cmd: 'vectors' }, '.']);
  }
  const told = get(trailed, g);
  for (const s of list) {
    // found prints: which way they crawl, and a vector to the plate
    if (s.kind === 'hands' && s.found && !s.done && !told.has(s)) {
      told.add(s);
      const [ax, ay] = s.trail[0];
      const deg = ((Math.atan2(s.x - ax, -(s.y - ay)) * 180) / Math.PI + 360) % 360;
      const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round(deg / 45) % 8];
      point(g, s, 'warm plate', s.x + 0.5, s.y + 0.5);
      say(g, [`  the prints crawl ${word}, toward a warm plate: ${bearing(g, s.x + 0.5, s.y + 0.5)}. `, { text: 'vectors', cmd: 'vectors' }]);
    }
  }
  // a secret paid out: its vector is spent
  for (const v of g.vectors) {
    if (v.found || !v.card.startsWith('eye:')) continue;
    const s = list.find((s) => key(s) === v.card);
    if (s?.done) v.found = true;
  }
});

/** whether the map shows this secret: an eye found it, or a teach line or scripture named it */
const known = (g: Game, s: Secret) => s.found || get(named, g).has(s) || g.vectors.some((v) => Math.floor(v.x - s.fx) === s.x && Math.floor(v.y - s.fy) === s.y);

const INK = '#f0a050';
const DARK = '#000';
mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const span = ctx.canvas.width / px;
  const r = Math.max(5.5, px);
  for (const s of secrets(g)) {
    if (s.x < ox - 2 || s.y < oy - 2 || s.x > ox + span + 2 || s.y > oy + span + 2) continue;
    if (!known(g, s)) continue;
    const [cx, cy] = [(s.x - ox + 0.5) * px, (s.y - oy + 0.5) * px];
    if (s.kind === 'hollow' && !s.done) {
      // a shell: a dark box with bars across it, like the sonar shows it ring
      ctx.fillStyle = DARK;
      ctx.fillRect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, px / 6);
      ctx.strokeRect(cx - r + 0.5, cy - r + 0.5, 2 * r - 1, 2 * r - 1);
      ctx.fillStyle = INK;
      for (let k = 0; k < 3; k++) ctx.fillRect(cx - r + 2, cy - r + 2 + ((2 * r - 4) * k) / 2.5, 2 * r - 4, Math.max(1, r / 4));
    } else if (s.kind === 'script') {
      // a tablet: pale, with three lines of writing; dim once read
      ctx.fillStyle = DARK;
      ctx.fillRect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);
      ctx.fillStyle = s.done ? '#a08a6a' : '#f0e4c8';
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      ctx.fillStyle = DARK;
      for (let k = 0; k < 3; k++) ctx.fillRect(cx - r + 2, cy - r + 2 + ((2 * r - 4) * k) / 2.5, (2 * r - 4) * (k === 2 ? 0.6 : 1), Math.max(1, r / 5));
    } else if (s.kind === 'hands' && !s.done) {
      // the prints: a dotted trail to a ring on the plate
      ctx.fillStyle = INK;
      for (const [x, y] of s.trail) {
        ctx.beginPath();
        ctx.arc((x - ox + 0.5) * px, (y - oy + 0.5) * px, Math.max(1.5, px / 6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      for (const k of [0.8, 0.35]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
});

/** test runs: the secrets, so a play-through can walk to one and face it */
(globalThis as unknown as { thawSecrets?: (g: Game) => Secret[] }).thawSecrets = secrets;
