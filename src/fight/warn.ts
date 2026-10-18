// Warnings before the fights that matter (playtest r1: the warden and the swarms came with no word).
// An elite or a pack of PACK+ within WARN cells that has not noticed you yet gets one line, with the
// way it lies and a button to switch to your battle setup. Once per encounter: an elite is warned of
// again only after you were 16+ cells from its post (src/fight/index.ts).
import { dist, ENEMIES, say, tickHooks } from '../core/game';
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
  const line: Line = [`⚠ ${text}, ${Math.round(dist(at, p))} cells ${word(g, at)}. `];
  line.push(setupsOf(g).battle ? { text: 'setup battle', cmd: 'setup battle' } : { text: 'setup', cmd: 'setup' });
  say(g, line);
  g.events.push({ type: 'warn', at: [at.x, at.y] });
}

tickHooks.push((g) => {
  const p = g.player;
  if (g.ended) return;
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
