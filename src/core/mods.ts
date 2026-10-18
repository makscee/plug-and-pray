// Modules: the table entries (src/mods/table.ts), the families' logic, slots and power.
//
// A family is one code path for many modules: each module is a family plus a parameter block.
// A family's logic lives in src/mods/<family>.ts (`family(name, def)`); its window lives in the UI
// (src/ui/views.ts `view(name, ...)`), so the core stays testable without a DOM.

import type { Game, Inst, Line, Roll } from './types';

export type Family = 'camera' | 'scanner' | 'lamp' | 'gait' | 'weapon' | 'body' | 'mind' | 'power' | 'unique' | 'tool';
export type Param = number | string | boolean | string[];

export interface ModDef {
  id: string;
  name: string;
  family: Family;
  /** power drawn while on (power modules: 0, they add `params.power`) */
  power: number;
  /** seconds from switching on to working */
  warm: number;
  /** 0 common .. 3 unique: how far out it starts to show up */
  tier: number;
  params: Record<string, Param>;
  /** one line of flavour, shown on take and in the window */
  text: string;
}

export interface FamilyDef {
  /** every tick while on and warm */
  tick?: (g: Game, inst: Inst, dt: number) => void;
  /** buttons in its window: a label and the command it types */
  buttons?: (g: Game, inst: Inst) => { label: string; cmd: string }[];
  /** lines `look`/`status` prints for it */
  status?: (g: Game, inst: Inst) => Line[];
}

export const MODS: Record<string, ModDef> = {};
export const families: Partial<Record<Family, FamilyDef>> = {};

export function mod(def: ModDef): void {
  MODS[def.id] = def;
}
export function mods(defs: ModDef[]): void {
  for (const d of defs) mod(d);
}
export function family(name: Family, def: FamilyDef): void {
  families[name] = def;
}

export const def = (inst: { mod: string }): ModDef => {
  const d = MODS[inst.mod];
  if (!d) throw new Error(`unknown module ${inst.mod}`);
  return d;
};

/** a parameter with the find's roll applied */
export function param<T extends Param>(inst: { mod: string; roll?: Roll }, key: string, fallback?: T): T {
  const v = def(inst).params[key] ?? fallback;
  if (inst.roll && inst.roll.key === key && typeof v === 'number') return (v * inst.roll.mult) as T;
  return v as T;
}

/** the name on screen: "pinhole eye", "attuned pinhole eye" */
export function label(item: { mod: string; roll?: Roll }): string {
  return (item.roll ? item.roll.tag + ' ' : '') + def(item).name;
}

/** slots it fills on the board: most take one, a few heavy ones two (`params.size`, v2 asks) */
export const size = (m: { mod: string }): number => Math.max(1, Math.round(Number(def(m).params.size ?? 1)));
/** slots the installed modules fill */
export const slotsUsed = (g: Game): number => g.player.installed.reduce((s, i) => s + size(i), 0);

export const working = (g: Game, inst: Inst): boolean => inst.on && g.t >= inst.readyAt;

/** installed modules of a family that are on and warm */
export function active(g: Game, fam: Family): Inst[] {
  return g.player.installed.filter((i) => def(i).family === fam && working(g, i));
}

export function powerMax(g: Game): number {
  let p = g.player.core;
  for (const i of g.player.installed) if (def(i).family === 'power' && i.on) p += Math.round(param<number>(i, 'power', 0));
  return p;
}
export function powerUsed(g: Game): number {
  let p = 0;
  for (const i of g.player.installed) if (i.on) p += def(i).power;
  return p;
}

/** switch on: refused when it would go over the power cap; starts the warm-up */
export function switchOn(g: Game, inst: Inst): string | null {
  if (inst.on) return null;
  const d = def(inst);
  if (powerUsed(g) + d.power > powerMax(g)) return `not enough power: ${d.name} needs ${d.power}, ${powerMax(g) - powerUsed(g)} free`;
  inst.on = true;
  inst.readyAt = g.t + d.warm;
  g.events.push({ type: 'warm', data: inst.uid });
  return null;
}

export function switchOff(g: Game, inst: Inst): void {
  inst.on = false;
  // a power module going off may leave others over the cap: switch off the newest until it fits
  const on = g.player.installed.filter((i) => i.on);
  while (powerUsed(g) > powerMax(g) && on.length) {
    const last = on.pop()!;
    if (def(last).family !== 'power') last.on = false;
  }
}

export function tickMods(g: Game, dt: number): void {
  for (const inst of g.player.installed) {
    if (!working(g, inst)) continue;
    families[def(inst).family]?.tick?.(g, inst, dt);
  }
}
