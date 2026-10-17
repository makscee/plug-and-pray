// Zones: rings of chunks around where you woke, each with its own name, look, foes, loot and hazard.
// Deeper zones want a stronger body (`readiness`): the gate is felt, never a wall.
import { CHUNK } from '../core/grid';
import { active, param } from '../core/mods';
import type { Game } from '../core/types';
import { dpsOf } from './zonemath';

export interface Zone {
  id: number;
  name: string;
  /** outer edge, in chunks from the start chunk */
  until: number;
  /** what a careful player's readiness should be before walking in (the sim's gate) */
  need: number;
}

export const ZONES: Zone[] = [
  { id: 0, name: 'the cradle', until: 1.5, need: 0 },
  { id: 1, name: 'the choir nave', until: 3.5, need: 0 },
  { id: 2, name: 'the ossuary', until: 5.5, need: 0 },
  { id: 3, name: 'the furnace', until: Infinity, need: 0 },
];

/** the zone of a chunk */
export function zoneOf(cx: number, cy: number): number {
  const far = Math.hypot(cx, cy);
  return ZONES.findIndex((z) => far < z.until);
}
export const zoneAt = (x: number, y: number): number => zoneOf(Math.floor(x / CHUNK), Math.floor(y / CHUNK));

/** zones where the cold stops your mending unless a lamp is on */
export const needsLamp = (z: number): boolean => false;

/** how ready the body is: damage per second times how much it can take */
export function readiness(g: Game): number {
  const body = active(g, 'body');
  const armour = body.reduce((s, i) => s + param<number>(i, 'armour', 0), 0);
  return dpsOf(active(g, 'weapon')) * g.player.maxHp * (1 + armour);
}
