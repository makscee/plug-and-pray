// Feedback effects (Maks 10-18 20:00: "taking damage etc. add simple animations and effects in most actions").
// One DOM layer over every eye and the map (so the pinhole's grey filter never eats it): short-lived
// Web Animations, nothing that runs once they end. It watches the game (hp, bag, modules, floor) and
// the strike/kill hooks; the attacks' own visuals (bolts, swings) are src/fx/attacks.ts, not here.

import { killHooks, strikeHooks } from '../core/game';
import type { Entity, Game } from '../core/types';
import { BOSS } from '../fight/bosses';
import { screenAt } from '../sight/backdrop';
import { frameHooks } from '../ui';
import './feedback.css';

const calm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let layer: HTMLElement | null = null;
function root(): HTMLElement {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.id = 'fx';
    document.body.append(layer);
  }
  return layer;
}

/** a throwaway element on the layer, gone when its animation ends */
function spark(cls: string, x: number, y: number, frames: Keyframe[], ms: number, text = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (text) el.textContent = text;
  root().append(el);
  const a = el.animate(frames, { duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  a.onfinish = () => el.remove();
  setTimeout(() => el.remove(), ms + 200); // a hidden tab never finishes its animations
  return el;
}

/** a full-screen wash: the red edge, the green pulse, the black of a new floor */
function wash(cls: string, from: number, ms: number): void {
  spark('fx-wash ' + cls, 0, 0, [{ opacity: from }, { opacity: from, offset: 0.25 }, { opacity: 0 }], ms);
}

function shake(px: number, ms: number): void {
  if (calm()) return;
  const el = document.getElementById('backdrop');
  if (!el) return;
  const k = [0, 1, -1, 0.7, -0.6, 0.3, 0].map((f, i) => ({ transform: `translate(${(i % 2 ? 1 : -1) * f * px}px, ${f * px * 0.6}px)` }));
  el.animate(k, { duration: ms, easing: 'ease-out' });
}

/** where a world point sits on screen now (the eye's view, or the map); the screen's middle when neither shows it */
function at(g: Game, x: number, y: number, up = 0.5): [number, number] | null {
  return screenAt(g, x, y, up);
}

function burst(x: number, y: number, n: number, size: number, colour: string, ms: number): void {
  const far = calm() ? size * 0.3 : size;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
    const r = far * (0.6 + Math.random() * 0.6);
    const el = spark('fx-bit', x, y, [
      { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * r * 0.7}px), calc(-50% + ${Math.sin(a) * r * 0.7}px)) scale(1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r}px)) scale(0.3)`, opacity: 0 },
    ], ms * (0.7 + Math.random() * 0.5));
    el.style.background = el.style.color = colour;
  }
}

// ---- foes: a blow lands (white flash + number), a foe dies (a pop of bits, then its drop)

const fmt = (n: number) => (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

let gameOf: Game | null = null;
strikeHooks.push((g, e, n) => {
  if (g !== gameOf || typeof document === 'undefined') return;
  const s = at(g, e.x, e.y);
  if (!s) return;
  spark('fx-hitflash', s[0], s[1], [{ opacity: 0.95, transform: 'translate(-50%,-50%) scale(0.6)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.3)' }], 220);
  const dx = (Math.random() - 0.5) * 30;
  spark('fx-num', s[0] + dx, s[1] - 18, [
    { transform: 'translate(-50%,0) scale(1.3)', opacity: 1 },
    { transform: 'translate(-50%,-14px) scale(1)', opacity: 1, offset: 0.35 },
    { transform: 'translate(-50%,-36px) scale(0.9)', opacity: 0 },
  ], 750, fmt(n));
});

killHooks.push((g, e: Entity) => {
  if (g !== gameOf || typeof document === 'undefined') return;
  const keeper = !!BOSS[e.enemy?.type ?? ''];
  const s = at(g, e.x, e.y, 0.4);
  if (keeper) {
    wash('fx-white', 0.5, 700);
    shake(10, 450);
  }
  if (!s) return;
  burst(s[0], s[1], keeper ? 32 : 16, keeper ? 180 : 80, keeper ? '#ffe2a0' : '#fff6e0', keeper ? 1000 : 650);
  if (keeper) burst(s[0], s[1], 14, 90, '#ff8a3a', 1100);
  // the drop pops out a beat later
  setTimeout(() => {
    const d = at(g, e.x, e.y, 0.2);
    if (d) spark('fx-ring', d[0], d[1], [{ transform: 'translate(-50%,-50%) scale(0.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }], 450);
  }, 220);
});

// ---- you: hurt, healed, a new floor; the bag and the modules

interface Seen {
  hp: number;
  max: number;
  floor: number;
  res: Map<string, number>;
  mods: number;
  inst: Map<number, number>;
}
let seen: Seen | null = null;
/** tiles that just went in: key → performance.now() it went in (the grid is rebuilt often: each new element picks the animation up) */
const fresh = new Map<string, number>();

const resOf = (g: Game) => {
  const m = new Map<string, number>();
  for (const it of g.player.inv) if (it.kind === 'res') m.set(it.res, (m.get(it.res) ?? 0) + it.n);
  return m;
};
const modsOf = (g: Game) => g.player.inv.filter((it) => it.kind === 'mod').length;

function look(g: Game): Seen {
  return { hp: g.player.hp, max: g.player.maxHp, floor: g.floor ?? 0, res: resOf(g), mods: modsOf(g), inst: new Map(g.player.installed.map((i) => [i.uid, i.level ?? 1])) };
}

/** the hp bar: the lost part lingers red and drains; a heal glows */
function tickBar(lost: number, max: number, hp: number, heal = false): void {
  // the first-person HUD's bar while it shows, else the top bar's
  const bar = [...document.querySelectorAll<HTMLElement>('#bigview .hp .bar, .hpbar i')].find((b) => b.offsetParent && b.getClientRects().length);
  if (!bar) return;
  // on the fx layer at the bar's place: the HUD rebuilds its bar most frames
  const r = bar.getBoundingClientRect();
  const from = Math.max(0, hp - (heal ? lost : 0)) / max;
  const el = spark(heal ? 'fx-hpheal' : 'fx-hpghost', r.left + 1 + from * (r.width - 2), r.top + 1,
    heal ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 1, transform: 'scaleX(1)', offset: 0.3 }, { opacity: 0.6, transform: 'scaleX(0)' }], heal ? 700 : 650);
  el.style.width = `${(lost / max) * (r.width - 2)}px`;
  el.style.height = `${r.height - 2}px`;
  const top = bar.closest<HTMLElement>('.hpbar');
  const hud = top ?? bar.closest<HTMLElement>('.hp');
  const x = top ? 'translateX(-50%) ' : '';
  hud?.animate(heal ? [{ filter: 'drop-shadow(0 0 6px #6f6)' }, { filter: 'none' }] : [{ transform: `${x}scale(1.15)`, color: '#fff' }, { transform: `${x}scale(1)` }], { duration: 350 });
}

/** a pickup flies from your feet toward the bag window with a glow */
function pickup(text: string, colour: string): void {
  const bag = document.querySelector<HTMLElement>('.panel-inv');
  const r = bag && !bag.classList.contains('min') ? bag.getBoundingClientRect() : null;
  const [x0, y0] = [innerWidth / 2, innerHeight * 0.62];
  const [x1, y1] = r && r.width ? [r.left + r.width / 2, r.top + 14] : [innerWidth / 2, 30];
  const el = spark('fx-pick', x0, y0, [
    { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 },
    { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: 0.25 },
    { transform: 'translate(-50%,-110%) scale(1)', opacity: 1, offset: 0.6 },
    { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(0.5)`, opacity: 0.3 },
  ], 1100, text);
  el.style.color = colour;
  if (bag) setTimeout(() => bag.animate([{ boxShadow: `0 0 14px ${colour}` }, { boxShadow: '0 0 0 transparent' }], { duration: 500 }), 900);
}

const RES_INK: Record<string, string> = { bone: '#efe6d2', glass: '#9fe3ff', copper: '#ffa860', ichor: '#e070ff' };

frameHooks.push((g) => {
  if (gameOf !== g) {
    gameOf = g;
    seen = look(g);
    fresh.clear();
    return;
  }
  const was = seen!;
  const now = look(g);
  seen = now;
  // hurt: the red edge and a shake, bigger for a big hit
  const lost = was.hp - now.hp;
  if (lost > 0.01) {
    const big = lost >= now.max * 0.15 || now.hp <= 0;
    wash('fx-red', big ? 0.85 : 0.5, big ? 600 : 380);
    shake(big ? 9 : 4, big ? 320 : 200);
    tickBar(lost, now.max, now.hp);
  } else if (lost <= -0.5 && now.max === was.max) {
    // a heal, not the slow mend of every frame
    wash('fx-green', 0.45, 700);
    tickBar(-lost, now.max, now.hp, true);
  }
  // a new floor: the screen comes up out of black
  if (now.floor !== was.floor) wash('fx-black', 1, 900);
  // the bag: resources and finds
  for (const [k, n] of now.res) {
    const d = n - (was.res.get(k) ?? 0);
    if (d > 0) pickup(`+${d} ${k}`, RES_INK[k] ?? '#fff');
  }
  if (now.mods > was.mods) pickup('+ module', '#ffd36a');
  // modules: a new one scales in, a level up flashes its tile
  const t = performance.now();
  for (const [uid, lvl] of now.inst) {
    const before = was.inst.get(uid);
    if (before === undefined) fresh.set(`u${uid}:in`, t);
    else if (lvl > before) fresh.set(`u${uid}:up`, t);
  }
  if (now.inst.size < was.inst.size) document.querySelector<HTMLElement>('.panel-inv')?.animate([{ boxShadow: '0 0 12px #ccc' }, { boxShadow: '0 0 0 transparent' }], { duration: 400 });
  for (const [k, since] of fresh) {
    const age = t - since;
    if (age > 600) {
      fresh.delete(k);
      continue;
    }
    const [key, how] = k.split(':');
    const el = document.querySelector<HTMLElement>(`.panel-modules .cell[data-key="${key}"]`);
    if (!el || el.dataset.fx === k) continue;
    el.dataset.fx = k;
    el.animate(how === 'in' ? [{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)' }] : [{ boxShadow: '0 0 0 2px #ffd36a, 0 0 16px #ffd36a', filter: 'brightness(1.8)' }, { boxShadow: '0 0 0 transparent', filter: 'none' }], { duration: 600, delay: -age });
  }
});
