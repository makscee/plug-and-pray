// The item card (Maks 10-18: "show on hover and stay on click, close on click away"): one floating card
// for a module, wherever a module shows (slots, bag, nearby, shop, kit tiles, module windows). Hover shows
// it; a click pins it; a click anywhere else, or Esc, closes it; leaving a pinned card's item keeps it.
// Anchors are found again by their data-card key, so a panel that redraws under a pinned card keeps it.

import type { Modish } from '../core/mods';
import { card } from './cardText';
import './card.css';

let el: HTMLElement | null = null;
/** what the card shows and where: the item, the anchor's key, pinned or only hovered */
type Cur = { m: Modish; key: string; anchor: HTMLElement; pinned: boolean };
let cur: Cur | null = null;
let html = '';
/** v3r1 floor 1: the pinned card, kept while another item's hover card shows; back when the hover ends */
let held: Cur | null = null;
const items = new WeakMap<HTMLElement, () => Modish | null | undefined>();
let n = 0;

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** the card's inner html for a module */
export function cardHtml(m: Modish): string {
  const c = card(m);
  const rar = c.rarity || 'common';
  return (
    `<div class="ic-head"><span class="ic-name rar-${rar}">${esc(c.name)}</span>${c.level ? `<span class="ic-level">${c.level}</span>` : ''}</div>` +
    `<div class="ic-kind">${esc(c.kind)}${c.rarity ? ` · <span class="rar-${rar}">${esc(c.rarity)}</span>` : ''}</div>` +
    `<p class="ic-does">${esc(c.does)}</p>` +
    `<div class="ic-nums">${c.nums.map((x) => `<b>${esc(x)}</b>`).join('')}<span class="ic-cost">${esc(c.cost)}</span></div>` +
    (c.good ? `<p class="ic-good">${esc(c.good)}</p>` : '') +
    (c.flavour ? `<p class="ic-flav">${esc(c.flavour)}</p>` : '') +
    (c.foot ? `<p class="ic-foot">${esc(c.foot)}</p>` : '')
  );
}

/** make an element show a module's card: `key` finds it again after a redraw (unique on the page) */
export function attach(anchor: HTMLElement, key: string, item: () => Modish | null | undefined): void {
  anchor.dataset.card = key;
  items.set(anchor, item);
  anchor.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch' || document.body.classList.contains('dragging')) return;
    // v3r1 floor 1 (a pinned card hid every other item's): hovering another item shows it, the pin comes back after
    if (cur?.pinned) {
      // the pinned item itself (or its tile drawn again under the mouse) keeps the pin
      if (cur.anchor === anchor || cur.key === key) return;
      held = cur;
    }
    show(anchor, false);
  });
  anchor.addEventListener('pointerleave', () => {
    if (!cur || cur.pinned || (cur.anchor !== anchor && cur.key !== key)) return;
    if (held) {
      cur = held;
      held = null;
      return draw();
    }
    hide();
  });
  anchor.addEventListener('click', (e) => {
    // a button inside the anchor (take, pick) does its own thing
    if ((e.target as HTMLElement).closest('button') && (e.target as HTMLElement).closest('button') !== anchor) return;
    show(anchor, true);
  });
}

function show(anchor: HTMLElement, pinned: boolean): void {
  const m = items.get(anchor)?.();
  if (!m) return;
  if (pinned) held = null;
  cur = { m, key: anchor.dataset.card!, anchor, pinned };
  draw();
}

export function hide(): void {
  cur = null;
  held = null;
  if (el) el.hidden = true;
}

/** is a card open (pinned or hovered) */
export const open = (): boolean => !!cur;
export const pinned = (): boolean => !!cur?.pinned;

function draw(): void {
  if (!cur) return;
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = 'item-card';
    document.body.append(el);
  }
  const h = cardHtml(cur.m);
  if (h !== html) {
    html = h;
    el.innerHTML = h;
  }
  el.classList.toggle('pinned', cur.pinned);
  el.hidden = false;
  place(el, cur.anchor, cur.key.startsWith('kit:'));
}

/** next to the item: left of it (the panels sit on the right), else right, else below or above; never off-screen.
 *  v3r1 floor 1: beside the item's whole window, so it never covers the window's other tiles or the bag's
 *  install / recycle / drop buttons; a kit tile's card goes below or above the kit, clear of the tiles beside it */
function place(c: HTMLElement, anchor: HTMLElement, upDown: boolean): void {
  const r = anchor.getBoundingClientRect();
  const box = anchor.closest('.win')?.getBoundingClientRect() ?? r;
  const w = c.offsetWidth;
  const h = c.offsetHeight;
  const gap = 8;
  const W = innerWidth;
  const H = innerHeight;
  let x: number;
  let y: number;
  // a kit tile: under the whole kit card (clear of its take / scrap / later buttons), else above it
  const kit = anchor.closest('.kit-card')?.getBoundingClientRect() ?? r;
  if (upDown && kit.bottom + gap + h <= H - 4) [x, y] = [r.left + r.width / 2 - w / 2, kit.bottom + gap];
  else if (upDown && kit.top - gap - h >= 4) [x, y] = [r.left + r.width / 2 - w / 2, kit.top - gap - h];
  else if (box.left - gap - w >= 4) [x, y] = [box.left - gap - w, r.top];
  else if (box.right + gap + w <= W - 4) [x, y] = [box.right + gap, r.top];
  else if (r.bottom + gap + h <= H - 4) [x, y] = [r.left, r.bottom + gap];
  else [x, y] = [r.left, r.top - gap - h];
  x = Math.max(4, Math.min(W - w - 4, x));
  y = Math.max(4, Math.min(H - h - 4, y));
  c.style.left = Math.round(x) + 'px';
  c.style.top = Math.round(y) + 'px';
}

/** every frame: follow the anchor (found again by key after a redraw), close when it is gone */
function tick(): void {
  requestAnimationFrame(tick);
  if (!cur) return;
  if (document.body.classList.contains('dragging')) return hide();
  if (!cur.anchor.isConnected) {
    const again = document.querySelector<HTMLElement>(`[data-card="${CSS.escape(cur.key)}"]`);
    const m = again && items.get(again)?.();
    if (!again || !m || (!cur.pinned && !again.matches(':hover'))) {
      if (held && !cur.pinned) {
        cur = held;
        held = null;
        return;
      }
      return hide();
    }
    cur.anchor = again;
    cur.m = m;
  } else {
    const m = items.get(cur.anchor)?.();
    if (!m) return hide();
    cur.m = m;
  }
  const r = cur.anchor.getBoundingClientRect();
  if (!r.width && !r.height) return hide();
  draw();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  requestAnimationFrame(tick);
  // a click (or tap) anywhere but the card and its item closes it
  addEventListener('pointerdown', (e) => {
    if (!cur) return;
    const t = e.target as HTMLElement;
    if (el?.contains(t) || t.closest?.(`[data-card="${CSS.escape(cur.key)}"]`)) return;
    hide();
  }, true);
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !cur) return;
    hide();
    e.stopPropagation();
  }, true);
}

/** a fresh key for anchors that have no natural one */
export const nextKey = (): string => 'c' + ++n;
