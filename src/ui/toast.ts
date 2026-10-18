// v3 econ (Maks 10-18: "getting modules more like an event"): a rare or unique find and every upgrade shows for
// a moment as a small card in the kit cache's look (src/ui/cache.css): the icon, the name with its level, and one
// line of what changed. It never takes a click and goes by itself; several queue up.

import { frameHooks } from '.';
import { label, rarityOf } from '../core/mods';
import type { Game } from '../core/types';
import { MOMENTS, type Moment } from '../core/verbs';
import { img } from './icons';

/** how long one shows (ms) */
export const TOAST_MS = 2600;
let el: HTMLElement | null = null;
let until = 0;

function show(m: Moment): void {
  el?.remove();
  el = document.createElement('div');
  el.className = `toast rar-${rarityOf(m.item)}`;
  const icon = document.createElement('div');
  icon.className = `kit-icon cell rar-${rarityOf(m.item)}`;
  icon.append(img({ kind: 'mod', ...m.item }, 3));
  const text = document.createElement('div');
  text.className = 'toast-text';
  const head = document.createElement('p');
  head.className = 'toast-head';
  head.textContent = m.head;
  const name = document.createElement('p');
  name.className = `toast-name rar-${rarityOf(m.item)}`;
  name.textContent = label(m.item);
  text.append(head, name);
  if (m.line) {
    const line = document.createElement('p');
    line.className = 'toast-line';
    line.textContent = m.line;
    text.append(line);
  }
  el.append(icon, text);
  document.body.append(el);
  until = performance.now() + TOAST_MS;
}

frameHooks.push((g: Game) => {
  const q = MOMENTS.get(g);
  if (el && performance.now() > until) (el.remove(), (el = null));
  if (!el && q?.length) show(q.shift()!);
});
