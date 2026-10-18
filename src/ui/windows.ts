// Windows on the dark page: one per installed module plus the console. Dragged by the title bar.
// The title carries the module's power dot (click: on/off); the foot carries its buttons.
// No window buries another (playtest r1): a new one goes to the first free spot left of the panel
// column, or, with none, opens minimised (its title bar only) in a dock along the bottom; a click on
// the title brings it back, a double-click on any module title minimises it. `tidy` lays them all out.

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
  const [x, y] = at ?? [24 + (k % perRow) * 280, TOP + Math.floor(k / perRow) % 2 * 330];
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
    queueMicrotask(place);
    setTimeout(place, 300);
    setTimeout(place, 1200);
  }
  const w = { id, el, title: t, body, foot, dot };
  wins.set(id, w);
  return w;
}

/** windows start under the hp bar */
export const TOP = 32;
/** the panel column on the right edge (panel width 260 + margins) is never free */
const COLUMN = 260 + 16 + 8;
type Rect = { left: number; top: number; right: number; bottom: number };

/** what a window must keep clear of: every other window (skipping those being laid out) and the panel column */
function rects(el: HTMLElement, skip?: (o: HTMLElement) => boolean): Rect[] {
  const out: Rect[] = [...document.querySelectorAll<HTMLElement>('.win')]
    .filter((o) => o !== el && !o.dataset.tidy && !skip?.(o))
    .map((o) => o.getBoundingClientRect());
  out.push({ left: innerWidth - COLUMN, top: 0, right: innerWidth, bottom: innerHeight });
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

/** the first free top-left (row by row from the top left, 16 px steps) where `el` overlaps no window */
function free(el: HTMLElement, skip?: (o: HTMLElement) => boolean): [number, number] | null {
  const { width: w, height: h } = el.getBoundingClientRect();
  const others = rects(el, skip);
  for (let y = TOP; y + h <= innerHeight - 8; y += 16)
    for (let x = 16; x + w <= innerWidth - 8; x += 16) if (!others.some((r) => hit(x, y, w, h, r, 8))) return [x, y];
  return null;
}

const moveTo = (el: HTMLElement, [x, y]: [number, number]) => ([el.style.left, el.style.top] = [x + 'px', y + 'px']);

/** a free spot; with none, lay the module windows out again; what still finds none goes to the dock */
function put(el: HTMLElement): void {
  // measured at the left edge: near the right one a window shrinks to fit what is left of the screen
  moveTo(el, [0, TOP]);
  const spot = free(el);
  if (spot) moveTo(el, spot);
  else layout(false);
}

/** a window that grew (a zoomed map): to a free spot if it now covers another and one exists */
export function refit(el: HTMLElement): void {
  if (el.classList.contains('min') || (!overlaps(el) && inside(el))) return;
  const spot = free(el);
  if (spot) moveTo(el, spot);
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
    // no room: it takes the first spot clear of the console and panels, and docks the module windows there
    const spot = free(el) ?? free(el, (o) => o.classList.contains('mod-win') && !o.classList.contains('min'));
    if (spot) moveTo(el, spot);
    else clamp(el);
    const a = el.getBoundingClientRect();
    for (const o of modWins())
      if (o !== el && !o.classList.contains('min') && hit(a.left, a.top, a.width, a.height, o.getBoundingClientRect(), -2)) minimise(o);
  }
  el.style.zIndex = String(++top);
  dock();
}

/** lay the minimised windows out along the bottom, left to right, around the windows already there */
function dock(): void {
  const mins = [...document.querySelectorAll<HTMLElement>('.win.min')];
  mins.forEach((m) => (m.dataset.tidy = '1'));
  for (const m of mins) {
    const { width: w, height: h } = m.getBoundingClientRect();
    const others = rects(m);
    let spot: [number, number] | null = null;
    for (let y = innerHeight - h - 6; y >= TOP && !spot; y -= h + 4)
      for (let x = 16; x + w <= innerWidth - 8; x += 8)
        if (!others.some((r) => hit(x, y, w, h, r, 3))) {
          spot = [x, y];
          break;
        }
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
  // eyes first (they are how you see), then the map, then biggest first
  const area = (w: HTMLElement) => w.offsetWidth * w.offsetHeight + (w.classList.contains('fam-camera') ? 1e7 : w.querySelector('canvas.map') ? 5e6 : 0);
  ws.sort((a, b) => area(b) - area(a));
  for (const w of ws) {
    delete w.dataset.tidy;
    const spot = free(w);
    if (spot) moveTo(w, spot);
    else {
      if (!w.classList.contains('min')) w.dataset.was = '';
      w.classList.add('min');
    }
  }
  dock();
}

/** the console's own spot: bottom centre, low enough that a map fits above it at 1280x720 (style.css
 * shortens its output under 800 px tall) */
export const consoleAt = (): [number, number] => [Math.max(16, innerWidth / 2 - 220), Math.max(TOP, innerHeight - (innerHeight < 800 ? 350 : 390))];

/** the console on screen: back to its own spot unless you dragged it, else just inside the edges */
function homeConsole(): void {
  const con = document.querySelector<HTMLElement>('.win-console');
  if (!con) return;
  if (!con.dataset.moved) moveTo(con, consoleAt());
  clamp(con);
}

/** T, or `tidy`: the console back on screen, every module window laid out again */
export function tidy(): void {
  homeConsole();
  layout(true);
}

// a smaller window (devtools, un-maximising): the console back on screen first, then every module
// window that now sits off screen or on another moves to a free spot or the dock
let settle: ReturnType<typeof setTimeout> | undefined;
if (typeof window !== 'undefined')
  addEventListener('resize', () => {
    homeConsole();
    // windows resize with the screen (the map's cells), so look once they have
    clearTimeout(settle);
    settle = setTimeout(() => {
      homeConsole();
      if (modWins().some((w) => !w.classList.contains('min') && (!inside(w) || overlaps(w)))) layout(false);
      else dock();
    }, 150);
  });
export function close(id: string): void {
  const docked = wins.get(id)?.el.classList.contains('min');
  wins.get(id)?.el.remove();
  wins.delete(id);
  if (docked) dock();
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

function drag(el: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).classList.contains('dot') || el.classList.contains('min')) return;
    const sx = e.clientX - el.offsetLeft;
    const sy = e.clientY - el.offsetTop;
    handle.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      const x = Math.max(0, Math.min(innerWidth - 60, m.clientX - sx));
      const y = Math.max(0, Math.min(innerHeight - 24, m.clientY - sy));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.dataset.moved = '1';
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}
