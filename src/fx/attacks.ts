// Your attacks, seen (Maks 10-18: "shooting with own weapons should also be visible, melee attacks should be
// animated"). Short-lived marks in a fixed pool: a tracer and a spark for a shot, a zap line for the spark
// finger, a ring for the bell, an arc for a swing. The fight code spawns them where a weapon strikes
// (src/fight/aim.ts, src/fight/shots.ts, src/mods/weapon.ts, src/body/fps.ts); the map (src/fight/ui.ts) and
// the first-person overlay (src/sight/fps.ts) draw them on their 2D canvases, after any eye's filter.
// No imports past types, so any slice can call it.
import type { Game, Inst } from '../core/types';

export type FxKind = 'tracer' | 'muzzle' | 'spark' | 'zap' | 'ring' | 'arc';

export interface Fx {
  kind: FxKind;
  /** game time it started and how long it lives (s) */
  t0: number;
  life: number;
  /** from (you, mostly) and to (the target); `r` a ring's or arc's reach in cells; `dir` an arc's facing */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  dir: number;
  /** a per-mark seed, for the zap's jags */
  seed: number;
  game: Game | null;
}

/** the pool: never grown past this, the oldest mark reused */
export const POOL = 48;
const pool: Fx[] = Array.from({ length: POOL }, () => ({ kind: 'spark' as FxKind, t0: -99, life: 0, x0: 0, y0: 0, x1: 0, y1: 0, r: 0, dir: 0, seed: 0, game: null }));
let head = 0;

/** how long each kind lives (s) */
export const LIFE: Record<FxKind, number> = { tracer: 0.14, muzzle: 0.08, spark: 0.22, zap: 0.16, ring: 0.3, arc: 0.22 };

export function fx(g: Game, kind: FxKind, x0: number, y0: number, x1 = x0, y1 = y0, r = 0, dir = 0): Fx {
  const f = pool[head];
  head = (head + 1) % POOL;
  f.kind = kind;
  f.t0 = g.t;
  f.life = LIFE[kind];
  [f.x0, f.y0, f.x1, f.y1, f.r, f.dir] = [x0, y0, x1, y1, r, dir];
  f.seed = (f.seed * 9301 + 49297 + head) % 233280;
  f.game = g;
  return f;
}

/** the live marks of this game, with how far through its life each is (0..1) */
export function live(g: Game, out: (f: Fx, k: number) => void): void {
  for (const f of pool) {
    if (f.game !== g) continue;
    const k = (g.t - f.t0) / f.life;
    if (k >= 0 && k < 1) out(f, k);
  }
}
export function anyLive(g: Game): boolean {
  for (const f of pool) if (f.game === g && g.t - f.t0 >= 0 && g.t - f.t0 < f.life) return true;
  return false;
}
/** the last time you fired or swung, for the first-person kick */
export const kicked = new WeakMap<Game, number>();

/** a ranged shot from you: the muzzle flash, a tracer to where it ends (`hit`: a spark there) */
export function shotFx(g: Game, x1: number, y1: number, hit: boolean): void {
  const p = g.player;
  fx(g, 'muzzle', p.x, p.y, p.x, p.y, 0, p.dir);
  fx(g, 'tracer', p.x, p.y, x1, y1);
  if (hit) fx(g, 'spark', x1, y1);
  kicked.set(g, g.t);
}

/** an auto (melee) weapon striking `to`: its look follows the weapon. The bell rings out to its reach, a sweep
 *  (the censer flail) swings an arc, the spark finger zaps, a sling flicks a tracer, the rest (the saw) slash */
export function strikeFx(g: Game, w: Inst, to: { x: number; y: number }, reach: number, sweep: boolean): void {
  const p = g.player;
  const dir = Math.atan2(to.x - p.x, -(to.y - p.y));
  if (/bell/.test(w.mod)) fx(g, 'ring', p.x, p.y, p.x, p.y, reach);
  else if (sweep) fx(g, 'arc', p.x, p.y, to.x, to.y, reach, dir);
  else if (/spark|chain|vitus/.test(w.mod)) fx(g, 'zap', p.x, p.y, to.x, to.y);
  else if (reach >= 3) fx(g, 'tracer', p.x, p.y, to.x, to.y);
  else fx(g, 'arc', p.x, p.y, to.x, to.y, Math.min(reach, 1.4), dir);
  fx(g, 'spark', to.x, to.y);
  kicked.set(g, g.t);
}

/** a zap's jagged line from a to b, `n` jags (deterministic per mark) */
function zigzag(c: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, seed: number, amp: number): void {
  const n = 5;
  const [dx, dy] = [bx - ax, by - ay];
  const len = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / len, dx / len];
  c.moveTo(ax, ay);
  for (let k = 1; k < n; k++) {
    const j = (((seed * (k + 3) * 7919) % 100) / 100 - 0.5) * 2 * amp;
    c.lineTo(ax + (dx * k) / n + nx * j, ay + (dy * k) / n + ny * j);
  }
  c.lineTo(bx, by);
}

/** the marks on a map: world cells → pixels with the map's origin and cell size */
export function drawMapFx(g: Game, c: CanvasRenderingContext2D, ox: number, oy: number, px: number): void {
  const X = (x: number) => (x - ox) * px;
  const Y = (y: number) => (y - oy) * px;
  c.save();
  c.lineCap = 'round';
  live(g, (f, k) => {
    const a = 1 - k;
    c.globalAlpha = a;
    switch (f.kind) {
      case 'muzzle': {
        const [mx, my] = [X(f.x0) + Math.sin(f.dir) * px * 0.6, Y(f.y0) - Math.cos(f.dir) * px * 0.6];
        c.fillStyle = '#fff6d0';
        c.beginPath();
        c.arc(mx, my, Math.max(3, px * 0.55) * (1 - k * 0.5), 0, Math.PI * 2);
        c.fill();
        break;
      }
      case 'tracer': {
        // a bright streak sliding from you to the end: its tail catches up as it fades
        const t = Math.min(1, k * 2.2);
        const [hx, hy] = [f.x0 + (f.x1 - f.x0) * Math.min(1, t + 0.35), f.y0 + (f.y1 - f.y0) * Math.min(1, t + 0.35)];
        const [tx, ty] = [f.x0 + (f.x1 - f.x0) * t * 0.8, f.y0 + (f.y1 - f.y0) * t * 0.8];
        for (const [col, w] of [['#000', Math.max(3, px * 0.45)], ['#ffe08a', Math.max(1.5, px * 0.22)]] as const) {
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          c.moveTo(X(tx), Y(ty));
          c.lineTo(X(hx), Y(hy));
          c.stroke();
        }
        break;
      }
      case 'spark': {
        const r = px * (0.3 + k * 0.7);
        c.strokeStyle = '#fff';
        c.lineWidth = Math.max(1.5, px * 0.18);
        c.beginPath();
        for (let i = 0; i < 4; i++) {
          const an = (i * Math.PI) / 2 + Math.PI / 4 + f.seed;
          c.moveTo(X(f.x0) + Math.cos(an) * r * 0.4, Y(f.y0) + Math.sin(an) * r * 0.4);
          c.lineTo(X(f.x0) + Math.cos(an) * r, Y(f.y0) + Math.sin(an) * r);
        }
        c.stroke();
        break;
      }
      case 'zap': {
        for (const [col, w] of [['#000', Math.max(3, px * 0.4)], ['#a8f0ff', Math.max(1.5, px * 0.18)]] as const) {
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          zigzag(c, X(f.x0), Y(f.y0), X(f.x1), Y(f.y1), f.seed + Math.floor(k * 3), px * 0.35);
          c.stroke();
        }
        break;
      }
      case 'ring': {
        const r = f.r * px * (0.25 + 0.75 * Math.sqrt(k));
        for (const [col, w] of [['#000', Math.max(4, px * 0.5)], ['#ffd070', Math.max(2, px * 0.25)]] as const) {
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          c.arc(X(f.x0), Y(f.y0), r, 0, Math.PI * 2);
          c.stroke();
        }
        break;
      }
      case 'arc': {
        // a swing: a 120° arc in front, sweeping across as it lives (canvas angles: 0 = east; ours 0 = north)
        const mid = f.dir - Math.PI / 2;
        const from = mid - Math.PI / 3, to = from + ((2 * Math.PI) / 3) * Math.min(1, 0.3 + k * 1.6);
        const r = Math.max(1, f.r) * px;
        for (const [col, w] of [['#000', Math.max(4, px * 0.5)], ['#ff9a50', Math.max(2, px * 0.28)]] as const) {
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          c.arc(X(f.x0), Y(f.y0), r, from, to);
          c.stroke();
        }
        break;
      }
    }
  });
  c.restore();
}

/** the marks in first person: a point in the world lands at its bearing across the view, lower the nearer */
export function drawFpsFx(g: Game, c: CanvasRenderingContext2D, W: number, H: number, fov: number): void {
  const p = g.player;
  const half = Math.tan(((fov / 2) * Math.PI) / 180);
  const [cx, cy] = [W / 2, H / 2];
  /** screen x, y of a world point (null when behind you) */
  const at = (x: number, y: number): [number, number] | null => {
    const [dx, dy] = [x - p.x, y - p.y];
    const [fx, fy] = [Math.sin(p.dir), -Math.cos(p.dir)];
    const along = dx * fx + dy * fy;
    if (along < 0.15) return null;
    const side = dx * -fy + dy * fx;
    return [cx + (side / along / half) * cx, cy + Math.min(H * 0.4, (H * 0.12) / along)];
  };
  const base: [number, number] = [cx + W * 0.08, H];
  c.save();
  c.lineCap = 'round';
  live(g, (f, k) => {
    c.globalAlpha = 1 - k;
    switch (f.kind) {
      case 'muzzle': {
        c.fillStyle = '#fff6d0';
        c.beginPath();
        c.arc(base[0], H - 10, 26 * (1 - k * 0.4), 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffb040';
        c.beginPath();
        c.arc(base[0], H - 10, 14, 0, Math.PI * 2);
        c.fill();
        break;
      }
      case 'tracer': {
        const end = at(f.x1, f.y1) ?? [cx, cy];
        const t = Math.min(1, k * 2.2);
        const [hx, hy] = [base[0] + (end[0] - base[0]) * Math.min(1, t + 0.45), base[1] + (end[1] - base[1]) * Math.min(1, t + 0.45)];
        const [tx, ty] = [base[0] + (end[0] - base[0]) * t * 0.85, base[1] + (end[1] - base[1]) * t * 0.85];
        for (const [col, w] of [['#000', 7], ['#ffe08a', 3]] as const) {
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          c.moveTo(tx, ty);
          c.lineTo(hx, hy);
          c.stroke();
        }
        break;
      }
      case 'spark': {
        const s = at(f.x0, f.y0);
        if (!s) break;
        const r = 10 + k * 22;
        for (const [col, w] of [['#000', 5], ['#fff', 2.5]] as const) {
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          for (let i = 0; i < 6; i++) {
            const an = (i * Math.PI) / 3 + f.seed;
            c.moveTo(s[0] + Math.cos(an) * r * 0.45, s[1] + Math.sin(an) * r * 0.45);
            c.lineTo(s[0] + Math.cos(an) * r, s[1] + Math.sin(an) * r);
          }
          c.stroke();
        }
        break;
      }
      case 'zap': {
        const end = at(f.x1, f.y1) ?? [cx, cy];
        for (const [col, w] of [['#000', 7], ['#a8f0ff', 3]] as const) {
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          zigzag(c, cx, H, end[0], end[1], f.seed + Math.floor(k * 3), 24);
          c.stroke();
        }
        break;
      }
      case 'ring': {
        // the bell: a wide ring on the floor around you, opening out
        const rx = W * (0.25 + 0.5 * Math.sqrt(k)), ry = H * (0.08 + 0.12 * Math.sqrt(k));
        for (const [col, w] of [['#000', 9], ['#ffd070', 4]] as const) {
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          c.ellipse(cx, H * 0.86, rx, ry, 0, 0, Math.PI * 2);
          c.stroke();
        }
        break;
      }
      case 'arc': {
        // a swing across the lower view, left to right
        const r = W * 0.32;
        const from = Math.PI * 1.15, to = from + Math.PI * 0.7 * Math.min(1, 0.3 + k * 1.6);
        for (const [col, w] of [['#000', 12], ['#ff9a50', 6]] as const) {
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          c.arc(cx, H * 1.05, r, from, to);
          c.stroke();
        }
        break;
      }
    }
  });
  c.restore();
}

/** the weapon kick: px the HUD's weapon glyph is thrown down by, easing back over 0.15 s */
export function kick(g: Game): number {
  const t = g.t - (kicked.get(g) ?? -99);
  return t >= 0 && t < 0.15 ? 14 * (1 - t / 0.15) : 0;
}

/** the first person's weapon: a dark barrel at the bottom, right of centre, that bumps when you fire */
export function drawWeapon(g: Game, c: CanvasRenderingContext2D, W: number, H: number): void {
  const k = kick(g);
  const x = W / 2 + W * 0.08, y = H - 34 + k;
  c.save();
  c.fillStyle = '#000';
  c.fillRect(x - 13, y - 3, 26, 40);
  c.fillStyle = '#5a4a3e';
  c.fillRect(x - 10, y, 20, 40);
  c.fillStyle = '#f0c070';
  c.fillRect(x - 10, y, 20, 3);
  c.restore();
}

/** test hook: the kinds of live marks in the running game (scripts/v5-fx-attack-look.mjs) */
(globalThis as unknown as { fxTest: unknown }).fxTest = {
  live: (g: Game): string[] => {
    const k: string[] = [];
    live(g, (f) => k.push(f.kind));
    return k;
  },
};
