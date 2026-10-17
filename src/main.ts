import './style.css';
import './mods';
import './sight';
import './fight/ui';
import { newGame, say, tick } from './core/game';
import { Screen } from './ui';
import { start } from './audio';
import './body/input';
import type { Game } from './core/types';

const params = new URLSearchParams(location.search);

// offline after the first load (sw/sw.js); only where a service worker may run, never in dev
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || local))
  navigator.serviceWorker.register('./sw.js').catch(() => {});

const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);

function boot(g: Game): void {
  say(
    g,
    'core ok. slots 0/3. power 0/4.',
    'no sight. no gait. you can only crawl: crawl n, e, s, w.',
    'you hear: a slow drip, close. something heavy breathing, far.',
    [{ text: 'take', cmd: 'take' }, '  ', { text: 'inv', cmd: 'inv' }, '  ', { text: 'listen', cmd: 'listen' }, '  ', { text: 'help', cmd: 'help' }],
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
  g = newGame(nextSeed);
  screen = new Screen(g);
  boot(g);
  expose();
}

function expose(): void {
  (window as unknown as { thaw: unknown }).thaw = { g, screen, restart, send: (c: string) => screen.con.send(c) };
}
expose();

/** you stopped: what the run reached, and a new run */
function deathCard(): void {
  const d = document.createElement('div');
  d.className = 'dead';
  const box = document.createElement('div');
  const s = g.stats;
  box.innerHTML = `<p>you stop.</p><p>${s.far} cells out · ${s.mods.length} modules found · ${s.kills} put down · ${Math.round(g.t)} s</p>`;
  const b = document.createElement('button');
  b.textContent = 'wake again';
  b.addEventListener('click', () => {
    d.remove();
    restart();
  });
  box.append(b);
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
  if (!still) tick(g, dt);
  screen.frame(dt);
  document.body.dataset.state = g.ended ?? 'live';
  if (g.ended === 'dead' && !document.querySelector('.dead')) deathCard();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
