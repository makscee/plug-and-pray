// The body slice's windows: the ledger (inventory with buttons) and the clock of hours (a small
// top-down dial: enemies now, and where they will be in a second). Both are `mind` modules; other
// mind modules (map spool, reader, compass) fall through to whatever view was registered before.
// Buttons type commands through window.thaw.send, like every button in the game.

import { itemName } from '../core/game';
import { def, param, powerMax, powerUsed, slotsUsed } from '../core/mods';
import { cell, Cell } from '../core/grid';
import type { Game, Inst, Item } from '../core/types';
import { VIEWS, view, type MakeView } from '../ui/views';
import { foresee, setupsOf } from './index';

const send = (cmd: string) => (window as unknown as { thaw: { send(c: string): void } }).thaw.send(cmd);

function button(text: string, cmd: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.dataset.cmd = cmd;
  b.addEventListener('click', () => send(cmd));
  return b;
}

/** the buttons for one carried item: what you can do with it */
function actions(it: Item): [string, string][] {
  const n = itemName(it);
  if (it.kind === 'mod') return [['install', `install ${def(it).name}`], ['drop', `drop ${def(it).name}`]];
  if (it.kind === 'card') return [['read', 'read card'], ['drop', 'drop memory card']];
  return [['drop', `drop ${n.replace(/^\d+ /, '')}`]];
}

const ledger: MakeView = (el) => {
  const box = document.createElement('div');
  box.className = 'ledger';
  el.append(box);
  let sig = '';
  return {
    update(g) {
      const p = g.player;
      const sets = Object.keys(setupsOf(g));
      const s = JSON.stringify([p.inv, p.slots, slotsUsed(g), powerUsed(g), powerMax(g), sets]);
      if (s === sig) return;
      sig = s;
      const head = document.createElement('div');
      head.className = 'ledger-head';
      head.textContent = `slots ${slotsUsed(g)}/${p.slots} · power ${powerUsed(g)}/${powerMax(g)}`;
      const rows = p.inv.map((it) => {
        const r = document.createElement('div');
        r.className = 'ledger-row';
        const name = document.createElement('span');
        name.textContent = itemName(it);
        if (it.kind === 'mod') name.title = `${def(it).family}: ${def(it).text}`;
        r.append(name, ...actions(it).map(([t, c]) => button(t, c)));
        return r;
      });
      if (!rows.length) {
        const r = document.createElement('div');
        r.className = 'ledger-row dim';
        r.textContent = 'you carry nothing.';
        rows.push(r);
      }
      const foot = document.createElement('div');
      foot.className = 'ledger-sets';
      const use = document.createElement('div');
      use.append('setup: ', ...sets.flatMap((n) => [button(n, `setup ${n}`), ' ']));
      if (!sets.length) use.append('none saved');
      const save = document.createElement('div');
      save.append('save on-set as: ', button('battle', 'save setup battle'), ' ', button('explore', 'save setup explore'));
      foot.append(use, save);
      box.replaceChildren(head, ...rows, foot);
    },
  };
};

const R = 6; // cells from the centre to the dial's edge
const PX = 132;

const clock: MakeView = (el, inst) => {
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  c.className = 'clock';
  el.append(c);
  const ctx = c.getContext('2d')!;
  return {
    update(g: Game) {
      ctx.fillStyle = '#060505';
      ctx.fillRect(0, 0, PX, PX);
      if (!inst.on || g.t < inst.readyAt) return;
      const p = g.player;
      const k = PX / 2 / R;
      // north up, you in the middle; walls dim so the marks have something to stand against
      const at = (x: number, y: number): [number, number] => [PX / 2 + (x - p.x) * k, PX / 2 + (y - p.y) * k];
      ctx.fillStyle = '#2a211c';
      for (let j = Math.floor(p.y) - R; j <= Math.floor(p.y) + R; j++)
        for (let i = Math.floor(p.x) - R; i <= Math.floor(p.x) + R; i++) {
          if (cell(g, i, j) === Cell.floor) continue;
          const [x, y] = at(i, j);
          ctx.fillRect(x, y, k, k);
        }
      // the hand: one turn per second
      ctx.strokeStyle = '#3a2f28';
      ctx.beginPath();
      ctx.arc(PX / 2, PX / 2, PX / 2 - 2, 0, Math.PI * 2);
      ctx.moveTo(PX / 2, PX / 2);
      const a = (g.t % 1) * Math.PI * 2;
      ctx.lineTo(PX / 2 + Math.sin(a) * (PX / 2 - 2), PX / 2 - Math.cos(a) * (PX / 2 - 2));
      ctx.stroke();
      for (const f of foresee(g, param<number>(inst, 'ahead', 1))) {
        const [ex, ey] = at(f.e.x, f.e.y);
        const [fx, fy] = at(f.x, f.y);
        ctx.strokeStyle = '#a05030';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#d04030';
        ctx.fillRect(ex - 2, ey - 2, 4, 4);
        ctx.strokeStyle = '#f0a050';
        ctx.strokeRect(fx - 4, fy - 4, 8, 8);
      }
      // you, and your facing
      ctx.fillStyle = '#d8c8b0';
      ctx.fillRect(PX / 2 - 2, PX / 2 - 2, 4, 4);
      ctx.beginPath();
      ctx.strokeStyle = '#d8c8b0';
      ctx.moveTo(PX / 2, PX / 2);
      ctx.lineTo(PX / 2 + Math.sin(p.dir) * 8, PX / 2 - Math.cos(p.dir) * 8);
      ctx.stroke();
    },
  };
};

const mine: Record<string, MakeView> = { ledger, clock };
const before = VIEWS.mind;
view('mind', (el, inst: Inst, g) => {
  const make = mine[param<string>(inst, 'what', '')] ?? before;
  if (make) return make(el, inst, g);
  const p = document.createElement('p');
  p.className = 'flavour';
  p.textContent = def(inst).text;
  el.append(p);
  return { update() {} };
});
