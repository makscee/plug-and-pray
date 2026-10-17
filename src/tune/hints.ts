// Play-through tuning (#1328): what a blind new player is told, once, so the first minutes read from
// the console alone. When the legs first work, the console says where the spark and the card reader
// are, in compass words and cells, with a button that walks that way.

import { active, param } from '../core/mods';
import { say, tickHooks } from '../core/game';
import type { Game, Line } from '../core/types';

const told = new WeakSet<Game>();

function toward(g: Game, mod: string, sound: string): Line | null {
  const p = g.player;
  const e = g.ents.find((e) => e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === mod && !e.data?.mimic);
  if (!e || g.player.inv.some((i) => i.kind === 'mod' && i.mod === mod)) return null;
  const [dx, dy] = [e.x - p.x, e.y - p.y];
  const word = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 45) % 8];
  const ax = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
  return [`${sound}, ${Math.round(Math.hypot(dx, dy))} cells ${word}.  `, { text: `go ${ax} 9`, cmd: `go ${ax} 9` }];
}

tickHooks.push((g) => {
  if (told.has(g) || !active(g, 'gait').some((i) => param(i, 'go', false))) return;
  told.add(g);
  const lines = [toward(g, 'dawn-eye', 'a clear eye glints, waiting for a socket'), toward(g, 'card-reader', 'a card reader ticks, waiting for a card')].filter((l): l is Line => !!l);
  if (lines.length) say(g, 'you hear:', ...lines, ['the walls bend; ', { text: 'listen', cmd: 'listen' }, ' finds the way.']);
});
