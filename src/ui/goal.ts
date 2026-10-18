// v2r1 ux: the goal line under the HUD: what this floor wants of you now (src/tune/hints.ts goalLine).
// It steps aside for a boss bar and for the big view.

import { goalLine } from '../tune/hints';
import { frameHooks } from './index';

let el: HTMLElement | null = null;
let next = 0;
frameHooks.push((g) => {
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = 'goal';
    document.body.append(el);
  }
  const hide = g.ended === 'dead' || document.body.classList.contains('boss-on') || document.body.classList.contains('big');
  el.hidden = hide;
  const now = performance.now();
  if (hide || now < next) return;
  next = now + 250;
  const t = goalLine(g);
  if (el.textContent !== t) el.textContent = t;
});
