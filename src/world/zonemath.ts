// Small numbers about a loadout, shared by the zones and the sims.
import { param } from '../core/mods';
import { MODS } from '../core/mods';
import type { Roll } from '../core/types';

/** damage per second of the weapons in a list (aimed ones count a bit less: you have to line up) */
export function dpsOf(list: { mod: string; roll?: Roll }[]): number {
  let d = 0;
  // copies of one weapon never add hits: each extra copy cools it 25% quicker (src/mods/weapon.ts COPY)
  const seen = new Set<string>();
  for (const i of list) {
    if (MODS[i.mod]?.family !== 'weapon' || seen.has(i.mod)) continue;
    seen.add(i.mod);
    const copies = list.filter((x) => x.mod === i.mod).length;
    const v = param<number>(i, 'damage', 1) / (param<number>(i, 'cooldown', 1) * Math.pow(0.75, copies - 1));
    d += param<string>(i, 'aim', 'auto') === 'aimed' ? v * 0.6 : v;
  }
  return d;
}
