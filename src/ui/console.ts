// The console: built in, always there. Output lines with buttons, and a typed input line.

import { actions, exec } from '../core/verbs';
import type { Game, Line } from '../core/types';
import * as windows from './windows';

const KEEP = 120;

export class Console {
  g: Game;
  out: HTMLElement;
  input: HTMLInputElement;
  shown = 0;
  history: string[] = [];
  hpos = 0;
  win: windows.Win;
  bar: HTMLElement;
  barKey = '';
  /** you just did something: the next draw shows the end, wherever the reader had scrolled */
  follow = false;
  /** the output's height at the last draw: a smaller window re-pins to the end */
  seenH = 0;
  /** the last line printed, as printed: a key step's echo grows in place (`> go n ×3`) */
  lastSig = '';

  constructor(g: Game) {
    this.g = g;
    this.win = windows.open('console', 'console', windows.consoleAt());
    this.win.el.classList.add('win-console');
    this.out = document.createElement('div');
    this.out.className = 'out';
    const row = document.createElement('label');
    row.className = 'in';
    row.textContent = '> ';
    this.input = document.createElement('input');
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    row.append(this.input);
    this.bar = document.createElement('div');
    this.bar.className = 'acts';
    this.win.body.append(this.out, row, this.bar);
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = this.input.value;
        this.input.value = '';
        if (v.trim()) this.history.push(v);
        this.hpos = this.history.length;
        this.send(v);
      } else if (!this.input.value && !e.ctrlKey && /^Arrow/.test(e.key)) {
        // an empty line: the arrows walk (body/input.ts takes them first); nothing to do here
      } else if (e.key === 'ArrowUp' && this.history.length) {
        this.hpos = Math.max(0, this.hpos - 1);
        this.input.value = this.history[this.hpos];
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        this.hpos = Math.min(this.history.length, this.hpos + 1);
        this.input.value = this.history[this.hpos] ?? '';
        e.preventDefault();
      }
      e.stopPropagation();
    });
    this.win.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'BUTTON') this.input.focus();
    });
  }

  /** run a command as if typed; `a; b` runs both (the boot text's install all) */
  send(cmd: string): void {
    for (const c of cmd.split(';')) exec(this.g, c);
    this.follow = true;
    this.draw();
  }

  /** print log lines the console has not shown yet */
  draw(): void {
    const log = this.g.log;
    const o = this.out;
    if (this.shown > log.length) {
      o.replaceChildren();
      this.shown = 0;
    }
    // follow new lines when the reader is at the bottom, or just did something (a typed or clicked
    // command); scrolled up to read, they stay put. A window that got shorter re-pins to the end
    const atEnd = o.scrollHeight - o.scrollTop - o.clientHeight < 24 || this.follow || (this.seenH > 0 && o.clientHeight !== this.seenH);
    let grew = false;
    // the last line changed in place (a key step's echo counting up): draw it again
    if (this.shown && this.shown <= log.length && sig(log[this.shown - 1]) !== this.lastSig && o.lastElementChild) {
      o.lastElementChild.replaceWith(line(log[this.shown - 1], (c) => this.send(c)));
      grew = true;
    }
    if (this.shown < log.length) {
      for (; this.shown < log.length; this.shown++) o.append(line(log[this.shown], (c) => this.send(c)));
      while (o.childElementCount > KEEP) o.firstElementChild!.remove();
      grew = true;
    }
    if (this.shown) this.lastSig = sig(log[this.shown - 1]);
    if ((grew || this.follow || o.clientHeight !== this.seenH) && atEnd) o.scrollTop = o.scrollHeight;
    this.follow = false;
    this.seenH = o.clientHeight;
    this.drawBar();
  }

  /** the actions bar: every action open right now, rebuilt only when the list changes */
  drawBar(): void {
    const groups = this.g.ended ? [] : actions(this.g);
    const key = JSON.stringify(groups);
    if (key === this.barKey) return;
    this.barKey = key;
    this.bar.replaceChildren(
      ...groups.map(([name, xs]) => {
        const row = document.createElement('div');
        const h = document.createElement('span');
        h.className = 'echo';
        h.textContent = name;
        row.append(h);
        for (const x of xs) {
          const b = document.createElement('button');
          b.textContent = x.label;
          b.dataset.cmd = x.cmd;
          b.addEventListener('click', () => this.send(x.cmd));
          row.append(b);
        }
        return row;
      }),
    );
  }
}

const sig = (l: Line) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('');

function line(l: Line, send: (cmd: string) => void): HTMLElement {
  const el = document.createElement('div');
  for (const s of l) {
    if (typeof s === 'string') el.append(s);
    else if (!s.cmd) {
      const e = document.createElement('span');
      e.className = 'echo';
      e.textContent = s.text;
      el.append(e);
    } else {
      const b = document.createElement('button');
      b.textContent = s.text;
      b.dataset.cmd = s.cmd;
      b.addEventListener('click', () => send(s.cmd));
      el.append(b);
    }
  }
  return el;
}
