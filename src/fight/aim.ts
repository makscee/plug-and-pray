// Aimed weapons: `shoot` fires one shot per aimed module down your facing; copies of a module
// shorten its cooldown instead of adding burst.
// It first turns you to the nearest foe you perceive within reach (v2r2 fight: a foe 16° off at 3 cells
// counted as in front, and every shot passed it by). The gyro heart turns `player.dir`
// to the mouse. Their windows carry a shoot button.
import { dist, ENEMIES, REACH, say, tickHooks } from '../core/game';
import { active, def, families, param } from '../core/mods';
import { verb } from '../core/verbs';
import type { Entity, Game, Inst, Line } from '../core/types';
import { bolted, clearShot, compass, fire } from './shots';
import { COPY, haste } from '../mods/weapon';
import { canHit, perceives } from '../mods/sense';
import { offFacing, toward, turned } from './eye';

export const aimed = (g: Game): Inst[] => active(g, 'weapon').filter((i) => param<string>(i, 'aim', 'auto') === 'aimed');

const weapon = families.weapon!;
const autoButtons = weapon.buttons;
weapon.buttons = (g, inst) => (param<string>(inst, 'aim', 'auto') === 'aimed' ? [{ label: 'shoot', cmd: 'shoot' }] : autoButtons?.(g, inst) ?? []);

/** speed of your shots, cells per second */
export const SHOT_SPEED = 12;
/** foes you could shoot at from here: perceived (or in touch), in a clear line (low pillars do not block it),
 *  within `range` */
export function targets(g: Game, range: number): Entity[] {
  const p = g.player;
  return g.ents
    // (on floors 1-2 a keeper that woke stays a target behind a low pillar: you know where it stands)
    .filter((e) => e.enemy && dist(e, p) <= range && (canHit(g, e) || (!!e.enemy.data.boss && !!e.enemy.data.noticed && (g.floor ?? 0) <= 1)) && clearShot(g, p.x, p.y, e.x, e.y))
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

/** v2-balance3 (v2r3 fight: `shoot` spam filled the console): a repeat of the last "still cooling" counts up in place */
function cooling(g: Game, msg: string): void {
  const log = g.log;
  const txt = (l?: Line) => (l ?? []).map((s) => (typeof s === 'string' ? s : s.text)).join('');
  const echo = txt(log[log.length - 1]).startsWith('> ');
  const at = log.length - (echo ? 2 : 1);
  const was = txt(log[at]);
  if (!was.startsWith(msg) || (echo && txt(log[at - 1]) !== txt(log[log.length - 1]))) return say(g, msg);
  if (echo) log.pop();
  log[at] = [`${msg} ×${Number(/×(\d+)$/.exec(was)?.[1] ?? 1) + 1}`];
}

verb('shoot', {
  help: 'fire your aimed weapons where you face (turns to a foe in reach first)',
  when: (g) => aimed(g).length > 0,
  run(g) {
    const p = g.player;
    const fire1 = volley(g);
    if (!fire1.length) {
      const soon = aimed(g).sort((a, b) => ((a.data.readyAt as number) ?? 0) - ((b.data.readyAt as number) ?? 0))[0];
      return cooling(g, `${def(soon).name}: still cooling.`);
    }
    // the gyro heart aims with the mouse: leave it be
    const range = Math.max(...fire1.map((i) => param<number>(i, 'range', 6)));
    if (!active(g, 'gait').some((x) => param(x, 'free', false))) aimAt(g, range);
    if (!targets(g, range).length) whyNot(g, range);
    const fx = Math.sin(p.dir);
    const fy = -Math.cos(p.dir);
    for (const i of fire1) {
      // the copies cool together: one shot per module
      const until = g.t + shotCooldown(g, i);
      for (const c of aimed(g).filter((x) => x.mod === i.mod)) c.data.readyAt = until;
      fire(g, { x: p.x + fx * 0.3, y: p.y + fy * 0.3, vx: fx * SHOT_SPEED, vy: fy * SHOT_SPEED, dmg: param<number>(i, 'damage', 1), range: param<number>(i, 'range', 6), src: null, foe: false, name: def(i).name });
      g.events.push({ type: 'shoot', data: i.uid });
    }
  },
});

const nameOf = (e: Entity) => (ENEMIES[e.enemy!.type]?.name ?? 'it').replace(/^(a|an|the) /, '');
const told = new WeakMap<Game, number>();
/** v2r5 run: `shoot` with nothing to aim at only ever said "you miss": the nearest foe in reach that a wall
 *  hides, or that your eyes do not see, is named with the way to it */
function whyNot(g: Game, range: number): void {
  if (g.t - (told.get(g) ?? -99) < 2.5) return;
  const p = g.player;
  const e = g.ents
    .filter((e) => e.enemy && !ENEMIES[e.enemy.type]?.hidden && !e.enemy.data.mimic && dist(e, p) <= range)
    .sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (!e) return;
  told.set(g, g.t);
  const w = compass(g, e);
  if (!clearShot(g, p.x, p.y, e.x, e.y) && canHit(g, e)) return say(g, `stone stands between you and the ${nameOf(e)}: step out of its line.`);
  if (!perceives(g, e)) say(g, ['nothing in sight to aim at: ', { text: `turn ▶ ${nameOf(e)}`, cmd: `face ${w}` }]);
}

/** v2r5 run: an unseen seraph's orbs hit you with nothing on screen: the way they came from, once in a while */
const cued = new WeakMap<Game, number>();
tickHooks.push((g) => {
  const b = bolted.get(g);
  const p = g.player;
  if (!b || b.t !== g.t || p.hurtAt !== g.t || g.ended) return;
  if (b.from.enemy && g.ents.includes(b.from) && (perceives(g, b.from) || dist(b.from, p) <= REACH)) return;
  if (g.t - (cued.get(g) ?? -99) < 3) return;
  cued.set(g, g.t);
  const at = g.ents.includes(b.from) ? b.from : { x: p.x - b.vx, y: p.y - b.vy };
  say(g, `a bolt from the ${compass(g, at)}.`);
});
