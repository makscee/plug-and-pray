// v4 foes (Maks 10-18: "enemies should be more pronounced, make there a window there their description is
// shown and some info"): the foe window shows one foe: the one you clicked on the map, else the one under the
// mouse there, else the nearest after you, else the nearest on the map. Its picture, name, what it does, hp,
// how bad it is for you now, what it drops, the call (fight or avoid), your best weapon against it, and a tip.
// It sits at the foot of the panel column and goes when no foe has been near for a few seconds.
// The first time you meet a kind, a short banner names it (in the toast's look, src/ui/toast.ts).

import './foes.css';
import { frameHooks } from '.';
import { dist, ENEMIES } from '../core/game';
import { active, label, param } from '../core/mods';
import type { Entity, Game, Item } from '../core/types';
import { DROP, DROPS, MITE_DROP } from '../fight/drops';
import { perceives } from '../mods/sense';
import { engaged, onMap, picked } from '../sight/foes';
import { frames, SPRITES } from '../sight/sprites';
import { bestArm, danger, foeText, why, type Arm } from './foeText';
import { img } from './icons';
import * as windows from './windows';
import { goDown } from '../world/floors';

/** how long the window stays with no foe in sight (s of game time) */
const LINGER = 4;

const looks = new Map<string, HTMLCanvasElement>();
/** a foe's first idle frame, scaled up crisp */
function look(type: string, px: number): HTMLElement {
  const key = SPRITES[type] ? type : type.startsWith('boss-') ? 'warden' : 'mite';
  let c = looks.get(key);
  if (!c) looks.set(key, (c = frames(SPRITES[key]).color[0]));
  const out = document.createElement('canvas');
  out.width = out.height = c.width;
  out.getContext('2d')!.drawImage(c, 0, 0);
  out.className = 'foe-look';
  out.style.width = out.style.height = px + 'px';
  return out;
}

const nameOf = (e: Entity) => (ENEMIES[e.enemy!.type]?.name ?? 'something').replace(/^(a|an|the) /, '');
/** what one of its blows does to you now */
const hitOf = (e: Entity) => (ENEMIES[e.enemy!.type]?.damage ?? 1) * Number(e.enemy!.data.mult ?? 1);
// (far ones skipped first: this runs over every foe each frame)
const seen = (g: Game, e: Entity) => !!e.enemy && e.enemy.hp > 0 && dist(e, g.player) <= 16 && (onMap(g, e) || perceives(g, e));

/** your weapons that are on, as the foe text reads them */
export function arms(g: Game): Arm[] {
  return active(g, 'weapon').map((i) => ({ name: label(i), damage: param<number>(i, 'damage', 1), cooldown: param<number>(i, 'cooldown', 1), range: param<number>(i, 'range', 1.5), sweep: !!param<boolean>(i, 'sweep', false) }));
}

/** the map cell under the mouse, on a map spool or the full-screen map */
let hoverCell: [number, number] | null = null;
function cellAt(ev: MouseEvent): [number, number] | null {
  const c = ev.target as HTMLElement;
  if (!(c instanceof HTMLCanvasElement) || !c.classList.contains('map') || !c.dataset.cells) return null;
  const r = c.getBoundingClientRect();
  const span = Number(c.dataset.cells);
  const rows = Math.round(c.height / (c.width / span));
  return [Number(c.dataset.ox) + ((ev.clientX - r.left) / r.width) * span, Number(c.dataset.oy) + ((ev.clientY - r.top) / r.height) * rows];
}
/** the seen foe nearest a map point, within a cell */
const foeAt = (g: Game, x: number, y: number) =>
  g.ents.filter((e) => seen(g, e) && Math.hypot(e.x - x, e.y - y) <= 1.1).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];

const game = () => (window as unknown as { thaw?: { g: Game } }).thaw?.g;
if (typeof window !== 'undefined') {
  addEventListener('mousemove', (ev) => (hoverCell = cellAt(ev)), { passive: true });
  // a click on a foe on the map picks it (and does not walk you into it)
  addEventListener(
    'click',
    (ev) => {
      const at = cellAt(ev);
      const g = game();
      if (!at || !g) return;
      const e = foeAt(g, at[0], at[1]);
      if (!e) return;
      picked.set(g, e.id);
      ev.stopPropagation();
    },
    true,
  );
}

/** the foe the window shows now */
export function shown(g: Game): Entity | undefined {
  const id = picked.get(g);
  const pick = id ? g.ents.find((e) => e.id === id) : undefined;
  if (pick && seen(g, pick)) return pick;
  if (id) picked.delete(g);
  const hov = hoverCell && foeAt(g, hoverCell[0], hoverCell[1]);
  if (hov) return hov;
  const p = g.player;
  return engaged(g).find((e) => seen(g, e)) ?? g.ents.filter((e) => seen(g, e)).sort((a, b) => dist(a, p) - dist(b, p))[0];
}

/** the window's lines for foe `e`: pure enough for a test */
export function card(g: Game, e: Entity) {
  const type = e.enemy!.type;
  const t = foeText(type);
  const hit = hitOf(e);
  const d = danger(hit, g.player.hp);
  const best = bestArm(arms(g), t.want, Number(e.enemy!.data.armour ?? ENEMIES[type]?.armour ?? 0));
  const [res, n] = DROPS[type] ?? ['bone', 1];
  const dressed = e.enemy!.data.dressed as { kind: string } | undefined;
  const drop = e.enemy!.data.boss ? 'the way down' : e.enemy!.data.summoner ? 'nothing (brood)' : `${n} ${res} · ${Math.round((type === 'mite' ? MITE_DROP : DROP) * 100)}%`;
  const call = t.worth === 'fight' ? 'fight it: it pays' : t.worth === 'avoid' ? 'avoid: little to gain, hits hard' : 'your call';
  return { type, t, hit, danger: d, best, res: e.enemy!.data.boss || e.enemy!.data.summoner ? null : res, drop: dressed ? `${drop} + what it wore` : drop, call };
}

let sig = '';
let lastSeen = -99;
let seenGame: Game | null = null;
frameHooks.push((g) => {
  if (seenGame !== g) [seenGame, lastSeen, sig] = [g, -99, ''];
  meet(g);
  const e = shown(g);
  if (e) lastSeen = g.t;
  const w = windows.get('foe');
  if (!e) {
    if (w && g.t - lastSeen > LINGER) (windows.close('foe'), (sig = ''));
    return;
  }
  const c = card(g, e);
  const hp = Math.max(0, e.enemy!.hp);
  const max = Number(e.enemy!.data.maxHp ?? hp) || 1;
  const key = [e.id, hp.toFixed(1), c.danger, c.best?.name, picked.get(g) === e.id, !!w?.el.isConnected].join('|');
  if (key === sig && w?.el.isConnected) return place(w.el);
  sig = key;
  const win = windows.open('foe', 'foe', [innerWidth - 276, innerHeight - 260]);
  win.el.classList.add('win-foe');
  win.title.querySelector('span')!.textContent = picked.get(g) === e.id ? 'foe · picked' : 'foe';
  const elite = !!e.enemy!.data.elite || !!e.enemy!.data.boss;
  const top = document.createElement('div');
  top.className = 'foe-top';
  const words = document.createElement('div');
  words.innerHTML =
    `<p class="foe-name">${nameOf(e)}${elite ? ' <span class="foe-elite">elite</span>' : ''}</p>` +
    `<p class="foe-what">${c.t.what}</p>`;
  top.append(look(c.type, 36), words);
  const rows = document.createElement('div');
  rows.className = 'foe-rows';
  const blows = Math.max(1, Math.ceil(g.player.hp / Math.max(0.01, c.hit)));
  rows.innerHTML =
    `<p><span class="k">hp</span> <i class="foe-bar"><b style="width:${(hp / max) * 100}%"></b></i> ${hp.toFixed(1)}/${Math.round(max * 10) / 10}</p>` +
    `<p><span class="k">danger</span> <span class="foe-d-${c.danger}">${c.danger}</span> <span class="m">· ${c.hit > 0 ? `${blows} blow${blows === 1 ? '' : 's'} stop you` : 'it does not hit'}</span></p>` +
    `<p class="foe-drop"><span class="k">drops</span> </p>` +
    `<p class="foe-call foe-${c.t.worth}">${c.call}</p>` +
    `<p><span class="k">best</span> ${c.best ? `${c.best.name} <span class="m">· ${why(c.best, c.t.want)}</span>` : '<span class="foe-d-high">no weapon on</span>'}</p>` +
    `<p class="foe-tip">${c.t.tip}</p>`;
  const dropRow = rows.querySelector('.foe-drop')!;
  if (c.res) dropRow.append(img({ kind: 'res', res: c.res, n: 1 } as Item, 1));
  dropRow.append(` ${c.drop}`);
  win.body.replaceChildren(top, rows);
  place(win.el);
});

/** at the foot of the panel column, under the panels when there is room */
function place(el: HTMLElement): void {
  const h = el.offsetHeight;
  const under = Math.max(0, ...[...document.querySelectorAll<HTMLElement>('.win.panel')].map((p) => p.getBoundingClientRect().bottom));
  const y = Math.min(innerHeight - h - 6, Math.max(under + 8, innerHeight - h - 6));
  const x = innerWidth - 276;
  const [l, t] = [x + 'px', Math.max(windows.TOP, y) + 'px'];
  if (el.style.left !== l || el.style.top !== t) [el.style.left, el.style.top] = [l, t];
}

// ---- the first meeting with a kind: a banner for a moment

const met = new WeakMap<Game, Set<string>>();
const queue: Entity[] = [];
let banner: HTMLElement | null = null;
let until = 0;
/** how long a banner shows (ms) */
export const BANNER_MS = 3200;

function meet(g: Game): void {
  let m = met.get(g);
  if (!m) met.set(g, (m = new Set()));
  for (const e of g.ents) {
    if (!e.enemy || e.enemy.data.summoner || m.has(e.enemy.type) || !seen(g, e)) continue;
    m.add(e.enemy.type);
    queue.push(e);
  }
  if (banner && performance.now() > until) (banner.remove(), (banner = null));
  if (!banner && queue.length) show(queue.shift()!);
}

function show(e: Entity): void {
  const t = foeText(e.enemy!.type);
  banner = document.createElement('div');
  banner.className = 'toast toast-foe';
  const text = document.createElement('div');
  text.className = 'toast-text';
  text.innerHTML = `<p class="toast-head">new foe</p><p class="toast-name">${nameOf(e)}</p><p class="toast-line">${t.what}</p>`;
  banner.append(look(e.enemy!.type, 48), text);
  document.body.append(banner);
  until = performance.now() + BANNER_MS;
}

// test runs (?still): look scripts go down a floor and pick a foe by hand
if (/[?&]still/.test(globalThis.location?.search ?? ''))
  (globalThis as unknown as { thawFoes?: unknown }).thawFoes = { goDown, pick: (g: Game, id: number) => picked.set(g, id) };
