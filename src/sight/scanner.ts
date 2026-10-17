// Scanners: a small radial window of what its `sees` list picks up within `range`, through walls,
// refreshed every `refresh` s. `scan` is pure (tested); the view draws the blips, your facing up.

import { cell, Cell, veinOf } from '../core/grid';
import { ENEMIES } from '../core/game';
import { family, param } from '../core/mods';
import type { Game, Inst } from '../core/types';
import { view } from '../ui/views';

export type Sense = 'heat' | 'metal' | 'flesh' | 'doors' | 'cards' | 'enemies' | 'veins';
export interface Blip {
  x: number;
  y: number;
  sense: Sense;
}

/** a one-cell conduit: floor with walls on both sides across it */
function conduit(g: Game, x: number, y: number): boolean {
  if (cell(g, x, y) !== Cell.floor) return false;
  const wall = (dx: number, dy: number) => cell(g, x + dx, y + dy) !== Cell.floor;
  return (wall(1, 0) && wall(-1, 0)) || (wall(0, 1) && wall(0, -1));
}

/** what a scanner picks up now: every thing its senses know within range (and its cone) */
export function scan(g: Game, inst: { mod: string; roll?: Inst['roll'] }): Blip[] {
  const p = g.player;
  const range = param<number>(inst, 'range', 6);
  const sees = new Set(param<string[]>(inst, 'sees', ['enemies']) as Sense[]);
  const cone = param<string>(inst, 'shape', 'ring') === 'cone';
  const inShape = (x: number, y: number) => {
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.hypot(dx, dy) > range) return false;
    if (!cone || Math.hypot(dx, dy) < 0.5) return true;
    let a = Math.atan2(dx, -dy) - p.dir;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.abs(a) <= Math.PI / 4;
  };
  const out: Blip[] = [];
  for (const e of g.ents) {
    if (!inShape(e.x, e.y)) continue;
    if (e.enemy) {
      const hidden = ENEMIES[e.enemy.type]?.hidden;
      if (sees.has('heat')) out.push({ x: e.x, y: e.y, sense: 'heat' });
      else if (sees.has('flesh')) out.push({ x: e.x, y: e.y, sense: 'flesh' });
      else if (sees.has('enemies') && !hidden) out.push({ x: e.x, y: e.y, sense: 'enemies' });
    } else if (e.kind === 'printer' || (e.item && e.item.kind !== 'card')) {
      if (sees.has('metal')) out.push({ x: e.x, y: e.y, sense: 'metal' });
    } else if (e.item?.kind === 'card' && sees.has('cards')) out.push({ x: e.x, y: e.y, sense: 'cards' });
  }
  if (sees.has('doors') || sees.has('veins')) {
    const r = Math.ceil(range);
    for (let y = Math.floor(p.y) - r; y <= Math.floor(p.y) + r; y++)
      for (let x = Math.floor(p.x) - r; x <= Math.floor(p.x) + r; x++) {
        if (!inShape(x + 0.5, y + 0.5)) continue;
        if (sees.has('veins') && veinOf(cell(g, x, y))) out.push({ x: x + 0.5, y: y + 0.5, sense: 'veins' });
        else if (sees.has('doors') && conduit(g, x, y)) out.push({ x: x + 0.5, y: y + 0.5, sense: 'doors' });
      }
  }
  return out;
}

const INK: Record<Sense, string> = {
  heat: '#ff7a3a',
  flesh: '#e8506a',
  enemies: '#f0e4c8',
  metal: '#9ab8d0',
  cards: '#e8d070',
  doors: '#6a8a6a',
  veins: '#c04070',
};

family('scanner', {
  status: (g, inst) => {
    const b = scan(g, inst);
    return [[b.length ? `${b.length} things within ${param<number>(inst, 'range', 6)} cells.` : 'nothing within range.']];
  },
});

view('scanner', (el, inst) => {
  const S = 120;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  canvas.className = 'scan';
  el.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let blips: Blip[] = [];
  let at = -99;
  return {
    update(g) {
      const warm = inst.on && g.t >= inst.readyAt;
      ctx.fillStyle = '#050605';
      ctx.fillRect(0, 0, S, S);
      if (!warm) return;
      const refresh = param<number>(inst, 'refresh', 1);
      if (g.t - at >= refresh) {
        blips = scan(g, inst);
        at = g.t;
      }
      const range = param<number>(inst, 'range', 6);
      const k = (S / 2 - 4) / range;
      const p = g.player;
      const cone = param<string>(inst, 'shape', 'ring') === 'cone';
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.strokeStyle = '#1c2a1c';
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(0, 0, ((S / 2 - 4) * r) / 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (cone) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, S / 2 - 4, -Math.PI * 0.75, -Math.PI * 0.25);
        ctx.closePath();
        ctx.stroke();
      }
      // the sweep: how far the next refresh is
      const f = Math.min(1, (g.t - at) / refresh);
      ctx.strokeStyle = '#2e4a2e';
      ctx.beginPath();
      ctx.arc(0, 0, (S / 2 - 4) * f, 0, Math.PI * 2);
      ctx.stroke();
      // your facing points up
      ctx.rotate(-p.dir);
      const fade = 1 - f * 0.6;
      for (const b of blips) {
        ctx.globalAlpha = fade;
        ctx.fillStyle = INK[b.sense];
        const x = (b.x - p.x) * k;
        const y = (b.y - p.y) * k;
        const s = b.sense === 'doors' || b.sense === 'veins' ? 2 : 4;
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f0e4c8';
      ctx.fillRect(S / 2 - 1, S / 2 - 1, 3, 3);
    },
  };
});
