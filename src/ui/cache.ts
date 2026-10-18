// The kit cache's choice card (src/world/cache.ts): the reliquary near where you land. v4 inv (Maks 10-18: "no
// idea why it appeared, should be more intentional"): it shows only once you open it (walk into it, the nearby
// row's `open`, or type `open`), with a one-line intro, then its modules as tiles (icon, name in its rarity's
// colour and a level badge when it would raise yours, kind and cost, the mechanic in one line, where it would
// go) with a take button each, and "scrap the rest". `later`, or walking off, shuts it.

import { frameHooks } from '.';
import { label, maxLevel, moduleLevel, rarityOf, ROMAN } from '../core/mods';
import type { Game, Item } from '../core/types';
import { owned } from '../core/verbs';
import { boneOf, cacheNear, cardOpen, costOf, fitOf, FREE, freeLeft, hideCard, INTRO, SCRAP } from '../world/cache';
import { FLOORS, KIT } from '../world/floors';
import { img } from './icons';
import { attach } from './card';
import { costLine, kindOf, mechanic } from './cardText';
import './cache.css';

const send = (cmd: string) => (window as unknown as { thaw?: { send: (c: string) => void } }).thaw?.send(cmd);

let el: HTMLElement | null = null;
let key = '';
/** v2r2 ux: the offer as it first showed, so a pick greys its tile in place and the others keep their spots (a
 *  second click on the same spot picked a neighbour) */
const firstOffer = new WeakMap<object, Item[]>();
/** v2r4 ux: the tallest the rule line and the tile row have been for this cache (px): a pick never shrinks them, so
 *  the take buttons stay where they were and "scrap the rest" never moves up under the pointer */
const tallest = new WeakMap<object, { rule: number; row: number }>();

/** the level a pick would raise yours to (▲ II), when you own it */
function upBadge(g: Game, it: Item): string {
  const have = it.kind === 'mod' && owned(g, it.mod);
  if (!have) return '';
  return `▲ ${ROMAN[Math.min(maxLevel(have), moduleLevel(have) + Math.max(1, moduleLevel(it) - 1))]}`;
}

function el_(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

frameHooks.push((g) => {
  const c = g.ended ? undefined : cacheNear(g);
  // never over a fight: it comes back when nothing is after you
  const fight = g.ents.some((e) => e.enemy?.data.noticed && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 7);
  const show = !!c && cardOpen(g) && !fight;
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
  const again = !!el;
  el?.remove();
  el = el_('div', `kit-card${again ? ' again' : ''}`);
  const f = c!.floor;
  const free = freeLeft(c!);
  const cost = costOf(c!);
  const head = el_('div', 'kit-head');
  head.append(el_('span', 'kit-title', `reliquary · choose ${free || FREE}`), el_('span', 'kit-sub', `floor ${f + 1} · ${FLOORS[f].name}`));
  const intro = el_('p', 'kit-intro', INTRO);
  const rule = el_('p', 'kit-rule');
  rule.innerHTML = free
    ? `<b>${free}</b> free of ${c!.offer.length}${c!.taken ? '' : `; every pick after ${FREE} costs bone`}. the rest folds into scrap.`
    : `free picks used. the next costs <b>${cost} bone</b> <span class="${bone >= cost ? 'ok' : 'short'}">(you carry ${bone})</span>.`;
  const row = el_('div', 'kit-row');
  if (!firstOffer.has(c!)) firstOffer.set(c!, [...c!.offer]);
  firstOffer.get(c!)!.forEach((it) => {
    if (it.kind !== 'mod') return;
    const n = c!.offer.indexOf(it);
    if (n < 0) {
      // taken: its spot stays, greyed
      const gone = el_('div', 'kit-tile kit-taken');
      gone.append(el_('p', 'name', label(it)), el_('p', 'kit-meta', 'taken'));
      row.append(gone);
      return;
    }
    const tile = el_('div', `kit-tile rar-${rarityOf(it)}`);
    const icon = el_('div', `kit-icon cell rar-${rarityOf(it)}`);
    icon.append(img(it, 3));
    const name = el_('p', `name rar-${rarityOf(it)}`, label(it));
    // v4 inv: a pick that raises one you own says so on its name
    const up = upBadge(g, it);
    if (up) name.append(' ', el_('span', 'kit-up', up));
    // v3 cards: kind and cost, then the mechanic in one line; the full card on hover and click
    const meta = el_('p', 'kit-meta', `${kindOf(it)} · ${costLine(it)}${it.mod === KIT[f]?.[0] ? ' · headline' : ''}`);
    const text = el_('p', 'kit-text', mechanic(it).split(/[.;:]\s/)[0].replace(/[.;:]$/, ''));
    const fitText = fitOf(g, it);
    const fit = el_('p', `kit-fit${fitText.startsWith('⚠') ? ' kit-warn' : ''}`, fitText);
    const b = el_('button', 'kit-pick', free ? 'take' : `take · ${cost} bone`) as HTMLButtonElement;
    b.dataset.cmd = `pick ${n + 1}`;
    if (!free && bone < cost) b.disabled = true;
    b.addEventListener('click', () => send(`pick ${n + 1}`));
    tile.append(icon, name, meta, text, fit, b);
    attach(tile, `kit:${f}:${n}:${it.mod}`, () => it);
    row.append(tile);
  });
  const foot = el_('div', 'kit-foot');
  const scrap = el_('button', 'kit-scrap', `scrap the rest · +${c!.offer.length * SCRAP} bone`) as HTMLButtonElement;
  scrap.dataset.cmd = 'scrap';
  scrap.addEventListener('click', () => send('scrap'));
  const later = el_('button', 'kit-later', 'later') as HTMLButtonElement;
  later.addEventListener('click', () => (hideCard(g, true), el?.remove(), (el = null), (key = '')));
  foot.append(scrap, later);
  el.append(head, intro, rule, row, foot);
  document.body.append(el);
  const t = tallest.get(c!) ?? { rule: 0, row: 0 };
  tallest.set(c!, t);
  t.rule = Math.max(t.rule, rule.getBoundingClientRect().height);
  t.row = Math.max(t.row, row.getBoundingClientRect().height);
  rule.style.minHeight = `${t.rule}px`;
  row.style.minHeight = `${t.row}px`;
});
