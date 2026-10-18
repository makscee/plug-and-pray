// Keys and mouse for the gaits. The console keeps typing: while it has focus, keys are text (but the
// arrows walk while its line is empty); Esc gives them back to movement and Enter takes them to the
// console again. Key steps print quietly: one echo that counts up, and a wall said once.
// Arrow keys walk one cell with any legs: the servo gait steps, the stepper relay types `go n` (as its
// buttons do), with neither you crawl. WASD: the gyro heart walks free; without one, WASD are arrows.
// Q and E turn a quarter. T tidies the windows, P pauses, 1-4 switch to saved setups 1-4.
// On the end screen Enter or R wakes again.
// Mouse: with the gyro heart, a click on a camera's eye (or the empty desk) locks the pointer and the
// mouse turns you; Esc lets it go. Without a lock, dragging on the eye turns you too.
// The FPS eye's big view (src/body/fps.ts, v2): V goes big and back; there WASD and the arrows walk and
// strafe relative to the view, a click on the view takes the mouse (smooth yaw), then a click shoots down the
// crosshair (right click or F: a melee lunge; Space shoots too), Shift dashes (mk2), Esc frees the mouse,
// and Esc again with the mouse free leaves the big view.

import { gyroMove, gyroTurn, hasGyro, saveSetup, servoStep, setupsOf } from './index';
import { exec, VERBS } from '../core/verbs';
import { active, param } from '../core/mods';
import { walk } from '../mods/gait';
import { frameHooks } from '../ui';
import { tidy } from '../ui/windows';
import { togglePause } from '../ui/pause';
import type { Game, Line } from '../core/types';
import { say } from '../core/game';
import './views';
import { clean } from '../tune/start';
import { bigOn, dash, fpsEye, fpsFire, fpsMove, fpsTurn, lunge } from './fps';

const ARROWS: Record<string, string> = { ArrowUp: 'n', ArrowRight: 'e', ArrowDown: 's', ArrowLeft: 'w' };
const WASD: Record<string, string> = { w: 'n', a: 'w', s: 's', d: 'e' };
const held = new Set<string>();
/** test runs hold keys as if pressed ('w', 'ArrowUp'...): src/sight/fps.ts fpsTest.hold */
(globalThis as unknown as { fpsHold: (...keys: string[]) => void }).fpsHold = (...keys) => {
  held.clear();
  for (const k of keys) held.add(k);
};
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
    // r4: r and space wake too, even with the console focused (the card says so); never type them in
    if (g?.ended && (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'r')) {
      const box = typing(e.target) ? (e.target as HTMLInputElement) : null;
      if (!box || e.key !== 'Enter' || !box.value.trim()) {
        if (box) { box.value = ''; box.blur(); }
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
    if (fpsKey(g, e, k)) {
      e.preventDefault();
      return;
    }
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
    else if (k === 'm') thaw().send('map');
    else if (k >= '1' && k <= '4') {
      const name = Object.keys(setupsOf(g))[Number(k) - 1];
      thaw().send(name ? `setup ${name}` : 'setup');
    } else return;
    e.preventDefault();
  },
  true,
);
addEventListener('keyup', (e) => {
  held.delete(e.key.toLowerCase());
  held.delete(e.key);
});

/** when the mouse was last freed from the big view */
let lockLost = -1e9;
if (typeof document !== 'undefined') document.addEventListener('pointerlockchange', () => !document.pointerLockElement && (lockLost = performance.now()));

/** the big view's keys; true when it took the key */
function fpsKey(g: Game, e: KeyboardEvent, k: string): boolean {
  if (k === 'v' && !e.repeat && fpsEye(g)) {
    thaw().send('big');
    return true;
  }
  if (!bigOn(g)) return false;
  if (WASD[k] || ARROWS[e.key]) {
    held.add(ARROWS[e.key] ? e.key : k);
    return true;
  }
  if (e.repeat) return k === ' ' || k === 'shift' || k === 'f';
  if (k === 'shift') dash(g);
  else if (k === '[' || k === ']') setSens(g, k === ']' ? 1.15 : 1 / 1.15);
  else if (k === 'f') lunge(g);
  else if (k === ' ') fpsFire(g);
  else if (k === 'escape') {
    // the first Esc frees the mouse (the browser's own, or this one); only an Esc with the mouse already
    // free leaves the big view (v2r1 ux: one press did both where the browser passed that Esc on)
    if (document.pointerLockElement) document.exitPointerLock();
    else if (performance.now() - lockLost > 400) thaw().send('big');
  } else return false;
  return true;
}

addEventListener('blur', () => held.clear());

// focus moving into the console drops held keys, so you do not walk on while typing
addEventListener('focusin', (e) => {
  if (typing(e.target)) held.clear();
});

frameHooks.push((g) => {
  const fwd = (held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0);
  const side = (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0);
  if (bigOn(g)) {
    // the big view: the arrows walk with WASD, relative to where you look
    const f = fwd + (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0);
    const sd = side + (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
    fpsMove(g, Math.sign(f), Math.sign(sd));
    return;
  }
  if (fwd || side || g.player.move) gyroMove(g, fwd, side);
});

// the big view: a press takes the mouse, then fires (left) or lunges (right)
addEventListener('mousedown', (e) => {
  const g = thaw()?.g;
  const view = document.getElementById('bigview');
  if (!g || !view || !bigOn(g) || !view.contains(e.target as Node)) return;
  e.preventDefault();
  (document.activeElement as HTMLElement | null)?.blur();
  if (document.pointerLockElement !== view) {
    (view.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
    return;
  }
  if (e.button === 2) lunge(g);
  else if (e.button === 0) fpsFire(g);
});
addEventListener('contextmenu', (e) => {
  if (document.getElementById('bigview')?.contains(e.target as Node)) e.preventDefault();
});

addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (document.pointerLockElement && document.pointerLockElement.id === 'bigview') return; // the big view's own (mousedown)
  if (document.pointerLockElement) {
    // locked: a click fires an aimed weapon, when the fight slice has added one
    if (VERBS.shoot && (!VERBS.shoot.when || VERBS.shoot.when(thaw().g))) thaw().send('shoot');
    // no weapon on at all: the click says so (Maks 10-18: it felt like hitting)
    else if (VERBS.attack && !active(thaw().g, 'weapon').length) thaw().send('attack');
    return;
  }
  const g = thaw()?.g;
  if (!g || !(t.matches('canvas.eye') || t.id === 'desk')) return;
  if (!hasGyro(g)) return;
  (document.activeElement as HTMLElement | null)?.blur();
  // some browsers (and a lock released under a second ago) refuse: dragging on the eye still turns you
  (t.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
});

/** mouse-look in the big view: radians per pixel, by default; [ and ] slow it down or speed it up, and
 *  this browser keeps it (v2r1 fight: a little fast, with no setting) */
export const SENS = 0.0026;
const SENS_KEY = 'thaw.sens';
let sens = SENS;
try {
  const v = Number(localStorage.getItem(SENS_KEY));
  if (v > 0) sens = Math.min(SENS * 3, Math.max(SENS / 3, v));
} catch {
  // no storage (private mode, a sandbox): the default
}
/** the mouse speed now, as a share of the default (1 = 100%) */
export const sensShare = (): number => sens / SENS;
/** scale the mouse speed by `by` (kept between a third and three times the default) */
export function setSens(g: Game, by: number): void {
  sens = Math.min(SENS * 3, Math.max(SENS / 3, sens * by));
  try {
    localStorage.setItem(SENS_KEY, String(sens));
  } catch {
    // not kept: it still holds for this visit
  }
  say(g, `mouse speed ${Math.round(sensShare() * 100)}%. [ slower, ] faster.`);
}
addEventListener('mousemove', (e) => {
  const dragging = e.buttons === 1 && (e.target as HTMLElement).matches?.('canvas.eye');
  if (!document.pointerLockElement && !dragging) return;
  const g = thaw()?.g;
  if (g && bigOn(g)) {
    if (document.pointerLockElement?.id === 'bigview') fpsTurn(g, e.movementX * sens);
    return;
  }
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
