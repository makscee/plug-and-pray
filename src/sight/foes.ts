// What the eyes and the HUD need to show a fight: when each enemy was last hit, where things died
// (a puff of dust), which enemies are after you, and a mark per kind for them on the map spool.

import { dist, ENEMIES, tickHooks } from '../core/game';
import { clear } from '../core/grid';
import type { Entity, Game } from '../core/types';
import { mapHooks } from '../world/mind';
import { foeText } from '../ui/foeText';

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

/** on the map: in view range with a clear line, or a woken keeper near (never the hidden) */
export function onMap(g: Game, e: Entity): boolean {
  const p = g.player;
  // v2r3 ux: a woken keeper always shows within view range, walls or not (the bell-ringer was off the map window)
  const boss = !!e.enemy?.data.boss && !!e.enemy.data.noticed && dist(e, p) <= 16;
  return !!e.enemy && (boss || (!ENEMIES[e.enemy.type]?.hidden && dist(e, p) <= 9 && clear(g, p.x, p.y, e.x, e.y)));
}

/** v4 foes: the foe the foe window shows, picked by a click (src/ui/foes.ts); 0 for none */
export const picked = new WeakMap<Game, number>();

// the map spool marks enemies you can see from where you stand. v4 foes (Maks 10-18: "you just eat red dots"):
// each kind its own mark and colour (src/ui/foeText.ts), elites and keepers ringed gold, the picked one ringed white
mapHooks.draw.push((g, ctx, ox, oy, px) => {
  for (const e of g.ents) {
    if (!e.enemy || !onMap(g, e)) continue;
    const t = foeText(e.enemy.type);
    const big = !!e.enemy.data.boss || !!e.enemy.data.elite;
    const r = big ? Math.max(4, px * 1.1) : t.glyph === 'dot' ? Math.max(2, px * 0.6) : Math.max(3, px * 0.8);
    const [x, y] = [(e.x - ox) * px, (e.y - oy) * px];
    const shape = (k: number) => {
      const q = r + k;
      ctx.beginPath();
      if (t.glyph === 'dot') ctx.arc(x, y, q, 0, Math.PI * 2);
      else if (t.glyph === 'diamond') (ctx.moveTo(x, y - q * 1.25), ctx.lineTo(x + q * 1.25, y), ctx.lineTo(x, y + q * 1.25), ctx.lineTo(x - q * 1.25, y));
      else if (t.glyph === 'triangle') (ctx.moveTo(x, y - q * 1.2), ctx.lineTo(x + q * 1.1, y + q * 0.9), ctx.lineTo(x - q * 1.1, y + q * 0.9));
      else ctx.rect(x - q, y - q, q * 2, q * 2);
      ctx.closePath();
    };
    ctx.fillStyle = '#000';
    shape(1.5);
    ctx.fill();
    // one that has not seen you yet is dimmer
    ctx.globalAlpha = e.enemy.data.noticed ? 1 : 0.6;
    ctx.fillStyle = t.colour;
    shape(0);
    ctx.fill();
    ctx.globalAlpha = 1;
    const ring = picked.get(g) === e.id ? '#ffffff' : big ? '#ffd04a' : '';
    if (ring) {
      ctx.strokeStyle = ring;
      ctx.lineWidth = 1.5;
      shape(3);
      ctx.stroke();
    }
  }
});
