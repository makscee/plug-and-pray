// The Thaw Engine ending as numbers, no DOM: how warm the light is, how far each window has melted and
// whether the end card shows, at `t` seconds after the engine turned over. src/end/index.ts draws it.

import type { Game } from '../core/types';

/** seconds: the light floods over LIGHT, windows melt from MELT_AT (staggered), the card shows at CARD */
export const LIGHT = 4;
export const MELT_AT = 1.2;
export const MELT = 3;
export const STAGGER = 0.35;
export const CARD = 6.5;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => x * x * (3 - 2 * x);

/** 0..1: the heart's light filling the screen */
export function light(t: number): number {
  return ease(clamp(t / LIGHT));
}

/** 0..1: window number `i` melting (the console last, it is the oldest part of you) */
export function melt(t: number, i: number): number {
  return clamp((t - MELT_AT - i * STAGGER) / MELT);
}

/** the heartbeat, 0..1: slow at first, quickening as it warms */
export function beat(t: number): number {
  const rate = 0.7 + 0.9 * light(t);
  return Math.pow(Math.max(0, Math.sin(t * rate * Math.PI * 2)), 6);
}

export function card(t: number): boolean {
  return t >= CARD;
}

/** m:ss of game time */
export function clock(s: number): string {
  const n = Math.max(0, Math.round(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/** the end card's run line */
export function summary(g: Game): string {
  const s = g.stats;
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  return `${n(s.far, 'cell')} out · ${n(s.mods.length, 'module')} found · ${s.kills} put down · ${clock(g.t)}`;
}
