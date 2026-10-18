// Zones: rings of chunks around where you woke, each with its own name, look, foes, loot and hazard.
// The shards lie one per zone (1, 2, 3) and each is guarded by that zone's elite; the Engine lies in the
// furnace. Deeper zones hit harder (`FOE`), hold better loot and carry a hazard a module answers:
//   0 the cradle      mites, a seraph. learn to walk and bite.
//   1 the choir nave  swarms and seraph lines, mimics; the choir warden guards shard 1. want: a second weapon or a ranged one, a body module, a slot.
//   2 the ossuary     walkers and the hum; COLD: you do not mend without a lamp on (and light draws them). the bone abbot guards shard 2. want: armour, a lamp, power.
//   3 the furnace     furnace seraphs, walkers, hum packs; HEAT sears 0.15 hp/s unless something keeps it off. the furnace saint guards shard 3 and the engine.
// The gate is felt, never a wall: `readiness` is what a careful player (and the sim) waits for.
import { CHUNK } from '../core/grid';
import { active, def, param } from '../core/mods';
import { say, tickHooks } from '../core/game';
import type { Game, Line } from '../core/types';
import { dpsOf } from './zonemath';

export interface Zone {
  id: number;
  name: string;
  /** outer edge, in chunks from the start chunk */
  until: number;
  /** the sight layer's hint: wall tint and fog (hex), how dark */
  look: { tint: string; fog: string; dark: number };
  /** what it says when you cross in */
  enter: string;
  /** foes here hit and last this much more */
  foe: { hp: number; damage: number };
  /** loot tier this zone rolls up to */
  tier: number;
  /** readiness a careful player wants before walking in (the sims' gate) */
  need: number;
}

export const ZONES: Zone[] = [
  { id: 0, name: 'the cradle', until: 1.5, look: { tint: 'c8a070', fog: '100c0a', dark: 0 }, enter: 'the cradle. warm, close, almost kind.', foe: { hp: 1, damage: 1 }, tier: 0, need: 0 },
  { id: 1, name: 'the choir nave', until: 3.5, look: { tint: 'd0b890', fog: '141018', dark: 0.15 }, enter: 'the choir nave. many small voices, all of them hungry.', foe: { hp: 1.2, damage: 1.15 }, tier: 1, need: 9 },
  { id: 2, name: 'the ossuary', until: 5.5, look: { tint: '9aa8b0', fog: '080a10', dark: 0.4 }, enter: 'the ossuary. the marrow is cold: without a lamp you will not mend.', foe: { hp: 1.7, damage: 1.45 }, tier: 2, need: 40 },
  { id: 3, name: 'the furnace', until: Infinity, look: { tint: 'ff7a40', fog: '200804', dark: 0.25 }, enter: 'the furnace. the god\'s heat sears here: keep it off or burn.', foe: { hp: 2, damage: 1.6 }, tier: 2, need: 70 },
];

/** the zone of a chunk */
export function zoneOf(cx: number, cy: number): number {
  const far = Math.hypot(cx, cy);
  return ZONES.findIndex((z) => far < z.until);
}
export const zoneAt = (x: number, y: number): number => zoneOf(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
/** the zone for a distance in chunks (the old `far` numbers) */
export const zoneFar = (far: number): number => ZONES.findIndex((z) => far < z.until);

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

/** buttons for the carried modules that answer a zone, on the line after its entry text */
export function answers(g: Game, z: number): Line[] {
  const fits = ANSWERS[z];
  if (!fits) return [];
  const names = [...new Set(g.player.inv.flatMap((i) => (i.kind === 'mod' && fits(i) ? [def(i).name] : [])))].slice(0, 4);
  if (!names.length) return z === HEAT ? [['nothing you carry keeps it off. a rime hood would.']] : [];
  return [['you carry what answers it: ', ...names.flatMap((n, k) => [k ? '  ' : '', { text: `install ${n}`, cmd: `install ${n}` }])]];
}
