// The kit cache's choice card (src/world/cache.ts): while you stand by a floor's cache it shows its five
// modules as tiles (icon, name in its rarity's colour, family, power and slots, what it does, where it would
// go) with a pick button each, the picks left or the price of the next, and "scrap the rest". `later` hides
// it until you walk off and come back (or type `cache`). On the cradle it waits until your legs are in; below,
// until the floor's banner is gone.

import { frameHooks } from '.';
import { def, label, rarityOf, size } from '../core/mods';
import type { Game } from '../core/types';
import { boneOf, cacheNear, cardHidden, costOf, fitOf, FREE, freeLeft, hideCard, SCRAP } from '../world/cache';
import { floorOf, FLOORS, KIT } from '../world/floors';
import { img } from './icons';
import './cache.css';

const send = (cmd: string) => (window as unknown as { thaw?: { send: (c: string) => void } }).thaw?.send(cmd);

let el: HTMLElement | null = null;
let key = '';
const wasNear = new WeakMap<Game, boolean>();
/** the floor the card last saw, and when (real ms) you came to it: the card waits out the floor's banner (src/ui/floors.ts) */
const landed = new WeakMap<Game, { f: number; at: number }>();
const BANNER = 5000;

function el_(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

frameHooks.push((g) => {
  const c = g.ended ? undefined : cacheNear(g);
  // walking off and back brings a hidden card back
  if (!c && wasNear.get(g)) hideCard(g, false);
  wasNear.set(g, !!c);
  const legs = g.player.installed.some((i) => def(i).family === 'gait');
  const f0 = floorOf(g);
  let l = landed.get(g);
  if (!l || l.f !== f0) landed.set(g, (l = { f: f0, at: l ? performance.now() : -BANNER }));
  // never over a fight: it comes back when nothing is after you
  const fight = g.ents.some((e) => e.enemy?.data.noticed && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 7);
  const show = !!c && !cardHidden(g) && !fight && (f0 > 0 ? performance.now() - l.at > BANNER : legs);
  if (!show) {
    el?.remove();
    el = null;
    key = '';
    return;
  }
  const bone = boneOf(g);
  const k = JSON.stringify([c!.floor, c!.offer.map((i) => (i.kind === 'mod' ? label(i) : '')), c!.taken, bone, g.player.installed.map((i) => i.mod + i.on), g.player.slots]);
  if (k === key && el?.isConnected) return;
  key = k;
  el?.remove();
  el = el_('div', 'kit-card');
  const f = c!.floor;
  const free = freeLeft(c!);
  const cost = costOf(c!);
  const head = el_('div', 'kit-head');
  head.append(el_('span', 'kit-title', `floor ${f + 1} kit`), el_('span', 'kit-sub', FLOORS[f].name));
  const rule = el_('p', 'kit-rule');
  rule.innerHTML = free
    ? `take <b>${free}</b> of ${c!.offer.length} for nothing${c!.taken ? '' : `; every pick after ${FREE} costs bone`}. the rest folds into scrap.`
    : `free picks used. the next costs <b>${cost} bone</b> <span class="${bone >= cost ? 'ok' : 'short'}">(you carry ${bone})</span>.`;
  const row = el_('div', 'kit-row');
  c!.offer.forEach((it, n) => {
    if (it.kind !== 'mod') return;
    const d = def(it);
    const tile = el_('div', `kit-tile rar-${rarityOf(it)}`);
    const icon = el_('div', `kit-icon cell rar-${rarityOf(it)}`);
    icon.append(img(it, 3));
    const name = el_('p', `name rar-${rarityOf(it)}`, label(it));
    const meta = el_('p', 'kit-meta', `${d.family}${d.power ? ` · ${d.power}⚡︎` : ''}${size(it) > 1 ? ` · ${size(it)} slots` : ''}${it.mod === KIT[f]?.[0] ? ' · headline' : ''}`);
    const text = el_('p', 'kit-text', d.text);
    const fit = el_('p', 'kit-fit', fitOf(g, it));
    const b = el_('button', 'kit-pick', free ? 'take' : `take · ${cost} bone`) as HTMLButtonElement;
    b.dataset.cmd = `pick ${n + 1}`;
    if (!free && bone < cost) b.disabled = true;
    b.addEventListener('click', () => send(`pick ${n + 1}`));
    tile.append(icon, name, meta, text, fit, b);
    row.append(tile);
  });
  const foot = el_('div', 'kit-foot');
  const scrap = el_('button', 'kit-scrap', `scrap the rest · +${c!.offer.length * SCRAP} bone`) as HTMLButtonElement;
  scrap.dataset.cmd = 'scrap';
  scrap.addEventListener('click', () => send('scrap'));
  const later = el_('button', 'kit-later', 'later') as HTMLButtonElement;
  later.addEventListener('click', () => (hideCard(g, true), el?.remove(), (el = null), (key = '')));
  foot.append(scrap, later);
  el.append(head, rule, row, foot);
  document.body.append(el);
});
