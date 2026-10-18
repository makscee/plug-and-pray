// Weapons: auto weapons strike the nearest enemy in range on their own cooldown. The fight slice
// adds aimed ones (shoot down your facing; with the gyro heart, the mouse).

import { dist, strike } from '../core/game';
import { active, family, param } from '../core/mods';
import type { Game } from '../core/types';

/** the overclock coil's haste: every weapon cools this many times faster */
export const haste = (g: Game): number => 1 + active(g, 'body').reduce((s, i) => s + param<number>(i, 'haste', 0), 0);
import { clear } from '../core/grid';
import { canHit } from './sense';
import { perk } from './uniques';

/** v2 uniques: the chain of saint vitus leaps on (CHAIN.hops foes within CHAIN.reach, at CHAIN.mult); the drowned bell slows */
export const CHAIN = { hops: 2, reach: 3, mult: 0.5 };
export const SLOW = 2;

family('weapon', {
  tick(g, inst) {
    if (param(inst, 'aim', 'auto') !== 'auto') return;
    const ready = (inst.data.readyAt as number) ?? 0;
    if (g.t < ready) return;
    const range = param<number>(inst, 'range', 1.3);
    const p = g.player;
    // only what you perceive (an eye, a scanner) or can touch; the hidden only when perceived (src/mods/sense.ts)
    const near = g.ents.filter((e) => e.enemy && dist(e, p) <= range && clear(g, p.x, p.y, e.x, e.y) && canHit(g, e)).sort((a, b) => dist(a, p) - dist(b, p));
    if (!near.length) return;
    inst.data.readyAt = g.t + param<number>(inst, 'cooldown', 1) / haste(g);
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

