// Warnings before the fights that matter (playtest r1: the warden and the swarms came with no word).
// An elite or a pack of PACK+ within WARN cells that has not noticed you yet gets one line, with the
// way it lies and a button to switch to your battle setup. Once per encounter: an elite is warned of
// again only after you were 16+ cells from its post (src/fight/index.ts).
// Playtest r2 pace: and when an elite turns to you within TURN cells, a line with how hard it hits and
// how much it takes, and whether you have a weapon on; the HUD flashes it (src/fight/ui.ts, `turned`).
import { cells, dist, ENEMIES, say, tickHooks } from '../core/game';
import { active, param } from '../core/mods';
import type { Entity, Game, Line } from '../core/types';
import { setupsOf } from '../body';

export const WARN = 12;
export const PACK = 4;
/** foes this close together are one pack */
const TOGETHER = 2.5;

const word = (g: Game, e: { x: number; y: number }) => {
  const deg = ((Math.atan2(e.x - g.player.x, -(e.y - g.player.y)) * 180) / Math.PI + 360) % 360;
  return ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round(deg / 45) % 8];
};

function warn(g: Game, text: string, at: Entity): void {
  const p = g.player;
  const line: Line = [`⚠ ${text}, ${cells(Math.round(dist(at, p)))} ${word(g, at)}. `];
  // r5: with no setup saved, `setup` only printed how to make one: offer to save the one on now
  line.push(setupsOf(g).battle ? { text: 'setup battle', cmd: 'setup battle' } : { text: 'save setup battle', cmd: 'save setup battle' });
  say(g, line);
  g.events.push({ type: 'warn', at: [at.x, at.y] });
}

export const TURN = 10;
/** the last elite that turned to you: the HUD's line, and when */
export const turned = new WeakMap<Game, { text: string; at: number }>();

function turns(g: Game, e: Entity): void {
  const d = e.enemy!.data;
  const kind = ENEMIES[e.enemy!.type];
  const hits = +(kind.damage * ((d.mult as number) ?? 1)).toFixed(1);
  const hp = Math.ceil(e.enemy!.hp);
  const armed = active(g, 'weapon').length > 0;
  const text = `${kind.name} turns to you. it hits ${hits}, it has ${hp} hp`;
  // r4 final: damage per second of what is on, × 8 s, short of its hp: say so before the fight
  const dps = active(g, 'weapon').reduce((s, i) => s + param<number>(i, 'damage', 0) / Math.max(0.1, param<number>(i, 'cooldown', 1)), 0);
  const weak = armed && dps * 8 < hp && !d.boss; // a boss is a long fight by design (src/fight/bosses.ts)
  const line: Line = [`⚠ ${text}.${!armed ? ' you have no weapon on! ' : weak ? ' your weapon may be too weak. ' : ' '}`];
  // a boss's line carries no stray button: `unstuck` there read as part of the boss (v2r1 fight)
  if (setupsOf(g).battle) line.push({ text: 'setup battle', cmd: 'setup battle' });
  else if (!d.boss) line.push({ text: 'unstuck', cmd: 'unstuck' });
  say(g, line);
  turned.set(g, { text: armed ? text : `${text} · no weapon on`, at: g.t });
  g.events.push({ type: 'warn', at: [e.x, e.y] });
}

tickHooks.push((g) => {
  const p = g.player;
  if (g.ended) return;
  // an elite that noticed you: told once per time it turns (and not again within 20 s)
  for (const e of g.ents) {
    const d = e.enemy?.data;
    if (!d?.elite) continue;
    if (!d.noticed) d.turned = false;
    else if (!d.turned && dist(e, p) <= TURN && g.t >= ((d.turnedAt as number) ?? -99) + 20) {
      d.turned = true;
      d.turnedAt = g.t;
      turns(g, e);
    }
  }
  const near = g.ents.filter((e) => e.enemy && !e.enemy.data.noticed && !ENEMIES[e.enemy.type]?.hidden && dist(e, p) <= WARN);
  for (const e of near) {
    const d = e.enemy!.data;
    if (d.warned) continue;
    if (d.elite) {
      d.warned = true;
      warn(g, `${ENEMIES[e.enemy!.type].name} waits ahead`, e);
      continue;
    }
    const pack = near.filter((o) => !o.enemy!.data.elite && dist(o, e) < TOGETHER);
    if (pack.length < PACK) continue;
    for (const o of pack) o.enemy!.data.warned = true;
    const kinds = new Set(pack.map((o) => o.enemy!.type));
    const what = kinds.size === 1 && kinds.has('mite') ? `a swarm of ${pack.length} mites` : `a pack of ${pack.length}`;
    warn(g, `${what} ahead`, e);
  }
});
