// What you can perceive (docs/modules.md, rule 2): auto weapons strike only what an eye or a scanner
// shows you, or what is close enough to touch. The ossuary is dark (colour eyes see as far as your
// light), the hum is hidden (sonar, heat or a listening scanner find it), the furnace washes out a
// heat eye, and walkers are cold bone a heat eye never shows. The sight layer draws an eye with the
// same `eyeRange`, so what it shows is what you can hit.
import { dist, ENEMIES, REACH, say, tickHooks } from '../core/game';
import { Cell, cell, clear } from '../core/grid';
import { active, param } from '../core/mods';
import type { Entity, Game, Inst } from '../core/types';
import { ZONES, zoneAt } from '../world/zones';
import { wake } from '../fight/mimic';
import { light } from '../sight/lamp';
import { perk, throughOne } from './uniques';

export { light, loud } from '../sight/lamp';

/** warm things: what a heat eye or the heat choir shows (walkers and the abbot are cold bone) */
export const WARM = new Set(['mite', 'seraph', 'pyre', 'saint', 'warden', 'mimic', 'hum']);
/** the furnace: a heat eye sees this much of its range there */
export const WASHED = 0.35;
/** what a body glows with no lamp: an eye that needs light sees this far in the dark */
export const GLOW = 2.5;
/** seconds after a hidden thing strikes you that touch weapons can find it */
export const FELT = 1.5;

const dark = (g: Game) => ZONES[zoneAt(g.player.x, g.player.y)].look.dark >= 0.3;
const furnace = (g: Game) => zoneAt(g.player.x, g.player.y) === 3;

/** how far an eye sees here: colour and grey need light in the dark, black & white half of it;
 *  heat washes out in the furnace; sonar and outlines see their full range anywhere */
export function eyeRange(g: Game, inst: { mod: string; roll?: Inst['roll'] }): number {
  const range = param<number>(inst, 'range', 8);
  const f = param<string>(inst, 'filter', 'color');
  if (f === 'heat') return furnace(g) ? range * WASHED : range;
  if (f === 'sonar' || f === 'edge') return range;
  if (!dark(g)) return range;
  const lit = Math.max(GLOW, light(g) * 1.5);
  return Math.min(range, f === '1bit' ? lit * 2 : lit);
}

/** does this eye show that enemy now? */
function eyeSees(g: Game, inst: Inst, e: Entity): boolean {
  const f = param<string>(inst, 'filter', 'color');
  const type = e.enemy!.type;
  const pk = perk(inst);
  if (ENEMIES[type]?.hidden && f !== 'sonar' && f !== 'heat' && pk !== 'hidden') return false;
  if (f === 'heat' && !WARM.has(type)) return false;
  if (dist(e, g.player) > eyeRange(g, inst)) return false;
  // v2 unique: the saint's last lens sees through one wall
  return clear(g, g.player.x, g.player.y, e.x, e.y) || (pk === 'xray' && throughOne(g, g.player.x, g.player.y, e.x, e.y));
}

/** does this scanner pick that enemy up (through walls)? */
function scannerSees(g: Game, inst: Inst, e: Entity): boolean {
  const sees = param<string[]>(inst, 'sees', []);
  const type = e.enemy!.type;
  if (dist(e, g.player) > param<number>(inst, 'range', 6)) return false;
  if (sees.includes('flesh')) return true;
  if (sees.includes('heat')) return WARM.has(type);
  return sees.includes('enemies') && !ENEMIES[type]?.hidden;
}

/** perceived: an eye or a scanner shows it */
export function perceives(g: Game, e: Entity): boolean {
  if (!e.enemy) return false;
  return active(g, 'camera').some((i) => eyeSees(g, i, e)) || active(g, 'scanner').some((i) => scannerSees(g, i, e));
}

/** can an auto weapon go for it? the hidden only when perceived; the rest when perceived or in touch */
export function canHit(g: Game, e: Entity): boolean {
  if (!e.enemy) return false;
  // the hidden: when perceived, or for a moment after it struck you up close (you felt where it is)
  if (ENEMIES[e.enemy.type]?.hidden) return perceives(g, e) || (dist(e, g.player) <= REACH && g.t - ((e.enemy.data.felt as number) ?? -99) < FELT);
  return dist(e, g.player) <= REACH || perceives(g, e);
}

/** a mimic seen for what it is: the lodestone pulls at it, sonar hears it breathe. It wakes far off. */
export function unmasks(g: Game, e: Entity): boolean {
  const r = dist(e, g.player);
  return (
    active(g, 'scanner').some((i) => param<string[]>(i, 'sees', []).includes('metal') && r <= param<number>(i, 'range', 6)) ||
    active(g, 'camera').some((i) => param<string>(i, 'filter', '') === 'sonar' && r <= eyeRange(g, i))
  );
}

tickHooks.push((g) => {
  for (const e of [...g.ents]) {
    if (e.kind !== 'item' || !e.data?.mimic || !unmasks(g, e)) continue;
    say(g, 'something on the floor is not a thing. it knows you know.');
    wake(g, e);
  }
});

/** the conduit dowser: passages within its range go on your map, walls or not (pilots can plan through them) */
tickHooks.push((g) => {
  for (const i of active(g, 'scanner')) {
    if (!param<string[]>(i, 'sees', []).includes('doors') || g.t < ((i.data.dowsedAt as number) ?? 0)) continue;
    i.data.dowsedAt = g.t + param<number>(i, 'refresh', 3);
    const r = Math.ceil(param<number>(i, 'range', 9));
    const px = Math.floor(g.player.x);
    const py = Math.floor(g.player.y);
    for (let y = py - r; y <= py + r; y++)
      for (let x = px - r; x <= px + r; x++) if (Math.hypot(x - px, y - py) <= r && cell(g, x, y) === Cell.floor) g.seen.add(`${x},${y}`);
  }
});
