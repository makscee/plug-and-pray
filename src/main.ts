import './style.css';
import './mods';
import './sight';
import './fight/ui';
import { newGame, say, tick } from './core/game';
import { Screen } from './ui';
import { start } from './audio';
import { startKit } from './tune/start';
import { powerMax } from './core/mods';
import { paused, togglePause } from './ui/pause';
import './body/input';
import './audio/hook';
import './end';
import type { Game } from './core/types';

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
  if (!still && !paused()) tick(g, dt);
  screen.frame(paused() ? 0 : dt);
  document.body.dataset.state = g.ended ?? 'live';
  if (g.ended === 'dead' && !document.querySelector('.dead')) deathCard();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
