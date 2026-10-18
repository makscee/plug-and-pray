// Aimed weapons: `shoot` fires one shot per aimed module down your facing; copies of a module
// shorten its cooldown instead of adding burst.
// It first turns you to the nearest foe you perceive within reach (v2r2 fight: a foe 16° off at 3 cells
// counted as in front, and every shot passed it by). The gyro heart turns `player.dir`
// to the mouse. Their windows carry a shoot button.
import { dist, say } from '../core/game';
import { clear } from '../core/grid';
import { active, def, families, param } from '../core/mods';
import { verb } from '../core/verbs';
import type { Entity, Game, Inst } from '../core/types';
import { fire } from './shots';
import { COPY, haste } from '../mods/weapon';
import { canHit } from '../mods/sense';
import { offFacing, toward, turned } from './eye';

export const aimed = (g: Game): Inst[] => active(g, 'weapon').filter((i) => param<string>(i, 'aim', 'auto') === 'aimed');

const weapon = families.weapon!;
const autoButtons = weapon.buttons;
weapon.buttons = (g, inst) => (param<string>(inst, 'aim', 'auto') === 'aimed' ? [{ label: 'shoot', cmd: 'shoot' }] : autoButtons?.(g, inst) ?? []);

/** speed of your shots, cells per second */
export const SHOT_SPEED = 12;
/** foes you could shoot at from here: perceived (or in touch), in a clear line, within `range` */
export function targets(g: Game, range: number): Entity[] {
  const p = g.player;
  return g.ents
    .filter((e) => e.enemy && dist(e, p) <= range && canHit(g, e) && clear(g, p.x, p.y, e.x, e.y))
    .sort((a, b) => dist(a, p) - dist(b, p));
}

/** turn to the nearest foe in reach, always (a sidestepper is shot where it stands now); true if you turned */
export function aimAt(g: Game, range: number): boolean {
  const near = targets(g, range);
  if (!near.length) return false;
  const was = offFacing(g, near[0]);
  g.player.dir = toward(g, near[0]);
  if (was < 0.01) return false;
  turned(g);
  return true;
}

/** each extra copy of one aimed module cuts its cooldown by this much (stacked); auto weapons too (src/mods/weapon.ts) */
export { COPY };

/** what the next `shoot` fires: one shot per distinct aimed module whose copies are warm. Copies of
 *  one module never stack burst (playtest r1/r2: nail psalm stacks won most runs); each extra copy
 *  shortens that module's cooldown by COPY instead. */
export function volley(g: Game): Inst[] {
  const out: Inst[] = [];
  for (const mod of new Set(aimed(g).map((i) => i.mod))) {
    const lead = aimed(g).find((i) => i.mod === mod && g.t >= ((i.data.readyAt as number) ?? 0));
    if (lead) out.push(lead);
  }
  return out;
}

/** the cooldown of a shot from `i`, with its copies counted */
export function shotCooldown(g: Game, i: Inst): number {
  const copies = aimed(g).filter((x) => x.mod === i.mod).length;
  return (param<number>(i, 'cooldown', 1) * Math.pow(1 - COPY, copies - 1)) / haste(g);
}

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
      // the copies cool together: one shot per module
      const until = g.t + shotCooldown(g, i);
      for (const c of aimed(g).filter((x) => x.mod === i.mod)) c.data.readyAt = until;
      fire(g, { x: p.x + fx * 0.3, y: p.y + fy * 0.3, vx: fx * SHOT_SPEED, vy: fy * SHOT_SPEED, dmg: param<number>(i, 'damage', 1), range: param<number>(i, 'range', 6), src: null, foe: false });
      g.events.push({ type: 'shoot', data: i.uid });
    }
  },
});
