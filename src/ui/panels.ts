// The always-open panels on the right edge: modules (slots and power on top, then a grid of sockets),
// inventory (a grid of icons), and what lies nearby (rows with icons). Click a cell in a grid: a detail
// pane under it shows what the thing does and its buttons; double-click installs (or switches on/off).
// A panel redraws only when what it shows changes. They stack down the right edge until dragged away.
// v2: tiles drag (inventory → modules installs, modules → inventory takes out, within a grid reorders), a
// module that takes two slots spans two cells, and a tile's border shows its rarity.

import { dist, itemName, reach } from '../core/game';
import { Cell, cell, veinOf } from '../core/grid';
import { def, label, powerMax, powerUsed, size, slotsUsed, working } from '../core/mods';
import { inPlace, instRef, VERBS } from '../core/verbs';
import type { Game, Inst, Item, Roll } from '../core/types';
import * as windows from './windows';
import { costs, does } from '../mods/describe';
import { affords, fmt, offers, PRICES, priceAt, scrapOf, shopNear } from '../world/printer';
import { altarNear, offers as altarOffers } from '../world/altar';
import { atStairs, STAIRS, type Stairs } from '../world/floors';
import { nearPieces } from '../world/events';
import { img, type Of } from './icons';
import { makeRoom, setupsOf } from '../body';

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
  /** cells it spans: the slots it takes */
  span?: number;
  /** rarity (modules only): common, fine, rare, unique */
  rar?: string;
  /** it can be dragged */
  drag?: boolean;
  /** v2r2 fun: the "+N more" (or "fewer") cell that opens or folds a long inventory */
  more?: string;
}
interface Detail {
  icon: Of;
  title: string;
  rar?: string;
  /** a unique's own name, under its title */
  sub?: string;
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
  rar?: string;
}

const ok = (g: Game, v: string) => !!VERBS[v] && (!VERBS[v].when || VERBS[v].when!(g));
export const PANEL_W = 260;
/** grid icon scale: 16 px drawn at ×2 */
const SCALE = 2;
/** v2r2 fun: an inventory longer than this folds to its top INV_TOP cells and a "+N more" */
const INV_MAX = 16;
const INV_TOP = 15;

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
/** a module's rarity and a unique's own name (src/core/types.ts, from the rarity pass; common when absent) */
const rarOf = (m: object): string => (m as { rarity?: string }).rarity ?? 'common';
const titleOf = (m: object): string | undefined => (m as { title?: string }).title;

/** the install (or swap in) button for a carried module, and why it is greyed */
export function installBtn(g: Game, it: Item & { kind: 'mod' }): Btn {
  const p = g.player;
  const d = def(it);
  const free = slotsUsed(g) + size(it) <= p.slots;
  const spare = powerMax(g) - powerUsed(g);
  // playtest r3: a full board greyed install out; it offers the swap, saying what gives way
  const room = !free || d.power > spare ? makeRoom(g, it, false) : null;
  const out = room && typeof room !== 'string' && room.remove ? [room.remove, ...(room.more ?? [])] : [];
  const gives = room && typeof room !== 'string' ? [...out.map((o) => `takes out ${label(o)}`), ...room.off.map((o) => `turns off ${label(o)}`)].join(', ') : '';
  const left = p.slots - slotsUsed(g);
  return room && typeof room !== 'string' ? { label: 'swap in', cmd: `swap in ${label(it)}`, note: gives || 'swap in' }
    : !free ? { label: 'install', note: size(it) > 1 ? `it takes ${size(it)} slots, ${left} free: printers sell slots` : 'no free slot: printers sell slots' }
    : d.power > spare ? { label: 'install', cmd: `install ${label(it)}`, note: `it stays off: needs ${d.power}⚡︎, ${spare} free` }
    : { label: 'install', cmd: `install ${label(it)}` };
}

export class Panels {
  g: Game;
  send: Send;
  keys = new Map<string, string>();
  /** the selected cell per panel */
  sel = new Map<string, string>();
  /** the inventory's items by cell, for a drop */
  items = new Map<string, Item>();
  /** a tile being dragged: from which grid, which cell, where it started, its ghost once it moves */
  drag: { id: string; key: string; x0: number; y0: number; dx: number; dy: number; ghost?: HTMLElement; from?: DOMRect } | null = null;
  /** a drag just ended: the click it ends in is not a click */
  dragged = false;
  /** v2r2 fun: a long inventory shows its top INV_TOP cells and "+N more" until opened */
  invAll = false;

  constructor(g: Game, send: Send) {
    this.g = g;
    this.send = send;
    for (const [id, title] of [['modules', 'modules'], ['inv', 'inventory'], ['near', 'nearby']])
      windows.open(id, title, [innerWidth - PANEL_W - 16, windows.TOP]).el.classList.add('panel', 'panel-' + id);
    addEventListener('pointermove', (e) => this.dragMove(e));
    addEventListener('pointerup', (e) => this.dragEnd(e));
    addEventListener('pointercancel', () => this.dragEnd(null));
    addEventListener('click', (e) => this.dragged && (e.stopPropagation(), e.preventDefault()), true);
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
    return `<div class="res-row"><span>slots ${slotsUsed(g)}/${p.slots}</span>${pips(slotsUsed(g), p.slots)}</div>` +
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
      return { sel: 'u' + i.uid, icon: { mod: i.mod, roll: i.roll }, title: `${label(i)} · ${state}`, state, mod: i.mod, dbl: `${i.on ? 'off' : 'on'} ${instRef(g, i)}`, span: size(i), rar: rarOf(i), drag: true };
    });
    for (let k = slotsUsed(g); k < p.slots; k++) cells.push({ sel: 'empty' + k, title: 'an empty socket' });
    const s = this.sel.get('modules');
    const inst = p.installed.find((i) => 'u' + i.uid === s);
    if (!inst) return [cells, null];
    return [cells, {
      icon: { mod: inst.mod, roll: inst.roll },
      title: label(inst),
      rar: rarOf(inst),
      sub: titleOf(inst),
      lines: [!inst.on ? 'off' : working(g, inst) ? 'on' : 'warming up', ...modLines(inst)],
      buttons: [{ label: inst.on ? 'off' : 'on', cmd: `${inst.on ? 'off' : 'on'} ${instRef(g, inst)}` }, { label: 'remove', cmd: `remove ${instRef(g, inst)}` }],
    }];
  }

  inv(g: Game): [GridCell[], Detail | null] {
    const p = g.player;
    this.items.clear();
    const seen = new Map<string, number>();
    const cells: GridCell[] = [];
    let detail: Detail | null = null;
    const s = this.sel.get('inv');
    for (const it of p.inv) {
      const name = it.kind === 'res' ? it.res : it.kind === 'card' ? 'memory card' : label(it);
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      const sel = `${name}#${n}`;
      this.items.set(sel, it);
      const drop: Btn = { label: 'drop', cmd: `drop ${dropName(it)}` };
      let c: GridCell;
      let buttons: Btn[];
      let lines: string[];
      if (it.kind === 'mod') {
        const install = installBtn(g, it);
        const scrap = scrapOf(it);
        const recycle: Btn = Object.keys(scrap).length ? { label: 'recycle', cmd: `recycle ${label(it)}`, note: `recycle: ${fmt(scrap)}` } : { label: 'recycle', note: 'it will not break' };
        buttons = [install, { label: '?', cmd: `info ${label(it)}` }, recycle, drop];
        lines = modLines(it);
        c = { sel, icon: it, title: `${label(it)} · ${does(it)}`, mod: it.mod, dbl: install.cmd, dim: !install.cmd, span: size(it), rar: rarOf(it), drag: true };
      } else if (it.kind === 'card') {
        const scripture = !it.card.startsWith('log');
        buttons = [ok(g, 'read') ? { label: 'read', cmd: 'read card' } : { label: 'read', note: 'needs a card reader' }, drop];
        lines = [scripture ? 'a shard of scripture. read it to learn where the engine lies.' : 'a machine\'s last log. read it: it points somewhere.'];
        c = { sel, icon: it, title: 'memory card', dbl: ok(g, 'read') ? 'read card' : undefined, drag: true };
      } else {
        buttons = [drop];
        lines = [`${it.n} ${it.res}. printers, reliquaries and altars take it.`];
        c = { sel, icon: it, title: `${it.res} ×${it.n}`, badge: String(it.n), drag: true };
      }
      cells.push(c);
      if (sel === s) detail = { icon: it, title: it.kind === 'res' ? `${it.res} ×${it.n}` : c.title.split(' · ')[0], lines, buttons, ...(it.kind === 'mod' ? { rar: rarOf(it), sub: titleOf(it) } : {}) };
    }
    // v2r2 fun: 23 icons by floor 3 buried what mattered. Past INV_MAX: resources and cards first, then the
    // modules you could put in, then the rest; the top INV_TOP show, "+N more" opens the whole bag
    if (cells.length <= INV_MAX) return [cells, detail];
    const rank = (c: GridCell) => (!c.mod ? 0 : c.dim ? 2 : 1);
    const sorted = cells.map((c, k) => [c, k] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([c]) => c);
    if (this.invAll) return [[...sorted, { sel: '-less', title: 'fold the bag again', more: '−' }], detail];
    const top = sorted.slice(0, INV_TOP);
    // the selected one stays in sight
    const picked = sorted.find((c) => c.sel === s);
    if (picked && !top.includes(picked)) top[INV_TOP - 1] = picked;
    return [[...top, { sel: '+more', title: `${cells.length - INV_TOP} more: show the whole bag`, more: `+${cells.length - INV_TOP}` }], detail];
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
        rar: it.kind === 'mod' ? rarOf(it) : undefined,
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
          icon: it, name: label(it), tip: `${does(it)}\n${costs(it)}`, rar: rarOf(it),
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
    // v2 floors: the stairs down, open or sealed
    const st = atStairs(g);
    if (st) {
      const style = STAIRS[st.data!.stairs as Stairs];
      rows.push({ name: style.name, tip: style.look, buttons: [st.data!.open ? { label: 'descend', cmd: 'descend' } : { label: 'descend', note: 'sealed: its keeper still stands' }] });
    }
    // a set piece's finds, until taken (src/world/events.ts)
    for (const o of nearPieces(g)) rows.push({ icon: o.item, name: `${o.name} ${Math.round(o.r)} ${o.side}`, tip: `${o.name}, ${Math.round(o.r)} cells ${o.side}: a set piece's finds`, buttons: [{ label: o.cmd.startsWith('goto') ? 'go' : o.cmd, cmd: o.cmd }] });
    const [cx, cy] = [Math.floor(p.x), Math.floor(p.y)];
    for (const [d, dx, dy] of [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]] as const) {
      const c = cell(g, cx + dx, cy + dy);
      const res = c >= Cell.vein ? veinOf(c) : null;
      if (res) rows.push({ icon: { vein: res }, name: `${res} vein (${d})`, buttons: [ok(g, 'drain') ? { label: 'drain', cmd: 'drain' } : { label: 'drain', note: 'needs a needle' }] });
    }
    return rows.length ? rows : [{ name: 'nothing here.', buttons: [], dim: true }];
  }

  // ---- drag and drop (v2 asks): a tile lifts once the pointer moves 5 px; a click stays a click

  dragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      const src = windows.get(d.id)?.body.querySelector<HTMLElement>(`.cell[data-key="${CSS.escape(d.key)}"]`);
      if (!src) return void (this.drag = null);
      d.from = src.getBoundingClientRect();
      const ghost = src.cloneNode(true) as HTMLElement;
      ghost.classList.remove('sel', 'lifted');
      ghost.classList.add('drag-ghost');
      ghost.style.width = d.from.width + 'px';
      ghost.style.height = d.from.height + 'px';
      document.body.append(ghost);
      d.ghost = ghost;
      document.body.classList.add('dragging');
      this.keys.delete(d.id);
      this.frame();
    }
    d.ghost.style.left = e.clientX - d.dx + 'px';
    d.ghost.style.top = e.clientY - d.dy + 'px';
    // the grid under the pointer lights up: green where it goes, red where it cannot
    const at = this.dropAt(e.clientX, e.clientY);
    const why = at ? this.dropWhy(d.id, d.key, at.id, at.key) : null;
    for (const id of ['modules', 'inv']) {
      const g = windows.get(id)?.body.querySelector('.grid');
      g?.classList.toggle('drop-ok', at?.id === id && why === null);
      g?.classList.toggle('drop-no', at?.id === id && why !== null);
    }
  }

  dragEnd(e: PointerEvent | null): void {
    const d = this.drag;
    this.drag = null;
    if (!d?.ghost) return;
    this.dragged = true;
    setTimeout(() => (this.dragged = false));
    document.body.classList.remove('dragging');
    for (const g of document.querySelectorAll('.win.panel .grid')) g.classList.remove('drop-ok', 'drop-no');
    const at = e && this.dropAt(e.clientX, e.clientY);
    const why = at ? this.dropWhy(d.id, d.key, at.id, at.key) : '';
    if (at && why === null) {
      d.ghost.remove();
      this.drop(d.id, d.key, at.id, at.key);
    } else {
      // it snaps back, saying why
      if (why && e) this.toast(why, e.clientX, e.clientY);
      const g = d.ghost;
      g.classList.add('snap');
      g.style.left = d.from!.left + 'px';
      g.style.top = d.from!.top + 'px';
      setTimeout(() => g.remove(), 180);
    }
    this.keys.delete(d.id);
    this.frame();
  }

  /** the grid panel under a point, and the cell (its key) if over one */
  dropAt(x: number, y: number): { id: string; key?: string } | null {
    for (const id of ['modules', 'inv']) {
      const w = windows.get(id);
      if (!w || w.el.classList.contains('min')) continue;
      const r = w.el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const cellEl = document.elementFromPoint(x, y)?.closest<HTMLElement>('.cell');
      return { id, key: cellEl && w.el.contains(cellEl) ? cellEl.dataset.key : undefined };
    }
    return null;
  }

  /** why a tile cannot go there (null: it can) */
  dropWhy(from: string, key: string, to: string, onto?: string): string | null {
    if (from === to) return null;
    if (from === 'modules') return this.instOf(key) ? null : 'it is gone';
    const it = this.items.get(key);
    if (!it || !this.g.player.inv.includes(it)) return 'it is gone';
    if (it.kind !== 'mod') return 'only modules go in sockets';
    // v2r1 ux: onto an installed module, the two swap
    const out = onto ? this.instOf(onto) : undefined;
    if (out) {
      const p = this.g.player;
      const left = p.slots - slotsUsed(this.g) + size(out);
      return size(it) <= left ? null : `${label(it)} takes ${size(it)} slots; ${label(out)} frees ${left}`;
    }
    const b = installBtn(this.g, it);
    return b.cmd ? null : b.note ?? 'it will not go in';
  }

  instOf(key: string): Inst | undefined {
    return this.g.player.installed.find((i) => 'u' + i.uid === key);
  }

  /** a drop: install, take out, or reorder within a grid */
  drop(from: string, key: string, to: string, onto?: string): void {
    const p = this.g.player;
    if (from === 'inv' && to === 'modules') {
      const it = this.items.get(key) as Item & { kind: 'mod' };
      // the command finds the first carried one by name: this one goes first among its namesakes
      const k = p.inv.indexOf(it);
      const first = p.inv.findIndex((o) => o.kind === 'mod' && label(o) === label(it));
      if (first >= 0 && first < k) [p.inv[first], p.inv[k]] = [p.inv[k], p.inv[first]];
      // dropped onto an installed module: that one comes out and this one goes in (v2r1 ux)
      const out = onto ? this.instOf(onto) : undefined;
      if (out) return inPlace(this.g, it, () => this.send(`remove ${instRef(this.g, out)}; install ${label(it)}`));
      const b = installBtn(this.g, it);
      return inPlace(this.g, it, () => this.send(b.cmd!));
    }
    if (from === 'modules' && to === 'inv') {
      const inst = this.instOf(key);
      if (inst) this.send(`remove ${instRef(this.g, inst)}`);
      return;
    }
    // within a grid: it moves to the tile it was dropped on (the end, on empty space)
    const list: (Item | Inst)[] = to === 'inv' ? p.inv : p.installed;
    const a = to === 'inv' ? this.items.get(key) : this.instOf(key);
    const b = onto ? (to === 'inv' ? this.items.get(onto) : this.instOf(onto)) : undefined;
    if (!a || a === b || !list.includes(a)) return;
    // onto a later tile it lands after it, onto an earlier one before it: either way, at its index
    const at = b && list.includes(b) ? list.indexOf(b) : list.length - 1;
    list.splice(list.indexOf(a), 1);
    list.splice(at, 0, a);
  }

  toast(text: string, x: number, y: number): void {
    const t = document.createElement('div');
    t.className = 'drag-why';
    t.textContent = text;
    t.style.left = Math.max(8, Math.min(innerWidth - 268, x - 130)) + 'px';
    t.style.top = Math.max(8, y - 44) + 'px';
    document.body.append(t);
    setTimeout(() => t.remove(), 2400);
  }

  /** a grid panel: head, cells, then the selected cell's detail */
  grid(id: string, cells: GridCell[], detail: Detail | null, head = '', empty = '', setups: Btn[] = []): void {
    const w = windows.get(id);
    if (!w) return;
    const k = head + JSON.stringify([cells, detail, empty, setups]) + (this.sel.get(id) ?? '') + (this.drag?.ghost && this.drag.id === id ? this.drag.key : '');
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
      if (c.more) {
        const b = document.createElement('button');
        b.className = 'cell more';
        b.title = c.title;
        b.dataset.key = c.sel;
        b.textContent = c.more;
        b.addEventListener('click', () => {
          this.invAll = c.sel === '+more';
          this.keys.delete(id);
          this.frame();
        });
        gridEl.append(b);
        continue;
      }
      const b = document.createElement('button');
      b.className = 'cell' + (c.icon ? '' : ' socket') + (c.state ? ' st-' + c.state : '') + (c.dim ? ' dim' : '') + (this.sel.get(id) === c.sel ? ' sel' : '') +
        (c.rar ? ' rar-' + c.rar : '') + (c.span && c.span > 1 ? ' wide' : '') + (this.drag?.ghost && this.drag.id === id && this.drag.key === c.sel ? ' lifted' : '');
      b.title = c.title;
      b.dataset.key = c.sel;
      if (c.mod) b.dataset.mod = c.mod;
      // a module that takes n slots is one tile n cells wide, with a pip per slot under its icon
      if (c.span && c.span > 1) {
        b.style.gridColumn = `span ${c.span}`;
        b.style.width = `${c.span * 36 + (c.span - 1) * 4}px`;
      }
      if (c.icon) {
        const i = img(c.icon, SCALE);
        i.draggable = false;
        b.append(i);
      }
      if (c.span && c.span > 1) {
        const s = document.createElement('span');
        s.className = 'span-pips';
        s.innerHTML = '<b></b>'.repeat(c.span);
        b.append(s);
      }
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
        if (c.drag) b.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          const r = b.getBoundingClientRect();
          this.drag = { id, key: c.sel, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top };
        });
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
    t.className = 'name' + (d.rar ? ' rar-' + d.rar : '');
    t.textContent = d.title;
    top.append(t);
    el.append(top);
    // its rarity under the name, and a unique's own name
    if (d.rar && (d.rar !== 'common' || d.sub)) {
      const r = document.createElement('div');
      r.className = 'rar-line rar-' + d.rar;
      r.textContent = d.rar + (d.sub && !d.title.includes(d.sub) ? ` · ${d.sub}` : '');
      el.append(r);
    }
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
        s.className = 'name' + (r.rar ? ' rar-' + r.rar : '');
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

