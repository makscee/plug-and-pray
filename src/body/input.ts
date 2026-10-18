// Keys and mouse for the gaits. The console keeps typing: while it has focus, keys are text (but the
// arrows walk while its line is empty); Esc gives them back to movement and Enter takes them to the
// console again. Key steps print quietly: one echo that counts up, and a wall said once.
// Arrow keys walk one cell with any legs: the servo gait steps, the stepper relay types `go n` (as its
// buttons do), with neither you crawl. WASD: the gyro heart walks free; without one, WASD are arrows.
// Q and E turn a quarter. T tidies the windows, P pauses, 1-4 switch to saved setups 1-4.
// On the end screen Enter or R wakes again.
// Mouse: with the gyro heart, a click on a camera's eye (or the empty desk) locks the pointer and the
// mouse turns you; Esc lets it go. Without a lock, dragging on the eye turns you too.

import { gyroMove, gyroTurn, hasGyro, saveSetup, servoStep, setupsOf } from './index';
import { exec, VERBS } from '../core/verbs';
import { active, param } from '../core/mods';
import { walk } from '../mods/gait';
import { frameHooks } from '../ui';
import { tidy } from '../ui/windows';
import { togglePause } from '../ui/pause';
import type { Game, Line } from '../core/types';
import './views';
import { clean } from '../tune/start';

const ARROWS: Record<string, string> = { ArrowUp: 'n', ArrowRight: 'e', ArrowDown: 's', ArrowLeft: 'w' };
const WASD: Record<string, string> = { w: 'n', a: 'w', s: 's', d: 'e' };
const held = new Set<string>();
const thaw = () => (window as unknown as { thaw: { g: Game; send(c: string): void; screen?: { con: { follow: boolean } } } }).thaw;
const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
const consoleInput = () => document.querySelector<HTMLInputElement>('.win-console input');
const wakeAgain = () => document.querySelector<HTMLButtonElement>('.dead button, .thaw-card button')?.click();

/** one cell that way with whatever legs are on; quiet when a step is already queued */
export function keyStep(g: Game, d: string): void {
  if (servoStep(g, d)) return;
  if (active(g, 'gait').some((i) => param(i, 'keys', false))) return; // the servo's own queue is full, or a wall
  if (g.player.path.length > 1) return;
  const goes = active(g, 'gait').some((i) => param(i, 'go', false));
  if (!goes && hasGyro(g)) {
    // the gyro heart: a quiet cell-long glide
    g.player.pace = 2.5;
    walk(g, d, 1);
    return;
  }
  quietStep(g, goes ? `go ${d}` : `crawl ${d}`);
}

const text = (l: Line) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('');
/** what the last key step that went nowhere printed, per game */
const bumped = new WeakMap<Game, string>();

/** a key's `go n`: echoed once, then counted on that line (`> go n ×4`) while nothing else prints; the
 * same wall twice says nothing new, so it says nothing (playtest r2: ten steps flooded the console) */
export function quietStep(g: Game, cmd: string): void {
  const echo = '> ' + cmd;
  const last = g.log[g.log.length - 1];
  const head = last?.length === 1 && typeof last[0] !== 'string' && !last[0].cmd ? last[0].text : '';
  const n = head === echo ? 1 : head.startsWith(echo + ' ×') ? Number(head.slice(echo.length + 2)) : 0;
  const p = g.player;
  const before = [p.path.length, p.path[p.path.length - 1]?.join()].join();
  const at = g.log.length;
  exec(g, cmd);
  const moved = [p.path.length, p.path[p.path.length - 1]?.join()].join() !== before;
  const said = g.log.slice(at + 1).map(text).join('\n');
  if (!moved && said && bumped.get(g) === said) g.log.length = at;
  else if (n && g.log.length === at + 1) {
    // only the echo: count it on the line above instead
    g.log.length = at;
    g.log[at - 1] = [{ text: `${echo} ×${n + 1}`, cmd: '' }];
  }
  if (!moved && said) bumped.set(g, said);
  else if (moved) bumped.delete(g);
  const con = thaw()?.screen?.con;
  if (con) con.follow = true;
}

/** a quarter turn: -1 left (Q), 1 right (E) */
export function turn(g: Game, by: number): void {
  const q = Math.PI / 2;
  const p = g.player;
  p.dir = ((((Math.round(p.dir / q) + by) * q) % (4 * q)) + 4 * q) % (4 * q);
}

// capture phase: runs before the console's own key handler
addEventListener(
  'keydown',
  (e) => {
    const g = thaw()?.g;
    if (g?.ended && (e.key === 'Enter' || (!typing(e.target) && e.key.toLowerCase() === 'r'))) {
      if (!typing(e.target) || !(e.target as HTMLInputElement).value.trim()) {
        wakeAgain();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    if (typing(e.target)) {
      // an empty console line: the arrows walk; with text (or ctrl) they are the history
      const d = ARROWS[e.key];
      if (d && g && !g.ended && !(e.target as HTMLInputElement).value && !e.ctrlKey && !e.metaKey && !e.altKey) {
        keyStep(g, d);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') {
        (e.target as HTMLElement).blur();
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.key === 'Enter') {
      consoleInput()?.focus();
      e.preventDefault();
      return;
    }
    if (!g || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const d = ARROWS[e.key] ?? (!hasGyro(g) ? WASD[k] : undefined);
    if (d) {
      keyStep(g, d);
      e.preventDefault();
      return;
    }
    if (WASD[k]) {
      held.add(k);
      e.preventDefault();
      return;
    }
    if (e.repeat && k !== 'q' && k !== 'e') return;
    if (k === 'q' || k === 'e') turn(g, k === 'q' ? -1 : 1);
    else if (k === 't') tidy();
    else if (k === 'p') togglePause();
    else if (k >= '1' && k <= '4') {
      const name = Object.keys(setupsOf(g))[Number(k) - 1];
      thaw().send(name ? `setup ${name}` : 'setup');
    } else return;
    e.preventDefault();
  },
  true,
);
addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());

// focus moving into the console drops held keys, so you do not walk on while typing
addEventListener('focusin', (e) => {
  if (typing(e.target)) held.clear();
});

frameHooks.push((g) => {
  const fwd = (held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0);
  const side = (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0);
  if (fwd || side || g.player.move) gyroMove(g, fwd, side);
});

addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (document.pointerLockElement) {
    // locked: a click fires an aimed weapon, when the fight slice has added one
    if (VERBS.shoot && (!VERBS.shoot.when || VERBS.shoot.when(thaw().g))) thaw().send('shoot');
    return;
  }
  const g = thaw()?.g;
  if (!g || !(t.matches('canvas.eye') || t.id === 'desk')) return;
  if (!hasGyro(g)) return;
  (document.activeElement as HTMLElement | null)?.blur();
  // some browsers (and a lock released under a second ago) refuse: dragging on the eye still turns you
  (t.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
});

addEventListener('mousemove', (e) => {
  const dragging = e.buttons === 1 && (e.target as HTMLElement).matches?.('canvas.eye');
  if (!document.pointerLockElement && !dragging) return;
  const g = thaw()?.g;
  if (g) gyroTurn(g, e.movementX * 0.004);
});

// ?scene=body stages the body for judging: vidicon, gyro heart, ledger, clock of hours, tunnel tongue
// and spark finger on; servo gait, a slot board and two power modules in the ledger; two setups
// saved; three mites coming from the east for the clock to read.
let staged = new URLSearchParams(location.search).get('scene') !== 'body';
frameHooks.push((g) => {
  if (staged) return;
  staged = true;
  clean(g);
  const p = g.player;
  g.ents = g.ents.filter((e) => e.kind !== 'item' || Math.hypot(e.x - p.x, e.y - p.y) > 8);
  p.slots = 6;
  p.core = 10;
  for (const mod of ['vidicon-tube', 'gyro-heart', 'ledger', 'clock-of-hours', 'tunnel-tongue', 'spark-finger']) {
    p.installed.push({ uid: g.nextId++, mod, on: true, readyAt: 0, data: {} });
    g.stats.mods.push(mod);
  }
  for (const mod of ['servo-gait', 'slot-board', 'votive-battery', 'heart-shard']) p.inv.push({ kind: 'mod', mod });
  const on = (mods: string[]) => p.installed.forEach((i) => (i.on = mods.includes(i.mod)));
  on(['vidicon-tube', 'gyro-heart', 'clock-of-hours', 'spark-finger']);
  saveSetup(g, 'battle');
  on(['vidicon-tube', 'gyro-heart', 'ledger', 'tunnel-tongue']);
  saveSetup(g, 'explore');
  on(['vidicon-tube', 'gyro-heart', 'ledger', 'clock-of-hours', 'tunnel-tongue', 'spark-finger']);
  p.dir = Math.PI / 2;
  for (const [x, y] of [[11.5, 6.5], [11.5, 10.5], [11.5, 8.5]]) g.ents.push({ id: g.nextId++, kind: 'enemy', x, y, enemy: { type: 'mite', hp: 2, readyAt: 0, data: { noticed: true } } });
  g.log.push(
    ['a body, staged. you face east; three mites come. esc, then wasd walks; click the eye to turn with the mouse.'],
    [{ text: 'dig', cmd: 'dig' }, '  ', { text: 'setup battle', cmd: 'setup battle' }, '  ', { text: 'setup explore', cmd: 'setup explore' }, '  ', { text: 'status', cmd: 'status' }],
  );
});
