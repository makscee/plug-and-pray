// Aimed weapons: `shoot` fires every warm aimed weapon down your facing (the gyro heart turns
// `player.dir` to the mouse). Their windows carry a shoot button.
import { say } from '../core/game';
import { active, def, families, param } from '../core/mods';
import { verb } from '../core/verbs';
import type { Game, Inst } from '../core/types';
import { fire } from './shots';

const aimed = (g: Game): Inst[] => active(g, 'weapon').filter((i) => param<string>(i, 'aim', 'auto') === 'aimed');

const weapon = families.weapon!;
const autoButtons = weapon.buttons;
weapon.buttons = (g, inst) => (param<string>(inst, 'aim', 'auto') === 'aimed' ? [{ label: 'shoot', cmd: 'shoot' }] : autoButtons?.(g, inst) ?? []);

/** speed of your shots, cells per second */
export const SHOT_SPEED = 12;

verb('shoot', {
  help: 'fire your aimed weapons where you face',
  when: (g) => aimed(g).length > 0,
  run(g) {
    const p = g.player;
    const ready = aimed(g).filter((i) => g.t >= ((i.data.readyAt as number) ?? 0));
    if (!ready.length) return say(g, `${def(aimed(g)[0]).name}: still cooling.`);
    const fx = Math.sin(p.dir);
    const fy = -Math.cos(p.dir);
    for (const i of ready) {
      i.data.readyAt = g.t + param<number>(i, 'cooldown', 1);
      fire(g, { x: p.x + fx * 0.3, y: p.y + fy * 0.3, vx: fx * SHOT_SPEED, vy: fy * SHOT_SPEED, dmg: param<number>(i, 'damage', 1), range: param<number>(i, 'range', 6), src: null, foe: false });
      g.events.push({ type: 'shoot', data: i.uid });
    }
  },
});
