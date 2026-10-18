// The eye snaps to the threat (playtest r1: 3 of 3 deaths happened off camera). When something hits
// you, or a foe first comes within SNAP cells, your facing turns to it, and holds on it a moment while
// you walk. Never against the player: no snap within MANUAL s of a turn you made yourself (face,
// shoot), and never with the gyro heart (the mouse aims).
import { dist, ENEMIES, hurtHooks, tickHooks } from '../core/game';
import { clear } from '../core/grid';
import { active, param } from '../core/mods';
import { VERBS } from '../core/verbs';
import type { Entity, Game } from '../core/types';

/** a foe this close turns the eye to it, once per foe */
export const SNAP = 3;
/** seconds after your own turn that the eye leaves you be */
export const MANUAL = 1.5;
/** seconds the eye holds on the threat while you keep walking */
export const HOLD = 1.2;
/** a foe this far off your facing already shows: no need to turn */
const CONE = (25 * Math.PI) / 180;

interface Eye { manual: number; hitBy: number; hitAt: number; seenHit: number; hold: number; on: number }
const eyes = new WeakMap<Game, Eye>();
const eye = (g: Game): Eye => {
  let e = eyes.get(g);
  if (!e) eyes.set(g, (e = { manual: -99, hitBy: 0, hitAt: -99, seenHit: -99, hold: -99, on: 0 }));
  return e;
};

/** you turned yourself: the eye leaves you be for a moment */
export const turned = (g: Game): void => void (eye(g).manual = g.t);

/** the angle that faces `e` from where you stand (0 = north, clockwise) */
export const toward = (g: Game, e: { x: number; y: number }): number => Math.atan2(e.x - g.player.x, -(e.y - g.player.y));
/** how far `e` is off your facing, 0..pi */
export const offFacing = (g: Game, e: { x: number; y: number }): number => {
  const a = toward(g, e) - g.player.dir;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
};

const gyro = (g: Game) => active(g, 'gait').some((i) => param(i, 'free', false));

function snap(g: Game, e: Entity): void {
  const s = eye(g);
  s.hold = g.t + HOLD;
  s.on = e.id;
  if (offFacing(g, e) < CONE) return;
  g.player.dir = toward(g, e);
  g.events.push({ type: 'snap', data: e.id });
}

// the face verb is a turn you made: note it
const face = VERBS.face;
if (face) {
  const run = face.run;
  face.run = (g, args) => {
    turned(g);
    run(g, args);
  };
}

// who hit you last (any hit that got through)
hurtHooks.push((g, n, from) => {
  if (n > 0 && from?.enemy) Object.assign(eye(g), { hitBy: from.id, hitAt: g.t });
  return n;
});

tickHooks.push((g) => {
  const p = g.player;
  if (g.ended || gyro(g)) return;
  const s = eye(g);
  const free = g.t - s.manual >= MANUAL;
  // while you walk, the gait turns you with each step: keep the eye on the threat a moment longer
  if (free && g.t < s.hold && p.path.length) {
    const e = g.ents.find((x) => x.id === s.on && x.enemy);
    if (e) p.dir = toward(g, e);
  }
  // struck: turn to what struck you (a hit taken while you turned yourself is let go)
  if (s.hitAt > s.seenHit && (!free || g.t - s.hitAt > 0.5)) s.seenHit = s.hitAt;
  if (!free) return;
  if (s.hitAt > s.seenHit) {
    s.seenHit = s.hitAt;
    const e = g.ents.find((x) => x.id === s.hitBy && x.enemy);
    if (e) return snap(g, e);
  }
  // a foe coming close for the first time
  const close = g.ents
    .filter((e) => e.enemy && !e.enemy.data.eyed && e.enemy.data.noticed && !ENEMIES[e.enemy.type]?.hidden && dist(e, p) <= SNAP && clear(g, p.x, p.y, e.x, e.y))
    .sort((a, b) => dist(a, p) - dist(b, p));
  for (const e of close) e.enemy!.data.eyed = true;
  if (close.length) snap(g, close[0]);
});
