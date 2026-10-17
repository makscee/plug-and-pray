// The mimic: an item on the floor with `data.mimic`. It wakes when you come close or reach for it.
import { itemName, reach, say, tickHooks } from '../core/game';
import { VERBS } from '../core/verbs';
import type { Entity, Game } from '../core/types';
import { ENEMIES } from '../core/game';

export const WAKE = 1.1;

export function wake(g: Game, e: Entity): void {
  const dressed = e.item;
  e.kind = 'enemy';
  e.enemy = { type: 'mimic', hp: ENEMIES.mimic.hp, readyAt: g.t + 0.6, data: { noticed: true, dressed } };
  delete e.item;
  e.data = { ...e.data, mimic: false };
  g.events.push({ type: 'mimic', at: [e.x, e.y] });
  say(g, `the ${dressed ? itemName(dressed) : 'thing'} on the floor opens a mouth. a mimic.`);
}

tickHooks.push((g) => {
  for (const e of g.ents) if (e.kind === 'item' && e.data?.mimic && Math.hypot(e.x - g.player.x, e.y - g.player.y) < WAKE) wake(g, e);
});

// reaching for it wakes it too
const take = VERBS.take.run;
VERBS.take.run = (g, args) => {
  for (const e of reach(g)) if (e.data?.mimic) wake(g, e);
  take(g, args);
};
