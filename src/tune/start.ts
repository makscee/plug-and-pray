// Accessible start (Maks's playtest 10-18: "really hard to start, camera is impossible to understand"):
// a run wakes with a plain eye, the stepper relay and the map spool already in and on, slots and power
// to spare. `unstuck` gets you out of any corner: the nearest open cell, or home to the start chamber.

import { say, tickHooks } from '../core/game';
import { open } from '../core/grid';
import { switchOn } from '../core/mods';
import type { Game, Inst } from '../core/types';
import { verb } from '../core/verbs';

export const KIT = ['dawn-eye', 'stepper-relay', 'map-spool'];

/** install the starting kit, already warm */
export function startKit(g: Game): void {
  const p = g.player;
  p.slots = 6;
  p.core = 6;
  for (const mod of KIT) {
    const inst: Inst = { uid: g.nextId++, mod, on: false, readyAt: 0, data: {} };
    p.installed.push(inst);
    g.stats.mods.push(mod);
    switchOn(g, inst);
    inst.readyAt = 0;
  }
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
