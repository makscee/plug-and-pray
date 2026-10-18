// What the eyes and the HUD need to show a fight: when each enemy was last hit, where things died
// (a puff of dust), which enemies are after you, and red dots for them on the map spool.

import { dist, ENEMIES, tickHooks } from '../core/game';
import { clear } from '../core/grid';
import type { Entity, Game } from '../core/types';
import { mapHooks } from '../world/mind';

export interface Puff {
  x: number;
  y: number;
  t: number;
  type: string;
}

/** recent deaths, per game, for the eyes to draw as dust */
export const puffs = new WeakMap<Game, Puff[]>();
export const PUFF_TIME = 0.5;

tickHooks.push((g) => {
  for (const ev of g.events) {
    if (ev.type === 'hit') {
      const e = g.ents.find((x) => x.id === ev.data);
      if (e?.enemy) e.enemy.data.hitAt = g.t;
    } else if (ev.type === 'kill') {
      let list = puffs.get(g);
      if (!list) puffs.set(g, (list = []));
      list.push({ x: ev.at![0], y: ev.at![1], t: g.t, type: String(ev.data) });
    }
  }
  const list = puffs.get(g);
  if (list?.length) puffs.set(g, list.filter((p) => g.t - p.t < PUFF_TIME));
  // full hp is what it had when first seen alive: zones scale it, so read it off the enemy itself
  for (const e of g.ents) if (e.enemy && e.enemy.data.maxHp === undefined) e.enemy.data.maxHp = e.enemy.hp;
});

/** the moment an enemy last struck (its cooldown restarted), or -inf */
export const struckAt = (e: Entity): number => (e.enemy ? e.enemy.readyAt - (ENEMIES[e.enemy.type]?.cooldown ?? 1) : -Infinity);

/** enemies that noticed you and are near, nearest first; the hidden ones only when `hidden` */
export function engaged(g: Game, range = 9, hidden = false): Entity[] {
  const p = g.player;
  return g.ents
    .filter((e) => e.enemy && e.enemy.data.noticed && dist(e, p) <= range && (hidden || !ENEMIES[e.enemy.type]?.hidden))
    .sort((a, b) => dist(a, p) - dist(b, p));
}

// the map spool marks enemies you can see from where you stand as red dots
mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const p = g.player;
  for (const e of g.ents) {
    if (!e.enemy || ENEMIES[e.enemy.type]?.hidden || dist(e, p) > 9 || !clear(g, p.x, p.y, e.x, e.y)) continue;
    const r = Math.max(2, px * 0.7);
    ctx.fillStyle = '#000';
    ctx.fillRect((e.x - ox) * px - r - 1, (e.y - oy) * px - r - 1, r * 2 + 2, r * 2 + 2);
    ctx.fillStyle = e.enemy.data.noticed ? '#ff3a28' : '#a04030';
    ctx.fillRect((e.x - ox) * px - r, (e.y - oy) * px - r, r * 2, r * 2);
  }
});
