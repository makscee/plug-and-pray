// The screen: the console plus one window per installed module, kept in step with the game every frame.

import { costs, does } from '../mods/describe';
import { def, families, label, working } from '../core/mods';
import type { Game, Inst } from '../core/types';
import { Console } from './console';
import { Panels } from './panels';
import { VIEWS, type View } from './views';
import * as windows from './windows';
import './sheet';

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
      w.dot.addEventListener('click', () => this.con.send(`${inst.on ? 'off' : 'on'} ${d.name}`));
      // what it does, in plain words, on top of every module window; the flavour under it when there's no view
      const what = document.createElement('p');
      what.className = 'does';
      what.textContent = does(inst);
      what.title = costs(inst);
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
    w.el.dataset.state = !inst.on ? 'off' : working(g, inst) ? 'on' : 'warm';
    this.views.get(inst.uid)?.update(g, dt);
    const fam = families[d.family];
    windows.buttons(w, inst.on ? fam?.buttons?.(g, inst) ?? [] : [], (c) => this.con.send(c));
  }
}
