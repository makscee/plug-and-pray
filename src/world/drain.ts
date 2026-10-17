// Draining veins: a tool module (the leech needle) bleeds a vein beside you into resources.
// It is loud: enemies within the needle's noise radius notice you.

import { Cell, cell, DIRS, setCell, veinOf } from '../core/grid';
import { dist, say, tickHooks } from '../core/game';
import { active, family, param } from '../core/mods';
import { hash, rng } from '../core/rng';
import { addItem, verb } from '../core/verbs';
import type { Game } from '../core/types';

/** the vein beside you, your facing first: [x, y] of its cell */
export function veinBeside(g: Game): [number, number] | null {
  const p = g.player;
  const i = Math.floor(p.x);
  const j = Math.floor(p.y);
  const ahead: [number, number] = [Math.round(Math.sin(p.dir)), Math.round(-Math.cos(p.dir))];
  for (const [dx, dy] of [ahead, ...Object.values(DIRS)]) if (veinOf(cell(g, i + dx, j + dy))) return [i + dx, j + dy];
  return null;
}

const needles = (g: Game) => active(g, 'tool').filter((i) => param<number>(i, 'drain', 0) > 0);

family('tool', {
  buttons: (g, inst) => (param<number>(inst, 'drain', 0) > 0 && veinBeside(g) ? [{ label: 'drain', cmd: 'drain' }] : []),
});

verb('drain', {
  help: 'bleed a vein beside you into resources (loud)',
  when: (g) => needles(g).length > 0,
  run(g) {
    const inst = needles(g)[0];
    if (g.t < ((inst.data.readyAt as number) ?? 0)) return say(g, 'the needle is still cooling.');
    const v = veinBeside(g);
    if (!v) return say(g, 'no vein beside you.');
    const res = veinOf(cell(g, v[0], v[1]))!;
    const r = rng(hash(g.seed, 61, v[0], v[1]));
    const n = res === 'ichor' ? 1 : Math.max(1, Math.round(r.int(1, 3) * param<number>(inst, 'drain', 1)));
    setCell(g, v[0], v[1], Cell.wall);
    addItem(g, { kind: 'res', res, n });
    inst.data.readyAt = g.t + param<number>(inst, 'cooldown', 1.5);
    const noise = param<number>(inst, 'noise', 8);
    let woke = 0;
    for (const e of g.ents)
      if (e.enemy && dist(e, g.player) <= noise && !e.enemy.data.noticed) {
        e.enemy.data.noticed = true;
        woke++;
      }
    g.events.push({ type: 'drain', at: [v[0] + 0.5, v[1] + 0.5], data: res }, { type: 'noise', at: [g.player.x, g.player.y], data: noise });
    say(g, `the needle drinks the vein: +${n} ${res}. it screams as it goes.` + (woke ? ' something heard.' : ''));
  },
});

/** with a needle on, a vein beside you says so, once per cell you stand in */
const told = new WeakMap<Game, string>();
tickHooks.push((g) => {
  if (!needles(g).length) return;
  const v = veinBeside(g);
  if (!v) return;
  const k = `${Math.floor(g.player.x)},${Math.floor(g.player.y)}`;
  if (told.get(g) === k) return;
  told.set(g, k);
  say(g, [`a vein of ${veinOf(cell(g, v[0], v[1]))} beside you. `, { text: 'drain', cmd: 'drain' }]);
});

