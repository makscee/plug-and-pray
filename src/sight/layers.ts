// What the screen shows behind the windows (v2-view, Maks 10-18 ~10:50: "make it the background of the screen ...
// adding multiple cameras together should layer them"). Pure (no three, no DOM): the backdrop (backdrop.ts), the
// eye windows and the tests share it.
//   no eye works        the map is the screen (and the radars sweep over it)
//   an eye works        the best colour, grey or black & white eye is the base view, full screen; every other eye
//                       on adds a layer over it: heat warm blobs through walls, sonar edge lines and hollows,
//                       outlines, a second colour eye's vein glints, black & white's scripture
//   only layer eyes     the best of them is the base, in its own full look

import { def, param } from '../core/mods';
import type { Modish } from '../core/mods';
import type { Game, Inst } from '../core/types';

export type Layer = 'heat' | 'sonar' | 'edge' | 'glint' | 'script' | 'rest';

/** filters that can be a base view; the rest (heat, sonar, edge) are layers over one */
export const BASE_FILTERS = ['color', 'gray', '1bit'];

/** how good a base an eye makes: sharper first, then colour over grey over black & white */
export function baseScore(inst: Modish): number {
  const f = param<string>(inst, 'filter', 'color');
  const res = Math.min(180, param<number>(inst, 'res', 32));
  const colors = param<number>(inst, 'colors', 0);
  const tone = f === 'color' ? (colors && colors <= 8 ? 1.15 : 1.3) : f === 'gray' ? 1 : f === '1bit' ? 0.8 : 0.5;
  return res * tone;
}

/** the layer an eye adds when it is not the base */
export function layerOf(inst: Modish): Layer {
  const f = param<string>(inst, 'filter', 'color');
  if (f === 'heat' || f === 'sonar' || f === 'edge') return f;
  if (f === 'color') return 'glint';
  if (f === '1bit') return 'script';
  return 'rest';
}

export interface Plan {
  /** the base view's eye (warm), or null: the map */
  base: Inst | null;
  /** eyes on but still warming, with no warm eye to show: the screen shows static */
  warming: Inst | null;
  /** every other warm eye, and what it adds */
  layers: { inst: Inst; layer: Layer }[];
}

/** what the screen shows now */
export function plan(g: Game): Plan {
  const on = g.player.installed.filter((i) => i.on && def(i).family === 'camera');
  const warm = on.filter((i) => g.t >= i.readyAt);
  const bases = warm.filter((i) => BASE_FILTERS.includes(param<string>(i, 'filter', 'color')));
  const pool = bases.length ? bases : warm;
  const base = pool.slice().sort((a, b) => baseScore(b) - baseScore(a) || a.uid - b.uid)[0] ?? null;
  const layers = warm.filter((i) => i !== base).map((inst) => ({ inst, layer: layerOf(inst) }));
  const warming = base ? null : on.find((i) => g.t < i.readyAt) ?? null;
  return { base, warming, layers };
}

/** the view's fov across, degrees: a scope's is across already (it has `wide`); a square eye's is widened to the screen */
export function fovAcross(inst: Modish): number {
  const fov = param<number>(inst, 'fov', 60);
  return (param<number>(inst, 'wide', 0) ? fov : Math.min(110, fov * 1.25)) + WIDEN.by;
}
/** degrees the view opens wider: the martyr's reins held (src/body/fps.ts sets it each tick) */
export const WIDEN = { by: 0 };

/** the view's rows: the eye's resolution, capped so a full-screen shot stays cheap */
export const rowsOf = (inst: Modish): number => Math.max(16, Math.min(180, Math.round(param<number>(inst, 'res', 32))));
