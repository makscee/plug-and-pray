// The always-open panels on the right edge: modules (slots and power on top, then a grid of sockets),
// inventory (a grid of icons), and what lies nearby (rows with icons). Click a cell in a grid: a detail
// pane under it shows what the thing does and its buttons; double-click installs (or switches on/off).
// A panel redraws only when what it shows changes. They stack down the right edge until dragged away.

import { dist, itemName, reach } from '../core/game';
import { Cell, cell, veinOf } from '../core/grid';
import { def, label, powerMax, powerUsed, working } from '../core/mods';
import { instRef, VERBS } from '../core/verbs';
import type { Game, Item, Roll } from '../core/types';
import * as windows from './windows';
import { costs, does } from '../mods/describe';
import { affords, fmt, offers, PRICES, priceAt, scrapOf, shopNear } from '../world/printer';
import { altarNear, offers as altarOffers } from '../world/altar';
import { img, type Of } from './icons';
import { setupsOf } from '../body';

type Send = (cmd: string) => void;
/** a button: a command, or greyed with a note saying why */
type Btn = { label: string; cmd?: string; note?: string; on?: boolean };
/** a grid cell: an icon (or an empty socket), what selecting it shows */
interface GridCell {
  sel: string;
  icon?: Of;
  title: string;
  /** on / warm / off ring for installed modules */
  state?: string;
  badge?: string;
  /** typed on double-click */
  dbl?: string;
  mod?: string;
  /** greyed: it cannot be installed now */
  dim?: boolean;
}
interface Detail {
  icon: Of;
  title: string;
  lines: string[];
  buttons: Btn[];
}
/** a nearby row: an icon, a name, buttons */
interface Row {
  icon?: Of;
  name: string;
  tip?: string;
  buttons: Btn[];
  dim?: boolean;
}

const ok = (g: Game, v: string) => !!VERBS[v] && (!VERBS[v].when || VERBS[v].when!(g));
export const PANEL_W = 260;
/** grid icon scale: 16 px drawn at ×2 */
const SCALE = 2;

/** pips for a resource: used of max, red when full */
export function pips(used: number, max: number): string {
  const full = used >= max;
  // past 8 a row of pips wraps and misaligns: a bar instead (the number sits in its label)
  if (Math.max(max, used) > 8) return `<span class="pips bar${full ? ' full' : ''}"><b style="width:${Math.min(100, (used / Math.max(1, max)) * 100)}%"></b></span>`;
  let s = '';
  for (let k = 0; k < Math.max(max, used); k++) s += `<b class="${k < used ? 'used' : ''}${k >= max ? ' over' : ''}"></b>`;
  return `<span class="pips${full ? ' full' : ''}">${s}</span>`;
}

const modLines = (m: { mod: string; roll?: Roll }) => [does(m), costs(m), def(m).text];

export class Panels {
  g: Game;
  send: Send;
  keys = new Map<string, string>();
  /** the selected cell per panel */
  sel = new Map<string, string>();

  constructor(g: Game, send: Send) {
    this.g = g;
    this.send = send;
    for (const [id, title] of [['modules', 'modules'], ['inv', 'inventory'], ['near', 'nearby']])
      windows.open(id, title, [innerWidth - PANEL_W - 16, windows.TOP]).el.classList.add('panel', 'panel-' + id);
  }

  frame(): void {
    const g = this.g;
    const [mc, md] = this.modules(g);
    this.grid('modules', mc, md, this.head(g), '', this.setups(g));
    const [ic, id] = this.inv(g);
    this.grid('inv', ic, id, '', ic.length ? '' : 'you carry nothing.');
    this.list('near', this.near(g));
    this.stack();
  }

  head(g: Game): string {
    const p = g.player;
    return `<div class="res-row"><span>slots ${p.installed.length}/${p.slots}</span>${pips(p.installed.length, p.slots)}</div>` +
      `<div class="res-row"><span>power ${powerUsed(g)}/${powerMax(g)}</span>${pips(powerUsed(g), powerMax(g))}</div>`;
  }

  /** saved setups as buttons (keys 1-4 do the first four), and one to save what is on now */
  setups(g: Game): Btn[] {
    const all = setupsOf(g);
    const names = Object.keys(all);
    let n = names.length + 1;
    while (names.includes(String(n))) n++;
    // the one whose modules are exactly what is on now is marked
    const now = g.player.installed.filter((i) => i.on).map((i) => i.mod).sort().join();
    return [
      ...names.map((name, k) => ({
        // the key, then the name, unless the name is the key ("1", not "1 1")
        label: k < 4 && name !== String(k + 1) ? `${k + 1} ${name}` : name,
        cmd: `setup ${name}`,
        on: [...all[name]].sort().join() === now,
      })),
      { label: '+ save', cmd: `save setup ${n}` },
    ];
  }

  /** the slots as sockets: installed modules first, then empty sockets up to the slot count */
  modules(g: Game): [GridCell[], Detail | null] {
    const p = g.player;
    const cells: GridCell[] = p.installed.map((i) => {
      const state = !i.on ? 'off' : working(g, i) ? 'on' : 'warm';
      return { sel: 'u' + i.uid, icon: { mod: i.mod, roll: i.roll }, title: `${label(i)} · ${state}`, state, mod: i.mod, dbl: `${i.on ? 'off' : 'on'} ${instRef(g, i)}` };
    });
    for (let k = p.installed.length; k < p.slots; k++) cells.push({ sel: 'empty' + k, title: 'an empty socket' });
    const s = this.sel.get('modules');
    const inst = p.installed.find((i) => 'u' + i.uid === s);
    if (!inst) return [cells, null];
    return [cells, {
      icon: { mod: inst.mod, roll: inst.roll },
      title: label(inst),
      lines: [!inst.on ? 'off' : working(g, inst) ? 'on' : 'warming up', ...modLines(inst)],
      buttons: [{ label: inst.on ? 'off' : 'on', cmd: `${inst.on ? 'off' : 'on'} ${instRef(g, inst)}` }, { label: 'remove', cmd: `remove ${instRef(g, inst)}` }],
    }];
  }

  inv(g: Game): [GridCell[], Detail | null] {
    const p = g.player;
    const free = p.installed.length < p.slots;
    const spare = powerMax(g) - powerUsed(g);
    const seen = new Map<string, number>();
    const cells: GridCell[] = [];
    let detail: Detail | null = null;
    const s = this.sel.get('inv');
    for (const it of p.inv) {
      const name = it.kind === 'res' ? it.res : it.kind === 'card' ? 'memory card' : label(it);
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      const sel = `${name}#${n}`;
      const drop: Btn = { label: 'drop', cmd: `drop ${dropName(it)}` };
      let c: GridCell;
      let buttons: Btn[];
      let lines: string[];
      if (it.kind === 'mod') {
        const d = def(it);
        const install: Btn = !free ? { label: 'install', note: 'no free slot' }
          : d.power > spare ? { label: 'install', cmd: `install ${label(it)}`, note: `it stays off: needs ${d.power}⚡︎, ${spare} spare` }
          : { label: 'install', cmd: `install ${label(it)}` };
        const scrap = scrapOf(it);
        const recycle: Btn = Object.keys(scrap).length ? { label: 'recycle', cmd: `recycle ${label(it)}`, note: `recycle: ${fmt(scrap)}` } : { label: 'recycle', note: 'it will not break' };
        buttons = [install, { label: '?', cmd: `info ${label(it)}` }, recycle, drop];
        lines = modLines(it);
        c = { sel, icon: it, title: `${label(it)} · ${does(it)}`, mod: it.mod, dbl: install.cmd, dim: !free };
      } else if (it.kind === 'card') {
        const scripture = !it.card.startsWith('log');
        buttons = [ok(g, 'read') ? { label: 'read', cmd: 'read card' } : { label: 'read', note: 'needs a card reader' }, drop];
        lines = [scripture ? 'a shard of scripture. read it to learn where the engine lies.' : 'a machine\'s last log. read it: it points somewhere.'];
        c = { sel, icon: it, title: 'memory card', dbl: ok(g, 'read') ? 'read card' : undefined };
      } else {
        buttons = [drop];
        lines = [`${it.n} ${it.res}. printers, reliquaries and altars take it.`];
        c = { sel, icon: it, title: `${it.res} ×${it.n}`, badge: String(it.n) };
      }
      cells.push(c);
      if (sel === s) detail = { icon: it, title: it.kind === 'res' ? `${it.res} ×${it.n}` : c.title.split(' · ')[0], lines, buttons };
    }
    return [cells, detail];
  }

  near(g: Game): Row[] {
    const p = g.player;
    const rows: Row[] = [];
    const items = reach(g);
    if (items.length > 1) rows.push({ name: '', buttons: [{ label: 'take all', cmd: 'take' }] });
    for (const e of items) {
      const it = e.item!;
      rows.push({
        icon: it,
        name: it.kind === 'mod' ? label(it) : itemName(it),
        tip: it.kind === 'mod' ? `${does(it)}\n${costs(it)}` : undefined,
        buttons: [...(it.kind === 'mod' ? [{ label: '?', cmd: `info ${label(it)}` }] : []), { label: 'take', cmd: `take ${itemName(it)}` }],
      });
    }
    if (g.ents.some((e) => e.kind === 'printer' && !e.data?.shop && dist(e, p) < 1.6))
      rows.push({ icon: { thing: 'printer' }, name: 'printer', buttons: [{ label: 'print slot', cmd: 'print slot' }, { label: 'print module', cmd: 'print module' }] });
    const shop = shopNear(g);
    if (shop) {
      rows.push({ icon: { thing: 'shop' }, name: 'reliquary', buttons: [{ label: 'reroll', cmd: 'reroll', note: `reroll: ${fmt(PRICES.reroll)}` }] });
      offers(g, shop).forEach((it, k) => {
        if (!it || it.kind !== 'mod') return void rows.push({ name: `${k + 1}. sold`, buttons: [], dim: true });
        const price = priceAt(shop, k, it);
        rows.push({
          icon: it, name: label(it), tip: `${does(it)}\n${costs(it)}`,
          buttons: [{ label: '?', cmd: `info ${label(it)}` }, affords(g, price) ? { label: 'buy', cmd: `buy ${k + 1}`, note: fmt(price) } : { label: 'buy', note: `${fmt(price)}: short` }],
        });
      });
    }
    const altar = altarNear(g);
    if (altar) {
      rows.push({ icon: { thing: 'altar' }, name: 'altar', buttons: [] });
      for (const [cmd, price] of altarOffers(g, altar))
        rows.push({ name: '', buttons: [affords(g, price) ? { label: cmd, cmd, note: fmt(price) } : { label: cmd, note: `${fmt(price)}: short` }] });
    }
    const [cx, cy] = [Math.floor(p.x), Math.floor(p.y)];
    for (const [d, dx, dy] of [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]] as const) {
      const c = cell(g, cx + dx, cy + dy);
      const res = c >= Cell.vein ? veinOf(c) : null;
      if (res) rows.push({ icon: { vein: res }, name: `${res} vein (${d})`, buttons: [ok(g, 'drain') ? { label: 'drain', cmd: 'drain' } : { label: 'drain', note: 'needs a needle' }] });
    }
    return rows.length ? rows : [{ name: 'nothing here.', buttons: [], dim: true }];
  }

  /** a grid panel: head, cells, then the selected cell's detail */
  grid(id: string, cells: GridCell[], detail: Detail | null, head = '', empty = '', setups: Btn[] = []): void {
    const w = windows.get(id);
    if (!w) return;
    const k = head + JSON.stringify([cells, detail, empty, setups]) + (this.sel.get(id) ?? '');
    if (this.keys.get(id) === k) return;
    this.keys.set(id, k);
    // a selection whose thing is gone clears
    if (this.sel.has(id) && !cells.some((c) => c.sel === this.sel.get(id))) this.sel.delete(id);
    const els: HTMLElement[] = [];
    if (head) {
      const h = document.createElement('div');
      h.className = 'res';
      h.innerHTML = head;
      els.push(h);
    }
    if (setups.length) {
      const row = document.createElement('div');
      row.className = 'setups';
      const h = document.createElement('span');
      h.className = 'dim';
      h.textContent = 'setups';
      row.append(h, ...this.buttons(setups));
      els.push(row);
    }
    if (empty) {
      const e = document.createElement('div');
      e.className = 'dim';
      e.textContent = empty;
      els.push(e);
    }
    const gridEl = document.createElement('div');
    gridEl.className = 'grid';
    for (const c of cells) {
      const b = document.createElement('button');
      b.className = 'cell' + (c.icon ? '' : ' socket') + (c.state ? ' st-' + c.state : '') + (c.dim ? ' dim' : '') + (this.sel.get(id) === c.sel ? ' sel' : '');
      b.title = c.title;
      b.dataset.key = c.sel;
      if (c.mod) b.dataset.mod = c.mod;
      if (c.icon) b.append(img(c.icon, SCALE));
      if (c.badge) {
        const s = document.createElement('span');
        s.className = 'badge';
        s.textContent = c.badge;
        b.append(s);
      }
      if (c.icon) {
        b.addEventListener('click', () => {
          if (this.sel.get(id) === c.sel) this.sel.delete(id);
          else this.sel.set(id, c.sel);
          this.keys.delete(id);
          this.frame();
        });
        if (c.dbl) b.addEventListener('dblclick', () => this.send(c.dbl!));
      } else b.disabled = true;
      gridEl.append(b);
    }
    if (cells.length) els.push(gridEl);
    if (detail) els.push(this.detail(detail));
    w.body.replaceChildren(...els);
  }

  detail(d: Detail): HTMLElement {
    const el = document.createElement('div');
    el.className = 'detail';
    const top = document.createElement('div');
    top.className = 'dtop';
    top.append(img(d.icon, 3));
    const t = document.createElement('span');
    t.className = 'name';
    t.textContent = d.title;
    top.append(t);
    el.append(top);
    d.lines.forEach((l, k) => {
      const p = document.createElement('div');
      p.className = k === d.lines.length - 1 && d.lines.length > 2 ? 'flavour-line' : 'does';
      p.textContent = l;
      el.append(p);
    });
    el.append(...this.buttons(d.buttons));
    return el;
  }

  /** the buttons in a row, then why any is greyed (or what it costs), each note on its own line */
  buttons(list: Btn[]): HTMLElement[] {
    const row = document.createElement('div');
    row.className = 'btns';
    const notes: HTMLElement[] = [];
    for (const part of list) {
      const b = document.createElement('button');
      b.textContent = part.label;
      if (part.on) b.className = 'on';
      if (part.cmd) {
        b.dataset.cmd = part.cmd;
        b.addEventListener('click', () => this.send(part.cmd!));
      } else b.disabled = true;
      if (part.note) {
        b.title = part.note;
        const n = document.createElement('span');
        n.className = 'dim note';
        n.textContent = part.note;
        notes.push(n);
      }
      row.append(b);
    }
    return list.length ? [row, ...notes] : notes;
  }

  /** a list panel: rows with an icon, a name and buttons */
  list(id: string, rows: Row[]): void {
    const w = windows.get(id);
    if (!w) return;
    const k = JSON.stringify(rows);
    if (this.keys.get(id) === k) return;
    this.keys.set(id, k);
    w.body.replaceChildren(...rows.map((r) => {
      const row = document.createElement('div');
      row.className = 'row' + (r.dim ? ' dim' : '');
      if (r.icon) row.append(img(r.icon, SCALE));
      if (r.name) {
        const s = document.createElement('span');
        s.className = 'name';
        s.textContent = r.name;
        if (r.tip) s.title = r.tip;
        row.append(s);
      }
      row.append(...this.buttons(r.buttons));
      return row;
    }));
  }

  /** the panels stack down the right edge, each under the one above, unless dragged; when they would
   * run off the bottom, each keeps a floor (nearby 150 px, modules 140, inventory 100, or less if that
   * is all it needs) and what is left goes to nearby, then the modules, then the inventory, each up to
   * what it needs (playtest r2: nearby was cut while the column sat empty) */
  stack(): void {
    const ws = ['modules', 'inv', 'near'].map((id) => windows.get(id)).filter((w) => w && !w.el.dataset.moved) as windows.Win[];
    const natural = (w: windows.Win) => w.el.offsetHeight - w.body.clientHeight + w.body.scrollHeight;
    let room = innerHeight - windows.TOP - 8 - (ws.length - 1) * 8;
    const want = ws.map(natural);
    const total = want.reduce((a, b) => a + b, 0);
    const caps = new Map<windows.Win, number>();
    if (total > room) {
      const order = ['near', 'modules', 'inv'].map((id) => ws.find((w) => w.id === id)).filter((w): w is windows.Win => !!w);
      const floor: Record<string, number> = { near: 150, modules: 140, inv: 100 };
      for (const w of order) caps.set(w, Math.min(natural(w), floor[w.id]));
      room -= [...caps.values()].reduce((a, b) => a + b, 0);
      for (const w of order) {
        const more = Math.max(0, Math.min(room, natural(w) - caps.get(w)!));
        caps.set(w, caps.get(w)! + more);
        room -= more;
      }
    }
    let y = windows.TOP;
    for (const w of ws) {
      const cap = caps.get(w);
      const chrome = w.el.offsetHeight - w.body.clientHeight;
      const mh = cap ? Math.max(60, cap - chrome) + 'px' : '';
      if (w.body.style.maxHeight !== mh) w.body.style.maxHeight = mh;
      // a body cut short fades at the bottom while there is more below
      const b = w.body;
      b.classList.toggle('more', b.scrollHeight - b.scrollTop - b.clientHeight > 2);
      w.el.style.left = innerWidth - PANEL_W - 16 + 'px';
      w.el.style.top = y + 'px';
      y += w.el.offsetHeight + 8;
    }
  }
}

/** a word `drop` finds this item by */
function dropName(it: Item): string {
  return it.kind === 'res' ? it.res : it.kind === 'card' ? 'memory card' : label(it);
}

