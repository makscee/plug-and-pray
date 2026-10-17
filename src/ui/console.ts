// The console: built in, always there. Output lines with buttons, and a typed input line.

import { exec } from '../core/verbs';
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

  constructor(g: Game) {
    this.g = g;
    this.win = windows.open('console', 'console', [Math.max(16, innerWidth / 2 - 220), Math.max(16, innerHeight - 340)]);
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
    this.win.body.append(this.out, row);
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = this.input.value;
        this.input.value = '';
        if (v.trim()) this.history.push(v);
        this.hpos = this.history.length;
        this.send(v);
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

  /** run a command as if typed */
  send(cmd: string): void {
    exec(this.g, cmd);
    this.draw();
  }

  /** print log lines the console has not shown yet */
  draw(): void {
    const log = this.g.log;
    if (this.shown > log.length) {
      this.out.replaceChildren();
      this.shown = 0;
    }
    for (; this.shown < log.length; this.shown++) this.out.append(line(log[this.shown], (c) => this.send(c)));
    while (this.out.childElementCount > KEEP) this.out.firstElementChild!.remove();
    this.out.scrollTop = this.out.scrollHeight;
  }
}

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
