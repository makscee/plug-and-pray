// The map spool, readable (playtest r1): what the hints and the cards name gets a filled diamond in
// the accent colour (on the edge when it lies off the map); hovering a cell names what is there, with
// the legend; a line under the map keys the diamond and has a zoom link (6 or 9 px a cell) and `where`.
// Playtest r2: a click on the map with no pilot walks the first straight leg toward that cell.
// v2: clicks only on a map that takes them (the surveyor's and up); the hover tells only what is known
// (unseen, seen, seen through a wall, marked), and the illuminated atlas shows a note instead of a title.

import { ENEMIES, itemName, say, tickHooks } from '../core/game';
import { active, param } from '../core/mods';
import { exec, VERBS, way } from '../core/verbs';
import { cradleShop, firstLeg, HINTED } from '../tune/hints';
import { cell, Cell, veinOf } from '../core/grid';
import { MODS } from '../core/mods';
import { know, markAt, thinWall } from '../sight/know';
import { does } from '../mods/describe';
import type { Game } from '../core/types';
import { mapCell, mapHooks } from '../world/mind';
import { refit } from './windows';

const ACC = '#f0a050';
/** the hint targets still lying out there: the dawn eye and the card reader until you hold one */
function targets(g: Game): { x: number; y: number; name: string }[] {
  const p = g.player;
  const out: { x: number; y: number; name: string }[] = [];
  for (const mod of HINTED) {
    if (p.inv.some((i) => i.kind === 'mod' && i.mod === mod) || p.installed.some((i) => i.mod === mod)) continue;
    const e = g.ents.find((e) => e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === mod && !e.data?.mimic);
    if (e) out.push({ x: e.x, y: e.y, name: itemName(e.item!) });
  }
  for (const v of g.vectors) if (!v.found) out.push({ x: v.x, y: v.y, name: v.what });
  const shop = cradleShop(g);
  if (shop) out.push({ x: shop.x, y: shop.y, name: 'a reliquary' });
  return out;
}

const LEGEND = ['legend: arrow you · ◆ where the hints point · hatched: seen through a wall (it may hide things) · ? something a radar marked · chevron: a thin wall to dig through',
  'legend: arrow you · ◆ where the hints point · green ◇ a set piece\'s finds · dots: piles in their ore\'s colour · small square a module · teal printer or reliquary · red enemy · hatched: seen through a wall (it may hide things) · coloured spots: what radars marked (orange vein, gold cache, red life, white stairs, violet guard), a dashed ring where it may be'];
/** per map canvas: where its top-left cell is and how big a cell draws, for the hover */
const at = new WeakMap<HTMLCanvasElement, { g: Game; ox: number; oy: number; px: number }>();

/** the atlas's note under the pointer (v2: "icons for POIs, hover tooltips with info") */
let tip: HTMLDivElement | null = null;
function showTip(ev: MouseEvent, head: string, lines: string[]): void {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'map-tip';
    document.body.append(tip);
  }
  tip.replaceChildren();
  const b = document.createElement('b');
  b.textContent = head;
  tip.append(b);
  for (const l of lines) {
    const p = document.createElement('p');
    p.textContent = l;
    tip.append(p);
  }
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(innerWidth - r.width - 8, ev.clientX + 14)}px`;
  tip.style.top = `${Math.min(innerHeight - r.height - 8, ev.clientY + 14)}px`;
}
const hideTip = () => tip && (tip.hidden = true);
// a map window that closes under the pointer gets no mouseleave: any move off a map hides the note
if (typeof document !== 'undefined') document.addEventListener('mousemove', (e) => tip && !tip.hidden && !(e.target as Element)?.closest?.('canvas.map') && hideTip());

function hover(c: HTMLCanvasElement): void {
  const detail = Number(c.dataset.detail ?? 0);
  c.addEventListener('mousemove', (ev) => {
    const m = at.get(c);
    if (!m) return;
    const r = c.getBoundingClientRect();
    const x = m.ox + Math.floor(((ev.clientX - r.left) / r.width) * (c.width / m.px));
    const y = m.oy + Math.floor(((ev.clientY - r.top) / r.height) * (c.height / m.px));
    if (detail >= 2) {
      const [head, ...lines] = infoAt(m.g, x, y);
      if (c.title) c.title = '';
      return showTip(ev, head, lines);
    }
    const what = `${whatAt(m.g, x, y, detail)}\n\n${LEGEND[detail ? 1 : 0]}`;
    if (c.title !== what) c.title = what;
  });
  c.addEventListener('mouseleave', hideTip);
  const legend = document.createElement('p');
  legend.className = 'map-legend';
  legend.innerHTML = detail
    ? `<i style="color:${ACC}">◆</i> hints · <i style="color:#b0f080">◇</i> finds · <i class="hatch"></i> unsure · <i style="color:#ffd070">●</i> marks · `
    : `<i style="color:${ACC}">◆</i> hints · <i class="hatch"></i> unsure · <i>?</i> marks · `;
  const zoom = document.createElement('button');
  const big = () => mapCell.zoom ?? innerHeight >= 900;
  zoom.textContent = big() ? 'smaller' : 'zoom';
  addEventListener('resize', () => (zoom.textContent = big() ? 'smaller' : 'zoom'));
  const label = () => document.querySelectorAll<HTMLButtonElement>('.map-legend .zoom').forEach((b) => (b.textContent = big() ? 'smaller' : 'zoom'));
  zoom.className = 'zoom';
  zoom.addEventListener('click', () => {
    mapCell.zoom = !big();
    label();
    // the map redraws at its new size next frame; then it moves off anything it now covers, docking
    // lower windows if it must; with no room even so, it goes back to the smaller size (playtest r2:
    // the zoomed map grew over the console)
    const win = c.closest<HTMLElement>('.win');
    if (win)
      setTimeout(() => {
        if (refit(win)) return;
        mapCell.zoom = !big();
        label();
        zoom.textContent = 'no room to zoom';
        setTimeout(label, 1500);
      }, 100);
  });
  const where = document.createElement('button');
  where.textContent = 'where';
  where.title = 'where the hints point, again';
  where.addEventListener('click', () => (window as unknown as { thaw: { send(c: string): void } }).thaw.send('where'));
  // r4: `vectors` sits on this line once there are any, so the map never grows a button row
  const vec = document.createElement('button');
  vec.textContent = 'vectors';
  vec.className = 'map-vectors';
  vec.addEventListener('click', () => (window as unknown as { thaw: { send(c: string): void } }).thaw.send('vectors'));
  const sep = document.createElement('span');
  sep.textContent = ' · ';
  legend.append(zoom, ' · ', where, sep, vec);
  vec.hidden = sep.hidden = true;
  c.after(legend);
}

/** what the map shows at cell (x, y), in words: only what is known there, and only as much as the map's detail tells */
export function whatAt(g: Game, x: number, y: number, detail = 1): string {
  const p = g.player;
  const here = (e: { x: number; y: number }) => Math.floor(e.x) === x && Math.floor(e.y) === y;
  const t = targets(g).find(here);
  if (here(p)) return 'you';
  if (t) return `${t.name} (the hints point here)`;
  const m = markAt(g, x, y);
  const k = know(g, x, y);
  if (m) return detail ? `${m.what}${m.r ? ` (somewhere within ${Math.round(m.r)} cells)` : ''}` : 'something marked here; a better map would say what';
  if (k === 'unseen') return 'unseen';
  const c = cell(g, x, y);
  if (k === 'through') return `seen through a wall: ${c === Cell.floor ? 'open' : 'stone'}, but it may hide what that eye cannot show`;
  const e = g.ents.find((e) => here(e) && (e.kind === 'printer' || e.kind === 'item' || (e.enemy && !ENEMIES[e.enemy.type]?.hidden)));
  if (e?.kind === 'printer') return e.data?.shop ? 'reliquary' : 'printer';
  if (e?.enemy) return ENEMIES[e.enemy.type]?.name ?? 'something moving';
  if (e?.item && !e.data?.mimic) return detail ? itemName(e.item) : 'a thing on the floor';
  const v = veinOf(c);
  if (thinWall(g, x, y, (a, b) => cell(g, a, b) === Cell.floor)) return 'a thin wall: something open lies past it. dig or break through';
  return c === Cell.floor ? 'floor' : v && detail ? `${v} vein` : 'wall';
}

/** the atlas's note: a name, then what it is and what to do with it */
export function infoAt(g: Game, x: number, y: number): string[] {
  const p = g.player;
  const here = (e: { x: number; y: number }) => Math.floor(e.x) === x && Math.floor(e.y) === y;
  if (here(p)) return ['you', `${p.hp.toFixed(0)}/${p.maxHp} hp`];
  const t = targets(g).find(here);
  if (t) return [t.name, 'the hints point here.'];
  const k = know(g, x, y);
  const e = k === 'seen' || k === 'scanned' ? g.ents.find((e) => here(e) && (e.kind === 'printer' || e.kind === 'item' || (e.enemy && !ENEMIES[e.enemy.type]?.hidden))) : undefined;
  if (e?.kind === 'printer') return e.data?.shop ? ['reliquary', 'buys, sells, rerolls and recycles modules.'] : ['printer', 'prints a module for ore: print <family>.'];
  if (e?.enemy) return [ENEMIES[e.enemy.type]?.name ?? 'something moving', `${Math.max(0, e.enemy.hp).toFixed(1)} hp${e.enemy.data.noticed ? ' · it has seen you' : ' · it has not seen you'}`];
  if (e?.item && !e.data?.mimic) return [itemName(e.item), e.item.kind === 'mod' ? does(e.item) : e.item.kind === 'card' ? 'a memory card: a card reader reads it.' : 'walk over it to pick it up.'];
  const m = markAt(g, x, y);
  if (m) return [m.what, ...(m.info ? [m.info] : []), `marked by the ${MODS[m.by]?.name ?? m.by}${m.ttl ? `, ${Math.round(g.t - m.at)} s ago` : ''}${m.r ? `; somewhere within ${Math.round(m.r)} cells` : ''}.`];
  if (k === 'unseen') return ['unseen', 'no eye has looked here; a radar may still mark things.'];
  const c = cell(g, x, y);
  if (k === 'through') return [c === Cell.floor ? 'open, past the stone' : 'stone, past the stone', 'seen through a wall: that eye can miss what lies here. not known to be empty.'];
  if (thinWall(g, x, y, (a, b) => cell(g, a, b) === Cell.floor)) return ['a thin wall', 'one cell thick, with open space past it: dig, or break a hollow one.'];
  const v = veinOf(c);
  if (v) return [`${v} vein`, 'a leech needle or a bone auger beside it drains it.'];
  return c === Cell.floor ? ['floor', 'seen: nothing here.'] : ['wall'];
}

mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const c = ctx.canvas;
  if (!at.has(c)) hover(c);
  at.set(c, { g, ox, oy, px });
  const vec = c.parentElement?.querySelector<HTMLElement>('.map-vectors');
  if (vec && vec.hidden === !!g.vectors.length) vec.hidden = (vec.previousElementSibling as HTMLElement).hidden = !g.vectors.length;
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

/** no pilot: a click on the map walks the first straight leg toward that cell (playtest r2: it did nothing) */
const toldPilot = new WeakSet<Game>();
mapHooks.click.push((g, x, y) => {
  if (VERBS.goto && (!VERBS.goto.when || VERBS.goto.when(g))) return; // the pilot's own click
  const p = g.player;
  if (Math.floor(p.x) === x && Math.floor(p.y) === y) return;
  const send = (window as unknown as { thaw: { send(c: string): void } }).thaw.send;
  const leg = firstLeg(g, x + 0.5, y + 0.5);
  if (!leg) return say(g, 'no open way there that you know of.');
  const goes = active(g, 'gait').some((i) => param(i, 'go', false));
  send(goes ? `go ${leg[0]} ${leg[1]}` : `crawl ${leg[0]}`);
  if (goes) trips.set(g, { x, y, hp: p.hp, at: `${Math.floor(p.x)},${Math.floor(p.y)}`, legs: 1, log: g.log.length });
  if (toldPilot.has(g)) return;
  toldPilot.add(g);
  say(g, 'the stepper walks it leg by leg, until you arrive or something hits you. a pilot (the wayfinder moth) walks it faster.');
});

// playtest r3 (fresh A): a map click walked one leg per click. With the stepper it keeps walking leg
// after leg toward the clicked cell, until you arrive, get hit, type anything, or a leg gets nowhere
const trips = new WeakMap<Game, { x: number; y: number; hp: number; at: string; legs: number; log: number }>();
tickHooks.push((g) => {
  const t = trips.get(g);
  if (!t) return;
  const p = g.player;
  const hit = p.hp < t.hp;
  t.hp = p.hp;
  if (p.path.length && !hit) return;
  const here = `${Math.floor(p.x)},${Math.floor(p.y)}`;
  const typed = g.log.slice(t.log).some((l) => typeof l[0] === 'object' && l[0].text.startsWith('> '));
  const leg = firstLeg(g, t.x + 0.5, t.y + 0.5) && way.long(g, t.x + 0.5, t.y + 0.5);
  if (hit || typed || here === t.at || here === `${t.x},${t.y}` || ++t.legs > 40 || !leg || !active(g, 'gait').some((i) => param(i, 'go', false))) return void trips.delete(g);
  t.at = here;
  exec(g, `go ${leg[0]} ${leg[1]}`);
  t.log = g.log.length;
});
import './map3d';
