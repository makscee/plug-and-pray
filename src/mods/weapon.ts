// Weapons: auto weapons strike the nearest enemy in range on their own cooldown. The fight slice
// adds aimed ones (shoot down your facing; with the gyro heart, the mouse).

import { dist, strike } from '../core/game';
import { active, family, param } from '../core/mods';
import type { Game } from '../core/types';

/** the overclock coil's haste: every weapon cools this many times faster */
export const haste = (g: Game): number => 1 + active(g, 'body').reduce((s, i) => s + param<number>(i, 'haste', 0), 0);
import { clear } from '../core/grid';
import { canHit, strikeGap } from './sense';

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
    // what only an eye shows can be struck no faster than that eye sees it (sense.ts strikeGap)
    inst.data.readyAt = g.t + Math.max(param<number>(inst, 'cooldown', 1) / haste(g), strikeGap(g, near[0]));
    // a sweeping weapon (the censer flail) hits everything in reach, the rest the nearest
    for (const t of param(inst, 'sweep', false) ? near : near.slice(0, 1)) strike(g, t, param<number>(inst, 'damage', 1));
  },
});

