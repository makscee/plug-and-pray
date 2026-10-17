// The world's mind modules: the card reader (read card), the map spool (a top-down window of what
// you have seen) and the drowned compass (an arrow to the nearest open vector). Other slices add
// mind modules too (ledger, clock), so this wraps whatever `mind` family and view came before it
// and only answers for its own `what`.

import { CHUNK, cell, Cell, veinOf } from '../core/grid';
import { tickHooks } from '../core/game';
import { families, family, param } from '../core/mods';
import type { Game, Inst } from '../core/types';
import { view, VIEWS, type View } from '../ui/views';
import { nearestOpen } from './vectors';

const OURS = ['reader', 'map', 'compass'];
const ours = (inst: Inst) => OURS.includes(param<string>(inst, 'what', ''));

const prev = families.mind;
family('mind', {
  tick: (g, inst, dt) => (ours(inst) ? undefined : prev?.tick?.(g, inst, dt)),
  status: (g, inst) => (ours(inst) ? [] : prev?.status?.(g, inst) ?? []),
  buttons(g, inst) {
    if (!ours(inst)) return prev?.buttons?.(g, inst) ?? [];
    const w = param<string>(inst, 'what', '');
    if (w === 'reader') return g.player.inv.some((i) => i.kind === 'card') ? [{ label: 'read card', cmd: 'read card' }] : [];
    if (g.vectors.length) return [{ label: 'vectors', cmd: 'vectors' }];
    return [];
  },
});

/** the map spool also remembers where you have walked, so it works blind */
tickHooks.push((g) => {
  const i = Math.floor(g.player.x);
  const j = Math.floor(g.player.y);
  for (let y = j - 1; y <= j + 1; y++) for (let x = i - 1; x <= i + 1; x++) g.seen.add(`${x},${y}`);
});

/** other slices hook the map window: a click on a cell (world cells), and drawing on top of it */
export const mapHooks = {
  click: [] as ((g: Game, x: number, y: number) => void)[],
  draw: [] as ((g: Game, ctx: CanvasRenderingContext2D, ox: number, oy: number, px: number) => void)[],
};

const CSS = { floor: '#3a2f28', wall: '#211a16', vein: '#7a4a2a', ichor: '#a02838', you: '#f0a050', vec: '#e0d0a0', printer: '#70a0a0' };

function mapView(el: HTMLElement, inst: Inst, game: Game): View {
  const span = Math.round(param<number>(inst, 'span', 33));
  const px = Math.max(3, Math.floor(198 / span));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = span * px;
  canvas.className = 'map';
  el.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let next = 0;
  let [ox, oy] = [0, 0];
  canvas.addEventListener('click', (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = ox + Math.floor(((ev.clientX - r.left) / r.width) * span);
    const y = oy + Math.floor(((ev.clientY - r.top) / r.height) * span);
    for (const f of mapHooks.click) f(game, x, y);
  });
  return {
    update(g: Game) {
      if (!(inst.on && g.t >= inst.readyAt)) return;
      if (g.t < next) return;
      next = g.t + 0.25;
      const p = g.player;
      ox = Math.floor(p.x) - (span >> 1);
      oy = Math.floor(p.y) - (span >> 1);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < span; y++)
        for (let x = 0; x < span; x++) {
          const wx = ox + x;
          const wy = oy + y;
          if (!g.seen.has(`${wx},${wy}`) || !g.chunks.has(`${Math.floor(wx / CHUNK)},${Math.floor(wy / CHUNK)}`)) continue;
          const c = cell(g, wx, wy);
          const v = veinOf(c);
          ctx.fillStyle = c === Cell.floor ? CSS.floor : v ? (v === 'ichor' ? CSS.ichor : CSS.vein) : CSS.wall;
          ctx.fillRect(x * px, y * px, px, px);
        }
      for (const e of g.ents)
        if (e.kind === 'printer' && g.seen.has(`${Math.floor(e.x)},${Math.floor(e.y)}`)) {
          ctx.fillStyle = CSS.printer;
          ctx.fillRect((e.x - ox) * px - px / 2, (e.y - oy) * px - px / 2, px, px);
        }
      // vectors: a cross where they end, or a tick on the edge toward them
      const half = (span * px) / 2;
      for (const v of g.vectors) {
        if (v.found) continue;
        let vx = (v.x - ox) * px;
        let vy = (v.y - oy) * px;
        const inside = vx >= 0 && vy >= 0 && vx < span * px && vy < span * px;
        if (!inside) {
          const dx = vx - half;
          const dy = vy - half;
          const k = (half - 4) / Math.max(Math.abs(dx), Math.abs(dy));
          vx = half + dx * k;
          vy = half + dy * k;
        }
        ctx.strokeStyle = CSS.vec;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(vx - 4, vy - 4);
        ctx.lineTo(vx + 4, vy + 4);
        ctx.moveTo(vx + 4, vy - 4);
        ctx.lineTo(vx - 4, vy + 4);
        ctx.stroke();
      }
      for (const f of mapHooks.draw) f(g, ctx, ox, oy, px);
      const yx = (p.x - ox) * px;
      const yy = (p.y - oy) * px;
      // you: an arrowhead pointing the way you face, big enough to read at a glance
      const [fx, fy] = [Math.sin(p.dir), -Math.cos(p.dir)];
      const r = Math.max(5, px * 1.6);
      ctx.fillStyle = CSS.you;
      ctx.beginPath();
      ctx.moveTo(yx + fx * r, yy + fy * r);
      ctx.lineTo(yx - fx * r * 0.6 - fy * r * 0.7, yy - fy * r * 0.6 + fx * r * 0.7);
      ctx.lineTo(yx - fx * r * 0.2, yy - fy * r * 0.2);
      ctx.lineTo(yx - fx * r * 0.6 + fy * r * 0.7, yy - fy * r * 0.6 - fx * r * 0.7);
      ctx.closePath();
      ctx.fill();
    },
  };
}

function compassView(el: HTMLElement, inst: Inst): View {
  const S = 120;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  canvas.className = 'compass';
  const label = document.createElement('p');
  label.className = 'flavour';
  el.append(canvas, label);
  const ctx = canvas.getContext('2d')!;
  return {
    update(g: Game) {
      if (!(inst.on && g.t >= inst.readyAt)) return;
      const v = nearestOpen(g);
      const p = g.player;
      // relative to your facing: up is ahead. with nothing to point at, the needle drifts
      const a = v ? Math.atan2(v.x - p.x, -(v.y - p.y)) - p.dir : Math.sin(g.t * 0.7) * 2.5;
      const r = S / 2 - 10;
      ctx.clearRect(0, 0, S, S);
      ctx.strokeStyle = CSS.floor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = v ? CSS.you : CSS.floor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(S / 2 - Math.sin(a) * r * 0.4, S / 2 + Math.cos(a) * r * 0.4);
      ctx.lineTo(S / 2 + Math.sin(a) * r, S / 2 - Math.cos(a) * r);
      ctx.stroke();
      const text = v ? `${v.what}: ${Math.round(Math.hypot(v.x - p.x, v.y - p.y))} cells` : 'the needle drifts.';
      if (label.textContent !== text) label.textContent = text;
    },
  };
}

const prevView = VIEWS.mind;
view('mind', (el, inst, g) => {
  const w = param<string>(inst, 'what', '');
  if (w === 'map') return mapView(el, inst, g);
  if (w === 'compass') return compassView(el, inst);
  if (!ours(inst) && prevView) return prevView(el, inst, g);
  const p = document.createElement('p');
  p.className = 'flavour';
  p.textContent = w === 'reader' ? 'a slot for memory cards. it reads what the dead wrote.' : '';
  el.append(p);
  return { update() {} };
});
