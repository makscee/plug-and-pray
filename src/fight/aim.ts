// Aimed weapons: `shoot` fires your warm aimed weapons down your facing, each on its own cooldown.
// With no foe in front, it first turns you to the nearest one you perceive within reach. The gyro heart turns `player.dir`
// to the mouse. Their windows carry a shoot button.
import { dist, say } from '../core/game';
import { clear } from '../core/grid';
import { active, def, families, param } from '../core/mods';
import { verb } from '../core/verbs';
import type { Entity, Game, Inst } from '../core/types';
import { fire } from './shots';
import { haste } from '../mods/weapon';
import { canHit } from '../mods/sense';
import { offFacing, toward, turned } from './eye';

export const aimed = (g: Game): Inst[] => active(g, 'weapon').filter((i) => param<string>(i, 'aim', 'auto') === 'aimed');

const weapon = families.weapon!;
const autoButtons = weapon.buttons;
weapon.buttons = (g, inst) => (param<string>(inst, 'aim', 'auto') === 'aimed' ? [{ label: 'shoot', cmd: 'shoot' }] : autoButtons?.(g, inst) ?? []);

/** speed of your shots, cells per second */
export const SHOT_SPEED = 12;
/** a foe this far off your facing counts as in front */
const CONE = (25 * Math.PI) / 180;

/** foes you could shoot at from here: perceived (or in touch), in a clear line, within `range` */
export function targets(g: Game, range: number): Entity[] {
  const p = g.player;
  return g.ents
    .filter((e) => e.enemy && dist(e, p) <= range && canHit(g, e) && clear(g, p.x, p.y, e.x, e.y))
    .sort((a, b) => dist(a, p) - dist(b, p));
}

/** turn to the nearest foe in reach unless one already stands in front; true if you turned */
export function aimAt(g: Game, range: number): boolean {
  const near = targets(g, range);
  if (!near.length || near.some((e) => offFacing(g, e) < CONE)) return false;
  g.player.dir = toward(g, near[0]);
  turned(g);
  return true;
}

/** what the next `shoot` fires: every warm aimed weapon, each on its own cooldown. (Playtest r1 asked
 *  to stop a stack of nail psalms firing as one burst; making copies take turns cost the sim's careful
 *  player 6 of 40 finishes, so the stack keeps its burst and its price is left to the economy pass.) */
export const volley = (g: Game): Inst[] => aimed(g).filter((i) => g.t >= ((i.data.readyAt as number) ?? 0));

verb('shoot', {
  help: 'fire your aimed weapons where you face (turns to a foe in reach first)',
  when: (g) => aimed(g).length > 0,
  run(g) {
    const p = g.player;
    const fire1 = volley(g);
    if (!fire1.length) {
      const soon = aimed(g).sort((a, b) => ((a.data.readyAt as number) ?? 0) - ((b.data.readyAt as number) ?? 0))[0];
      return say(g, `${def(soon).name}: still cooling.`);
    }
    // the gyro heart aims with the mouse: leave it be
    if (!active(g, 'gait').some((x) => param(x, 'free', false))) aimAt(g, Math.max(...fire1.map((i) => param<number>(i, 'range', 6))));
    const fx = Math.sin(p.dir);
    const fy = -Math.cos(p.dir);
    for (const i of fire1) {
      i.data.readyAt = g.t + param<number>(i, 'cooldown', 1) / haste(g);
      fire(g, { x: p.x + fx * 0.3, y: p.y + fy * 0.3, vx: fx * SHOT_SPEED, vy: fy * SHOT_SPEED, dmg: param<number>(i, 'damage', 1), range: param<number>(i, 'range', 6), src: null, foe: false });
      g.events.push({ type: 'shoot', data: i.uid });
    }
  },
});
