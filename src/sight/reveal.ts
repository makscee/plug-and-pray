// What the map spool draws: cells you have seen. Pure (no three, no DOM), so the world's map spool
// and the eyes share it. A cell is seen when it lies within `range` and a straight line from you
// reaches it through open floor (its own wall face counts: you see the wall that stops the line).

import { clear, edits } from '../core/grid';
import type { Game } from '../core/types';

const last = new WeakMap<Game, Map<number, string>>();

/** mark the cells within `range` that you can see from where you stand */
export function see(g: Game, range: number): void {
  const p = g.player;
  const i = Math.floor(p.x);
  const j = Math.floor(p.y);
  // the same cell and range as last time sees the same cells (unless a vein was drained: rare)
  let m = last.get(g);
  if (!m) last.set(g, (m = new Map()));
  const k = `${i},${j},${g.chunks.size},${edits}`;
  if (m.get(range) === k) return;
  m.set(range, k);
  const r = Math.ceil(range);
  for (let y = j - r; y <= j + r; y++)
    for (let x = i - r; x <= i + r; x++) {
      if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > range) continue;
      const key = `${x},${y}`;
      if (g.seen.has(key)) continue;
      // aim at the near side of the cell, so a wall's face is reached before the wall itself blocks
      const tx = x + 0.5 - Math.sign(x + 0.5 - p.x) * 0.45;
      const ty = y + 0.5 - Math.sign(y + 0.5 - p.y) * 0.45;
      if (clear(g, p.x, p.y, tx, ty)) g.seen.add(key);
    }
}
