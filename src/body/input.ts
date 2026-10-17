// Keys and mouse for the gaits. The console keeps typing: while it has focus, keys are text;
// Esc gives them back to movement and Enter takes them to the console again.
// Arrow keys: servo gait steps. WASD: gyro heart walks. Mouse: with the gyro heart, a click on a
// camera's eye (or the empty desk) locks the pointer and the mouse turns you; Esc lets it go.
// Without a lock, dragging on the eye turns you too.

import { gyroMove, gyroTurn, hasGyro, saveSetup, servoStep } from './index';
import { VERBS } from '../core/verbs';
import { frameHooks } from '../ui';
import type { Game } from '../core/types';
import './views';
import { clean } from '../tune/start';

const ARROWS: Record<string, string> = { ArrowUp: 'n', ArrowRight: 'e', ArrowDown: 's', ArrowLeft: 'w' };
const WASD = ['w', 'a', 's', 'd'];
const held = new Set<string>();
const thaw = () => (window as unknown as { thaw: { g: Game; send(c: string): void } }).thaw;
const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
const consoleInput = () => document.querySelector<HTMLInputElement>('.win-console input');

// capture phase: runs before the console's own key handler
addEventListener(
  'keydown',
  (e) => {
    if (typing(e.target)) {
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
    const g = thaw()?.g;
    if (!g) return;
    const d = ARROWS[e.key];
    if (d) {
      servoStep(g, d);
      e.preventDefault();
      return;
    }
    const k = e.key.toLowerCase();
    if (WASD.includes(k)) {
      held.add(k);
      e.preventDefault();
    }
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
