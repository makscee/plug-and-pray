// The Thaw Engine ending (DESIGN 2): once g.ended === 'thaw' the god's heart warms and its light floods
// the screen, every window melts and drips off the desk, then the end card shows the run and "wake again".
// Driven by frameHooks, so ?still runs step it with thaw.step(s) like the rest of the screen.

import { frameHooks } from '../ui';
import { exec } from '../core/verbs';
import type { Game } from '../core/types';
import { CARD, beat, card, light, melt, summary } from './timeline';
import './end.css';
import { clean } from '../tune/start';

interface End {
  t: number;
  el: HTMLElement;
  wins: HTMLElement[];
  card?: HTMLElement;
}

const ends = new WeakMap<Game, End>();
const DRIPS = 5;

function begin(): End {
  document.querySelector('.thaw-end')?.remove();
  const el = document.createElement('div');
  el.className = 'thaw-end';
  el.innerHTML = '<div class="thaw-light"></div><div class="thaw-heart"></div>';
  document.body.append(el);
  // the console melts last: it is the oldest part of you
  const wins = [...document.querySelectorAll<HTMLElement>('#desk .win')].sort(
    (a, b) => Number(a.dataset.win === 'console') - Number(b.dataset.win === 'console'),
  );
  for (const w of wins) {
    w.classList.add('melting');
    for (let k = 0; k < DRIPS; k++) {
      const d = document.createElement('i');
      d.className = 'drip';
      d.style.left = `${8 + ((k * 37 + w.offsetWidth) % 84)}%`;
      d.style.setProperty('--len', String(0.6 + ((k * 53) % 10) / 10));
      w.append(d);
    }
  }
  return { t: 0, el, wins };
}

function showCard(g: Game, e: End): void {
  const c = document.createElement('div');
  c.className = 'thaw-card';
  c.innerHTML = '<p class="big">the god is warm.</p><p>the engine turns in its breast. you are part of it now.</p>';
  const p = document.createElement('p');
  p.className = 'run';
  p.textContent = summary(g);
  const b = document.createElement('button');
  b.textContent = 'wake again';
  b.addEventListener('click', () => {
    e.el.remove();
    (window as unknown as { thaw: { restart(): void } }).thaw.restart();
  });
  c.append(p, b);
  e.el.append(c);
  e.card = c;
}

frameHooks.push((g, dt) => {
  if (g.ended !== 'thaw') return;
  let e = ends.get(g);
  if (!e) ends.set(g, (e = begin()));
  e.t += dt;
  const t = e.t;
  e.el.style.setProperty('--light', light(t).toFixed(3));
  e.el.style.setProperty('--beat', beat(t).toFixed(3));
  e.wins.forEach((w, i) => {
    const m = melt(t, i);
    const sway = Math.sin(i * 1.7 + t * 0.8) * 6 * m;
    w.style.setProperty('--m', m.toFixed(3));
    w.style.transform = `translateY(${(m * m * 80).toFixed(1)}vh) scaleY(${(1 + m * 0.7).toFixed(3)}) skewX(${sway.toFixed(1)}deg)`;
    w.style.filter = `blur(${(m * 5).toFixed(1)}px) sepia(${(light(t) * 0.8).toFixed(2)}) brightness(${(1 + light(t) * 0.8 + m).toFixed(2)})`;
    w.style.opacity = (1 - m * m).toFixed(3);
  });
  if (card(t) && !e.card) showCard(g, e);
  if (e.card) e.card.style.opacity = Math.min(1, (t - CARD) / 1.2).toFixed(3);
});

// ?scene=end stages the ending for judging: a few modules installed, then the engine; the sequence plays at once.
// Once per page load, so wake again starts a plain run.
let staged = false;
frameHooks.push((g) => {
  if (staged || !/[?&]scene=end\b/.test(globalThis.location?.search ?? '')) return;
  staged = true;
  clean(g);
  Object.assign(g.player, { slots: 5, core: 12 });
  for (const mod of ['vidicon-tube', 'stepper-relay', 'map-spool', 'thaw-engine']) {
    g.player.inv.push({ kind: 'mod', mod });
    exec(g, `install ${mod.replace(/-/g, ' ')}`);
    for (const i of g.player.installed) i.readyAt = g.t - 1; // warm now, so the eyes have a frame to melt
  }
});
