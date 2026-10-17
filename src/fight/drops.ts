// What a kill leaves: a resource most of the time, sometimes a module. A mimic gives up what it wore.
import { killHooks, spawn } from '../core/game';
import { hash, rng } from '../core/rng';
import { lootMod } from '../world/spawn';
import type { Item, Res } from '../core/types';

/** per enemy: resource, how many, chance of a module */
export const DROPS: Record<string, [Res, number, number]> = {
  mite: ['bone', 1, 0.05],
  seraph: ['glass', 2, 0.25],
  walker: ['bone', 3, 0.35],
  hum: ['ichor', 1, 0.4],
  mimic: ['copper', 2, 0],
};

killHooks.push((g, e) => {
  const type = e.enemy!.type;
  const r = rng(hash(g.seed, 31, e.id));
  const drop = (item: Item, k: number) => spawn(g, { kind: 'item', x: e.x + (k ? 0.3 : 0), y: e.y, item });
  const [res, n, modChance] = DROPS[type] ?? ['bone', 1, 0];
  if (r.chance(0.65)) drop({ kind: 'res', res, n }, 0);
  const dressed = e.enemy!.data.dressed as Item | undefined;
  if (dressed) drop(dressed, 1);
  else if (r.chance(modChance)) drop(lootMod(r, Math.hypot(e.x, e.y) / 16), 1);
});
