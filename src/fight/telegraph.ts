// Line telegraphs in the eye (v2r2 fight: an 8-line star read as a carpet of red dashes; you could not tell which
// line you stood on). On top of the centre marks (src/fight/bosses.ts marks), each line zone gets its two edges
// marked, so it reads as a band, and the ways between a boss's lines get pale gap markers: stand there.
// Props only (`data.edge`, `data.gap`), drawn by src/sight/scene.ts; the browser loads this, the sims do not.
import { spawn, tickHooks } from '../core/game';
import { open } from '../core/grid';
import type { Game } from '../core/types';
import { BOSS, coldMarks, inZone, type Zone } from './bosses';

type Line = Extract<Zone, { k: 'line' }>;

/** edge marks every this many cells, and the gap markers at these distances from the boss */
const EDGE_STEP = 0.55;
const GAP_AT = [2, 3, 4, 5];

/** the band's two edges and the gaps between a boss's lines: [x, y, gap?] */
export function telegraph(lines: Line[], all: Zone[]): [number, number, boolean][] {
  const out: [number, number, boolean][] = [];
  for (const z of lines) {
    const off = z.w * 0.9;
    const [nx, ny] = [-z.vy * off, z.vx * off];
    for (let s = 0.8; s <= z.len; s += EDGE_STEP) for (const k of [1, -1]) out.push([z.x + z.vx * s + nx * k, z.y + z.vy * s + ny * k, false]);
  }
  // gaps: lines that share an origin (a cross, a saltire, a star), the bisector of each neighbouring pair
  if (lines.length >= 2) {
    const [ox, oy] = [lines[0].x, lines[0].y];
    const angs = lines.filter((z) => Math.hypot(z.x - ox, z.y - oy) < 0.01).map((z) => Math.atan2(z.vy, z.vx)).sort((a, b) => a - b);
    for (let k = 0; k < angs.length; k++) {
      const a0 = angs[k];
      const a1 = k + 1 < angs.length ? angs[k + 1] : angs[0] + Math.PI * 2;
      const mid = (a0 + a1) / 2;
      for (const r of GAP_AT) {
        const [x, y] = [ox + Math.cos(mid) * r, oy + Math.sin(mid) * r];
        if (!all.some((z) => inZone(z, x, y))) out.push([x, y, true]);
      }
    }
  }
  return out;
}

const shown = new WeakMap<Game, string>();
tickHooks.push((g) => {
  const want: [number, number, boolean][] = [];
  for (const e of g.ents) {
    const zs = e.enemy?.data.zones as Zone[] | null | undefined;
    if (!zs || !BOSS[e.enemy!.type]) continue;
    const lines = zs.filter((z): z is Line => z.k === 'line');
    if (lines.length) want.push(...telegraph(lines, zs));
  }
  const key = want.map(([x, y, gap]) => `${x.toFixed(1)},${y.toFixed(1)}${gap ? 'g' : ''}`).join(';');
  if (shown.get(g) === key) return;
  shown.set(g, key);
  g.ents = g.ents.filter((x) => !x.data?.edge && !x.data?.gap);
  const cold = coldMarks(g);
  for (const [x, y, gap] of want) if (open(g, x, y)) spawn(g, { kind: 'prop', x, y, data: gap ? { gap: true } : cold ? { edge: true, cold } : { edge: true } });
});
