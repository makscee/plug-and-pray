// Windows on the dark page: one per installed module plus the console. Dragged by the title bar.
// The title carries the module's power dot (click: on/off); the foot carries its buttons.
// No window buries another (playtest r1): a new one goes to the first free spot left of the panel
// column, or, with none, opens minimised (its title bar only) in a dock along the bottom; a click on
// the title brings it back, a double-click on any module title minimises it. `tidy` lays them all out.
// When room is short the windows dock by rank (playtest r2): eyes that are on, then the map, then on
// modules with buttons, then text-only ones, then what is off. A window only ever docks a lower one.

export interface Win {
  id: string;
  el: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  dot: HTMLElement;
}

const wins = new Map<string, Win>();
let top = 10;
let cascade = 0;

function desk(): HTMLElement {
  let d = document.getElementById('desk');
  if (!d) {
    d = document.createElement('div');
    d.id = 'desk';
    document.body.append(d);
  }
  return d;
}

export function get(id: string): Win | undefined {
  return wins.get(id);
}

/** open (or return) a window; `at` is its first position in px, else it cascades */
export function open(id: string, title: string, at?: [number, number]): Win {
  const have = wins.get(id);
  // a window left from the last run (restart empties the desk) is made anew
  if (have?.el.isConnected) return have;
  if (!desk().children.length) cascade = 0;
  const el = document.createElement('section');
  el.className = 'win';
  el.dataset.win = id;
  const t = document.createElement('header');
  t.className = 'title';
  const dot = document.createElement('i');
  dot.className = 'dot';
  const name = document.createElement('span');
  name.textContent = title;
  t.append(dot, name);
  const body = document.createElement('div');
  body.className = 'body';
  const foot = document.createElement('footer');
  foot.className = 'foot';
  el.append(t, body, foot);
  // new module windows fill a row along the top, then a second row
  const k = cascade++;
  // the right edge belongs to the panels (modules, inventory, nearby)
  const perRow = Math.max(1, Math.floor((innerWidth - 24 - 280) / 280));
  const [x, y] = at ?? [16 + (k % perRow) * 280, TOP + Math.floor(k / perRow) % 2 * 330];
  if (at) cascade--;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.zIndex = String(++top);
  el.addEventListener('pointerdown', () => (el.style.zIndex = String(++top)));
  drag(el, t);
  desk().append(el);
  // once its body is filled, a new module window moves to the first spot that covers no other window
  // windows grow as their views fill (a description, a canvas), so look again a little later, unless dragged
  if (!at) {
    el.classList.add('mod-win');
    t.title = 'drag to move · double-click to minimise';
    t.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).classList.contains('dot')) return;
      if (!el.classList.contains('min')) minimise(el, true);
    });
    // a minimised window comes back on a click on its title
    t.addEventListener('click', (e) => {
      if (!el.classList.contains('min') || (e.target as HTMLElement).classList.contains('dot')) return;
      restore(el);
    });
    let dragged = false;
    t.addEventListener('pointerdown', () => {
      if (!el.classList.contains('min')) dragged = true;
    });
    const place = () => {
      if (dragged || !el.isConnected || el.classList.contains('min')) return;
      if (!overlaps(el) && inside(el)) return;
      put(el);
    };
    el.dataset.fresh = '1';
    // v2r2 fun: a window the game files as a chip from the start (src/ui/index.ts: floor 1's helpers)
    queueMicrotask(() => el.isConnected && !el.classList.contains('min') && startsDocked.test(el) && minimise(el, true));
    queueMicrotask(place);
    // v2r1 ux: measured before VT323 loaded, the map docked on 2 of 13 fresh starts at 1280x720
    document.fonts?.ready.then(() => (place(), mapBack()));
    setTimeout(place, 300);
    setTimeout(() => (place(), delete el.dataset.fresh, mapBack()), 1200);
  }
  const w = { id, el, title: t, body, foot, dot };
  wins.set(id, w);
  return w;
}

/** v2r2 fun: seven windows were open on floor 1. A new module window this says yes to opens docked */
export const startsDocked: { test: (el: HTMLElement) => boolean } = { test: () => false };

/** windows start under the hp bar and the goal line (src/ui/goal.ts) */
export const TOP = 54;
/** the panel column on the right edge (panel width 260 + margins) is never free */
const COLUMN = 260 + 16 + 8;
type Rect = { left: number; top: number; right: number; bottom: number };

/** what a window must keep clear of: every other window (skipping those being laid out) and the panel column */
function rects(el: HTMLElement, skip?: (o: HTMLElement) => boolean): Rect[] {
  const out: Rect[] = [...document.querySelectorAll<HTMLElement>('.win')]
    .filter((o) => o !== el && !o.dataset.tidy && !skip?.(o))
    .map((o) => o.getBoundingClientRect());
  out.push({ left: innerWidth - COLUMN, top: 0, right: innerWidth, bottom: innerHeight });
  if (el.classList.contains('mod-win') && !el.classList.contains('min')) out.push(middle());
  return out;
}
const hit = (x: number, y: number, w: number, h: number, r: Rect, gap: number) =>
  x < r.right + gap && x + w + gap > r.left && y < r.bottom + gap && y + h + gap > r.top;
function overlaps(el: HTMLElement): boolean {
  const a = el.getBoundingClientRect();
  return rects(el).some((r) => hit(a.left, a.top, a.width, a.height, r, -2));
}
function inside(el: HTMLElement): boolean {
  const a = el.getBoundingClientRect();
  return a.left >= 0 && a.top >= 0 && a.right <= innerWidth && a.bottom <= innerHeight;
}

/** v2-view: the view behind the windows keeps its middle clear: module windows keep to the edges (the console
 *  and the panels have their own spots) */
export const middle = (): Rect => ({ left: innerWidth * 0.3, top: innerHeight * 0.2, right: innerWidth * 0.7, bottom: innerHeight });

/** the first free top-left (row by row from the top left, 16 px steps) where `el` overlaps no window */
function free(el: HTMLElement, skip?: (o: HTMLElement) => boolean): [number, number] | null {
  const { width: w, height: h } = el.getBoundingClientRect();
  const others = rects(el, skip);
  for (let y = TOP; y + h <= innerHeight - 8; y += 16)
    for (let x = 16; x + w <= innerWidth - 8; x += 16) if (!others.some((r) => hit(x, y, w, h, r, 8))) return [x, y];
  return null;
}

const moveTo = (el: HTMLElement, [x, y]: [number, number]) => ([el.style.left, el.style.top] = [x + 'px', y + 'px']);

/** how much a window must stay open: the map 0.05; an eye that is on, under 1 (v2r1 ux: by how readable it is: a colour
 * eye, sharper first, 0.2-0.3; a grey one 0.35; a layer eye (heat, sonar, 1-bit, edge) 0.6, 0.55 while it is
 * the only one showing its hidden layer; installing a heat eye docked the only readable view); 1 the map,
 * 1.8 a weapon, 2 an on module with buttons, 3 an on module that only reads (never above an eye), 4 one that is off */
export function rank(el: HTMLElement): number {
  if (el.dataset.state === 'off') return 4;
  // v2r3 ux: the map outranks every eye (taking the pilgrim scope docked the map spool); then the base eye, then
  // layer eyes, then weapons, then the rest
  if (el.querySelector('canvas.map')) return 0.05;
  if (el.classList.contains('fam-camera')) {
    if (el.dataset.base) return 0.1;
    const eye = Number(el.dataset.eye ?? 3);
    return eye < 2 ? 0.2 + eye * 0.2 : eye === 2 ? 0.45 : el.dataset.layer ? 0.55 : 0.6;
  }
  if (el.classList.contains('fam-weapon')) return 1.8;
  return el.querySelector('.foot button') ? 2 : 3;
}

/** a second eye (one an open eye outranks) gives way to the map and stands with the modules that have
 * buttons: installing it never docks your main eye or the map (v2r1 ux) */
export function eff(el: HTMLElement): number {
  const r = rank(el);
  if (r >= 1) return r;
  return modWins().some((o) => o !== el && !o.classList.contains('min') && o.classList.contains('fam-camera') && rank(o) < r) ? 1.5 : r;
}

/** room is short: the game docked a window that has an eye, the map or buttons. Then windows that are
 * off or only read stay docked too, even where they would fit */
const short = () => modWins().some((w) => w.classList.contains('min') && !w.dataset.hand && rank(w) < 3);

/** a spot for `el`, docking open module windows that rank below it (lowest first, only those in the
 * way); `self`: with none, `el` docks itself. Windows you dragged are never moved */
function room(el: HTMLElement, self: boolean): boolean {
  const spot = free(el);
  if (spot) return moveTo(el, spot), true;
  const r = eff(el);
  const lower = modWins()
    // an eye just installed or just showing its layer may also dock an older one of its rank (r3: the new eye opens big)
    .filter((o) => o !== el && !o.classList.contains('min') && !o.dataset.moved && (rank(o) > r || (r < 1 && !!el.dataset.fresh && rank(o) === r)))
    .sort((a, b) => rank(b) - rank(a) || a.offsetWidth * a.offsetHeight - b.offsetWidth * b.offsetHeight);
  const gone: HTMLElement[] = [];
  for (const o of lower) {
    gone.push(o);
    const at = free(el, (x) => gone.includes(x));
    if (!at) continue;
    moveTo(el, at);
    const a = el.getBoundingClientRect();
    for (const x of gone) if (hit(a.left, a.top, a.width, a.height, x.getBoundingClientRect(), 8)) minimise(x);
    return true;
  }
  if (self) minimise(el);
  return false;
}

/** a free spot; else the module windows laid out again by rank, if that keeps every open one open;
 * else room made by docking lower-ranked windows; else the dock */
function put(el: HTMLElement): void {
  // measured at the left edge: near the right one a window shrinks to fit what is left of the screen
  moveTo(el, [0, TOP]);
  if (rank(el) >= 3 && short()) return minimise(el);
  const spot = free(el);
  if (spot) {
    moveTo(el, spot);
    return;
  }
  const ws = modWins();
  const was = ws.map((w) => [w, w.style.left, w.style.top, w.classList.contains('min'), w.dataset.was] as const);
  layout(false);
  if (!el.classList.contains('min') && was.every(([w, , , min]) => min || !w.classList.contains('min'))) return;
  // the layout would dock something that was open: put everything back, and make room by rank instead
  for (const [w, l, t, min, at] of was) {
    [w.style.left, w.style.top] = [l, t];
    w.classList.toggle('min', min);
    if (at === undefined) delete w.dataset.was;
    else w.dataset.was = at;
  }
  moveTo(el, [0, TOP]);
  room(el, true);
  dock();
}

/** a docked module window that now outranks an open one (switched on): back out, if it can */
export function promote(el: HTMLElement): void {
  if (!el.classList.contains('min') || el.dataset.hand || el.dataset.moved) return;
  const r = eff(el);
  if (r >= 3 && short()) return;
  if (!modWins().some((o) => !o.classList.contains('min') && (rank(o) > r || (r < 1 && !!el.dataset.fresh))) && !free(el)) return;
  const was = el.dataset.was;
  el.classList.remove('min');
  moveTo(el, [0, TOP]);
  if (room(el, false)) {
    el.style.zIndex = String(++top);
    dock();
  } else {
    minimise(el);
    if (was !== undefined) el.dataset.was = was;
  }
}

/** an eye just showed something hidden: its window opens even if docked (by hand too), docking lower
 * windows if it must, and comes to the front */
export function reveal(el: HTMLElement): void {
  delete el.dataset.hand;
  delete el.dataset.moved;
  el.dataset.fresh = '1';
  promote(el);
  delete el.dataset.fresh;
  el.style.zIndex = String(++top);
}

/** the docked module windows the game docked (not you), best rank first, back out where they can */
export function refill(): void {
  const auto = modWins().filter((w) => w.classList.contains('min') && !w.dataset.hand && !w.dataset.moved);
  for (const w of auto.sort((a, b) => rank(a) - rank(b))) promote(w);
}

/** a window that grew (a zoomed map): to a free spot if it now covers another, or room made by docking
 * lower-ranked windows; false when neither (the caller undoes the growth) */
export function refit(el: HTMLElement): boolean {
  if (el.classList.contains('min') || (!overlaps(el) && inside(el))) return true;
  const was: [number, number] = [el.offsetLeft, el.offsetTop];
  moveTo(el, [0, TOP]);
  if (room(el, false)) return true;
  moveTo(el, was);
  return false;
}

/** title bar only, in the dock row along the bottom */
export function minimise(el: HTMLElement, byHand = false): void {
  if (!el.classList.contains('min')) el.dataset.was = `${el.style.left},${el.style.top}`;
  if (byHand) el.dataset.hand = '1';
  el.classList.add('min');
  dock();
}

/** back from the dock: its old spot if that is free now, else the first free one, else it swaps with the module windows in its way */
export function restore(el: HTMLElement): void {
  el.classList.remove('min');
  delete el.dataset.hand;
  const [x, y] = (el.dataset.was ?? '').split(',');
  if (x && y) [el.style.left, el.style.top] = [x, y];
  if (overlaps(el) || !inside(el)) {
    // no room: it takes the first spot clear of the console and panels, docking lower-ranked module
    // windows there, or, asked by hand with none of those, any module windows
    const r = rank(el);
    const open = (o: HTMLElement) => o.classList.contains('mod-win') && !o.classList.contains('min');
    const spot = free(el) ?? free(el, (o) => open(o) && rank(o) > r) ?? free(el, open);
    if (spot) moveTo(el, spot);
    else clamp(el);
    const a = el.getBoundingClientRect();
    for (const o of modWins())
      if (o !== el && !o.classList.contains('min') && hit(a.left, a.top, a.width, a.height, o.getBoundingClientRect(), -2)) minimise(o);
  }
  el.style.zIndex = String(++top);
  dock();
}

/** lay the minimised windows out from the bottom up, around the windows already there, only in the side columns
 *  (v2r2 ux: they spilled across the view's middle band, where the foes are); with no room, they stack in the left one */
function dock(): void {
  const mins = [...document.querySelectorAll<HTMLElement>('.win.min')];
  mins.forEach((m) => (m.dataset.tidy = '1'));
  const mid = middle();
  const band = { left: mid.left, top: 0, right: mid.right, bottom: innerHeight };
  const column = { left: innerWidth - COLUMN, top: 0, right: innerWidth, bottom: innerHeight };
  for (const m of mins) {
    const { width: w, height: h } = m.getBoundingClientRect();
    const find = (others: Rect[]) => {
      for (let y = innerHeight - h - 6; y >= TOP; y -= h + 4)
        for (let x = 16; x + w <= innerWidth - 8; x += 8) if (!others.some((r) => hit(x, y, w, h, r, 3))) return [x, y] as [number, number];
      return null;
    };
    // no room left: over an open module window at the side (never over another chip, the console or the middle)
    const chips = [...document.querySelectorAll<HTMLElement>('.win.min, .win-console')].filter((o) => o !== m && !o.dataset.tidy).map((o) => o.getBoundingClientRect());
    // v2r3 ux: never over the map window (a third chip row sat on its bottom border at 1280x720)
    // v2r5 newcomer: nor over an eye's window (a weapon chip hid the vidicon's turn and step buttons at 720)
    const maps = modWins().filter((o) => !o.classList.contains('min') && (o.querySelector('canvas.map') || o.classList.contains('fam-camera'))).map((o) => o.getBoundingClientRect());
    const spot = find([...rects(m), band]) ?? find([...chips, ...maps, band, column]) ?? find([...chips, band, column]);
    moveTo(m, spot ?? [16, innerHeight - h - 6]);
    delete m.dataset.tidy;
  }
}

/** keep a window on screen, its title bar at least */
function clamp(el: HTMLElement): void {
  const a = el.getBoundingClientRect();
  const x = Math.max(0, Math.min(innerWidth - a.width, a.left));
  const y = Math.max(TOP, Math.min(innerHeight - a.height, a.top));
  moveTo(el, [Math.max(0, x), Math.max(0, y)]);
}

const modWins = () => [...document.querySelectorAll<HTMLElement>('.win.mod-win')];

/** lay module windows out again, eyes then biggest first, each at the first free spot; what finds none is docked.
 * `all` (tidy): every module window; else the ones you dragged or minimised yourself stay put */
function layout(all: boolean): void {
  const ws = modWins().filter((w) => all || (!w.dataset.moved && !w.dataset.hand));
  for (const w of ws) {
    w.classList.remove('min');
    moveTo(w, [0, TOP]); // measured at full width (see put)
    w.dataset.tidy = '1';
    delete w.dataset.moved;
    delete w.dataset.hand;
  }
  // by rank (eyes that are on, the map, modules with buttons, text, off), then biggest first
  const area = (w: HTMLElement) => w.offsetWidth * w.offsetHeight;
  // r4: the map before a second eye: he asked to always see it, and tidy docked it at 1280x720
  const eyes = (w: HTMLElement) => w.classList.contains('fam-camera') && rank(w) < 1;
  const best = Math.min(...ws.filter(eyes).map(rank));
  const order = (w: HTMLElement) => (eyes(w) && rank(w) > best ? 1.5 : rank(w));
  ws.sort((a, b) => order(a) - order(b) || area(b) - area(a));
  for (const w of ws) {
    delete w.dataset.tidy;
    const spot = free(w);
    if (spot) moveTo(w, spot);
    else {
      if (!w.classList.contains('min')) w.dataset.was = '';
      w.classList.add('min');
    }
  }
  if (short()) for (const w of ws) if (rank(w) >= 3 && !w.classList.contains('min')) minimise(w);
  dock();
}

/** the console's own spot: bottom centre, low enough that a map fits above it at 1280x720 (style.css
 * shortens its output under 800 px tall) */
export const consoleAt = (): [number, number] => {
  // v2r4 ux: on the bottom edge at any height (it floated 26-52 px above it at 800), by its own height once drawn
  const h = document.querySelector<HTMLElement>('.win-console')?.offsetHeight || (innerHeight < 800 ? 256 : 324);
  // and clear of the panel column (it overlapped the nearby window by 4 px at 1024 wide)
  return [Math.max(16, Math.min(innerWidth / 2 - 240, innerWidth - COLUMN - 8 - 480)), Math.max(TOP, innerHeight - h - 6)];
};

/** the console on screen: back to its own spot unless you dragged it, else just inside the edges
 *  (v2r2 ux: its button rows grew it 20 px off the bottom at 1280x800; the console calls it as it grows) */
export function homeConsole(): void {
  const con = document.querySelector<HTMLElement>('.win-console');
  if (!con) return;
  if (!con.dataset.moved) moveTo(con, consoleAt());
  clamp(con);
}

/** T, or `tidy`: the console back on screen, every module window laid out again */
export function tidy(): void {
  // v3r1 floor 1 (a console dragged right sat over modules and inventory after T): T takes it home too
  const con = document.querySelector<HTMLElement>('.win-console');
  if (con) delete con.dataset.moved;
  homeConsole();
  layout(true);
  mapBack();
}

/** r4: the map docked by the game (a burst of installs) comes back out, docking text-only windows in its way */
export function mapBack(): void {
  for (const w of modWins()) if (w.querySelector('canvas.map') && w.classList.contains('min') && !w.dataset.hand && !w.dataset.moved) promote(w);
}

// a smaller window (devtools, un-maximising): the console back on screen first, then every module
// window that now sits off screen or on another moves to a free spot or the dock
let settle: ReturnType<typeof setTimeout> | undefined;
if (typeof window !== 'undefined')
  addEventListener('resize', () => {
    homeConsole();
    // windows resize with the screen (the map's cells), so look once they have
    clearTimeout(settle);
    settle = setTimeout(resettle, 150);
  });

/** the console home, and every module window that sits off screen or on another to a free spot or the dock
 *  (a resize; v2-view: windows shown again as the map leaves the screen or the reins are let go) */
export function resettle(): void {
  homeConsole();
  if (modWins().some((w) => !w.classList.contains('min') && (!inside(w) || overlaps(w)))) layout(false);
  else dock();
  refill();
}
export function close(id: string): void {
  const docked = wins.get(id)?.el.classList.contains('min');
  wins.get(id)?.el.remove();
  wins.delete(id);
  if (docked) dock();
  // a window gone leaves room for one the game docked
  else if (/^m\d+$/.test(id)) refill();
}

export function ids(): string[] {
  return [...wins.keys()];
}

/** the foot's buttons; each types its command through `send` */
export function buttons(w: Win, list: { label: string; cmd: string }[], send: (cmd: string) => void): void {
  const sig = list.map((b) => b.label + '\u0000' + b.cmd).join('\u0001');
  if (w.foot.dataset.sig === sig) return;
  w.foot.dataset.sig = sig;
  w.foot.replaceChildren(
    ...list.map((b) => {
      const el = document.createElement('button');
      el.textContent = b.label;
      el.dataset.cmd = b.cmd;
      el.addEventListener('click', () => send(b.cmd));
      return el;
    }),
  );
}

export function drag(el: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener('pointerdown', (e) => {
    // v3: only the main button drags (a right press opened the context menu and its release was lost)
    if (e.button !== 0 || (e.target as HTMLElement).classList.contains('dot') || el.classList.contains('min')) return;
    const sx = e.clientX - el.offsetLeft;
    const sy = e.clientY - el.offsetTop;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic or stale pointer: the window-wide listeners below still end it
    }
    // v3 (Maks 10-18: the console kept following the cursor across the screen): every way a drag can end ends it,
    // and a move with no button down (its release was lost: outside the page, a lost focus) ends it too
    const move = (m: PointerEvent) => {
      if (!(m.buttons & 1)) return up();
      const x = Math.max(0, Math.min(innerWidth - 60, m.clientX - sx));
      const y = Math.max(0, Math.min(innerHeight - 24, m.clientY - sy));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.dataset.moved = '1';
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('blur', up);
      handle.removeEventListener('lostpointercapture', up);
      if (handle.hasPointerCapture?.(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('blur', up);
    handle.addEventListener('lostpointercapture', up);
  });
}
