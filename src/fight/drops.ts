// What a kill leaves: a resource most of the time, sometimes a module. A mimic gives up what it wore.
import { killHooks, spawn } from '../core/game';
import { active, param } from '../core/mods';
import { hash, rng } from '../core/rng';
import { lootMod } from '../world/spawn';
import type { Item, Res } from '../core/types';

/** how often a kill leaves its resource (balance pass: was 0.65: resources piled up unspent) */
export const DROP = 0.35;

/** per enemy: resource, how many, chance of a module */
export const DROPS: Record<string, [Res, number, number]> = {
  mite: ['bone', 1, 0.12], // playtest 10-18: early fights pay (was 0.05)
  seraph: ['glass', 2, 0.25],
  walker: ['bone', 3, 0.35],
  hum: ['ichor', 1, 0.4],
  mimic: ['copper', 2, 0],
  pyre: ['glass', 2, 0.3],
  warden: ['copper', 3, 1],
  abbot: ['bone', 5, 1],
  saint: ['ichor', 2, 1],
};

killHooks.push((g, e) => {
  // a boss's brood leaves nothing: no farming the mite queen (src/fight/bosses.ts)
  if (e.enemy!.data.summoner) return;
  const type = e.enemy!.type;
  const r = rng(hash(g.seed, 31, e.id));
  const drop = (item: Item, k: number) => spawn(g, { kind: 'item', x: e.x + (k ? 0.3 : 0), y: e.y, item });
  const [res, n, modChance] = DROPS[type] ?? ['bone', 1, 0];
  // the tithe ledger: kills pay out more often while it is on
  const tithe = active(g, 'mind').reduce((m, i) => Math.max(m, param<number>(i, 'tithe', 1)), 1);
  if (r.chance(Math.min(1, DROP * tithe))) drop({ kind: 'res', res, n }, 0);
  const dressed = e.enemy!.data.dressed as Item | undefined;
  if (dressed) drop(dressed, 1);
  else if (r.chance(modChance)) drop(lootMod(r, Math.hypot(e.x, e.y) / 16), 1);
});
