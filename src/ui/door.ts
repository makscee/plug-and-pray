// v2r1 ux: at the keeper's door, before it wakes, a card names what waits inside: its name, hp, blows and
// how it fights, and whether you look ready (src/tune/door.ts). `save setup` keeps what is on now as your
// battle set; `go in` walks through. It goes when you step away or in.

import { atDoor, keeperCheck, keeperOf } from '../tune/door';
import { floorOf } from '../world/floors';
import { altarSeen } from '../tune/hints';
import type { Game } from '../core/types';
import { frameHooks } from './index';

let el: HTMLElement | null = null;
let sig = '';
/** closed by hand: it stays shut until you step away from the door */
let shut = false;
/** v2-last-polish (v2r6 newcomer: the verdict wrapped to five lines, and "an altar (+hp) or armour first (4 bone,
 *  1 copper)" named no place with no altar seen): each blocker short, on its own line. The words come from
 *  keeperCheck (src/tune/door.ts); only the card says them shorter */
export function tight(g: Game, why: string): string {
  // a price you cannot pay names what you are short of; the console says how to get it
  const w = why.replace(/; you are short: (glass|copper|bone|ichor)\b.*$/, '; short of $1)').replace(/; you are short\b.*$/, '; short)');
  const frail = /^too frail for its blows: (.*)$/.exec(w);
  if (frail) {
    const fix = frail[1];
    const flesh = /^an altar \(\+hp\) or armour first ?(.*)$/.exec(fix);
    if (!flesh) return `too frail: ${fix.replace(/^turn on your /, 'turn on ').replace(/^install the (.*) you carry$/, 'install your $1')}`;
    return altarSeen(g) ? `too frail: altar flesh${flesh[1] ? ` ${flesh[1]}` : ''} or armour` : 'too frail: no altar seen (listen), or print body at a printer';
  }
  const short = /^about (\d+) hp short:/.exec(w);
  if (short) return `${short[1]} hp short: altar, armour or a stronger weapon`;
  return w
    .replace(/^(temper|attune) your (.*) at an altar first/, '$1 $2 at an altar')
    .replace(/^upgrade your (.*) at a printer or altar first/, 'upgrade $1 at a printer or altar')
    .replace(/^weapons too weak: find or print a stronger one, or a second$/, 'weapons too weak: a stronger one, or a second');
}

const send = (c: string) => (window as unknown as { thaw: { send(c: string): void } }).thaw.send(c);

frameHooks.push((g) => {
  const d = g.ended ? null : atDoor(g, 3);
  if (!d || shut) {
    if (!d) shut = false;
    if (el) el.hidden = true;
    return;
  }
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = 'door-card';
    document.body.append(el);
  }
  el.hidden = false;
  const f = floorOf(g);
  const c = keeperCheck(g, f);
  const k = keeperOf(g, f);
  const s = JSON.stringify([f, c.ready, c.risky, c.why, c.link, c.dps.toFixed(1), d.dir, g.player.hp > 0, !!altarSeen(g)]);
  if (s === sig) return;
  sig = s;
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  el.innerHTML =
    `<button class="door-x" title="close">×</button><p class="door-k">the keeper of floor ${f + 1}</p>` +
    `<p class="door-name">${esc(k.name)}</p>` +
    `<p class="door-stats"><b>${c.hp}</b> hp · hits up to <b>${c.damage.toFixed(1)}</b> · you deal <b>${c.dps.toFixed(1)}</b>/s</p>` +
    `<p class="door-hint">${esc(c.hint)}</p>` +
    `<p class="door-verdict ${c.ready ? (c.risky ? 'risky' : 'ok') : 'no'}">${c.ready ? (c.risky ? `risky: ${esc(c.risky)}.` : 'you look ready.') : `not ready:${c.why.map((w) => `<br><span>· ${esc(tight(g, w))}</span>`).join('')}`}</p>`;
  const row = document.createElement('p');
  row.className = 'door-btns';
  // v2r5 run: the armour it asks for comes with the swap that makes room for it
  const fix = c.link ? [[c.link.text, c.link.cmd]] : [];
  if (!c.link && c.why.some((w) => tight(g, w).includes('(listen)'))) fix.push(['listen', 'listen']);
  for (const [text, cmd] of [...fix, ['save setup', 'save setup battle'], [c.ready ? 'go in' : 'go in anyway', 'go in']]) {
    const b = document.createElement('button');
    b.textContent = text;
    b.dataset.cmd = cmd;
    b.addEventListener('click', () => send(cmd));
    row.append(b);
  }
  el.append(row);
  el.querySelector('.door-x')!.addEventListener('click', () => ((shut = true), (sig = '')));
});
