// The map spool, readable (playtest r1): what the hints and the cards name gets a filled diamond in
// the accent colour (on the edge when it lies off the map); hovering a cell names what is there, with
// the legend; a line under the map keys the diamond and has a zoom link (6 or 9 px a cell) and `where`.
// Playtest r2: a click on the map with no pilot walks the first straight leg toward that cell.
// v2: clicks only on a map that takes them (the surveyor's and up); the hover tells only what is known
// (unseen, seen, seen through a wall, marked), and the illuminated atlas shows a note instead of a title.

import { cells, ENEMIES, grazed, itemName, say, tickHooks } from '../core/game';
import { exec, VERBS, way } from '../core/verbs';
import { cradleShop, eyeHinted, firstLeg, HINTED } from '../tune/hints';
import { cell, Cell, veinOf } from '../core/grid';
import { MODS } from '../core/mods';
import { know, markAt, thinWall } from '../sight/know';
import { mechanic } from './cardText';
import { foeText } from './foeText';
import type { Game } from '../core/types';
import { mapHooks } from '../world/mind';
import { walks } from '../mods/gait';
import { consoleAt, TOP } from './windows';

const ACC = '#f0a050';
/** the hint targets still lying out there: the first eye and the card reader until you hold one (the backdrop's
 *  chevrons read them too) */
export function hintTargets(g: Game): { x: number; y: number; name: string }[] {
  const p = g.player;
  const out: { x: number; y: number; name: string }[] = [];
  for (const mod of HINTED) {
    if (mod === 'pinhole-eye' && !eyeHinted(g)) continue;
    if (p.inv.some((i) => i.kind === 'mod' && i.mod === mod) || p.installed.some((i) => i.mod === mod)) continue;
    const e = g.ents.find((e) => e.kind === 'item' && e.item?.kind === 'mod' && e.item.mod === mod && !e.data?.mimic);
    if (e) out.push({ x: e.x, y: e.y, name: itemName(e.item!) });
  }
  for (const v of g.vectors) if (!v.found) out.push({ x: v.x, y: v.y, name: v.what });
  const shop = cradleShop(g);
  if (shop) out.push({ x: shop.x, y: shop.y, name: 'a reliquary' });
  return out;
}

/** v2r4 ux: the part of the screen no window, HUD or goal line covers ([left, top, right, bottom]). The full-screen
 *  map draws its ◆, ◇ and their labels only in here; what lies outside gets one chevron on its edge (backdrop.ts) */
export function openPart(): [number, number, number, number] {
  const W = innerWidth;
  const con = document.querySelector<HTMLElement>('.win-console')?.getBoundingClientRect();
  let [l, t, r, bt] = [14, TOP + 14, W - 284 - 14, (con && con.height ? con.top : consoleAt()[1]) - 14];
  for (const el of document.querySelectorAll<HTMLElement>('#desk > .win')) {
    if (el.classList.contains('min') || el.classList.contains('win-console')) continue;
    const a = el.getBoundingClientRect();
    if (!a.width || a.top > bt) continue;
    if (a.right < W * 0.4) l = Math.max(l, a.right + 14);
    else if (a.left > W * 0.6) r = Math.min(r, a.left - 14);
  }
  return [l, t, r, bt];
}
/** a point on map canvas `c` (its own px) on the screen: null when `c` is not the full-screen map */
export function onScreen(c: HTMLCanvasElement, x: number, y: number): [number, number] | null {
  if (!c.closest('#backdrop')) return null;
  const r = c.getBoundingClientRect();
  return [r.left + (x * r.width) / c.width, r.top + (y * r.height) / c.height];
}
/** in the open part, `m` px in from its edges */
export const inOpen = (o: [number, number, number, number], x: number, y: number, m = 0) => x >= o[0] + m && x <= o[2] - m && y >= o[1] + m && y <= o[3] - m;

const LEGEND = ['legend: arrow you · ◆ where the hints point · hatched: seen through a wall (it may hide things) · ? something a radar marked · chevron: a thin wall to dig through',
  'legend: arrow you · ◆ where the hints point · green ◇ a set piece\'s finds · dots: piles in their ore\'s colour · small square a module · teal printer or reliquary · foes: dot mite, diamond lamp, square heavy, triangle trick (gold ring: elite) · hatched: seen through a wall (it may hide things) · coloured spots: what radars marked (orange vein, gold cache, red life, white stairs, violet guard), a dashed ring where it may be'];
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
  // v2r1 ux: zoom refitted the map into the window flow ("no room to zoom" at 720, or it docked itself);
  // the big map opens over the middle of the screen instead (src/ui/bigmap.ts)
  const zoom = document.createElement('button');
  const inBig = !!c.closest('#bigmap');
  zoom.textContent = inBig ? 'close (m)' : 'big map (m)';
  zoom.className = 'zoom';
  zoom.title = inBig ? 'close the big map' : 'the whole map, big, in the middle of the screen';
  zoom.addEventListener('click', () => (window as unknown as { thaw: { send(c: string): void } }).thaw.send('map'));
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
  const t = hintNear(g, x, y);
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
  if (here(p)) return ['you', `${Math.max(0, Math.ceil(p.hp * 2) / 2)}/${p.maxHp} hp`];
  const t = hintNear(g, x, y);
  if (t) return [t.name, 'the hints point here.'];
  const k = know(g, x, y);
  const e = k === 'seen' || k === 'scanned' ? g.ents.find((e) => here(e) && (e.kind === 'printer' || e.kind === 'item' || (e.enemy && !ENEMIES[e.enemy.type]?.hidden))) : undefined;
  if (e?.kind === 'printer') return e.data?.shop ? ['reliquary', 'buys, sells, rerolls and recycles modules.'] : ['printer', 'prints a module for ore: print <family>.'];
  if (e?.enemy) return [ENEMIES[e.enemy.type]?.name ?? 'something moving', `${Math.max(0, e.enemy.hp).toFixed(1)} hp${e.enemy.data.noticed ? ' · it has seen you' : ' · it has not seen you'}`, foeText(e.enemy.type).what, 'click: the foe window shows it'];
  if (e?.item && !e.data?.mimic) return [itemName(e.item), e.item.kind === 'mod' ? mechanic(e.item) : e.item.kind === 'card' ? 'a memory card: a card reader reads it.' : 'walk over it to pick it up.'];
  const m = markAt(g, x, y);
  if (m) return [m.what, ...(m.info ? [m.info] : []), `marked by the ${MODS[m.by]?.name ?? m.by}${m.ttl ? `, ${Math.round(g.t - m.at)} s ago` : ''}${m.r ? `; somewhere within ${Math.round(m.r)} cells` : ''}.`];
  if (k === 'unseen') return ['unseen', 'no eye has looked here; a radar may still mark things.'];
  const c = cell(g, x, y);
  if (k === 'through') return [c === Cell.floor ? 'open, past the stone' : 'stone, past the stone', 'seen through a wall: that eye can miss what lies here. not known to be empty.'];
  if (thinWall(g, x, y, (a, b) => cell(g, a, b) === Cell.floor)) return ['a thin wall', 'one cell thick, with open space past it: dig, or break a hollow one.'];
  const v = veinOf(c);
  if (v) return [`${v} vein`, 'a leech needle or a bone auger beside it drains it. no tool? an altar grinds 4 bone into 1 glass.'];
  return c === Cell.floor ? ['floor', 'seen: nothing here.'] : ['wall'];
}

mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const c = ctx.canvas;
  if (!at.has(c)) hover(c);
  at.set(c, { g, ox, oy, px });
  const vec = c.parentElement?.querySelector<HTMLElement>('.map-vectors');
  if (vec && vec.hidden === !!g.vectors.length) vec.hidden = (vec.previousElementSibling as HTMLElement).hidden = !g.vectors.length;
  const [w, h] = [c.width, c.height];
  const named: { x: number; y: number; r: number; name: string; d: number }[] = [];
  // the full-screen map: only what shows in the open part (the rest has its chevron)
  const open = c.closest('#backdrop') ? openPart() : null;
  for (const t of hintTargets(g)) {
    let x = (t.x - ox) * px;
    let y = (t.y - oy) * px;
    const inside = !(x < 0 || y < 0 || x >= w || y >= h);
    if (open) {
      const s = onScreen(c, x, y)!;
      if (!inOpen(open, s[0], s[1], 4)) continue;
    } else if (!inside) {
      // off the map: on the edge, toward it
      const [dx, dy] = [x - w / 2, y - h / 2];
      const m = Math.max(5, px * 0.8) + 3;
      const k = Math.min((w / 2 - m) / Math.max(1e-6, Math.abs(dx)), (h / 2 - m) / Math.max(1e-6, Math.abs(dy)));
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
    if (inside) named.push({ x, y, r, name: t.name.replace(/^(a|an|the) /, ''), d: Math.hypot(t.x - g.player.x, t.y - g.player.y) });
  }
  // v2r3 ux: a ◆ on the map says what it is (off the map, the backdrop's chevrons say it): the nearest four
  const fs = Math.max(11, Math.min(18, Math.round(px * 1.3)));
  ctx.font = `${fs}px VT323, monospace`;
  ctx.textAlign = 'left';
  const placed: [number, number, number][] = [];
  for (const n of named.sort((a, b) => a.d - b.d).slice(0, 4)) {
    const tw = ctx.measureText(n.name).width;
    const lx = n.x + n.r + 4 + tw + 4 > w ? n.x - n.r - 6 - tw : n.x + n.r + 4;
    let ly = Math.max(fs, Math.min(h - 3, n.y + fs * 0.35));
    // v2r4 ux: two labels never sit on each other: the later one steps down a line
    for (let k = 0; k < 6 && placed.some(([x, y, pw]) => Math.abs(y - ly) < fs + 2 && lx < x + pw + 4 && lx + tw + 4 > x); k++) ly += fs + 2;
    placed.push([lx, ly, tw]);
    ctx.fillStyle = 'rgba(10, 8, 7, 0.85)';
    ctx.fillRect(lx - 2, ly - fs * 0.8, tw + 4, fs);
    ctx.fillStyle = ACC;
    ctx.fillText(n.name, lx, ly);
  }
});

/** a hint target on or beside cell (x, y): the ◆ draws bigger than its cell, so the hover forgives a cell */
const hintNear = (g: Game, x: number, y: number) => hintTargets(g).find((t) => Math.abs(Math.floor(t.x) - x) <= 1 && Math.abs(Math.floor(t.y) - y) <= 1);

/** no pilot: a click on the map walks the first straight leg toward that cell (playtest r2: it did nothing) */
const toldPilot = new WeakSet<Game>();
mapHooks.click.push((g, x, y) => {
  if (VERBS.goto && (!VERBS.goto.when || VERBS.goto.when(g))) return; // the pilot's own click
  const p = g.player;
  if (Math.floor(p.x) === x && Math.floor(p.y) === y) return;
  const send = (window as unknown as { thaw: { send(c: string): void } }).thaw.send;
  const leg = firstLeg(g, x + 0.5, y + 0.5);
  // v2r5 newcomer: say why (40 s of clicks on unknown black did nothing a first-timer could read)
  if (!leg) {
    const why = know(g, x, y) === 'unseen' ? 'no known way there: that spot is unseen. click a cell you have seen, nearer.' : 'no open way there that you know of: a wall or the unknown is in the way. click nearer.';
    const last = g.log[g.log.length - 1];
    return void (last?.[0] !== why && say(g, why));
  }
  const goes = walks(g);
  if (goes) {
    // v2r4 ux: one line a walk, not an echo a leg (2-4 `> go` lines pushed the useful text out)
    const [dx, dy] = [x + 0.5 - p.x, y + 0.5 - p.y];
    const w = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 45) % 8];
    const t = hintNear(g, x, y);
    say(g, [{ text: `> walk ${t ? `to ${t.name.replace(/^(a|an|the) /, '')}, ` : ''}${cells(Math.round(Math.hypot(dx, dy)))} ${w}`, cmd: '' }]);
    exec(g, `go ${leg[0]} ${leg[1]}`, true);
  } else send(`crawl ${leg[0]}`);
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
  const hit = p.hp < t.hp && !grazed(g);
  t.hp = p.hp;
  if (p.path.length && !hit) return;
  const here = `${Math.floor(p.x)},${Math.floor(p.y)}`;
  const typed = g.log.slice(t.log).some((l) => typeof l[0] === 'object' && l[0].text.startsWith('> '));
  const leg = firstLeg(g, t.x + 0.5, t.y + 0.5) && way.long(g, t.x + 0.5, t.y + 0.5);
  if (hit || typed || here === t.at || here === `${t.x},${t.y}` || ++t.legs > 40 || !leg || !walks(g)) return void trips.delete(g);
  t.at = here;
  exec(g, `go ${leg[0]} ${leg[1]}`, true);
  t.log = g.log.length;
});
import './map3d';
