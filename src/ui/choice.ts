// v2r2 fun: at a set piece that asks (src/world/choices.ts), a small card in the door card's style: the
// piece's name, its question and a button per deal with its price, and "leave it". It goes when you walk
// off, take a deal or leave it; × hides it until you step away.

import { choiceNear } from '../world/choices';
import { pieceOf } from '../world/piecefill';
import { frameHooks } from './index';
import './choice.css';

let el: HTMLElement | null = null;
let sig = '';
/** closed by hand: shut until you walk away from the piece */
let shut = false;
const send = (c: string) => (window as unknown as { thaw: { send(c: string): void } }).thaw.send(c);
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

frameHooks.push((g) => {
  const n = g.ended ? null : choiceNear(g);
  if (!n || shut) {
    if (!n) shut = false;
    if (el) el.hidden = true;
    return;
  }
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = 'door-card choice-card';
    document.body.append(el);
  }
  el.hidden = false;
  const why = n.c.deals.map((d) => d.why?.(g, n.e) ?? null);
  const s = JSON.stringify([n.e.id, why]);
  if (s === sig) return;
  sig = s;
  el.innerHTML =
    `<button class="door-x" title="close">×</button><p class="door-k">a set piece asks</p>` +
    `<p class="door-name">${esc(pieceOf(n.e)?.name ?? '')}</p>` +
    `<p class="door-hint">${esc(n.c.ask)}</p>`;
  const row = document.createElement('p');
  row.className = 'door-btns';
  n.c.deals.forEach((d, k) => {
    const b = document.createElement('button');
    b.innerHTML = `${esc(d.label)} <span class="choice-price">· ${esc(d.price)}</span>`;
    if (why[k]) {
      b.disabled = true;
      b.title = why[k]!;
    } else {
      b.dataset.cmd = `choose ${k + 1}`;
      b.addEventListener('click', () => send(`choose ${k + 1}`));
    }
    row.append(b);
  });
  const leave = document.createElement('button');
  leave.textContent = 'leave it';
  leave.dataset.cmd = 'choose leave';
  leave.addEventListener('click', () => send('choose leave'));
  row.append(leave);
  el.append(row);
  const no = why.find(Boolean);
  if (no) {
    const p = document.createElement('p');
    p.className = 'door-verdict no';
    p.textContent = `not now: ${no}.`;
    el.append(p);
  }
  el.querySelector('.door-x')!.addEventListener('click', () => ((shut = true), (sig = '')));
});
