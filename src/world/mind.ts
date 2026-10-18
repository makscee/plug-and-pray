// The world's mind modules: the card reader (read card), the maps (a top-down window of what your eyes
// saw and your radars marked, in four tiers: v2 below) and the drowned compass (an arrow to the nearest open vector). Other slices add
// mind modules too (ledger, clock), so this wraps whatever `mind` family and view came before it
// and only answers for its own `what`.

import { CHUNK, cell, Cell, veinOf } from '../core/grid';
import { cells, say, tickHooks } from '../core/game';
import { active, families, family, param } from '../core/mods';
import type { Entity, Game, Inst } from '../core/types';
import { view, VIEWS, type View } from '../ui/views';
import { consoleAt, TOP } from '../ui/windows';
import { nearestOpen } from './vectors';
import { isNamed } from './secrets';
import { see } from '../sight/reveal';

/** cells a map feels round you with no eye on */
export const BLIND = 2.5;
import { know, marks, thinWall, type Mark, type MarkKind } from '../sight/know';

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
    // r4: the map has `vectors` on its legend line (a button row here grew it over the console at 1280x720)
    if (g.vectors.length && w !== 'map') return [{ label: 'vectors', cmd: 'vectors' }];
    return [];
  },
});

/** the map spool also remembers where you have walked, so it works blind. What lies farther off goes on it
 *  only as your eyes see it (v2: src/sight/reveal.ts writes each eye's cone, range and light) */
tickHooks.push((g) => {
  const i = Math.floor(g.player.x);
  const j = Math.floor(g.player.y);
  for (let y = j - 1; y <= j + 1; y++) for (let x = i - 1; x <= i + 1; x++) g.seen.add(`${x},${y}`);
  // v2-view: no eye at all (the run wakes blind): it feels the walls a little farther, by the body's own glow
  if (!active(g, 'camera').length && active(g, 'mind').some((m) => param<string>(m, 'what', '') === 'map')) see(g, BLIND);
});

/** other slices hook the map window: a click on a cell (world cells), and drawing on top of it */
export const mapHooks = {
  click: [] as ((g: Game, x: number, y: number) => void)[],
  draw: [] as ((g: Game, ctx: CanvasRenderingContext2D, ox: number, oy: number, px: number) => void)[],
  /** something moving fast is on the map (shots in flight): it redraws at 12 Hz, not 4 */
  fast: [] as ((g: Game) => boolean)[],
};

/** the map window's cell size and how many cells it shows (v2r1 ux: 6 px a cell hid one-cell corridors and
 *  the arrow read a cell off): 8 px a cell, as many of the map's cells as fit above the console at this
 *  height; the big map (M, src/ui/bigmap.ts) shows them all at 12 px */
export const mapCell = {
  px: (_span: number) => 8,
  cells: (span: number) => {
    // the map window's title, legend and padding take about 90 px; 8 px of gap above the console
    const fit = Math.floor((consoleAt()[1] - TOP - 8 - 90) / 8);
    return Math.min(span, Math.max(21, fit - (fit % 2 ? 0 : 1)));
  },
};

/** veins a colour eye named, in their own colours */
const NAMED: Record<string, string> = { bone: '#d8c8a8', glass: '#7fd8d0', copper: '#e08a40', ichor: '#e02848' };
const CSS = { floor: '#6a5444', wall: '#2c221d', face: '#4a3a30', vein: '#7a4a2a', ichor: '#a02838', you: '#f0a050', vec: '#e0d0a0', printer: '#70a0a0' };
/** the map spool's three inks: floor, wall, and one for every thing on it (v2: "basic, coarse, few colours") */
const SPOOL = { floor: '#5a4a3e', wall: '#241c18', thing: '#d8c8a8' };
/** what each kind of mark is drawn in, on a map that has inks for them */
export const MARK_INK: Record<MarkKind, string> = { thing: '#d8c8a8', vein: '#e08a40', cache: '#ffd070', life: '#ff5a3c', stairs: '#f0f0ff', boss: '#d050ff' };

/** a map module's detail (0 spool, 1 surveyor, 2 atlas, 3 diorama) and whether it takes clicks */
export const detailOf = (inst: Inst): number => param<number>(inst, 'detail', 0);
/** the best working map's detail, or -1 with none */
export function mapDetail(g: Game): number {
  let d = -1;
  for (const i of active(g, 'mind')) if (param<string>(i, 'what', '') === 'map') d = Math.max(d, detailOf(i));
  return d;
}

/** diagonal hatching for a cell seen only through a wall: its shape is a rumour, never known-empty */
const hatches = new Map<string, CanvasPattern | string>();
function hatch(ctx: CanvasRenderingContext2D, ink: string, bg: string): CanvasPattern | string {
  const k = ink + bg;
  let h = hatches.get(k);
  if (h) return h;
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, 4, 4);
  x.fillStyle = ink;
  for (let k = 0; k < 4; k++) x.fillRect(k, 3 - k, 1, 1);
  h = ctx.createPattern(c, 'repeat') ?? ink;
  hatches.set(k, h);
  return h;
}

/** a mark on the map, as much as this map can draw: "?" on the spool, a coloured spot on the surveyor's,
 *  a little picture on the atlas (map.ts draws the pictures: `markIcon`); a blob is a dashed ring where it may be */
export const markIcon: { draw?: (ctx: CanvasRenderingContext2D, m: Mark, x: number, y: number, size: number) => boolean } = {};
function drawMark(g: Game, ctx: CanvasRenderingContext2D, m: Mark, ox: number, oy: number, px: number, detail: number): void {
  const [x, y] = [(m.x - ox) * px, (m.y - oy) * px];
  const ore = m.kind === 'vein' && NAMED[m.what.split(' ')[0]];
  const ink = !detail ? SPOOL.thing : ore || MARK_INK[m.kind];
  ctx.globalAlpha = m.ttl ? Math.max(0.25, 1 - (g.t - m.at) / m.ttl) : 1;
  if (m.r > 0) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.globalAlpha *= 0.6;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(x, y, m.r * px, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha /= 0.6;
  }
  const size = Math.max(9, px * 1.6);
  if (!(detail >= 2 && markIcon.draw?.(ctx, m, x, y, size + 3))) {
    if (!detail || m.kind === 'thing') {
      ctx.font = `bold ${Math.round(size + 2)}px VT323, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText('?', x, y);
      ctx.fillStyle = ink;
      ctx.fillText('?', x, y);
    } else {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x, y, size / 2 + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(x, y, size / 2 - 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

let toldClick = new WeakSet<Game>();
export const resetMapTold = () => (toldClick = new WeakSet());

/** v2-view: the map as the screen itself (src/sight/backdrop.ts): cells across and down and their size, how often
 *  it redraws; a click always walks there (the map is your only sight); lives are left to the radar's sweep */
export interface Fill {
  size: () => [number, number, number];
  hz: number;
  /** where you sit down the picture, 0..1 (the middle when left out) */
  at?: number;
  /** v2r4 ux: the picture's top-left cell, fixed (the big map's whole floor), instead of round you */
  origin?: () => [number, number];
  /** clicks walk you only if the map takes them (the screen-filling map always does) */
  ownClicks?: boolean;
}

/** a map walks you where you click: one that takes clicks, the screen-filling one, and (v2r2 ux: the first eye
 *  took click-to-walk away and felt like a loss) any map until you first go down: the surveyor's map is floor 2's */
export const walksOnClick = (g: Game, inst: Inst): boolean => !!param(inst, 'click', false) || !g.floor;

export function mapView(el: HTMLElement, inst: Inst, game: Game, big?: () => number, fill?: Fill): View {
  const all = Math.round(param<number>(inst, 'span', 33));
  /** cells shown across: the window crops to what fits, the big map shows them all */
  let span = all;
  /** cells shown down: the same, but for the screen-filling map */
  let rows = all;
  const detail = detailOf(inst);
  // a cell's size follows mapCell (the map's zoom link, playtest r1: 6 px hid one-cell corridors)
  let px = 0;
  const canvas = document.createElement('canvas');
  canvas.className = 'map';
  canvas.dataset.detail = String(detail);
  const walks = () => (!!fill && !fill.ownClicks) || walksOnClick(game, inst);
  if (!walks()) canvas.style.cursor = 'default';
  el.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let next = 0;
  let [ox, oy] = [0, 0];
  canvas.addEventListener('click', (ev) => {
    // v2 (Maks 10-18): clicking to walk is an upgrade; the map spool only remembers
    if (!walks()) {
      // v2r5 newcomer: a second click said nothing at all; it says one short line again
      if (toldClick.has(game)) return say(game, ['this map takes no clicks: ', { text: 'where', cmd: 'where' }, ' walks you.']);
      toldClick.add(game);
      return say(game, ['below floor 1 this map takes no clicks. ', { text: 'where', cmd: 'where' }, ' walks you; a survey spool walks on click.']);
    }
    const r = canvas.getBoundingClientRect();
    const x = ox + Math.floor(((ev.clientX - r.left) / r.width) * span);
    const y = oy + Math.floor(((ev.clientY - r.top) / r.height) * rows);
    for (const f of mapHooks.click) f(game, x, y);
  });
  return {
    update(g: Game) {
      if (!(inst.on && g.t >= inst.readyAt)) return;
      const [n, m, want] = fill ? fill.size() : [big ? all : mapCell.cells(all), 0, big ? big() : mapCell.px(all)];
      const down = fill ? m : n;
      if (want !== px || n !== span || down !== rows) [px, span, rows, next, canvas.width, canvas.height] = [want, n, down, 0, n * want, down * want];
      canvas.dataset.cells = String(span);
      const cur = walks() ? '' : 'default';
      if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
      if (g.t < next) return;
      next = g.t + (fill ? 1 / fill.hz : mapHooks.fast.some((f) => f(g)) ? 1 / 12 : 0.25);
      const p = g.player;
      ox = Math.floor(p.x) - (span >> 1);
      oy = Math.floor(p.y) - (fill?.at !== undefined ? Math.round(rows * fill.at) : rows >> 1);
      if (fill?.origin) [ox, oy] = fill.origin();
      // where this picture's top-left cell is, for what draws over it (the backdrop's radar)
      canvas.dataset.ox = String(ox);
      canvas.dataset.oy = String(oy);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const made = (wx: number, wy: number) => g.chunks.has(`${Math.floor(wx / CHUNK)},${Math.floor(wy / CHUNK)}`);
      const isFloor = (wx: number, wy: number) => made(wx, wy) && cell(g, wx, wy) === Cell.floor;
      const plain = detail ? hatch(ctx, '#8a7cb8', '#1c1726') : hatch(ctx, '#7a7090', '#16121c');
      const stone = detail ? hatch(ctx, '#3e3650', '#0a080e') : hatch(ctx, '#363044', '#09070b');
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < span; x++) {
          const wx = ox + x;
          const wy = oy + y;
          if (!made(wx, wy)) continue;
          const k = know(g, wx, wy);
          if (k === 'unseen') continue;
          const c = cell(g, wx, wy);
          if (k === 'through') {
            // seen through a wall: hatched, the open part lighter; never drawn as known floor
            ctx.fillStyle = c === Cell.floor ? plain : stone;
            ctx.fillRect(x * px, y * px, px, px);
            continue;
          }
          const v = veinOf(c);
          if (!detail) ctx.fillStyle = c === Cell.floor ? SPOOL.floor : SPOOL.wall;
          // r2 decide: a vein a colour eye named shows its kind
          else ctx.fillStyle = c === Cell.floor ? CSS.floor : v ? (isNamed(g, wx, wy) ? NAMED[v] : v === 'ichor' ? CSS.ichor : CSS.vein) : CSS.wall;
          ctx.fillRect(x * px, y * px, px, px);
          // the surveyor's finer pen: a wall's face toward known floor gets an edge
          if (detail && c !== Cell.floor && !v) {
            ctx.fillStyle = CSS.face;
            const e = Math.max(1, px >> 2);
            if (g.seen.has(`${wx},${wy - 1}`) && isFloor(wx, wy - 1)) ctx.fillRect(x * px, y * px, px, e);
            if (g.seen.has(`${wx},${wy + 1}`) && isFloor(wx, wy + 1)) ctx.fillRect(x * px, y * px + px - e, px, e);
            if (g.seen.has(`${wx - 1},${wy}`) && isFloor(wx - 1, wy)) ctx.fillRect(x * px, y * px, e, px);
            if (g.seen.has(`${wx + 1},${wy}`) && isFloor(wx + 1, wy)) ctx.fillRect(x * px + px - e, y * px, e, px);
          }
          // a wall one cell thick with a rumoured room past it: a dig here mark, pointing through
          const thin = thinWall(g, wx, wy, isFloor);
          if (thin) {
            const [cx, cy] = [(x + 0.5) * px, (y + 0.5) * px];
            ctx.strokeStyle = detail ? '#ffd070' : SPOOL.thing;
            ctx.lineWidth = Math.max(1.5, px / 4);
            ctx.beginPath();
            ctx.moveTo(cx - thin[0] * px * 0.35 - thin[1] * px * 0.35, cy - thin[1] * px * 0.35 - thin[0] * px * 0.35);
            ctx.lineTo(cx + thin[0] * px * 0.35, cy + thin[1] * px * 0.35);
            ctx.lineTo(cx - thin[0] * px * 0.35 + thin[1] * px * 0.35, cy - thin[1] * px * 0.35 + thin[0] * px * 0.35);
            ctx.stroke();
          }
        }
      for (const e of g.ents)
        if (e.kind === 'printer' && g.seen.has(`${Math.floor(e.x)},${Math.floor(e.y)}`)) {
          if (detail >= 2 && thingIcon.draw?.(ctx, e, (e.x - ox) * px, (e.y - oy) * px, Math.max(12, px * 2))) continue;
          ctx.fillStyle = detail ? CSS.printer : SPOOL.thing;
          ctx.fillRect((e.x - ox) * px - px / 2, (e.y - oy) * px - px / 2, px, px);
        }
      // seen loot (playtest r3): a small dot in a pile's colour, a small accent square for a module or card;
      // the spool has one ink for all of it; the atlas draws its picture
      for (const e of g.ents) {
        if (e.kind !== 'item' || !e.item || e.data?.mimic || !g.seen.has(`${Math.floor(e.x)},${Math.floor(e.y)}`)) continue;
        const [cx, cy] = [(Math.floor(e.x) + 0.5 - ox) * px, (Math.floor(e.y) + 0.5 - oy) * px];
        halo(ctx, g, e, cx, cy, px);
        if (detail >= 2 && thingIcon.draw?.(ctx, e, cx, cy, Math.max(11, px * 1.8))) continue;
        if (e.item.kind === 'res') {
          ctx.fillStyle = detail ? NAMED[e.item.res] : SPOOL.thing;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(2, px * 0.25), 0, Math.PI * 2);
          ctx.fill();
        } else {
          const s = Math.max(3, Math.round(px * 0.5));
          ctx.fillStyle = '#000';
          ctx.fillRect(cx - s / 2 - 1, cy - s / 2 - 1, s + 2, s + 2);
          ctx.fillStyle = detail ? CSS.you : SPOOL.thing;
          ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
        }
      }
      // what the radars marked (src/mods/radar.ts): only as much as this map can draw
      for (const m of marks(g)) {
        if (m.x + m.r < ox - 1 || m.y + m.r < oy - 1 || m.x - m.r > ox + span + 1 || m.y - m.r > oy + rows + 1) continue;
        if (fill && m.kind === 'life') continue;
        drawMark(g, ctx, m, ox, oy, px, detail);
      }
      // vectors: a cross where they end, or a tick on the edge toward them
      const [hx, hy] = [(span * px) / 2, (rows * px) / 2];
      for (const v of g.vectors) {
        if (v.found) continue;
        let vx = (v.x - ox) * px;
        let vy = (v.y - oy) * px;
        const inside = vx >= 0 && vy >= 0 && vx < span * px && vy < rows * px;
        if (!inside) {
          const dx = vx - hx;
          const dy = vy - hy;
          const k = Math.min((hx - 4) / Math.max(1e-6, Math.abs(dx)), (hy - 4) / Math.max(1e-6, Math.abs(dy)));
          vx = hx + dx * k;
          vy = hy + dy * k;
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
      // you: your cell ringed, and an arrowhead centred on it pointing the way you face (v2r1 ux: the
      // arrow's tip reached 1.6 cells ahead and read as a cell off)
      const [cx, cy] = [(Math.floor(p.x) - ox) * px, (Math.floor(p.y) - oy) * px];
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 1, cy - 1, px + 2, px + 2);
      ctx.strokeStyle = CSS.you;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 0.5, cy - 0.5, px + 1, px + 1);
      const [fx, fy] = [Math.sin(p.dir), -Math.cos(p.dir)];
      const r = Math.max(5, px * 0.95);
      ctx.fillStyle = CSS.you;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(yx + fx * r, yy + fy * r);
      ctx.lineTo(yx - fx * r * 0.7 - fy * r * 0.7, yy - fy * r * 0.7 + fx * r * 0.7);
      ctx.lineTo(yx - fx * r * 0.3, yy - fy * r * 0.3);
      ctx.lineTo(yx - fx * r * 0.7 + fy * r * 0.7, yy - fy * r * 0.7 - fx * r * 0.7);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    },
  };
}

/** the atlas's pictures of things in the world (src/ui/map3d.ts fills it in: icons need the DOM) */
export const thingIcon: { draw?: (ctx: CanvasRenderingContext2D, e: Entity, x: number, y: number, size: number) => boolean } = {};
/** the diorama's own view (src/ui/map3d.ts) */
export const diorama: { make?: (el: HTMLElement, inst: Inst, g: Game) => View } = {};

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
      const text = v ? `${v.what}: ${cells(Math.round(Math.hypot(v.x - p.x, v.y - p.y)))}` : 'the needle drifts.';
      if (label.textContent !== text) label.textContent = text;
    },
  };
}

const prevView = VIEWS.mind;
view('mind', (el, inst, g) => {
  const w = param<string>(inst, 'what', '');
  if (w === 'map') return detailOf(inst) >= 3 && diorama.make ? diorama.make(el, inst, g) : mapView(el, inst, g);
  if (w === 'compass') return compassView(el, inst);
  if (!ours(inst) && prevView) return prevView(el, inst, g);
  const p = document.createElement('p');
  p.className = 'flavour';
  p.textContent = w === 'reader' ? 'a slot for memory cards. it reads what the dead wrote.' : '';
  el.append(p);
  return { update() {} };
});

/** loot on the ground glows so it reads at a glance (Maks 10-18): a faint pulse for all of it,
 * a wider gold (rare) or purple (unique) one that shows from further */
export const LOOT_GLOW: Record<string, [string, number]> = { common: ['255,230,180', 0.9], fine: ['140,200,255', 1.1], rare: ['255,200,60', 1.8], unique: ['200,110,255', 2.2] };
export const rarityOf = (e: Entity): string => (e.item?.kind === 'mod' ? (e.item.rarity ?? 'common') : 'common');
export function halo(ctx: CanvasRenderingContext2D, g: Game, e: Entity, cx: number, cy: number, px: number) {
  const [rgb, k] = LOOT_GLOW[rarityOf(e)] ?? LOOT_GLOW.common;
  const pulse = 0.55 + 0.45 * Math.sin(g.t * 3 + e.id);
  const r = Math.max(6, px * k);
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grd.addColorStop(0, `rgba(${rgb},${(k > 1.5 ? 0.75 : 0.45) * pulse})`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = grd;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}
