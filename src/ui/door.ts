// v2r1 ux: at the keeper's door, before it wakes, a card names what waits inside: its name, hp, blows and
// how it fights, and whether you look ready (src/tune/door.ts). `save setup` keeps what is on now as your
// battle set; `go in` walks through. It goes when you step away or in.

import { atDoor, keeperCheck, keeperOf } from '../tune/door';
import { floorOf } from '../world/floors';
import { frameHooks } from './index';

let el: HTMLElement | null = null;
let sig = '';
/** closed by hand: it stays shut until you step away from the door */
let shut = false;
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
  const s = JSON.stringify([f, c.ready, c.why, c.link, c.dps.toFixed(1), d.dir, g.player.hp > 0]);
  if (s === sig) return;
  sig = s;
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  el.innerHTML =
    `<button class="door-x" title="close">×</button><p class="door-k">the keeper of floor ${f + 1}</p>` +
    `<p class="door-name">${esc(k.name)}</p>` +
    `<p class="door-stats"><b>${c.hp}</b> hp · hits up to <b>${c.damage.toFixed(1)}</b> · you deal <b>${c.dps.toFixed(1)}</b>/s</p>` +
    `<p class="door-hint">${esc(c.hint)}</p>` +
    `<p class="door-verdict ${c.ready ? 'ok' : 'no'}">${c.ready ? 'you look ready.' : `not ready: ${esc(c.why.join('; '))}.`}</p>`;
  const row = document.createElement('p');
  row.className = 'door-btns';
  // v2r5 run: the armour it asks for comes with the swap that makes room for it
  const fix = c.link ? [[c.link.text, c.link.cmd]] : [];
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
