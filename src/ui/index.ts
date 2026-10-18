// The screen: the console plus one window per installed module, kept in step with the game every frame.

import { costs, does } from '../mods/describe';
import { def, families, label, param, working } from '../core/mods';
import { LAYERS } from '../world/secrets';
import type { Game, Inst } from '../core/types';
import { Console } from './console';
import { Panels } from './panels';
import { VIEWS, type View } from './views';
import * as windows from './windows';
import './sheet';
import './maptips';
import { say } from '../core/game';
import { instRef, verb } from '../core/verbs';
import { togglePause } from './pause';

verb('tidy', {
  help: 'lay the windows out again, none on another (key t)',
  run(g) {
    windows.tidy();
    say(g, 'windows tidied. a title in the dock along the bottom opens that window; double-click a title to dock it.');
  },
});
verb('pause', {
  help: 'stop the world while you think (key p)',
  run() {
    togglePause();
  },
});

/** module uids whose eye has shown something hidden once (its window opened then) */
const shown = new WeakMap<Game, Set<number>>();

/** per-frame hooks the slices add (the end sequence, hit flashes, sound) */
export const frameHooks: ((g: Game, dt: number) => void)[] = [];

export class Screen {
  g: Game;
  con: Console;
  panels: Panels;
  views = new Map<number, View>();

  constructor(g: Game) {
    this.g = g;
    this.con = new Console(g);
    this.panels = new Panels(g, (c) => this.con.send(c));
    // v2r2 fun: on floor 1 only the eyes, the map and the weapons open; legs (the console has the moves),
    // power, body, lamps, scanners, tools and the rest start as chips in the dock
    windows.startsDocked.test = (el) => !this.g.floor && /^m\d+$/.test(el.dataset.win ?? '') && !/fam-(camera|weapon)\b/.test(el.className) && !el.querySelector('canvas.map');
  }

  /** every frame: windows follow the installed modules, views redraw, the console prints */
  frame(dt: number): void {
    const g = this.g;
    const want = new Set(g.player.installed.map((i) => 'm' + i.uid));
    for (const id of windows.ids()) {
      if (!/^m\d+$/.test(id) || want.has(id)) continue; // module windows only
      const uid = Number(id.slice(1));
      this.views.get(uid)?.dispose?.();
      this.views.delete(uid);
      windows.close(id);
    }
    for (const inst of g.player.installed) this.sync(inst, dt);
    this.con.draw();
    this.panels.frame();
    for (const f of frameHooks) f(g, dt);
  }

  sync(inst: Inst, dt: number): void {
    const g = this.g;
    const id = 'm' + inst.uid;
    let w = windows.get(id);
    const d = def(inst);
    if (!w) {
      w = windows.open(id, label(inst));
      w.el.classList.add('fam-' + d.family);
      w.dot.title = 'on / off';
      // this very one, not the first of two the same (playtest r2)
      w.dot.addEventListener('click', () => this.con.send(`${inst.on ? 'off' : 'on'} ${instRef(g, inst)}`));
      // what it does, in plain words, on top of every module window; the flavour under it when there's no view
      const what = document.createElement('p');
      what.className = 'does';
      w.body.append(what);
      const make = VIEWS[d.family];
      if (make) this.views.set(inst.uid, make(w.body, inst, g));
      else {
        const p = document.createElement('p');
        p.className = 'flavour';
        p.textContent = d.text;
        w.body.append(p);
      }
    }
    // attune and temper change the name and the numbers: the title and the does line follow
    const name = label(inst);
    const text = does(inst);
    const key = name + '\u0000' + text + '\u0000' + costs(inst);
    if (w.el.dataset.key !== key) {
      w.el.dataset.key = key;
      w.title.querySelector('span')!.textContent = name;
      const what = w.body.querySelector<HTMLElement>('.does')!;
      what.textContent = text;
      what.title = costs(inst);
      // v2 flow: a map window hides its does line (flow.css); its title says it on hover
      if (param<string>(inst, 'what', '') === 'map') w.title.title = `${text} · drag to move · double-click to minimise`;
    }
    // an eye that is the only one on showing its hidden layer (heat, sonar, 1-bit, edge) outranks the rest
    const f = d.family === 'camera' ? param<string>(inst, 'filter', '') : '';
    const layer = LAYERS.includes(f) && !g.player.installed.some((o) => o !== inst && o.on && o.uid < inst.uid && def(o).family === 'camera' && param<string>(o, 'filter', '') === f);
    if (layer) w.el.dataset.layer = '1';
    else delete w.el.dataset.layer;
    // v2r1 ux: how readable an eye is, for the dock's rank: colour (sharper first), then grey, then layer eyes
    if (d.family === 'camera') {
      const eye = f === 'color' ? 1 - Math.min(200, param<number>(inst, 'res', 64)) / 400 : f === 'gray' ? 2 : 3;
      if (w.el.dataset.eye !== String(eye)) w.el.dataset.eye = String(eye);
    }
    // its first reveal (scripture, a hollow wall, handprints) opens its window (playtest r2)
    const flash = inst.data.flashAt as number | undefined;
    let seen = shown.get(g);
    if (!seen) shown.set(g, (seen = new Set()));
    if (flash !== undefined && LAYERS.includes(f) && !seen.has(inst.uid)) {
      seen.add(inst.uid);
      if (w.el.classList.contains('min')) queueMicrotask(() => windows.reveal(w!.el));
    }
    const state = !inst.on ? 'off' : working(g, inst) ? 'on' : 'warm';
    const was = w.el.dataset.state;
    w.el.dataset.state = state;
    // switched on while docked: it may outrank a window that is open
    if (was === 'off' && state !== 'off') queueMicrotask(() => windows.promote(w!.el));
    // switched off: a docked window that now outranks it may take its place
    else if (was && was !== 'off' && state === 'off') queueMicrotask(windows.refill);
    this.views.get(inst.uid)?.update(g, dt);
    const fam = families[d.family];
    windows.buttons(w, inst.on ? fam?.buttons?.(g, inst) ?? [] : [], (c) => this.con.send(c));
  }
}
