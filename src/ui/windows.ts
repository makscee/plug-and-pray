// Windows on the dark page: one per installed module plus the console. Dragged by the title bar.
// The title carries the module's power dot (click: on/off); the foot carries its buttons.

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
  if (have) return have;
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
  const perRow = Math.max(1, Math.floor((innerWidth - 24) / 280));
  const [x, y] = at ?? [24 + (k % perRow) * 280, 24 + Math.floor(k / perRow) % 2 * 330];
  if (at) cascade--;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.zIndex = String(++top);
  el.addEventListener('pointerdown', () => (el.style.zIndex = String(++top)));
  drag(el, t);
  desk().append(el);
  const w = { id, el, title: t, body, foot, dot };
  wins.set(id, w);
  return w;
}

export function close(id: string): void {
  wins.get(id)?.el.remove();
  wins.delete(id);
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
    if ((e.target as HTMLElement).classList.contains('dot')) return;
    const sx = e.clientX - el.offsetLeft;
    const sy = e.clientY - el.offsetTop;
    handle.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      const x = Math.max(0, Math.min(innerWidth - 60, m.clientX - sx));
      const y = Math.max(0, Math.min(innerHeight - 24, m.clientY - sy));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}
