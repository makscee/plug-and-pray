// The eye-codex: the first time an eye shows each kind of enemy, the altars, printers and reliquaries,
// the console prints what it is and what it does, and that eye's frame flashes. Once per run per kind
// (playtest r1: "first sight is a reveal"). `codex` lists what you have seen.

import { dist, ENEMIES, say } from '../core/game';
import { clear } from '../core/grid';
import { param } from '../core/mods';
import type { Entity, Game, Inst } from '../core/types';
import { verb } from '../core/verbs';
import { WARM } from '../mods/sense';

/** a line per kind: what it is, then what it does */
export const CODEX: Record<string, string> = {
  mite: 'a beetle that sang in the choir once. alone it is nothing, and it is never alone: it bites up close, so hit many at once.',
  seraph: 'a wheel of eyes nailed to the air. it never moves; it fires slow orbs down its line of sight: step out of the line.',
  pyre: 'a seraph of the furnace, burning. it never moves and fires faster than its cold kin: step out of its line.',
  walker: 'bone that walks, slow and cold. it lifts its arm before it strikes: step back. small blows glance off it, and a heat eye never shows it.',
  hum: 'a knot of smoke with eyes. no clear eye shows it: only sonar and heat do, and only then can your weapons find it.',
  mimic: 'a reliquary that wanted to be opened. it lay as loot; a heat or black & white eye sees it breathe, sonar wakes it early.',
  warden: 'the choir warden: a mite grown huge and haloed, guarding a shard. fast and hard-biting: bring a second weapon, or a bell for its choir.',
  abbot: 'the bone abbot: guards the second shard. it lifts its arm, then hits for four: step back. when it raises both arms it sweeps: get two cells away.',
  saint: 'the furnace saint: guards the last shard and the engine. it does not move; its fire crosses the room.',
  altar: 'an altar, stained and patient. offer what you gather for power, flesh or mending, or attune and temper a module.',
  printer: 'a printer of the old machines. feed it bone and glass: it prints a slot, a module, or (for copper more) one kind of module.',
  shop: 'a reliquary. it sells modules, rerolls its offers, and takes what you recycle.',
};

const NAMES: Record<string, string> = { altar: 'altar', printer: 'printer', shop: 'reliquary' };
const name = (k: string) => NAMES[k] ?? (ENEMIES[k]?.name ?? k).replace(/^(a|an|the) /, '');

const seen = new WeakMap<Game, string[]>();
export const codexOf = (g: Game): string[] => {
  let s = seen.get(g);
  if (!s) seen.set(g, (s = []));
  return s;
};

/** a thing's codex kind, or none */
export function kindOf(e: Entity): string | null {
  if (e.enemy) return CODEX[e.enemy.type] ? e.enemy.type : null;
  if (e.kind === 'printer') return e.data?.shop ? 'shop' : 'printer';
  if (e.data?.altar) return 'altar';
  return null;
}

/** does this eye show it now: in range, in the cone, not behind a wall (heat sees warmth through stone) */
export function shows(g: Game, inst: Inst, e: Entity, range: number): boolean {
  const p = g.player;
  const f = param<string>(inst, 'filter', 'color');
  const d = dist(e, p);
  if (d > range) return false;
  if (e.enemy) {
    const type = e.enemy.type;
    if (ENEMIES[type]?.hidden && f !== 'sonar' && f !== 'heat') return false;
    if (f === 'heat' && !WARM.has(type)) return false;
  }
  if (d > 0.6) {
    const a = Math.atan2(e.x - p.x, -(e.y - p.y)) - p.dir;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > ((param<number>(inst, 'fov', 60) / 2) * Math.PI) / 180) return false;
  }
  return f === 'heat' || clear(g, p.x, p.y, e.x, e.y);
}

/** an eye's frame just shot: anything new in it goes in the codex. True when something did (flash). */
export function firstSight(g: Game, inst: Inst, range: number): boolean {
  const list = codexOf(g);
  let any = false;
  for (const e of g.ents) {
    const k = kindOf(e);
    if (!k || list.includes(k) || !shows(g, inst, e, range)) continue;
    list.push(k);
    any = true;
    g.events.push({ type: 'codex', at: [e.x, e.y], data: k });
    say(g, [`◆ first sight · ${name(k)}: ${CODEX[k]}`]);
  }
  return any;
}

verb('codex', {
  help: 'what your eyes have shown you so far',
  when: (g) => codexOf(g).length > 0,
  run(g) {
    for (const k of codexOf(g)) say(g, `◆ ${name(k)}: ${CODEX[k]}`);
  },
});
