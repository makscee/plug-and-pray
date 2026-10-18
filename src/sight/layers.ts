// What the screen shows behind the windows (v2-view, Maks 10-18 ~10:50: "make it the background of the screen ...
// adding multiple cameras together should layer them"). Pure (no three, no DOM): the backdrop (backdrop.ts), the
// eye windows and the tests share it.
//   no eye works        the map is the screen (and the radars sweep over it)
//   an eye works        the best colour, grey or black & white eye is the base view, full screen; every other eye
//                       on adds a layer over it: heat warm blobs through walls, sonar edge lines and hollows,
//                       outlines, a second colour eye's vein glints, black & white's scripture
//   only layer eyes     the best of them is the base, in its own full look

import { def, moduleLevel, param, ROMAN } from '../core/mods';
import type { Modish } from '../core/mods';
import type { Game, Inst } from '../core/types';

export type Layer = 'heat' | 'sonar' | 'edge' | 'glint' | 'script' | 'rest';

/** filters that can be a base view; the rest (heat, sonar, edge) are layers over one */
export const BASE_FILTERS = ['color', 'gray', '1bit'];

/** how good a base an eye makes: its sharpness weighed by its tone, colour well over grey over black & white
 *  (v2r2 ux: a 96 px black & white eye took the base from a 64 px colour one and the screen went to dither; now
 *  a colour eye of 64 px scores 102 and a 1-bit one of 96 px 58, so black & white is a layer beside any other) */
export function baseScore(inst: Modish): number {
  const f = param<string>(inst, 'filter', 'color');
  const res = Math.min(180, param<number>(inst, 'res', 32));
  const colors = param<number>(inst, 'colors', 0);
  const tone = f === 'color' ? (colors && colors <= 8 ? 1.5 : 1.6) : f === 'gray' ? 1 : f === '1bit' ? 0.6 : 0.5;
  return res * tone;
}

/** v2r2 ux: three or more layers at once were noise. At most this many draw, by priority; `layers` (key L) turns them */
export const MAX_LAYERS = 2;
export const PRIORITY: Layer[] = ['sonar', 'heat', 'edge', 'glint', 'script'];
const turned = new WeakMap<Game, number>();
/** the layers that draw now: every layer that adds something, best first, turned by `layers`, at most MAX_LAYERS */
export function shownLayers(g: Game, layers: Plan['layers']): Plan['layers'] {
  const all = layers.filter((l) => l.layer !== 'rest').sort((a, b) => PRIORITY.indexOf(a.layer) - PRIORITY.indexOf(b.layer) || a.inst.uid - b.inst.uid);
  if (all.length <= MAX_LAYERS) return all;
  const k = (turned.get(g) ?? 0) % all.length;
  return [...all.slice(k), ...all.slice(0, k)].slice(0, MAX_LAYERS);
}
/** the next pair of layers */
export const turnLayers = (g: Game): void => void turned.set(g, (turned.get(g) ?? 0) + 1);

/** how the base view draws an eye: a black & white eye as the base reads as nothing (v2r3 ux: the carrion eye's
 *  full-screen dither was the first sight on the obvious path), so alone it draws as twelve greys; beside a colour or
 *  grey eye it stays its own black & white, a layer */
export function baseLook(inst: Modish): { filter: string; colors: number } {
  const f = param<string>(inst, 'filter', 'color');
  const tone = eyeTone(inst);
  // v5: a grey or b&w eye's level II is an amber duotone, its level III true colour
  if (tone === 'amber') return { filter: 'amber', colors: f === '1bit' ? 12 : param<number>(inst, 'colors', 0) };
  if (tone === 'colour') return { filter: 'color', colors: 0 };
  if (f === '1bit') return { filter: 'gray', colors: 12 };
  return { filter: f, colors: param<number>(inst, 'colors', 0) };
}

/** v5 (Maks 10-18: "upgrading eye module should ... add colors"): what a level does to an eye's tone, as a word.
 *  Grey and b&w eyes: II amber, III colour. Colour, heat and sonar eyes gain colours (EYE_LEVEL); an outline eye sharpens */
export function eyeTone(inst: Modish): string {
  const lv = moduleLevel(inst);
  if (lv < 2) return '';
  const f = param<string>(inst, 'filter', 'color');
  if (f === 'gray' || f === '1bit') return lv === 2 ? 'amber' : 'colour';
  if (f === 'edge') return 'finer lines';
  return param<number>(inst, 'colors', 0) ? 'more colours' : 'farther';
}
/** the banner when the eye you look through levels up: "pinhole eye II: sharper, amber" */
export const eyeLine = (inst: Modish): string => `${def(inst).name} ${ROMAN[moduleLevel(inst)]}: sharper${eyeTone(inst) ? ', ' + eyeTone(inst) : ''}`;

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
  // v2r2 fun: a black & white eye is a layer (scripture) beside any warm colour or grey eye, never the view over it
  const toned = warm.filter((i) => ['color', 'gray'].includes(param<string>(i, 'filter', 'color')));
  const bases = toned.length ? toned : warm.filter((i) => BASE_FILTERS.includes(param<string>(i, 'filter', 'color')));
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
