import './style.css';
import './mods';
import './sight';
import './fight/ui';
import './ui/floors';
import './ui/cache';
import { newGame, say, tick } from './core/game';
import { Screen } from './ui';
import './ui/bigmap';
import './ui/goal';
import './tune/door';
import './ui/door';
import { start } from './audio';
import { startKit } from './tune/start';
import { powerMax } from './core/mods';
import { paused, togglePause } from './ui/pause';
import './body/input';
import './audio/hook';
import './end';
import type { Game } from './core/types';
import { deathInfo } from './fight/death';
import { toward } from './fight/eye';
import { summary } from './end/timeline';

const params = new URLSearchParams(location.search);

// offline after the first load (sw/sw.js); only where a service worker may run, never in dev
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || local))
  navigator.serviceWorker.register('./sw.js').catch(() => {});

const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);

function boot(g: Game): void {
  startKit(g);
  const inst = (name: string) => ({ text: `install ${name}`, cmd: `install ${name}` });
  const kit = ['pinhole eye', 'map spool', 'stepper relay', 'spark finger'];
  // the install links last, so a short console still shows them (playtest r1)
  say(
    g,
    `core ok. you hold four modules and wear none. slots 0/${g.player.slots}. power 0/${powerMax(g)}.`,
    ['the goal, the keys and every verb: ', { text: 'help', cmd: 'help' }, '. lost or stuck? ', { text: 'unstuck', cmd: 'unstuck' }],
    ['once they are in, walk with the arrow keys (esc leaves the console) or ', { text: 'go e 3', cmd: 'go e 3' }, '. things move out there; the spark bites what comes close.'],
    ['install them: ', { text: 'install all', cmd: kit.map((k) => `install ${k}`).join('; ') }, '  or one by one: ', ...kit.flatMap((k) => [inst(k), '  '])],
  );
}

let g = newGame(seed);
let screen = new Screen(g);
boot(g);
screen.con.input.focus();
addEventListener('pointerdown', () => start(), { once: true });
addEventListener('keydown', () => start(), { once: true });

/** a new run on a new seed (death, or ?seed to replay one) */
export function restart(nextSeed = Math.floor(Math.random() * 1e9)): void {
  document.getElementById('desk')?.replaceChildren();
  togglePause(false);
  g = newGame(nextSeed);
  screen = new Screen(g);
  boot(g);
  expose();
}

function expose(): void {
  (window as unknown as { thaw: unknown }).thaw = { g, screen, restart, send: (c: string) => screen.con.send(c) };
}
expose();

/** you stopped: who took you, the last blows, the last thing your eye saw, a lesson; and a new run
 *  (Enter, R or Space wakes again) */
function deathCard(): void {
  const d = document.createElement('div');
  d.className = 'dead';
  const box = document.createElement('div');
  const info = deathInfo(g);
  // the last frame faces what took you (r2: it showed a wall, "walker behind")
  const killer = g.ents.find((e) => e.id === info.killerId && e.enemy);
  if (killer) {
    g.player.dir = toward(g, killer);
    // eyes redraw at their own fps: step the clock past their next frame for this one draw, then put it back
    const t = g.t;
    g.t += 2;
    screen.frame(0);
    g.t = t;
  }
  // the last frame your first working eye showed (a 2D canvas: cheap to copy)
  const eye = [...document.querySelectorAll<HTMLCanvasElement>('canvas.eye')].find((c) => c.width > 0);
  let frame = '';
  try {
    if (eye) frame = `<img class="last-frame" alt="the last thing it saw" src="${eye.toDataURL()}">`;
  } catch {
    frame = '';
  }
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  box.innerHTML =
    frame +
    `<p class="killer">you stop. ${esc(info.killer)}.</p>` +
    (info.blows.length ? `<p class="blows">last blows: ${info.blows.map(esc).join(' · ')}</p>` : '') +
    `<p class="lesson">what would have helped: ${esc(info.lesson)}</p>` +
    `<p>${esc(summary(g))}</p>`;
  const b = document.createElement('button');
  b.textContent = 'wake again';
  const again = () => {
    removeEventListener('keydown', key, true);
    d.remove();
    restart();
  };
  // keys wake you only after a moment, so a word typed as you fell does not
  const shown = performance.now();
  const key = (e: KeyboardEvent) => {
    if (performance.now() - shown < 600 || (e.key !== 'Enter' && e.key !== ' ' && e.key.toLowerCase() !== 'r')) return;
    e.preventDefault();
    e.stopPropagation();
    again();
  };
  b.addEventListener('click', again);
  addEventListener('keydown', key, true);
  const keys = document.createElement('p');
  keys.className = 'keys';
  keys.textContent = 'enter, r or space';
  box.append(b, keys);
  d.append(box);
  document.body.append(d);
}

let last = performance.now();
// tests drive time by hand: ?still stops the clock until thaw.step(s) is called
const still = params.has('still');
(window as unknown as { step: (s: number) => void }).step = (s: number) => {
  for (let k = 0; k < Math.round(s * 30); k++) tick(g, 1 / 30);
  screen.frame(s);
};
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!still && !paused()) tick(g, dt);
  screen.frame(paused() ? 0 : dt);
  document.body.dataset.state = g.ended ?? 'live';
  if (g.ended === 'dead' && !document.querySelector('.dead')) deathCard();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
