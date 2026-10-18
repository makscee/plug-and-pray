// Zones are the floors now (v2, src/world/floors.ts): zone n is floor n, each with its own name, look, foes,
// loot and hazard. `zoneAt` and `zoneOf` keep working and return the floor.
//   0 the cradle      mites, a seraph. learn to walk and bite; thin walls break.
//   1 the choir nave  swarms and seraph lines, mimics; echoes. want: a ranged weapon, a body module, a slot.
//   2 the ossuary     walkers and the hum; COLD: you do not mend without a lamp on (and light draws them). want: armour, a lamp, power.
//   3 the furnace     furnace seraphs, walkers, hum packs; HEAT sears 0.15 hp/s unless something keeps it off.
//   4 the heart       the final arena.
// The gate is felt, never a wall: `readiness` is what a careful player (and the sim) waits for.
import { CHUNK } from '../core/grid';
import { active, def, param, powerMax, powerUsed, size, slotsUsed } from '../core/mods';
import { makeRoom } from '../body';
import { say, tickHooks } from '../core/game';
import type { Game, Line } from '../core/types';
import { dpsOf } from './zonemath';
import { FLOORS, floorOfChunk, type Floor } from './floors';

export type Zone = Floor;

export const ZONES: Zone[] = FLOORS;

/** the zone (floor) of a chunk */
export const zoneOf = (cx: number, _cy?: number): number => floorOfChunk(cx);
export const zoneAt = (x: number, _y?: number): number => zoneOf(Math.floor(x / CHUNK));
/** the zone for a distance in chunks (the old `far` numbers: each floor is a band two wide, src/world/floors.ts farOf) */
export const zoneFar = (far: number): number => Math.max(0, Math.min(ZONES.length - 1, Math.floor(far / 2)));

/** zones where the cold stops your mending unless a lamp is on */
export const COLD = 2;
export const needsLamp = (z: number): boolean => z === COLD;
/** zones where heat sears, and how fast (hp/s) */
export const HEAT = 3;
export const SEAR = 0.15;

/** how ready the body is: damage per second, times what it can take (hp, armour, mending) */
export function readiness(g: Game): number {
  const body = active(g, 'body');
  const sum = (k: string) => body.reduce((s, i) => s + param<number>(i, k, 0), 0);
  const haste = 1 + sum('haste');
  return dpsOf(active(g, 'weapon')) * haste * g.player.maxHp * (1 + sum('armour')) * (1 + sum('regen') * 2 + sum('mend') * 0.05 + sum('thorns') * 0.5);
}

/** crossing into a zone says so, once per zone per run */
const told = new WeakMap<Game, Set<number>>();
tickHooks.push((g) => {
  const z = zoneAt(g.player.x, g.player.y);
  let s = told.get(g);
  if (!s) told.set(g, (s = new Set([0])));
  if (s.has(z)) return;
  s.add(z);
  g.events.push({ type: 'zone', data: z });
  say(g, ZONES[z].enter, ...answers(g, z));
});

/** what a zone asks for (docs/modules.md): the ossuary light or warmth, sight in the dark, the hum, big hits
 *  for bone armour; the furnace something that keeps the heat off */
const ANSWERS: Record<number, (m: { mod: string }) => boolean> = {
  2: (m) => {
    const d = def(m);
    const f = param<string>(m, 'filter', '');
    return d.family === 'lamp' || param<number>(m, 'glow', 0) > 0 || f === 'sonar' || f === 'edge' || f === 'heat' || param<string[]>(m, 'sees', []).includes('flesh') ||
      (d.family === 'weapon' && param<number>(m, 'damage', 0) >= 3) || param<number>(m, 'armour', 0) > 0 || param<number>(m, 'regen', 0) > 0;
  },
  3: (m) => param<number>(m, 'heatproof', 0) > 0,
};

/** buttons for the carried modules that answer a zone, on the line after its entry text. One that
 * would not fit (no slot, short of power) is a `swap in` that makes room first (playtest r2) */
export function answers(g: Game, z: number): Line[] {
  const fits = ANSWERS[z];
  if (!fits) return [];
  const p = g.player;
  const mods = [...new Map(p.inv.flatMap((i) => (i.kind === 'mod' && fits(i) ? [[def(i).name, i] as const] : []))).values()].slice(0, 4);
  if (!mods.length) return z === HEAT ? [['nothing you carry keeps it off. a rime hood would.']] : [];
  const spare = powerMax(g) - powerUsed(g);
  const cmd = (it: { mod: string }) => {
    const n = def(it).name;
    if (slotsUsed(g) + size(it) <= p.slots && def(it).power <= spare) return `install ${n}`;
    return typeof makeRoom(g, it, false) === 'string' ? `install ${n}` : `swap in ${n}`;
  };
  return [['you carry what answers it: ', ...mods.flatMap((it, k) => [k ? '  ' : '', { text: cmd(it), cmd: cmd(it) }])]];
}
