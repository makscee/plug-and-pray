// Weapons: auto weapons strike the nearest enemy in range on their own cooldown. The fight slice
// adds aimed ones (shoot down your facing; with the gyro heart, the mouse).

import { dist, strike } from '../core/game';
import { family, param } from '../core/mods';
import { clear } from '../core/grid';

family('weapon', {
  tick(g, inst) {
    if (param(inst, 'aim', 'auto') !== 'auto') return;
    const ready = (inst.data.readyAt as number) ?? 0;
    if (g.t < ready) return;
    const range = param<number>(inst, 'range', 1.3);
    const p = g.player;
    const target = g.ents
      .filter((e) => e.enemy && dist(e, p) <= range && clear(g, p.x, p.y, e.x, e.y))
      .sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (!target) return;
    inst.data.readyAt = g.t + param<number>(inst, 'cooldown', 1);
    strike(g, target, param<number>(inst, 'damage', 1));
  },
});

