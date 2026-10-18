// What the map spool draws: cells you have seen. Pure (no three, no DOM), so the world's map spool
// and the eyes share it. A cell is seen when it lies within `range` and a straight line from you
// reaches it through open floor (its own wall face counts: you see the wall that stops the line).
//
// v2 (Maks 10-18: "map should be explored depending on the eye"): each eye on writes what it actually
// perceives, every frame it takes (1/fps): rays across its view cone, one per pixel column (its
// resolution), out to its range, which in the dark is your light (src/mods/sense.ts eyeRange). A ray
// stops at the first wall, unless the eye sees through walls (heat: its whole range; sonar: a few cells
// into the stone); what it passes after a wall is a rumour (src/sight/know.ts `through`), never empty.

import { cell, Cell, clear, edits } from '../core/grid';
import { ENEMIES, tickHooks } from '../core/game';
import { active, param } from '../core/mods';
import type { Game, Inst } from '../core/types';
import { eyeRange, WARM } from '../mods/sense';
import { ck, mark, seeThrough } from './know';

const last = new WeakMap<Game, Map<number, string>>();

/** mark the cells within `range` that you can see from where you stand, all round (stagings, tests) */
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

export interface Eye {
  /** view cone, degrees */
  fov: number;
  /** cells it sees, after the dark */
  range: number;
  /** rays across the cone: its picture's width in pixels */
  rays: number;
  /** cells past the first wall it still perceives (0: walls stop it) */
  through: number;
}

/** filters that see through walls, and how far into the stone */
export const THROUGH: Record<string, number> = { heat: 99, sonar: 3 };

/** an installed eye's sight now */
export function eyeOf(g: Game, inst: Inst): Eye {
  const f = param<string>(inst, 'filter', 'color');
  return { fov: param<number>(inst, 'fov', 60), range: eyeRange(g, inst), rays: Math.round(param<number>(inst, 'res', 32)), through: THROUGH[f] ?? 0 };
}

/** write what one eye sees from where you stand and face: seen cells, and rumours past walls */
export function look(g: Game, eye: Eye): void {
  const p = g.player;
  const half = ((eye.fov / 2 + 4) * Math.PI) / 180;
  const rays = Math.max(12, Math.min(96, eye.rays));
  const step = 0.2;
  // the cell you stand in, and the ones you touch
  g.seen.add(ck(Math.floor(p.x), Math.floor(p.y)));
  for (let k = 0; k < rays; k++) {
    const a = p.dir - half + (2 * half * (k + 0.5)) / rays;
    const [dx, dy] = [Math.sin(a), -Math.cos(a)];
    let walls = 0;
    let past = 0;
    let prev = '';
    for (let d = step; d <= eye.range; d += step) {
      const x = Math.floor(p.x + dx * d);
      const y = Math.floor(p.y + dy * d);
      const key = ck(x, y);
      if (key === prev) continue;
      prev = key;
      const wall = cell(g, x, y) !== Cell.floor;
      if (!walls) {
        g.seen.add(key);
        if (wall) {
          walls++;
          if (!eye.through) break;
        }
        continue;
      }
      if (++past > eye.through) break;
      seeThrough(g, x, y);
    }
  }
}

/** the eyes' frames: each eye on writes what it sees, as often as it takes a picture */
const lastLook = new WeakMap<Inst, { at: number; sig: string }>();
tickHooks.push((g) => {
  const p = g.player;
  for (const inst of active(g, 'camera')) {
    const fps = Math.max(1, param<number>(inst, 'fps', 2));
    const was = lastLook.get(inst);
    if (was && g.t - was.at < 1 / fps) continue;
    const eye = eyeOf(g, inst);
    const sig = `${Math.round(p.x * 4)},${Math.round(p.y * 4)},${Math.round(p.dir * 20)},${eye.range.toFixed(1)},${edits},${g.chunks.size}`;
    if (was?.sig === sig) {
      was.at = g.t;
      continue;
    }
    lastLook.set(inst, { at: g.t, sig });
    look(g, eye);
    if (eye.through) warmBehind(g, inst, eye);
  }
});

/** a heat eye shows warm things through walls: a blob where it saw one, never a sure cell (it may miss more) */
function warmBehind(g: Game, inst: Inst, eye: Eye): void {
  if (param<string>(inst, 'filter', '') !== 'heat') return;
  const p = g.player;
  const half = ((eye.fov / 2 + 4) * Math.PI) / 180;
  for (const e of g.ents) {
    if (!e.enemy || !WARM.has(e.enemy.type)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > eye.range || d < 1) continue;
    const a = Math.atan2(e.x - p.x, -(e.y - p.y)) - p.dir;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > half) continue;
    if (clear(g, p.x, p.y, e.x, e.y)) continue;
    mark(g, { key: `warm:${e.id}`, kind: 'life', x: e.x, y: e.y, r: 1.5, what: 'something warm', info: `${ENEMIES[e.enemy.type]?.hidden ? 'a warmth with no shape' : 'warm, behind the stone'}: the heat eye saw it through the wall.`, at: g.t, ttl: 4, by: inst.mod });
  }
}
