// v2r1 ux: the map, big. `map` (key M, or the map's `big map` link) opens your best working map as an
// overlay in the empty middle of the screen, every one of its cells at about 12 px; a map that takes
// clicks walks you there from it too. Esc, M or × closes it.

import { say } from '../core/game';
import { active, label, param } from '../core/mods';
import type { Game, Inst } from '../core/types';
import { verb } from '../core/verbs';
import { detailOf, mapView, walksOnClick } from '../world/mind';
import type { View } from './views';
import { frameHooks } from './index';
import { TOP } from './windows';
import { floorAt, floorOf } from '../world/floors';
import './flow.css';

let open: { root: HTMLElement; view: View; inst: Inst; g: Game } | null = null;

/** the working map that shows most: the highest tier, then the widest */
export function bestMap(g: Game): Inst | undefined {
  const maps = active(g, 'mind').filter((i) => param<string>(i, 'what', '') === 'map');
  return maps.sort((a, b) => detailOf(b) - detailOf(a) || param<number>(b, 'span', 33) - param<number>(a, 'span', 33))[0];
}

export const bigMapOpen = (): boolean => !!open;

export function closeBigMap(): void {
  open?.root.remove();
  open = null;
}

/** v2r3 fight: floors 1-2 keepers come up on a map even with no map module (one floor-1 kit in 80 had one): a
 *  plain spool's view of what you have seen, for that fight only */
const keeperMaps = new WeakMap<Game, Inst>();
const keeperMap = (g: Game): Inst => keeperMaps.get(g) ?? (keeperMaps.set(g, { uid: -1, mod: 'map-spool', on: true, readyAt: 0, data: {} } as Inst), keeperMaps.get(g)!);

export function toggleBigMap(g: Game, keeper = false): void {
  if (open) return closeBigMap();
  const inst = bestMap(g) ?? (keeper ? keeperMap(g) : undefined);
  if (!inst) return say(g, 'no map is on: install one (the map spool) and switch it on.');
  const span = Math.round(param<number>(inst, 'span', 33));
  // v2r3 ux: it stops above the console's last three lines (floor 1's keeper pop hid all but one)
  const tall = () => Math.min(innerHeight - 16, consoleCut()) - TOP - 70;
  const px = () => Math.max(8, Math.min(12, Math.floor(tall() / span)));
  // v2r4 ux: opened by hand, it shows the whole floor you have seen (the 33-cell window round you forgot the
  // start, the card reader and the reliquary); the keeper's pop-up stays the room round you
  const whole = !keeper;
  const box = whole ? floorBox(g, span) : null;
  const fit = (): [number, number, number] => {
    const b = floorBox(g, span, box!);
    const [cols, rows] = [b[2] - b[0] + 1, b[3] - b[1] + 1];
    return [cols, rows, Math.max(4, Math.min(12, Math.floor(Math.min((innerWidth - 56) / cols, tall() / rows))))];
  };
  const root = document.createElement('div');
  root.id = 'bigmap';
  const head = document.createElement('header');
  const name = document.createElement('b');
  name.textContent = inst.uid < 0 ? "the keeper's room" : label(inst);
  const how = document.createElement('span');
  how.textContent = ` · ${whole ? 'the floor so far' : `${span} cells`} · ${walksOnClick(g, inst) ? 'click a cell to walk there' : 'it takes no clicks'} · esc closes`;
  const x = document.createElement('button');
  x.textContent = '×';
  x.title = 'close (m or esc)';
  x.addEventListener('click', closeBigMap);
  head.append(name, how, x);
  const body = document.createElement('div');
  body.className = 'body';
  root.append(head, body);
  document.body.append(root);
  open = { root, view: whole ? mapView(body, inst, g, undefined, { size: fit, hz: 8, origin: () => [box![0], box![1]], ownClicks: true }) : mapView(body, inst, g, px), inst, g };
  open.view.update(g, 0);
}

frameHooks.push((g, dt) => {
  if (!open) return;
  // a new run, or the map taken out or switched off: it closes
  if (open.g !== g || (open.inst.uid >= 0 && (!open.inst.on || !g.player.installed.includes(open.inst)))) return closeBigMap();
  open.view.update(g, dt);
  // centred, unless that would cover the console's last three lines: then it rises (never above the goal line)
  const h = open.root.offsetHeight;
  const top = Math.max(TOP, Math.min((innerHeight - h) / 2, consoleCut() - h));
  if (open.root.style.top !== top + 'px') {
    open.root.style.top = top + 'px';
    open.root.style.transform = 'translateX(-50%)';
  }
});

/** the cells [x0, y0, x1, y1] of this floor you have seen, and you, with a margin: at least `min` across and down.
 *  Given `grow`, it only grows (it is the open map's frame: the picture never jumps back) */
function floorBox(g: Game, min: number, grow?: number[]): number[] {
  const f = floorOf(g);
  const p = g.player;
  let [x0, y0, x1, y1] = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.x), Math.floor(p.y)];
  for (const k of g.seen) {
    const i = k.indexOf(',');
    const x = +k.slice(0, i);
    if (floorAt(x) !== f) continue;
    const y = +k.slice(i + 1);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  [x0, y0, x1, y1] = [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
  if (x1 - x0 + 1 < min) [x0, x1] = [Math.floor((x0 + x1 - min) / 2), Math.floor((x0 + x1 - min) / 2) + min - 1];
  if (y1 - y0 + 1 < min) [y0, y1] = [Math.floor((y0 + y1 - min) / 2), Math.floor((y0 + y1 - min) / 2) + min - 1];
  if (!grow) return [x0, y0, x1, y1];
  [grow[0], grow[1], grow[2], grow[3]] = [Math.min(grow[0], x0), Math.min(grow[1], y0), Math.max(grow[2], x1), Math.max(grow[3], y1)];
  return grow;
}

/** the y the big map keeps above: three lines up from the console output's bottom (the screen's bottom with no console) */
function consoleCut(): number {
  const out = document.querySelector<HTMLElement>('.win-console:not(.min) .out');
  const r = out?.getBoundingClientRect();
  if (!out || !r?.height) return innerHeight;
  const line = parseFloat(getComputedStyle(out).lineHeight) || 20;
  return r.bottom - 3.5 * line - 4;
}

if (typeof window !== 'undefined')
  addEventListener(
    'keydown',
    (e) => {
      if (!open || e.key !== 'Escape') return;
      closeBigMap();
      e.preventDefault();
    },
    true,
  );

verb('map', {
  help: 'your map, big, in the middle of the screen (key m); again or esc closes it',
  when: (g) => !!bestMap(g) || bigMapOpen(),
  whenFail: () => 'map: no map is on. install one (the map spool) and switch it on.',
  run(g) {
    toggleBigMap(g);
  },
});
