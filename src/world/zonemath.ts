// Small numbers about a loadout, shared by the zones and the sims.
import { param } from '../core/mods';
import { MODS } from '../core/mods';
import type { Roll } from '../core/types';

/** damage per second of the weapons in a list (aimed ones count a bit less: you have to line up) */
export function dpsOf(list: { mod: string; roll?: Roll }[]): number {
  let d = 0;
  for (const i of list) {
    if (MODS[i.mod]?.family !== 'weapon') continue;
    const v = param<number>(i, 'damage', 1) / param<number>(i, 'cooldown', 1);
    d += param<string>(i, 'aim', 'auto') === 'aimed' ? v * 0.6 : v;
  }
  return d;
}
