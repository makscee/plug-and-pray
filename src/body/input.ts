// Keys and mouse for the gaits. The console keeps typing: while it has focus, keys are text;
// Esc gives them back to movement and Enter takes them to the console again.
// Arrow keys: servo gait steps. WASD: gyro heart walks. Mouse: with the gyro heart, a click on a
// camera's eye (or the empty desk) locks the pointer and the mouse turns you; Esc lets it go.

import { gyroMove, gyroTurn, hasGyro, servoStep } from './index';
import { VERBS } from '../core/verbs';
import { frameHooks } from '../ui';
import type { Game } from '../core/types';
import './views';

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
  t.requestPointerLock?.();
});

addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  const g = thaw()?.g;
  if (g) gyroTurn(g, e.movementX * 0.004);
});
