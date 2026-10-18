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

export function toggleBigMap(g: Game): void {
  if (open) return closeBigMap();
  const inst = bestMap(g);
  if (!inst) return say(g, 'no map is on: install one (the map spool) and switch it on.');
  const span = Math.round(param<number>(inst, 'span', 33));
  const px = () => Math.max(8, Math.min(12, Math.floor((innerHeight - 150) / span)));
  const root = document.createElement('div');
  root.id = 'bigmap';
  const head = document.createElement('header');
  const name = document.createElement('b');
  name.textContent = label(inst);
  const how = document.createElement('span');
  how.textContent = ` · ${span} cells · ${walksOnClick(g, inst) ? 'click a cell to walk there' : 'it takes no clicks'} · esc closes`;
  const x = document.createElement('button');
  x.textContent = '×';
  x.title = 'close (m or esc)';
  x.addEventListener('click', closeBigMap);
  head.append(name, how, x);
  const body = document.createElement('div');
  body.className = 'body';
  root.append(head, body);
  document.body.append(root);
  open = { root, view: mapView(body, inst, g, px), inst, g };
  open.view.update(g, 0);
}

frameHooks.push((g, dt) => {
  if (!open) return;
  // a new run, or the map taken out or switched off: it closes
  if (open.g !== g || !open.inst.on || !g.player.installed.includes(open.inst)) return closeBigMap();
  open.view.update(g, dt);
});

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
