// The always-open panels on the right edge: modules (slots and power on top), inventory, and what lies
// nearby. Each row carries its buttons; a panel redraws only when what it shows changes. They stack
// down the right edge until the player drags one away.

import { dist, itemName, reach } from '../core/game';
import { Cell, cell, veinOf } from '../core/grid';
import { def, label, powerMax, powerUsed, working } from '../core/mods';
import { VERBS } from '../core/verbs';
import type { Game, Item } from '../core/types';
import * as windows from './windows';
import { costs, does } from '../mods/describe';
import { affords, fmt, offers, PRICES, priceOf, scrapOf, shopNear } from '../world/printer';
import type { Roll } from '../core/types';

type Send = (cmd: string) => void;
/** a row: text parts (a string, or [text, class]) then buttons ({label, cmd}, or a dim note) */
type Part = string | [string, string] | [string, string, string] | { label: string; cmd?: string; note?: string };
/** a module's name part: hover shows what it does */
const modName = (m: { mod: string; roll?: Roll }): Part => [label(m), 'name modname', `${does(m)}\n${costs(m)}`];

const ok = (g: Game, v: string) => !!VERBS[v] && (!VERBS[v].when || VERBS[v].when!(g));
export const PANEL_W = 260;

/** pips for a resource: used of max, red when full */
export function pips(used: number, max: number): string {
  const full = used >= max;
  let s = '';
  for (let k = 0; k < Math.max(max, used); k++) s += `<b class="${k < used ? 'used' : ''}${k >= max ? ' over' : ''}"></b>`;
  return `<span class="pips${full ? ' full' : ''}">${s}</span>`;
}

export class Panels {
  g: Game;
  send: Send;
  keys = new Map<string, string>();

  constructor(g: Game, send: Send) {
    this.g = g;
    this.send = send;
    for (const [id, title] of [['modules', 'modules'], ['inv', 'inventory'], ['near', 'nearby']])
      windows.open(id, title, [innerWidth - PANEL_W - 16, 24]).el.classList.add('panel', 'panel-' + id);
  }

  frame(): void {
    const g = this.g;
    this.draw('modules', this.modules(g), this.head(g));
    this.draw('inv', this.inv(g));
    this.draw('near', this.near(g));
    this.stack();
  }

  head(g: Game): string {
    const p = g.player;
    return `<div class="res-row"><span>slots ${p.installed.length}/${p.slots}</span>${pips(p.installed.length, p.slots)}</div>` +
      `<div class="res-row"><span>power ${powerUsed(g)}/${powerMax(g)}</span>${pips(powerUsed(g), powerMax(g))}</div>`;
  }

  modules(g: Game): Part[][] {
    const rows = g.player.installed.map((i): Part[] => {
      const d = def(i);
      const state = !i.on ? 'off' : working(g, i) ? 'on' : 'warm';
      return [['●', 'st st-' + state], modName(i), [cost(d.power), 'cost'],
        { label: i.on ? 'off' : 'on', cmd: `${i.on ? 'off' : 'on'} ${label(i)}` }, { label: 'remove', cmd: `remove ${label(i)}` }];
    });
    return rows.length ? rows : [[['no modules. install from the inventory.', 'dim']]];
  }

  inv(g: Game): Part[][] {
    const p = g.player;
    const free = p.installed.length < p.slots;
    const spare = powerMax(g) - powerUsed(g);
    const rows = p.inv.map((it): Part[] => {
      const drop: Part = { label: 'drop', cmd: `drop ${dropName(it)}` };
      if (it.kind === 'mod') {
        const d = def(it);
        const install: Part = !free ? { label: 'install', note: 'no slot' }
          : d.power > spare ? { label: 'install', cmd: `install ${label(it)}`, note: `stays off: needs ${d.power}` }
          : { label: 'install', cmd: `install ${label(it)}` };
        const scrap = scrapOf(it);
        const recycle: Part = Object.keys(scrap).length ? { label: 'recycle', cmd: `recycle ${label(it)}`, note: undefined } : { label: 'recycle', note: 'it will not break' };
        return [modName(it), [cost(d.power), 'cost'], install, { label: '?', cmd: `info ${label(it)}` }, recycle, drop];
      }
      if (it.kind === 'card') return [['memory card', 'name'], ok(g, 'read') ? { label: 'read', cmd: 'read card' } : { label: 'read', note: 'needs a card reader' }, drop];
      return [[`${it.res} ×${it.n}`, 'name'], drop];
    });
    return rows.length ? rows : [[['you carry nothing.', 'dim']]];
  }

  near(g: Game): Part[][] {
    const p = g.player;
    const rows: Part[][] = [];
    const items = reach(g);
    for (const e of items) {
      const it = e.item!;
      rows.push([it.kind === 'mod' ? modName(it) : [itemName(it), 'name'], ...(it.kind === 'mod' ? [{ label: '?', cmd: `info ${label(it)}` }] : []), { label: 'take', cmd: `take ${itemName(it)}` }]);
    }
    if (items.length > 1) rows.unshift([['', 'name'], { label: 'take all', cmd: 'take' }]);
    if (g.ents.some((e) => e.kind === 'printer' && !e.data?.shop && dist(e, p) < 1.6))
      rows.push([['printer', 'name'], { label: 'print slot', cmd: 'print slot' }, { label: 'print module', cmd: 'print module' }]);
    const shop = shopNear(g);
    if (shop) {
      rows.push([['reliquary', 'name'], { label: 'reroll', cmd: 'reroll', note: `reroll: ${fmt(PRICES.reroll)}` }]);
      offers(g, shop).forEach((it, k) => {
        if (!it || it.kind !== 'mod') return void rows.push([[`${k + 1}. sold`, 'dim']]);
        const price = priceOf(it);
        rows.push([modName(it), { label: '?', cmd: `info ${label(it)}` },
          affords(g, price) ? { label: 'buy', cmd: `buy ${k + 1}`, note: fmt(price) } : { label: 'buy', note: `${fmt(price)}: short` }]);
      });
    }
    const [cx, cy] = [Math.floor(p.x), Math.floor(p.y)];
    for (const [d, dx, dy] of [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]] as const) {
      const c = cell(g, cx + dx, cy + dy);
      const res = c >= Cell.vein ? veinOf(c) : null;
      if (res) rows.push([[`${res} vein (${d})`, 'name'], ok(g, 'drain') ? { label: 'drain', cmd: 'drain' } : { label: 'drain', note: 'needs a needle' }]);
    }
    return rows.length ? rows : [[['nothing here.', 'dim']]];
  }

  draw(id: string, rows: Part[][], head = ''): void {
    const w = windows.get(id);
    if (!w) return;
    const key = head + JSON.stringify(rows);
    if (this.keys.get(id) === key) return;
    this.keys.set(id, key);
    const els: HTMLElement[] = [];
    if (head) {
      const h = document.createElement('div');
      h.className = 'res';
      h.innerHTML = head;
      els.push(h);
    }
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'row';
      const notes: string[] = [];
      for (const part of r) {
        if (typeof part === 'string' || Array.isArray(part)) {
          const [text, cls, tip] = typeof part === 'string' ? [part, '', ''] : part;
          const s = document.createElement('span');
          s.textContent = text;
          if (cls) s.className = cls;
          if (tip) s.title = tip;
          row.append(s);
        } else {
          const b = document.createElement('button');
          b.textContent = part.label;
          if (part.cmd) {
            b.dataset.cmd = part.cmd;
            b.addEventListener('click', () => this.send(part.cmd!));
          } else b.disabled = true;
          if (part.note) b.title = part.note;
          row.append(b);
          if (part.note) notes.push(part.note);
        }
      }
      // why a button is greyed (or what it will do) goes on its own line under the row
      for (const t of notes) {
        const n = document.createElement('span');
        n.className = 'dim note';
        n.textContent = t;
        row.append(n);
      }
      els.push(row);
    }
    w.body.replaceChildren(...els);
  }

  /** the panels stack down the right edge, each under the one above, unless dragged */
  stack(): void {
    let y = 24;
    for (const id of ['modules', 'inv', 'near']) {
      const w = windows.get(id);
      if (!w) continue;
      if (w.el.dataset.moved) continue;
      w.el.style.left = innerWidth - PANEL_W - 16 + 'px';
      w.el.style.top = y + 'px';
      y += w.el.offsetHeight + 8;
    }
  }
}

/** a module's power draw, as a short tag */
const cost = (n: number) => (n ? `${n}\u26a1\ufe0e` : '');

/** a word `drop` finds this item by */
function dropName(it: Item): string {
  return it.kind === 'res' ? it.res : it.kind === 'card' ? 'memory card' : label(it);
}
