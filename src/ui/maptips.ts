// The map spool, readable (playtest r1): what the hints and the cards name gets a filled diamond in
// the accent colour (on the edge when it lies off the map); hovering a cell names what is there, with
// the legend; a line under the map keys the diamond and has a zoom link (6 or 9 px a cell).

import { ENEMIES, itemName } from '../core/game';
import { cell, Cell, veinOf } from '../core/grid';
import type { Game } from '../core/types';
import { mapCell, mapHooks } from '../world/mind';
import { HINTED } from '../tune/hints';
import { refit } from './windows';

const ACC = '#f0a050';
/** the hint targets still lying out there: the clear eye and the card reader until you hold one */
function targets(g: Game): { x: number; y: number; name: string }[] {
  const p = g.player;
  const out: { x: number; y: number; name: string }[] = [];
  for (const mod of HINTED) {
    if (p.inv.some((i) => i.kind === 'mod' && i.mod === mod) || p.installed.some((i) => i.mod === mod)) continue;
    const e = g.ents.find((e) => e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === mod && !e.data?.mimic);
    if (e) out.push({ x: e.x, y: e.y, name: itemName(e.item!) });
  }
  for (const v of g.vectors) if (!v.found) out.push({ x: v.x, y: v.y, name: v.what });
  return out;
}

const LEGEND = 'legend: ◆ where the hints and cards point · teal printer or reliquary · red enemy · arrow you';
/** per map canvas: where its top-left cell is and how big a cell draws, for the hover */
const at = new WeakMap<HTMLCanvasElement, { g: Game; ox: number; oy: number; px: number }>();

function hover(c: HTMLCanvasElement): void {
  c.addEventListener('mousemove', (ev) => {
    const m = at.get(c);
    if (!m) return;
    const r = c.getBoundingClientRect();
    const x = m.ox + Math.floor(((ev.clientX - r.left) / r.width) * (c.width / m.px));
    const y = m.oy + Math.floor(((ev.clientY - r.top) / r.height) * (c.height / m.px));
    const what = `${whatAt(m.g, x, y)}\n\n${LEGEND}`;
    if (c.title !== what) c.title = what;
  });
  const legend = document.createElement('p');
  legend.className = 'map-legend';
  legend.innerHTML = `<i style="color:${ACC}">◆</i> hints, cards · hover names a cell · `;
  const zoom = document.createElement('button');
  const big = () => mapCell.zoom ?? innerHeight >= 900;
  zoom.textContent = big() ? 'smaller' : 'zoom';
  addEventListener('resize', () => (zoom.textContent = big() ? 'smaller' : 'zoom'));
  zoom.addEventListener('click', () => {
    mapCell.zoom = !big();
    document.querySelectorAll<HTMLButtonElement>('.map-legend button').forEach((b) => (b.textContent = big() ? 'smaller' : 'zoom'));
    // the map redraws at its new size next frame; then it moves off anything it now covers, if it can
    const win = c.closest<HTMLElement>('.win');
    if (win) setTimeout(() => refit(win), 100);
  });
  legend.append(zoom);
  c.after(legend);
}

/** what the map shows at cell (x, y), in words */
export function whatAt(g: Game, x: number, y: number): string {
  const p = g.player;
  const here = (e: { x: number; y: number }) => Math.floor(e.x) === x && Math.floor(e.y) === y;
  const t = targets(g).find(here);
  if (here(p)) return 'you';
  if (t) return `${t.name} (the hints point here)`;
  if (!g.seen.has(`${x},${y}`)) return 'unseen';
  const e = g.ents.find((e) => here(e) && (e.kind === 'printer' || e.kind === 'item' || (e.enemy && !ENEMIES[e.enemy.type]?.hidden)));
  if (e?.kind === 'printer') return e.data?.shop ? 'reliquary' : 'printer';
  if (e?.enemy) return ENEMIES[e.enemy.type]?.name ?? 'something moving';
  if (e?.item && !e.data?.mimic) return itemName(e.item);
  const c = cell(g, x, y);
  const v = veinOf(c);
  return c === Cell.floor ? 'floor' : v ? `${v} vein` : 'wall';
}

mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const c = ctx.canvas;
  if (!at.has(c)) hover(c);
  at.set(c, { g, ox, oy, px });
  const [w, h] = [c.width, c.height];
  for (const t of targets(g)) {
    let x = (t.x - ox) * px;
    let y = (t.y - oy) * px;
    if (x < 0 || y < 0 || x >= w || y >= h) {
      // off the map: on the edge, toward it
      const [dx, dy] = [x - w / 2, y - h / 2];
      const k = (w / 2 - 6) / Math.max(Math.abs(dx), Math.abs(dy));
      [x, y] = [w / 2 + dx * k, h / 2 + dy * k];
    }
    const r = Math.max(5, px * 0.8);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y - r - 2);
    ctx.lineTo(x + r + 2, y);
    ctx.lineTo(x, y + r + 2);
    ctx.lineTo(x - r - 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ACC;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }
});
