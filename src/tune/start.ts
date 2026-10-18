// Accessible start (Maks's playtests 10-18): a run wakes holding a pinhole eye, the stepper relay, the
// map spool and the spark finger in its inventory; you install them yourself ("make modules in inventory
// initially and I have to click to install"), with slots and power for all four and two to spare. `unstuck` gets you out of any corner: the nearest open cell, or home to the start chamber.

import { dist, say, tickHooks } from '../core/game';
import { open } from '../core/grid';
import type { Game } from '../core/types';
import { verb } from '../core/verbs';
import { bossAt, origin } from '../world/floors';

export const KIT = ['pinhole-eye', 'stepper-relay', 'map-spool', 'spark-finger'];

/** the starting kit, in the inventory: the player installs it */
export function startKit(g: Game): void {
  const p = g.player;
  p.slots = 6;
  p.inv.push({ kind: 'res', res: 'copper', n: 2 }); // r1 econ: copper from the start, so the first reliquary is a choice
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

/** v2r1 pace: the last quiet spot on this floor: no foe within 10 cells for 3 s and clear of the keeper's
 *  room; unstuck folds you there, not back to the landing (a retreat cost 60-90 s of walking back) */
const quiet = new WeakMap<Game, { since: number; at: [number, number] | null; floor: number }>();
tickHooks.push((g) => {
  const p = g.player;
  const f = g.floor ?? 0;
  let q = quiet.get(g);
  if (!q || q.floor !== f) quiet.set(g, (q = { since: g.t, at: null, floor: f }));
  const [bx, by] = bossAt(g.seed, f);
  const calm = !g.ents.some((e) => e.enemy && dist(e, p) < 10) && Math.hypot(bx - p.x, by - p.y) > 12 && open(g, p.x, p.y);
  if (!calm) q.since = g.t;
  else if (g.t - q.since >= 3) q.at = [Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5];
});

/** home is the last quiet spot on this floor, else where you landed on it (src/world/floors.ts). Folding
 *  away from a fight (a foe within 8 cells) goes the long way, to the landing: the walk back is your mending (folding to a
 *  near quiet spot cost the sims 2-3 careful runs of 20, back in the fight half mended) */
const home = (g: Game, fled: boolean): [number, number] => {
  const q = quiet.get(g);
  // near it already (lost in a quiet place): the landing, as before
  const ok = !fled && q?.floor === (g.floor ?? 0) && q.at && Math.hypot(q.at[0] - g.player.x, q.at[1] - g.player.y) > 4;
  return ok ? q!.at! : origin(g.floor ?? 0);
};
const homing = new WeakMap<Game, { at: number; fled: boolean }>();

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
  help: 'stuck or lost? unstuck: out of a wall, else back to the last quiet spot on this floor (with a foe on you: 3 s, and home to where you landed)',
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
    // lost: home at once when nothing is on you (playtest r2 pace); cornered: 3 s
    const close = g.ents.some((e) => e.enemy && dist(e, p) < 2);
    // fleeing a fight (a foe within 8 cells): the long way home, to mend on the walk back
    const fled = g.ents.some((e) => e.enemy && dist(e, p) < 8);
    homing.set(g, { at: g.t + (close ? 3 : 0), fled });
    say(g, fled ? `you fold up and let the god\'s veins carry you home, far from this.${close ? ' 3 s.' : ''}` : 'you fold up and let the god\'s veins carry you back to where it was quiet.');
  },
});

tickHooks.push((g) => {
  const h = homing.get(g);
  if (!h || g.t < h.at) return;
  homing.delete(g);
  const p = g.player;
  [p.x, p.y] = home(g, h.fled);
  p.path = [];
  p.move = null;
  say(g, h.fled ? 'you wake where you landed. it is quiet here.' : 'you unfold where it was quiet.');
});
