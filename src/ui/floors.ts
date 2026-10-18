// The floors' screen side (v2, src/world/floors.ts): going down is a moment (the screen drops to black, then
// the new floor's number, name and gimmick in big letters), a fallen keeper says the way down is open, and
// the map draws each floor's stairs in its own sign: the rope pit a black hole on a chain, the candle stair a
// spiral, the bone chute chevrons pointing down, the lift a cage with an arrow; red while sealed.

import { frameHooks } from '.';
import type { Game } from '../core/types';
import { mapHooks } from '../world/mind';
import { bossDown, FLOORS, floorOf, STAIRS, WANTS, type Stairs } from '../world/floors';
import { variantOf } from '../fight/bosses';
import './floors.css';

interface Seen {
  floor: number;
  down: boolean;
}
const seen = new WeakMap<Game, Seen>();

function banner(cls: string, html: string, ms: number): void {
  document.querySelector(`.${cls}`)?.remove();
  const el = document.createElement('div');
  el.className = `floor-banner ${cls}`;
  el.innerHTML = html;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

frameHooks.push((g) => {
  let s = seen.get(g);
  const f = floorOf(g);
  if (!s) seen.set(g, (s = { floor: f, down: bossDown(g, f) }));
  if (s.floor !== f) {
    s.floor = f;
    s.down = bossDown(g, f);
    const F = FLOORS[f];
    banner('descend', `<div class="floor-drop"></div><div class="floor-card"><p class="floor-n">floor ${f + 1} of ${FLOORS.length} · keeper: ${variantOf(g, f).name}</p><p class="floor-name">${F.name}</p><p class="floor-gimmick">${F.gimmick}</p>${WANTS[f] ? `<p class="floor-wants">${WANTS[f]}</p>` : ''}</div>`, 5200);
    return;
  }
  const down = bossDown(g, f);
  if (down && !s.down && !g.ended) {
    const st = F_STAIRS(f);
    banner('opened', `<div class="floor-card small"><p class="floor-name">the way down is open</p>${st ? `<p class="floor-gimmick">${st.look}.</p>` : ''}</div>`, 4200);
  }
  s.down = down;
});
const F_STAIRS = (f: number) => (FLOORS[f].stairs ? STAIRS[FLOORS[f].stairs!] : null);

/** the stairs' sign on the map, centred at (x, y), cell size px */
function sign(ctx: CanvasRenderingContext2D, style: Stairs, open: boolean, x: number, y: number, px: number): void {
  const r = Math.max(7, px * 1.3);
  const ink = open ? '#f0e0a0' : '#e04030';
  ctx.save();
  ctx.lineWidth = Math.max(1.5, px * 0.18);
  ctx.strokeStyle = ink;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.rect(x - r, y - r, r * 2, r * 2);
  ctx.fill();
  if (style === 'rope') {
    // a black hole in a ring, the chain coming down into it
    ctx.beginPath();
    ctx.arc(x, y + r * 0.2, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r * 0.2);
    ctx.stroke();
  } else if (style === 'spiral') {
    ctx.beginPath();
    for (let k = 0; k <= 28; k++) {
      const a = k * 0.42;
      const rr = (r * 0.9 * k) / 28;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffc860';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  } else if (style === 'chute') {
    for (const dy of [-0.45, 0.1]) {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.7, y + dy * r);
      ctx.lineTo(x, y + (dy + 0.45) * r);
      ctx.lineTo(x + r * 0.7, y + dy * r);
      ctx.stroke();
    }
  } else {
    ctx.strokeRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.5);
    ctx.lineTo(x, y - r * 0.5);
    ctx.moveTo(x - r * 0.35, y - r * 0.15);
    ctx.lineTo(x, y - r * 0.5);
    ctx.lineTo(x + r * 0.35, y - r * 0.15);
    ctx.stroke();
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

mapHooks.draw.push((g, ctx, ox, oy, px) => {
  for (const e of g.ents) {
    if (!e.data?.stairs || !g.seen.has(`${Math.floor(e.x)},${Math.floor(e.y)}`)) continue;
    sign(ctx, e.data.stairs as Stairs, !!e.data.open, (e.x - ox) * px, (e.y - oy) * px, px);
  }
});
