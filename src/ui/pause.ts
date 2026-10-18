// Pause (playtest r1: enemies moved while you read a tooltip). P toggles it; a hidden tab pauses too
// and lets go when you come back, unless you paused by hand. The main loop skips the sim while paused.

let byHand = false;
let hidden = false;
let banner: HTMLElement | null = null;

export const paused = (): boolean => byHand || hidden;

function show(): void {
  if (typeof document === 'undefined') return;
  if (!banner || !banner.isConnected) {
    banner = document.createElement('div');
    banner.className = 'paused';
    banner.innerHTML = '<div><span>paused</span><small>p or a click resumes</small></div>';
    banner.addEventListener('click', () => togglePause(false));
    document.body.append(banner);
  }
  banner.hidden = !paused();
}

export function togglePause(on = !byHand): void {
  byHand = on;
  show();
}

if (typeof document !== 'undefined') addEventListener('visibilitychange', () => {
  hidden = document.visibilityState === 'hidden';
  show();
});
