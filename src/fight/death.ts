// What the death card tells (playtest r1: "death teaches nothing"): who took you, the last blows you
// took, and one line on what would have helped, by rule. Pure: src/main.ts draws the card.
import { ENEMIES, hurtHooks } from '../core/game';
import type { Game } from '../core/types';
import { def, param } from '../core/mods';
import { ZONES, zoneAt, HEAT } from '../world/zones';
import { light } from '../sight/lamp';
import { perceives } from '../mods/sense';
import { clock } from '../end/timeline';
import { ELITE } from '.';
import { BOSS, bossesNear } from './bosses';

export interface Blow { type: string; name: string; n: number; t: number; seen: boolean; id?: number }
const blows = new WeakMap<Game, Blow[]>();
export const blowsOf = (g: Game): Blow[] => blows.get(g) ?? [];

// every blow that got through, with whether an eye or scanner showed its source when it landed
hurtHooks.push((g, n, from) => {
  if (n <= 0) return n;
  let list = blows.get(g);
  if (!list) blows.set(g, (list = []));
  const furnace = !from && zoneAt(g.player.x, g.player.y) === HEAT;
  const type = from?.enemy?.type ?? (furnace ? 'heat' : 'something');
  const name = from?.enemy ? ENEMIES[type]?.name ?? 'something' : furnace ? "the furnace's heat" : 'something';
  const src = from && g.ents.find((e) => e.id === from.id);
  list.push({ type, name, n, t: g.t, seen: !!src && perceives(g, src), id: from?.id });
  if (list.length > 40) list.shift();
  return n;
});

/** one line on what would have helped, from who did it and where */
export function lesson(g: Game): string {
  const last = blowsOf(g).slice(-3);
  const killer = last[last.length - 1];
  if (!killer) return 'mend before the next fight.';
  // playtest r3: it recommended the bell a swap had switched off
  const wpn = g.player.installed.filter((i) => def(i).family === 'weapon');
  if (wpn.length && !wpn.some((i) => i.on)) return `your ${def(wpn[0]).name} was off: no weapon on. switch it on before the next fight.`;
  const kinds = new Set(last.map((b) => b.type));
  const dark = ZONES[zoneAt(g.player.x, g.player.y)].look.dark >= 0.3 && light(g) <= 0;
  if (killer.type === 'heat') return 'a rime hood, or anything heatproof, keeps the furnace off.';
  // v2r1 ux: a keeper's death said "fight from range", which floor 1 has no way to do
  // v2r5 newcomer: the queen's brood or acid took the last hp, and the card gave the swarm advice: a keeper
  // still up, or among the last blows, is the fight that took you
  const boss = BOSS[killer.type] ?? [...last].reverse().map((b) => BOSS[b.type]).find(Boolean) ?? BOSS[bossesNear(g, 10)[0]?.enemy?.type ?? ''];
  if (boss) {
    const near = g.player.installed.every((i) => def(i).family !== 'weapon' || param<number>(i, 'range', 1.5) < 3);
    const how = boss.floor === 0 || near ? 'up close, between its blows' : 'from range, out of its blows';
    return `${boss.hint} fight it ${how}; and before its door, a stronger weapon or more hp (where weighs you there).`;
  }
  if (ELITE.includes(killer.type)) {
    const how = { warden: 'step aside when it draws breath', abbot: 'step back when it lifts its arm, two cells away when it raises both arms', saint: 'come at it on a diagonal, off its lines' }[killer.type];
    return `a stronger weapon or a heal first; and ${how}.`;
  }
  if (killer.type === 'hum') return 'sonar, a heat eye or a bone-listener shows the hum; colour eyes never do.';
  if (killer.type === 'mimic') return 'a lodestone or sonar shows a mimic before you reach for it.';
  if (dark && !killer.seen) return 'light or sonar: you could not see what hit you.';
  // mites stack on one cell, so a corridor does not split them; walking off does (you outpace them)
  // v2r5 newcomer: never suggest the bell you already have on
  const many = g.player.installed.find((i) => i.on && def(i).family === 'weapon' && param<string>(i, 'aim', 'auto') !== 'aimed');
  if (many && (last.filter((b) => b.type === 'mite').length >= 2 || kinds.size > 1)) return `back off so they come at you one by one, into your ${def(many).name}: mites are slower than you, and a pack split is a pack beaten.`;
  if (last.filter((b) => b.type === 'mite').length >= 2) return 'something that hits many (a censer flail, a bell), or walk back the way you came: mites are slower than you.';
  if (kinds.size > 1) return 'something that hits many (a bell, a flail), or back off so they come at you one by one.';
  if (killer.type === 'seraph' || killer.type === 'pyre') return 'step out of its line: a lamp only fires down its row or column.';
  if (killer.type === 'walker') return 'step back when it lifts its arm.';
  if (!killer.seen) return 'an eye on the threat: turn to what hits you, or carry a scanner.';
  const ranged = g.player.installed.some((i) => def(i).family === 'weapon' && param<number>(i, 'range', 1.5) >= 3);
  return ranged ? 'mend to full before the next fight, or fight from range.' : 'mend to full before the next fight, or find a second weapon.';
}

/** blows of one kind within this many seconds read as one volley */
const AT_ONCE = 0.12;
export interface Volley { type: string; name: string; n: number; t: number; seen: boolean; count: number }
/** the blows, same-kind ones landing together grouped (r2: a swarm read as "−0.5 ×3" and hid −3 volleys) */
export function volleys(list: Blow[]): Volley[] {
  const out: Volley[] = [];
  for (const b of list) {
    const v = out[out.length - 1];
    if (v && v.type === b.type && b.t - v.t <= AT_ONCE) Object.assign(v, { n: v.n + b.n, count: v.count + 1, seen: v.seen || b.seen });
    else out.push({ type: b.type, name: b.name, n: b.n, t: b.t, seen: b.seen, count: 1 });
  }
  return out;
}

/** the card's lines: who took you, the last three blows (a volley counts as one) */
export function deathInfo(g: Game): { killer: string; blows: string[]; lesson: string; killerId?: number } {
  const all = blowsOf(g);
  const last = volleys(all).slice(-3);
  const killer = last[last.length - 1];
  const short = (b: Volley) => b.name.replace(/^(a|an|the) /, '');
  const fmt = (b: Volley) =>
    `${b.count > 1 ? (BOSS[b.type] ? `${short(b)} ×${b.count}` : `${b.count} ${short(b)}s at once`) : short(b)} −${b.n.toFixed(1)} hp at ${clock(b.t)}${b.seen ? '' : ' (unseen)'}`;
  return {
    killer: killer ? `${killer.name} took you` : 'something took you',
    blows: last.map(fmt),
    lesson: lesson(g),
    killerId: all[all.length - 1]?.id,
  };
}
