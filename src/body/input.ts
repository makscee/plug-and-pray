// Keys and mouse for the gaits. The console keeps typing: while it has focus, keys are text (but the
// arrows walk while its line is empty); Esc gives them back to movement and Enter takes them to the
// console again. Key steps print quietly: one echo that counts up, and a wall said once.
// Arrow keys walk one cell with any legs: the servo gait steps, the stepper relay types `go n` (as its
// buttons do), with neither you crawl. WASD: the gyro heart walks free; without one, WASD are arrows.
// Q and E turn a quarter. T tidies the windows, P pauses, 1-4 switch to saved setups 1-4.
// On the end screen Enter or R wakes again.
// Mouse: the cursor is yours for the windows, and a click on the map (while it is your sight) walks you there.
// The reins (src/body/fps.ts, v2-view): Tab (or V, or a click on the view) takes them and the mouse; there WASD
// and up/down walk relative to the view, the mouse turns you (smooth yaw), a click shoots down the
// crosshair (right click or F: a melee lunge; Space shoots too), Shift dashes (mk2). Tab again, or Esc, gives
// the cursor back for the windows.
// A trackpad plays it all (Maks 10-18: "it shouldn't require a mouse but looking around is important"): a finger
// moving turns you with no button held, Q/E and the left/right arrows turn smoothly too, a held Space (or a held
// click) keeps firing as the weapon warms, and `look 0.5`..`look 3` sets the turn speed.

import { gyroMove, gyroTurn, hasGyro, saveSetup, servoStep, setupsOf } from './index';
import { exec, verb, VERBS } from '../core/verbs';
import { active, param } from '../core/mods';
import { walk } from '../mods/gait';
import { frameHooks } from '../ui';
import { tidy } from '../ui/windows';
import { togglePause } from '../ui/pause';
import type { Game, Line } from '../core/types';
import { say, tickHooks } from '../core/game';
import './views';
import { clean } from '../tune/start';
import { bigOn, dash, fpsFire, fpsMove, fpsTurn, lunge, reins } from './fps';
import { aimed, volley } from '../fight/aim';

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
    // the reins: Tab takes them and gives the cursor back, from anywhere, the console too
    if (e.key === 'Tab' && g && !g.ended && reins(g)) {
      if (typing(e.target)) (e.target as HTMLElement).blur();
      takeReins(g, !bigOn(g));
      e.preventDefault();
      e.stopPropagation();
      return;
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
      // v2r5 newcomer: on an empty line Space shoots too, as the arrows walk
      if (e.key === ' ' && g && !g.ended && !(e.target as HTMLInputElement).value && aimed(g).length) {
        if (!e.repeat || volley(g).length) shootFree(g);
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
    if ((k === ' ' || k === 'f') && !g.ended && aimed(g).length) {
      // v2r5 newcomer: an aimed weapon fires from the keys without the reins too; held, it fires as it warms
      if (!e.repeat || volley(g).length) shootFree(g);
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
    else if (k === 'l') thaw().send('layers');
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

/** the reins' overlay: the pointer locks to it */
const reinsView = () => document.getElementById('bigview');
/** whether the pointer was locked to the reins' overlay, to tell a lock lost (Esc) from one never had */
let locked = false;

/** the reins flipped by a key, a click or a lost lock: no "> big" echo in the console (v2r2 ux: four in a row) */
function flip(g: Game): void {
  const d = VERBS.big;
  if (d && (!d.when || d.when(g))) d.run(g, []);
}

/** take the reins (the mouse with them) or give the cursor back */
export function takeReins(g: Game, on: boolean): void {
  if (on !== bigOn(g)) flip(g);
  const view = reinsView();
  if (on && view && document.pointerLockElement !== view) {
    // shown at once: a lock asked for in this same key press or click
    view.hidden = false;
    (view.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
  } else if (!on && document.pointerLockElement) document.exitPointerLock?.();
}

if (typeof document !== 'undefined')
  document.addEventListener('pointerlockchange', () => {
    const now = !!document.pointerLockElement && document.pointerLockElement === reinsView();
    // the browser let the mouse go (Esc): the cursor is yours again, for the windows
    const g = thaw()?.g;
    if (locked && !now && g && bigOn(g)) flip(g);
    locked = now;
  });

/** the reins' keys; true when it took the key */
function fpsKey(g: Game, e: KeyboardEvent, k: string): boolean {
  if (k === 'v' && !e.repeat && reins(g)) {
    takeReins(g, !bigOn(g));
    return true;
  }
  if (!bigOn(g)) return false;
  // held: walk, turn (q e and the left/right arrows) and Space, which keeps firing as the weapon warms (tickHooks below)
  if (WASD[k] || ARROWS[e.key] || k === 'q' || k === 'e' || k === ' ') {
    held.add(ARROWS[e.key] ? e.key : k);
    if (k === ' ' && !e.repeat) fpsFire(g);
    return true;
  }
  if (e.repeat) return k === 'shift' || k === 'f';
  if (k === 'shift') dash(g);
  else if (k === '[' || k === ']') setSens(g, k === ']' ? 1.15 : 1 / 1.15);
  else if (k === 'f') lunge(g);
  else if (k === 'escape') takeReins(g, false);
  else return false;
  return true;
}

addEventListener('blur', () => {
  held.clear();
  pressed = false;
});

// focus moving into the console drops held keys, so you do not walk on while typing
addEventListener('focusin', (e) => {
  if (typing(e.target)) held.clear();
});

frameHooks.push((g) => {
  const fwd = (held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0);
  const side = (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0);
  if (bigOn(g)) {
    // the big view: up/down walk with WASD, relative to where you look; left/right turn (tickHooks below)
    const f = fwd + (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0);
    fpsMove(g, Math.sign(f), Math.sign(side));
    return;
  }
  if (fwd || side || g.player.move) gyroMove(g, fwd, side);
});

/** a left press held in the big view: it keeps firing as the weapon warms, like a held Space */
let pressed = false;
/** keyboard turning in the big view, radians a second at 100% look speed (about a third of a turn a second) */
export const TURN = 2.2;
// game time, so it pauses with the game and a test's step() turns too
tickHooks.push((g, dt) => {
  if (!bigOn(g)) {
    pressed = false;
    return;
  }
  const t = (held.has('e') || held.has('ArrowRight') ? 1 : 0) - (held.has('q') || held.has('ArrowLeft') ? 1 : 0);
  if (t) fpsTurn(g, t * TURN * Math.min(2, Math.max(0.5, sensShare())) * dt);
  if ((held.has(' ') || pressed) && volley(g).length) fpsFire(g);
});

/** v2r5 newcomer (the floor-2 ringer was a wall: shoot had no key without the reins): `shoot` from a key or a
 *  click on the view, with no reins to take */
function shootFree(g: Game): void {
  thaw().send('shoot');
  const con = thaw()?.screen?.con;
  if (con) con.follow = true;
}

// the reins: a press on the view takes them (and the mouse), then fires (left) or lunges (right)
addEventListener('mousedown', (e) => {
  const g = thaw()?.g;
  const view = reinsView();
  if (!g || g.ended) return;
  if (!view || !reins(g)) {
    // no reins: a left press on the eye's view (not a window, not the map) shoots an aimed weapon
    const t = e.target as HTMLElement;
    // v2r5 newcomer: a click on the black round the screen-filling map did nothing; it says why
    if (e.button === 0 && document.body.dataset.view === 'map' && (t?.id === 'backdrop' || t?.classList?.contains('bd-map')) && document.querySelector('#backdrop .bd-map canvas.map')) {
      const why = 'off the map: nothing known out there. click on the map itself.';
      if (g.log[g.log.length - 1]?.[0] !== why) say(g, why);
      return;
    }
    if (e.button !== 0 || document.body.dataset.view !== 'view' || !aimed(g).length) return;
    if (!t?.closest?.('#backdrop') || t.closest('.bd-map')) return;
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    shootFree(g);
    return;
  }
  const onView = view.contains(e.target as Node) || !!document.getElementById('backdrop')?.contains(e.target as Node);
  if (!onView) return;
  e.preventDefault();
  (document.activeElement as HTMLElement | null)?.blur();
  if (document.pointerLockElement !== view) {
    if (e.button === 0) takeReins(g, true);
    return;
  }
  if (e.button === 2) lunge(g);
  else if (e.button === 0) {
    pressed = true;
    fpsFire(g);
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) pressed = false;
});
addEventListener('contextmenu', (e) => {
  if (document.getElementById('bigview')?.contains(e.target as Node)) e.preventDefault();
});

// a `big` button (the reins' window) took the reins: the mouse goes with them, in this same click
addEventListener('click', (e) => {
  const g = thaw()?.g;
  if (!g || (e.target as HTMLElement).dataset?.cmd !== 'big' || !bigOn(g)) return;
  const view = reinsView();
  if (view && document.pointerLockElement !== view) {
    view.hidden = false;
    (view.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
  }
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
  void t;
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
  say(g, `look speed ${Math.round(sensShare() * 100)}%. [ slower, ] faster, or look 0.5 to look 3.`);
}
// a trackpad's swipe is shorter than a mouse's sweep: `look 1.5` turns half as far again per finger
verb('look', {
  help: 'look 1.5: how fast the mouse, the trackpad and q/e turn you in the reins (0.33 to 3; keys [ and ])',
  run(g, args) {
    const v = Number((args[0] ?? '').replace('%', ''));
    if (!(v > 0)) return void say(g, `look speed ${Math.round(sensShare() * 100)}%. look 0.5 slower, look 2 faster; [ and ] in the reins.`);
    setSens(g, (Math.min(3, Math.max(1 / 3, v > 10 ? v / 100 : v)) * SENS) / sens);
  },
});
// v2-view: without the reins the mouse never turns you (the gyro heart turns with Q and E)
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement?.id !== 'bigview') return;
  const g = thaw()?.g;
  if (g && bigOn(g)) fpsTurn(g, e.movementX * sens);
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
    ['a body, staged. you face east; three mites come. esc, then wasd walks; q and e turn.'],
    [{ text: 'dig', cmd: 'dig' }, '  ', { text: 'setup battle', cmd: 'setup battle' }, '  ', { text: 'setup explore', cmd: 'setup explore' }, '  ', { text: 'status', cmd: 'status' }],
  );
});
