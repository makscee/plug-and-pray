// Modules: the table entries (src/mods/table.ts), the families' logic, slots and power.
//
// A family is one code path for many modules: each module is a family plus a parameter block.
// A family's logic lives in src/mods/<family>.ts (`family(name, def)`); its window lives in the UI
// (src/ui/views.ts `view(name, ...)`), so the core stays testable without a DOM.

import type { Game, Inst, Line, Rarity, Roll } from './types';

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

/** which way a number is better: up (damage, range) or down (cooldown, lag). Keys left out never roll:
 *  picture-only ones (res, fps, colors, flicker) and flags (slots, chill) */
export const BETTER: Record<string, 'up' | 'down'> = {
  range: 'up', damage: 'up', radius: 'up', hp: 'up', regen: 'up', armour: 'up', mend: 'up', thorns: 'up', haste: 'up',
  heatproof: 'up', glow: 'up', drain: 'up', power: 'up', speed: 'up', pace: 'up', plan: 'up', span: 'up', reveal: 'up',
  keep: 'up', tithe: 'up', fov: 'up', ahead: 'up', rate: 'up',
  cooldown: 'down', recharge: 'down', noise: 'down', lag: 'down', blur: 'down', refresh: 'down', loud: 'down', every: 'down', spread: 'down',
};

/** what a module is, rarity and name: v2 rarity rides on the item and the installed module alike */
export type Modish = { mod: string; roll?: Roll; rarity?: Rarity; title?: string; level?: number; printed?: boolean };
/** v2 rarity: fine and rare move the module's key number its better way */
export const RARITY_MULT: Partial<Record<Rarity, number>> = { fine: 1.15, rare: 1.3 };
/** the number rarity works: a weapon's damage, an eye's range, a lamp's radius, a generator's power, else the
 *  first that rolls (the altar's key, src/world/altar.ts, plus power) */
export function rarityKey(m: { mod: string }): string | null {
  const d = MODS[m.mod];
  if (!d) return null;
  const first = ({ weapon: 'damage', camera: 'range', lamp: 'radius', power: 'power' } as Record<string, string>)[d.family];
  if (first && typeof d.params[first] === 'number') return first;
  return Object.entries(d.params).find(([k, v]) => typeof v === 'number' && BETTER[k])?.[0] ?? null;
}
export const rarityOf = (m: Modish): Rarity => m.rarity ?? 'common';
/** the traits an item and its installed module share (roll, rarity, title): copied on install and remove */
export const traits = (m: Modish) => ({ roll: m.roll, rarity: m.rarity, title: m.title, level: m.level, ...(m.printed ? { printed: true } : {}) });

/** v3 modules (Maks 10-18: fewer finds, duplicates upgrade): levels I..III. Each level moves the module's ONE key
 *  number (levelKey) by LEVEL_STEP its better way; a power module gives +1 power a level instead */
export const MAX_LEVEL = 3;
export const LEVEL_STEP = 0.35;
export const moduleLevel = (m: { level?: number }): number => Math.max(1, Math.min(MAX_LEVEL, m.level ?? 1));
export const ROMAN = ['', 'I', 'II', 'III'];
/** the number a level works: a weapon's damage, an eye's range, a radar's range, legs' speed or pace, a lamp's radius, power */
export function levelKey(m: { mod: string }): string | null {
  const d = MODS[m.mod];
  if (!d) return null;
  const first = ({ weapon: ['damage', 'cooldown'], camera: ['range'], scanner: ['range'], lamp: ['radius'], power: ['power'], gait: ['speed', 'pace'] } as Record<string, string[]>)[d.family]?.find((k) => typeof d.params[k] === 'number');
  return first ?? rarityKey(m);
}
/** how high it goes: modules with no key number (the slot board, the stepper relay) stay at I */
export const maxLevel = (m: { mod: string }): number => (levelKey(m) ? MAX_LEVEL : 1);
/** "nail psalm II": the name with its level (I is left off) */
export const levelTag = (m: { level?: number }): string => (moduleLevel(m) > 1 ? ' ' + ROMAN[moduleLevel(m)] : '');
/** v5 (Maks 10-18 20:00: "upgrading eye module should change resolution and add colors"): an eye's level sharpens
 *  its whole picture too, by level I..III (colours 0 = full colour stays full); its tone steps in src/sight/layers.ts */
export const EYE_LEVEL: Record<string, number[]> = { res: [1, 1, 1.4, 1.8], colors: [1, 1, 1.6, 2.4], fps: [1, 1, 1.25, 1.5] };

/** a parameter with the find's roll (and its rarity) applied */
export function param<T extends Param>(inst: Modish, key: string, fallback?: T): T {
  let v = def(inst).params[key] ?? fallback;
  if (inst.roll && inst.roll.key === key && typeof v === 'number') v = v * inst.roll.mult;
  const r = inst.rarity && RARITY_MULT[inst.rarity];
  if (r && typeof v === 'number' && BETTER[key] && key === rarityKey(inst)) v = BETTER[key] === 'down' ? v / r : v * r;
  const lv = moduleLevel(inst);
  if (lv > 1 && typeof v === 'number' && key === levelKey(inst)) {
    if (def(inst).family === 'power') v = v + (lv - 1);
    else {
      const m = 1 + LEVEL_STEP * (lv - 1);
      v = BETTER[key] === 'down' ? v / m : v * m;
    }
  }
  if (lv > 1 && typeof v === 'number' && v > 0 && EYE_LEVEL[key] && def(inst).family === 'camera') v = Math.round(v * EYE_LEVEL[key][lv]);
  return v as T;
}

/** the name on screen: "pinhole eye", "attuned pinhole eye", "fine dawn eye", a unique's title */
export function label(item: Modish): string {
  if (item.title) return item.title + levelTag(item) + (item.roll ? ` (${item.roll.tag})` : '');
  const r = item.rarity === 'fine' || item.rarity === 'rare' ? item.rarity + ' ' : '';
  return r + (item.roll ? item.roll.tag + ' ' : '') + def(item).name + levelTag(item);
}

/** slots it fills on the board: most take one, a few heavy ones two (`params.size`, v2 asks) */
export const size = (m: { mod: string }): number => Math.max(1, Math.round(Number(def(m).params.size ?? 1)));
/** slots the installed modules fill */
export const slotsUsed = (g: Game): number => g.player.installed.reduce((s, i) => s + size(i), 0);
/** v2r4 ux: the reins bring a socket of their own (src/body/fps.ts grows it once a pair is in): the first pair fits
 *  with every slot full. The games whose socket has grown */
export const socketed = new WeakSet<Game>();
export const ownSocket = (g: Game, it: { mod: string }): number => (MODS[it.mod]?.params?.what === 'reins' && !socketed.has(g) ? 1 : 0);

export const working = (g: Game, inst: Inst): boolean => inst.on && g.t >= inst.readyAt;

/** installed modules of a family that are on and warm */
export function active(g: Game, fam: Family): Inst[] {
  return g.player.installed.filter((i) => def(i).family === fam && working(g, i));
}

export function powerMax(g: Game): number {
  let p = g.player.core;
  for (const i of g.player.installed) if (def(i).family === 'power' && i.on) p += Math.round(param<number>(i, 'power', 0)) + Number(i.data.bonus ?? 0);
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
  delete inst.data.powerOff;
  g.events.push({ type: 'warm', data: inst.uid });
  // v2r4 run: power back (a heart-shard in): what went off for want of power comes back on, as much as fits
  if (d.family === 'power') {
    const back = g.player.installed.filter((i) => !i.on && i.data.powerOff !== undefined && !switchOn(g, i));
    if (back.length) g.log.push([`power back: ${back.map((i) => label(i)).join(', ')} on again.`]);
  }
  return null;
}

export function switchOff(g: Game, inst: Inst): void {
  inst.on = false;
  // a power module going off may leave others over the cap: switch off the newest until it fits
  const on = g.player.installed.filter((i) => i.on);
  const lost: Inst[] = [];
  while (powerUsed(g) > powerMax(g) && on.length) {
    const last = on.pop()!;
    if (def(last).family !== 'power') (last.on = false), (last.data.powerOff = g.t), lost.push(last);
  }
  // (v2r4 run: this was silent, and the survey spool stayed off after more power came in)
  if (lost.length) g.log.push([`not enough power: ${lost.map((i) => label(i)).join(', ')} off. more power turns ${lost.length > 1 ? 'them' : 'it'} back on.`]);
}

export function tickMods(g: Game, dt: number): void {
  for (const inst of g.player.installed) {
    if (!working(g, inst)) continue;
    families[def(inst).family]?.tick?.(g, inst, dt);
  }
}
