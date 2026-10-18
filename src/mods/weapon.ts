// Weapons: auto weapons strike the nearest enemy in range on their own cooldown. The fight slice
// adds aimed ones (shoot down your facing; with the gyro heart, the mouse).

import { dist, strike } from '../core/game';
import { active, family, param } from '../core/mods';
import type { Game } from '../core/types';

/** the overclock coil's haste: every weapon cools this many times faster (and the martyr's reins held, src/body/fps.ts) */
export const haste = (g: Game): number => 1 + active(g, 'body').reduce((s, i) => s + param<number>(i, 'haste', 0), 0) + hasteHooks.reduce((s, f) => s + f(g), 0);
/** more haste from elsewhere: (game) => extra */
export const hasteHooks: ((g: Game) => number)[] = [];
import { clear } from '../core/grid';
import { canHit } from './sense';
import { perk } from './uniques';
import type { Inst } from '../core/types';

/** each extra copy of one weapon cuts its cooldown by this much (stacked); copies never add hits. Aimed weapons
 *  had this rule (src/fight/aim.ts); v2r2 fight: three choir bells stacked to 4.5 dps hands-free and beat aiming */
export const COPY = 0.25;
/** the copies of `i`'s weapon that are on, the lead (the one that strikes) first */
export const copiesOf = (g: Game, i: Inst): Inst[] => active(g, 'weapon').filter((x) => x.mod === i.mod);
/** an auto weapon's cooldown, with its copies and haste counted */
export const autoCooldown = (g: Game, i: Inst): number => (param<number>(i, 'cooldown', 1) * Math.pow(1 - COPY, Math.max(0, copiesOf(g, i).length - 1))) / haste(g);

/** v2 uniques: the chain of saint vitus leaps on (CHAIN.hops foes within CHAIN.reach, at CHAIN.mult); the drowned bell slows */
export const CHAIN = { hops: 2, reach: 3, mult: 0.5 };
export const SLOW = 2;

family('weapon', {
  tick(g, inst) {
    if (param(inst, 'aim', 'auto') !== 'auto') return;
    // only the first copy strikes; the others make it quicker (autoCooldown)
    if (copiesOf(g, inst)[0] !== inst) return;
    const ready = (inst.data.readyAt as number) ?? 0;
    if (g.t < ready) return;
    const range = param<number>(inst, 'range', 1.3);
    const p = g.player;
    // only what you perceive (an eye, a scanner) or can touch; the hidden only when perceived (src/mods/sense.ts)
    const near = g.ents.filter((e) => e.enemy && dist(e, p) <= range && clear(g, p.x, p.y, e.x, e.y) && canHit(g, e)).sort((a, b) => dist(a, p) - dist(b, p));
    if (!near.length) return;
    // a boss in reach comes first, its brood second (v2 r1 fun: the queen's mites soaked every hit)
    const boss = near.findIndex((e) => e.enemy!.data.boss);
    if (boss > 0) near.unshift(...near.splice(boss, 1));
    inst.data.readyAt = g.t + autoCooldown(g, inst);
    // a sweeping weapon (the censer flail) hits everything in reach, the rest the nearest
    const dmg = param<number>(inst, 'damage', 1);
    const hit = param(inst, 'sweep', false) ? near : near.slice(0, 1);
    for (const t of hit) strike(g, t, dmg);
    const pk = perk(inst);
    if (pk === 'slow') for (const t of hit) if (t.enemy) t.enemy.data.slowUntil = g.t + SLOW;
    if (pk === 'chain') {
      const done = new Set(hit);
      let from = hit[0];
      for (let k = 0; k < CHAIN.hops; k++) {
        const next = g.ents.filter((e) => e.enemy && !done.has(e) && dist(e, from) <= CHAIN.reach && clear(g, from.x, from.y, e.x, e.y)).sort((a, b) => dist(a, from) - dist(b, from))[0];
        if (!next) break;
        done.add(next);
        g.events.push({ type: 'chain', at: [next.x, next.y], data: [from.x, from.y] });
        strike(g, next, dmg * CHAIN.mult);
        from = next;
      }
    }
  },
});

