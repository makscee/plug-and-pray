// What sounds when: reads the game once a frame (its events and a few things it watches change)
// and returns the cues to play. Pure, no Web Audio, so vitest checks it.
// Events it knows: take, install, remove, warm, hit, hurt, kill, die; anything with print or card
// in its type (the printer and card-reader slices); thaw/heart for the end. Unknown types are ignored.

import type { Game } from '../core/types';

export interface Play {
  cue: string;
  uid?: number;
  secs?: number;
}

/** what the ear remembers between frames */
export interface Ear {
  g: Game | null;
  x: number;
  y: number;
  /** cells moved since the last step sound */
  walked: number;
  /** each installed module: off, warming or on */
  mods: Map<number, 'off' | 'warm' | 'on'>;
  cards: number;
}

export const ear = (): Ear => ({ g: null, x: 0, y: 0, walked: START, mods: new Map(), cards: 0 });

/** cells between step sounds: one per cell for the stepper, a drag each half cell crawling, a stride free */
const STRIDE = { step: 1, drag: 0.5, free: 0.8 };
/** `walked` while standing still */
const START = 99;

export function listen(e: Ear, g: Game): Play[] {
  const p = g.player;
  const out: Play[] = [];
  if (e.g !== g) {
    // a new run (or the first frame): remember, play nothing
    Object.assign(e, ear(), { g, x: p.x, y: p.y, cards: g.cards.length });
    for (const i of p.installed) e.mods.set(i.uid, state(g, i));
    return out;
  }

  // steps: by distance actually moved, so a long glide clicks once per cell
  const moved = Math.hypot(p.x - e.x, p.y - e.y);
  e.x = p.x;
  e.y = p.y;
  if (moved > 3) e.walked = 0; // a jump, not a walk
  else if (moved > 0) {
    const kind = p.move ? 'free' : p.pace <= 1 ? 'drag' : 'step';
    const arrived = !p.move && !p.path.length; // the last cell: the step that set off for it already sounded
    e.walked = e.walked >= START ? STRIDE[kind] : e.walked + moved;
    if (e.walked >= STRIDE[kind] - 1e-6 && !arrived) {
      e.walked = Math.max(0, e.walked - STRIDE[kind]);
      out.push({ cue: kind === 'drag' ? 'drag' : 'step' });
    }
  } else e.walked = START; // standing: the first move sounds at once

  const seen = new Set<string>();
  for (const ev of g.events) {
    const t = String(ev.type);
    if (t === 'warm') {
      const inst = p.installed.find((i) => i.uid === ev.data);
      const secs = inst ? inst.readyAt - g.t : 0;
      if (inst && secs > 0.05) out.push({ cue: 'warm', uid: inst.uid, secs });
      continue;
    }
    const cue = CUE[t] ?? (t.includes('print') ? 'printer' : t.includes('card') || t.includes('read') ? 'card' : t === 'thaw' ? 'heart' : null);
    if (!cue || seen.has(cue)) continue; // one of each per frame: three mites dying is one crunch
    seen.add(cue);
    out.push({ cue });
  }

  // modules: warm -> on is a soft blip, on -> off sinks; removal is its own clack
  const now = new Map<number, 'off' | 'warm' | 'on'>();
  for (const i of p.installed) {
    const s = state(g, i);
    const was = e.mods.get(i.uid);
    if (was && was !== 'off' && s === 'off') out.push({ cue: 'off', uid: i.uid });
    if (was === 'warm' && s === 'on') out.push({ cue: 'ready', uid: i.uid });
    now.set(i.uid, s);
  }
  e.mods = now;

  // a card read without its own event still chirps
  if (g.cards.length > e.cards && !seen.has('card')) out.push({ cue: 'card' });
  e.cards = g.cards.length;
  return out;
}

const CUE: Record<string, string> = { take: 'take', install: 'install', remove: 'remove', hit: 'hit', hurt: 'hurt', kill: 'kill', die: 'die' };

function state(g: Game, i: { on: boolean; readyAt: number }): 'off' | 'warm' | 'on' {
  return !i.on ? 'off' : g.t >= i.readyAt ? 'on' : 'warm';
}

/** how deep the drone sits: 0 at the start, 1 some sixty cells out */
export const deep = (g: Game): number => Math.min(1, g.stats.far / 60);
