// Accessible start (Maks's playtests 10-18): a run wakes holding a pinhole eye, the stepper relay, the
// map spool and the spark finger in its inventory; you install them yourself ("make modules in inventory
// initially and I have to click to install"), with slots and power for all four and two to spare. `unstuck` gets you out of any corner: the nearest open cell, or home to the start chamber.

import { say, tickHooks } from '../core/game';
import { open } from '../core/grid';
import type { Game } from '../core/types';
import { verb } from '../core/verbs';

export const KIT = ['pinhole-eye', 'stepper-relay', 'map-spool', 'spark-finger'];

/** the starting kit, in the inventory: the player installs it */
export function startKit(g: Game): void {
  const p = g.player;
  p.slots = 6;
  p.core = 4; // module pass: the kit draws 3 of 4 (the pinhole is free); the first colour eye already asks for a choice
  for (const mod of KIT) {
    p.inv.push({ kind: 'mod', mod });
    g.stats.mods.push(mod);
  }
}

/** ?scene= stagings start clean: the starting kit is put away so each scene fits its own caps */
export function clean(g: Game): void {
  g.player.installed = [];
  g.player.inv = [];
}

const HOME: [number, number] = [8.5, 8.5];
const homing = new WeakMap<Game, number>();

/** the nearest open cell centre to (x, y), searching rings out to r */
function nearestOpen(g: Game, x: number, y: number, r = 4): [number, number] | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let k = 0; k <= r; k++)
    for (let dy = -k; dy <= k; dy++)
      for (let dx = -k; dx <= k; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue;
        if (open(g, cx + dx + 0.5, cy + dy + 0.5)) return [cx + dx + 0.5, cy + dy + 0.5];
      }
  return null;
}

verb('unstuck', {
  help: 'stuck or lost? unstuck: out of a wall, else home to where you woke (3 s)',
  run(g) {
    const p = g.player;
    p.path = [];
    p.move = null;
    // inside a wall (a glide or a dig gone wrong): out onto the nearest open cell at once
    if (!open(g, p.x, p.y)) {
      const to = nearestOpen(g, p.x, p.y);
      if (to) {
        [p.x, p.y] = to;
        return say(g, 'you wrench yourself free, onto open floor.');
      }
    }
    // lost or cornered: home
    homing.set(g, g.t + 3);
    say(g, 'you fold up and let the god\'s veins carry you home. 3 s.');
  },
});

tickHooks.push((g) => {
  const at = homing.get(g);
  if (at === undefined || g.t < at) return;
  homing.delete(g);
  const p = g.player;
  [p.x, p.y] = HOME;
  p.path = [];
  p.move = null;
  say(g, 'you wake where you woke. the chamber is quiet.');
});
