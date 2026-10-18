// Lamps: lights around you. With none on, only the veins and a dim body glow show. Light draws
// enemies: `lit(g)` is how many cells farther they notice you (core's `chase` reads it).
// Pure (no three, no DOM): the scene reads `lamps(g)` and places its point lights.

import { active, family, param } from '../core/mods';
import type { Game } from '../core/types';

export interface Lamp {
  radius: number;
  color: number;
  flicker: number;
}

family('lamp', {
  status: (_g, inst) => [[`light ${param<number>(inst, 'radius', 3)} cells; things that see light come from farther.`]],
});

/** the lamps on and warm now */
export function lamps(g: Game): Lamp[] {
  return active(g, 'lamp').map((i) => ({
    radius: param<number>(i, 'radius', 3),
    color: parseInt(String(param<string>(i, 'color', 'ffd8a0')).replace('#', ''), 16) || 0xffd8a0,
    flicker: param<number>(i, 'flicker', 0),
  }));
}

/** your light: the brightest lamp, or a module's own glow (the censer flail) */
export function light(g: Game): number {
  let r = 0;
  for (const i of g.player.installed) if (i.on && g.t >= i.readyAt) r = Math.max(r, param<number>(i, 'glow', 0));
  for (const l of lamps(g)) r = Math.max(r, l.radius);
  return r;
}

/** how loud you are: cells farther that things notice you (a sonar's ping, a heart-shard's beat) */
export function loud(g: Game): number {
  let n = 0;
  for (const i of g.player.installed) if (i.on && g.t >= i.readyAt) n += param<number>(i, 'loud', 0);
  return n;
}

/** cells added to every enemy's sense: your light (the brightest lamp's radius) and your noise */
export function lit(g: Game): number {
  return light(g) + loud(g);
}

/** a lamp's brightness 0..1 at time t: flicker dips it, never to nothing */
export function flame(l: Lamp, t: number): number {
  if (!l.flicker) return 1;
  const w = Math.sin(t * 13.1) * 0.5 + Math.sin(t * 7.3 + 1.7) * 0.3 + Math.sin(t * 23.9) * 0.2;
  return Math.max(0.2, 1 - l.flicker * (0.5 + 0.5 * w));
}
